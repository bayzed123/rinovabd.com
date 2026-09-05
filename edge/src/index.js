/**
 * Campaign edge proxy — deployed into the Cloudflare account that owns rinovabd.com.
 *
 * The storefront Worker (rinovabd-worker) and its D1 database live in a different Cloudflare
 * account from the rinovabd.com zone. Cloudflare only allows a Worker route or custom domain
 * when the zone and the Worker share an account, so the storefront Worker can never be bound
 * to the brand domain directly, and a proxied CNAME to its workers.dev host is refused with
 * error 1014. This tiny Worker closes that gap: it owns ads.rinovabd.com in the domain's
 * account and forwards campaign traffic to the storefront Worker over the public internet.
 *
 * Meta's ad crawler runs no JavaScript, so the campaign HTML — including its Open Graph tags —
 * must come back fully rendered. Forwarding the original host lets the upstream Worker write
 * canonical and og:url tags that name ads.rinovabd.com instead of the workers.dev origin.
 */

// Only what a campaign landing page actually needs. Anything else is sent to the real shop,
// so this subdomain never becomes a second, duplicate storefront competing in search.
const ASSET_PATHS = new Set(['/styles.css', '/campaign.js', '/lp.js', '/runtime-config.js', '/icons.js', '/analytics.js', '/favicon.ico', '/robots.txt']);
const ASSET_PREFIXES = ['/assets/'];

const isCampaignPath = (pathname) => pathname === '/campaign' || pathname.startsWith('/campaign/');
// The ad landing pages built into the storefront Worker, served from this domain for the same
// reason campaigns are: the ad link has to carry the brand, not a workers.dev host.
const isLandingPath = (pathname) => pathname === '/lp' || pathname.startsWith('/lp/');
const isAssetPath = (pathname) => ASSET_PATHS.has(pathname) || ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upstream = env.UPSTREAM_ORIGIN || 'https://rinovabd-worker.abdussalam8480.workers.dev';
    const publicSite = env.PUBLIC_SITE_ORIGIN || 'https://rinovabd.com';

    if (!isCampaignPath(url.pathname) && !isLandingPath(url.pathname) && !isAssetPath(url.pathname)) {
      return Response.redirect(`${publicSite}${url.pathname}${url.search}`, 301);
    }

    // GET and HEAD are all a landing page needs; refusing the rest keeps this from becoming an
    // open proxy onto the storefront's admin and order APIs.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const target = new URL(url.pathname + url.search, upstream);
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    // The upstream is a different origin; sending the browser's Host would not match it.
    headers.delete('Host');

    let response;
    try {
      response = await fetch(target.toString(), { method: request.method, headers, redirect: 'manual' });
    } catch {
      return new Response('The campaign service is temporarily unavailable.', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    // A redirect from upstream would point at the workers.dev host, which would bounce the
    // visitor off the brand domain mid-ad-click, so rewrite it back onto this host.
    const location = response.headers.get('Location');
    const out = new Headers(response.headers);
    if (location) {
      try { out.set('Location', new URL(location, upstream).pathname + new URL(location, upstream).search); } catch { /* leave as-is */ }
    }
    out.delete('Content-Encoding');
    out.delete('Content-Length');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
  },
};
