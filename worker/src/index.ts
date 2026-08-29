import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { r2S3CompleteMultipartUpload, r2S3Configured, r2S3CreateMultipartUpload, r2S3Get, r2S3List, r2S3Put, r2S3UploadPart } from './r2-s3';

interface Bindings {
  DB: D1Database;
  PRODUCT_IMAGES?: R2Bucket;
  CACHE: KVNamespace;
  AI: Ai;
  ASSETS?: Fetcher;
  SHOP_NAME: string;
  SHOP_PHONE: string;
  SHOP_ADDRESS: string;
  STEADFAST_BASE_URL?: string;
  STEADFAST_API_KEY?: string;
  STEADFAST_SECRET_KEY?: string;
  STEADFAST_WEBHOOK_TOKEN?: string;
  ADMIN_API_TOKEN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  AI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_1?: string;
  GEMINI_API_KEY_2?: string;
  GEMINI_MODEL?: string;
  WHATSAPP_NUMBER?: string;
  GA4_PROPERTY_ID?: string;
  SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_ACCOUNT_LEADS_SHEET_ID?: string;
  GOOGLE_ACTIVITY_LEADS_SHEET_ID?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

type App = Hono<{ Bindings: Bindings }>;
type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'customer_cancelled' | 'refused' | 'delivery_failed' | 'returned' | 'admin_cancelled';

const app: App = new Hono();
app.use('/api/*', cors({ origin: ['https://rinovabd.com', 'https://www.rinovabd.com', 'http://rinovabd.com', 'http://www.rinovabd.com', 'https://bayzed123.github.io', 'http://localhost:5173'], allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'] }));

const json = (c: { json: (body: unknown, status?: number) => Response }, body: unknown, status = 200) => c.json(body, status);

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || normalize(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function base64Url(value: string | ArrayBuffer) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemBytes(pem: string) {
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function googleAccessToken(env: Bindings, scope = 'https://www.googleapis.com/auth/analytics.readonly') {
  if (!env.SERVICE_ACCOUNT_JSON) throw new Error('GA4 service account is not configured.');
  let service: { client_email?: string; private_key?: string; project_id?: string };
  try { service = JSON.parse(env.SERVICE_ACCOUNT_JSON); } catch { throw new Error('GA4 service account configuration is invalid.'); }
  if (!service.client_email || !service.private_key) throw new Error('GA4 service account configuration is incomplete.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({ iss: service.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(service.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(`${signingInput}.${base64Url(signature)}`)}` });
  if (!response.ok) throw new Error('GA4 authentication failed.');
  const data = await response.json<{ access_token?: string }>();
  if (!data.access_token) throw new Error('GA4 authentication returned no token.');
  return data.access_token;
}

function reportRows(report: any) {
  const dimensions = (report?.dimensionHeaders || []).map((header: any) => header.name);
  const metrics = (report?.metricHeaders || []).map((header: any) => header.name);
  return (report?.rows || []).map((row: any) => Object.fromEntries([...dimensions.map((name: string, index: number) => [name, row.dimensionValues?.[index]?.value || '']), ...metrics.map((name: string, index: number) => [name, row.metricValues?.[index]?.value || '0'])]));
}

async function runGa4Report(env: Bindings, body: Record<string, unknown>) {
  const propertyId = normalize(env.GA4_PROPERTY_ID);
  if (!/^\d+$/.test(propertyId)) throw new Error('GA4 Property ID is not configured.');
  const token = await googleAccessToken(env);
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('GA4 report request failed.');
  return response.json();
}

async function sheetsAccessCheck(spreadsheetId: string | undefined, token: string) {
  if (!spreadsheetId) return { configured: false, accessible: false, reason: 'Sheet ID is not configured.' };
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:A1?majorDimension=ROWS`;
  try {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return { configured: true, accessible: false, reason: 'Google Sheet access was rejected.' };
    return { configured: true, accessible: true };
  } catch {
    return { configured: true, accessible: false, reason: 'Google Sheet access could not be reached.' };
  }
}

async function sheetsAppendRow(env: Bindings, spreadsheetId: string | undefined, headers: string[], row: Array<string | number | null>) {
  if (!spreadsheetId || !env.SERVICE_ACCOUNT_JSON) return false;
  const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/spreadsheets');
  const range = encodeURIComponent(`A:${String.fromCharCode(64 + Math.max(headers.length, row.length))}`);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`;
  const headerResponse = await fetch(`${endpoint}?valueRenderOption=UNFORMATTED_VALUE` , { headers: { Authorization: `Bearer ${token}` } });
  if (!headerResponse.ok) throw new Error('Google Sheet could not be read. Verify the service account has Editor access.');
  const headerData = await headerResponse.json<{ values?: unknown[][] }>();
  if (!headerData.values?.length) {
    const writeHeaders = await fetch(`${endpoint}?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ range: 'A1', majorDimension: 'ROWS', values: [headers] }) });
    if (!writeHeaders.ok) throw new Error('Google Sheet headers could not be created.');
  }
  const appendResponse = await fetch(`${endpoint}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ majorDimension: 'ROWS', values: [row] }) });
  if (!appendResponse.ok) throw new Error('Google Sheet row could not be appended.');
  return true;
}

const accountLeadHeaders = ['Created At', 'Lead Type', 'Name', 'Phone', 'Email', 'Customer ID', 'Source', 'Account Status'];
const activityLeadHeaders = ['Created At', 'Activity Type', 'Order Number', 'Invoice Number', 'Customer Name', 'Customer Phone', 'Customer Email', 'Status', 'Payment Method', 'Subtotal', 'Delivery Fee', 'Total', 'Items', 'Return Code', 'Return Reason', 'Notes'];

async function syncAccountLead(env: Bindings, row: Array<string | number | null>) {
  return sheetsAppendRow(env, env.GOOGLE_ACCOUNT_LEADS_SHEET_ID, accountLeadHeaders, row);
}

async function syncActivityLead(env: Bindings, row: Array<string | number | null>) {
  return sheetsAppendRow(env, env.GOOGLE_ACTIVITY_LEADS_SHEET_ID, activityLeadHeaders, row);
}

async function analyticsSummary(env: Bindings, days: number) {
  const propertyId = normalize(env.GA4_PROPERTY_ID);
  if (!env.SERVICE_ACCOUNT_JSON || !/^\d+$/.test(propertyId)) return { configured: false, propertyId: propertyId || null, reason: 'Add SERVICE_ACCOUNT_JSON and grant that service-account email Viewer access to the GA4 property.' };
  try {
    const dateRange = { startDate: `${days}daysAgo`, endDate: 'today' };
    const [overview, events, pages] = await Promise.all([
      runGa4Report(env, { dateRanges: [dateRange], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'eventCount' }, { name: 'purchaseRevenue' }, { name: 'transactions' }], orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }], limit: String(Math.max(days, 7)) }),
      runGa4Report(env, { dateRanges: [dateRange], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: '12' }),
      runGa4Report(env, { dateRanges: [dateRange], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: '10' }),
    ]);
    return { configured: true, propertyId, days, overview: reportRows(overview), events: reportRows(events), pages: reportRows(pages) };
  } catch (error) {
    return { configured: false, propertyId, reason: error instanceof Error ? error.message : 'GA4 report could not be loaded. Verify service-account access and the Analytics Data API.' };
  }
}

async function createAdminNotification(env: Bindings, input: { type?: string; title: string; message: string; entityType?: string; entityId?: string }) {
  try { await env.DB.prepare('INSERT INTO admin_notifications(type, title, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(normalize(input.type) || 'info', normalize(input.title).slice(0, 160), normalize(input.message).slice(0, 500), normalize(input.entityType) || null, normalize(input.entityId) || null).run(); } catch {}
}

type MarketingBannerInput = { title?: unknown; eyebrow?: unknown; body?: unknown; imageUrl?: unknown; linkUrl?: unknown; placement?: unknown; categorySlug?: unknown; active?: unknown; sortOrder?: unknown; marqueeSpeed?: unknown; startsAt?: unknown; endsAt?: unknown };
function marketingBannerValues(input: MarketingBannerInput) {
  const imageUrl = normalize(input.imageUrl);
  const linkUrl = normalize(input.linkUrl);
  if (imageUrl && !/^(https:\/\/|\/assets\/|\/media\/)/i.test(imageUrl)) throw new Error('Banner image must use https://, /assets/ or /media/.');
  if (linkUrl && !/^(https?:\/\/|\/(?!\/))/i.test(linkUrl)) throw new Error('Banner link must use https:// or a site-relative path.');
  const placement = ['marquee', 'popup'].includes(normalize(input.placement)) ? normalize(input.placement) : 'marquee';
  return {
    title: normalize(input.title).slice(0, 160), eyebrow: normalize(input.eyebrow).slice(0, 100), body: normalize(input.body).slice(0, 500), imageUrl: imageUrl || null, linkUrl: linkUrl || null,
    placement, categorySlug: normalize(input.categorySlug).slice(0, 100) || null, active: input.active === false || normalize(input.active).toLowerCase() === 'false' ? 0 : 1,
    sortOrder: Math.max(0, Math.floor(Number(input.sortOrder) || 0)), marqueeSpeed: Math.min(90, Math.max(8, Math.floor(Number(input.marqueeSpeed) || 22))), startsAt: normalize(input.startsAt).replace('T', ' ') || null, endsAt: normalize(input.endsAt).replace('T', ' ') || null,
  };
}

function calculateBlogSeo(input: { title?: unknown; seoTitle?: unknown; metaDescription?: unknown; coverImageUrl?: unknown; excerpt?: unknown; slug?: unknown; keywords?: unknown; body?: unknown }) {
  const title = normalize(input.title);
  const seoTitle = normalize(input.seoTitle);
  const metaDescription = normalize(input.metaDescription);
  const coverImageUrl = normalize(input.coverImageUrl);
  const excerpt = normalize(input.excerpt);
  const slug = normalize(input.slug);
  const keywords = normalize(input.keywords);
  const body = normalize(input.body);
  const checks = [
    { key: 'title', label: 'Title is 15–70 characters', pass: title.length >= 15 && title.length <= 70 },
    { key: 'seoTitle', label: 'SEO title is 30–65 characters', pass: seoTitle.length >= 30 && seoTitle.length <= 65 },
    { key: 'metaDescription', label: 'Meta description is 70–158 characters', pass: metaDescription.length >= 70 && metaDescription.length <= 158 },
    { key: 'coverImage', label: 'A cover image is set', pass: /^(https:\/\/|\/assets\/|\/media\/)/i.test(coverImageUrl) },
    { key: 'summary', label: 'A summary is written', pass: excerpt.length >= 40 },
    { key: 'slug', label: 'URL slug is short and readable', pass: /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) && slug.length >= 3 && slug.length <= 70 },
    { key: 'keywords', label: 'Keywords added', pass: keywords.split(',').map((item) => item.trim()).filter(Boolean).length >= 2 },
    { key: 'body', label: 'Article body has real depth (300+ characters)', pass: body.length >= 300 },
  ];
  const passed = checks.filter((check) => check.pass).length;
  return { score: Math.round((passed / checks.length) * 100), passed, total: checks.length, ready: passed === checks.length, checks };
}

function parseVolumeTiers(value: unknown) {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [] as Array<{ minQty: number; price: number }>;
  return parsed.map((tier) => {
    const item = tier as Record<string, unknown>;
    return { minQty: Math.floor(Number(item.minQty ?? item.min_quantity ?? item.minOrderQty)), price: Number(item.price) };
  }).filter((tier) => Number.isFinite(tier.minQty) && tier.minQty > 0 && Number.isFinite(tier.price) && tier.price >= 0).sort((a, b) => a.minQty - b.minQty);
}

const restockOnStatuses = new Set<OrderStatus>(['customer_cancelled', 'refused', 'delivery_failed', 'returned', 'admin_cancelled']);

async function restoreOrderInventory(env: Bindings, orderId: number, actor: string, reason: 'return' | 'cancellation') {
  const items = await env.DB.prepare('SELECT product_id AS productId, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').bind(orderId).all<{ productId: number; quantity: number }>();
  const statements: D1PreparedStatement[] = [];
  for (const item of items.results) {
    const product = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(item.productId).first<{ stock: number }>();
    if (!product) continue;
    const next = product.stock + item.quantity;
    statements.push(
      env.DB.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(next, item.productId),
      env.DB.prepare('INSERT INTO stock_movements(product_id, quantity_delta, quantity_after, reason, note, actor) VALUES (?, ?, ?, ?, ?, ?)').bind(item.productId, item.quantity, next, reason, `Order ${orderId} inventory restoration`, actor),
    );
  }
  if (statements.length) await env.DB.batch(statements);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string) {
  const salt = crypto.randomUUID();
  return `${salt}:${await sha256(`${salt}:${password}`)}`;
}

async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, digest] = stored.split(':');
  return Boolean(salt && digest && digest === await sha256(`${salt}:${password}`));
}

async function adminPrincipal(c: { env: Bindings; req: { header: (name: string) => string | undefined } }) {
  const authorization = c.req.header('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  if (c.env.ADMIN_API_TOKEN && token === c.env.ADMIN_API_TOKEN) return 'api-admin';
  const tokenHash = await sha256(token);
  const session = await c.env.DB.prepare("SELECT username, expires_at AS expiresAt FROM admin_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first<{ username: string; expiresAt: string }>();
  return session?.username ?? null;
}

async function createAdminSession(env: Bindings, username: string) {
  const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash = await sha256(token);
  await env.DB.prepare("INSERT INTO admin_sessions(token_hash, username, expires_at) VALUES (?, ?, datetime('now', '+12 hours'))").bind(tokenHash, username).run();
  return token;
}

async function createCustomerSession(env: Bindings, customerId: number) {
  const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash = await sha256(token);
  await env.DB.prepare("INSERT INTO customer_sessions(customer_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").bind(customerId, tokenHash).run();
  return token;
}

function steadfastConfigured(env: Bindings) {
  return Boolean(env.STEADFAST_API_KEY && env.STEADFAST_SECRET_KEY);
}

async function steadfastRequest(env: Bindings, path: string, init: RequestInit = {}) {
  if (!steadfastConfigured(env)) throw new Error('Steadfast credentials are not configured.');
  const baseUrl = (env.STEADFAST_BASE_URL ?? 'https://portal.packzy.com/api/v1').replace(/\/$/, '');
  const headers = new Headers(init.headers);
  headers.set('Api-Key', env.STEADFAST_API_KEY!);
  headers.set('Secret-Key', env.STEADFAST_SECRET_KEY!);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Steadfast request failed with HTTP ${response.status}.`);
  return payload as Record<string, unknown>;
}

function normalizeCourierStatus(status: string) {
  const value = status.trim().toLowerCase().replace(/\s+/g, '_');
  const documented = new Set([
    'pending', 'delivered_approval_pending', 'partial_delivered_approval_pending',
    'cancelled_approval_pending', 'unknown_approval_pending', 'delivered',
    'partial_delivered', 'cancelled', 'hold', 'in_review', 'unknown', 'returned',
  ]);
  if (documented.has(value)) return value;
  if (value.includes('return')) return 'returned';
  if (value.includes('deliver')) return 'delivered';
  if (value.includes('cancel')) return 'cancelled';
  if (value.includes('hold')) return 'hold';
  if (value.includes('review')) return 'in_review';
  return value || 'unknown';
}

function statusToOrderStatus(status: string): OrderStatus | null {
  const normalized = normalizeCourierStatus(status);
  if (normalized === 'delivered') return 'delivered';
  if (normalized === 'cancelled' || normalized === 'returned') return 'returned';
  return null;
}

function authorizeSteadfastCallback(c: { env: Bindings; req: { header: (name: string) => string | undefined } }) {
  const bearer = c.req.header('Authorization') ?? '';
  if (c.env.STEADFAST_WEBHOOK_TOKEN) return bearer === `Bearer ${c.env.STEADFAST_WEBHOOK_TOKEN}`;
  const apiKey = c.req.header('Api-Key');
  const secretKey = c.req.header('Secret-Key');
  if (apiKey || secretKey) return apiKey === c.env.STEADFAST_API_KEY && secretKey === c.env.STEADFAST_SECRET_KEY;
  // The supplied Steadfast PDF documents authentication for outbound API calls,
  // but it does not define a callback signature or webhook header contract.
  return true;
}

function calculateTrust(rows: Array<{ status: string }>) {
  const totalPlaced = rows.filter((r) => r.status !== 'admin_cancelled').length;
  const finalized = rows.filter((r) => ['delivered', 'customer_cancelled', 'refused', 'delivery_failed', 'returned'].includes(r.status));
  const success = rows.filter((r) => r.status === 'delivered').length;
  const cancellations = rows.filter((r) => r.status === 'customer_cancelled').length;
  const failed = rows.filter((r) => ['refused', 'delivery_failed', 'returned'].includes(r.status)).length;
  const successRate = finalized.length ? Math.round((success / finalized.length) * 100) : null;
  const cancelRate = totalPlaced ? Math.round((cancellations / totalPlaced) * 100) : 0;
  const rating = totalPlaced === 0 || successRate === null ? 'no-history' : successRate >= 80 && cancelRate <= 15 && failed <= 1 ? 'trusted' : successRate >= 55 && cancelRate <= 35 ? 'regular' : successRate >= 30 ? 'review-required' : 'high-risk';
  return { totalPlaced, finalizedOrders: finalized.length, successfulOrders: success, cancelledOrders: cancellations, failedOrReturnedOrders: failed, successRate, cancelRate, rating };
}

function extractAiText(result: unknown) {
  if (typeof result === 'string') return result;
  const payload = result as Record<string, unknown>;
  if (typeof payload.response === 'string') return payload.response;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (typeof (payload.result as Record<string, unknown> | undefined)?.response === 'string') return ((payload.result as Record<string, unknown>).response as string);
  const choices = payload.choices as Array<Record<string, unknown>> | undefined;
  const content = choices?.[0]?.message && (choices[0].message as Record<string, unknown>).content;
  return typeof content === 'string' ? content : '';
}

type ShopProductLink = { slug: string; name: string; price: number; stock: number; imageUrl: string | null; categoryName: string | null; badgesJson?: string | null };

function parseProductMedia(value: unknown): Array<{ type: 'image' | 'video'; url: string; alt?: string }> {
  let items: unknown[] = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) items = parsed; } catch {}
  }
  const seen = new Set<string>();
  return items.map((item) => {
    if (typeof item === 'string') return { type: 'image' as const, url: normalizeMediaUrl(item) };
    const media = item as Record<string, unknown>;
    return { type: media.type === 'video' ? 'video' as const : 'image' as const, url: normalizeMediaUrl(media.url), alt: normalize(media.alt) || undefined };
  }).filter((item) => {
    if (!item.url) return false;
    const key = `${item.type}:${item.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMediaUrl(value: unknown) {
  const url = normalize(value);
  return /^(https:\/\/|\/assets\/|\/media\/)/i.test(url) ? url : '';
}

type ProductBadge = 'hot' | 'stockout' | 'out' | 'instock' | 'new';
function parseProductBadges(value: unknown): ProductBadge[] {
  let items: unknown[] = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) items = parsed; } catch {}
  }
  return Array.from(new Set(items.map((item) => normalize(item).toLowerCase()).filter((item): item is ProductBadge => ['hot', 'stockout', 'out', 'instock', 'new'].includes(item))));
}

async function findRelevantProducts(env: Bindings, question: string): Promise<ShopProductLink[]> {
  const products = await env.DB.prepare('SELECT p.slug, p.name, p.price, p.stock, p.image_url AS imageUrl, p.badges_json AS badgesJson, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 ORDER BY p.featured DESC, p.created_at DESC LIMIT 40').all<ShopProductLink & { categorySlug: string | null }>();
  const stopWords = new Set(['the','and','for','with','about','please','show','give','link','product','products','price','details','দাও','দেখাও','লিংক','প্রোডাক্ট','দাম']);
  const terms = normalize(question).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1 && !stopWords.has(term));
  const ranked = products.results.map((product) => {
    const haystack = `${product.name} ${product.categoryName || ''}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0);
    return { product, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const selected = (ranked.length ? ranked.map((item) => item.product) : products.results).slice(0, 4);
  return selected.map((product) => ({ slug: product.slug, name: product.name, price: Number(product.price || 0), stock: Number(product.stock || 0), imageUrl: product.imageUrl, categoryName: product.categoryName, badgesJson: JSON.stringify(parseProductBadges(product.badgesJson)) }));
}

function shopOnlyInstruction(scope: 'customer' | 'staff') {
  return scope === 'customer'
    ? 'You are Rinova BD customer support. Answer only questions about Rinova products, prices, stock, skincare/makeup usage, delivery fees, orders, returns, payments, and store policies. Never invent product facts, never reveal private customer/admin data, and politely refuse unrelated topics. Never output URLs, markdown links, HTML, or made-up links; the storefront will attach verified product cards separately. Respond in the user language, preferably concise Bangla when the user writes Bangla.'
    : 'You are the private Rinova BD staff, owner and admin assistance chatbot. You may summarize only Rinova shop data supplied in the context: products, stock, orders, returns, sales, settings and policies. Use the staffData numbers directly when answering: state exact counts and amounts for total products, stock on hand, ecommerce sales, POS sales, combined sales, order status, returns, low stock, and product-wise units/revenue. When asked what sold, list the productSales entries with units and revenue. Never reveal secrets, passwords, API keys or raw session tokens. Do not make irreversible changes; explain the required admin action. Answer operational questions clearly and in Bangla when appropriate.';
}

async function shopContext(env: Bindings, scope: 'customer' | 'staff') {
  const products = await env.DB.prepare('SELECT p.name, p.slug, p.price, p.stock, p.status, p.description, p.weight_grams AS weightGrams, p.image_url AS imageUrl, p.media_json AS mediaJson, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 ORDER BY p.featured DESC, p.created_at DESC LIMIT 40').all();
  const categories = await env.DB.prepare('SELECT name, slug FROM categories WHERE active = 1 ORDER BY sort_order ASC').all();
  const settings = await env.DB.prepare("SELECT setting_key AS key, setting_value AS value FROM store_settings WHERE setting_key IN ('store_name','tagline','delivery_inside_dhaka','delivery_outside_dhaka','free_delivery_over','support_phone','order_whatsapp_number')").all();
  const offers = await env.DB.prepare("SELECT title, description, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal FROM offers WHERE active = 1 AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP) ORDER BY created_at DESC LIMIT 10").all();
  let staffData: Record<string, unknown> | undefined;
  if (scope === 'staff') {
    const catalogue = await env.DB.prepare("SELECT COUNT(*) AS productCount, COALESCE(SUM(stock), 0) AS unitsOnHand, COALESCE(SUM(stock * price), 0) AS retailValue, COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0) AS costValue, COALESCE(SUM(CASE WHEN stock <= low_stock_threshold THEN 1 ELSE 0 END), 0) AS lowStockProducts FROM products WHERE active = 1").first();
    const ecommerceSales = await env.DB.prepare("SELECT COUNT(*) AS orderCount, COALESCE(SUM(subtotal + delivery_fee), 0) AS revenue FROM orders WHERE status IN ('confirmed','processing','shipped','delivered')").first();
    const posSales = await env.DB.prepare("SELECT COUNT(*) AS saleCount, COALESCE(SUM(subtotal - discount), 0) AS revenue FROM pos_sales WHERE status = 'completed'").first();
    const orderStatus = await env.DB.prepare("SELECT status, COUNT(*) AS count, COALESCE(SUM(subtotal + delivery_fee), 0) AS value FROM orders GROUP BY status ORDER BY count DESC").all();
    const returns = await env.DB.prepare("SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM returns GROUP BY status ORDER BY count DESC").all();
    const ecommerceProductSales = await env.DB.prepare("SELECT oi.product_name AS productName, COALESCE(SUM(oi.quantity), 0) AS units, COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('confirmed','processing','shipped','delivered') GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 20").all<{ productName: string; units: number; revenue: number }>();
    const posProductSales = await env.DB.prepare("SELECT product_name AS productName, COALESCE(SUM(quantity), 0) AS units, COALESCE(SUM(quantity * unit_price), 0) AS revenue FROM pos_sale_items psi JOIN pos_sales ps ON ps.id = psi.sale_id WHERE ps.status = 'completed' GROUP BY product_name ORDER BY revenue DESC LIMIT 20").all<{ productName: string; units: number; revenue: number }>();
    const salesByProduct = new Map<string, { productName: string; units: number; revenue: number }>();
    for (const sale of [...ecommerceProductSales.results, ...posProductSales.results]) { const current = salesByProduct.get(sale.productName) ?? { productName: sale.productName, units: 0, revenue: 0 }; current.units += Number(sale.units || 0); current.revenue += Number(sale.revenue || 0); salesByProduct.set(sale.productName, current); }
    staffData = {
      catalogue,
      salesSummary: { ecommerce: ecommerceSales, pos: posSales, combinedRevenue: Number(ecommerceSales?.revenue || 0) + Number(posSales?.revenue || 0), combinedTransactions: Number(ecommerceSales?.orderCount || 0) + Number(posSales?.saleCount || 0) },
      productSales: [...salesByProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      orders: orderStatus.results,
      returns: returns.results,
      recentOrders: (await env.DB.prepare("SELECT order_code AS orderCode, status, subtotal, delivery_fee AS deliveryFee, created_at AS createdAt FROM orders ORDER BY created_at DESC LIMIT 10").all()).results,
    };
  }
  return JSON.stringify({ store: Object.fromEntries(settings.results.map((item) => [item.key, item.value])), categories: categories.results, products: products.results, offers: offers.results, staffData });
}

async function runShopAssistant(env: Bindings, scope: 'customer' | 'staff', messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const context = await shopContext(env, scope);
  const prompt = `${shopOnlyInstruction(scope)}\nSHOP DATA JSON:\n${context}`;
  const model = env.AI_MODEL ?? '@cf/openai/gpt-oss-20b';
  try {
    const response = await env.AI.run(model, { messages: [{ role: 'system', content: prompt }, ...messages.slice(-8)], max_tokens: 600 });
    const text = extractAiText(response);
    if (text) return { text, provider: 'cloudflare-ai' };
  } catch (error) {
    console.warn('Cloudflare AI unavailable; trying Gemini fallback.', error);
  }
  const keys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY].filter(Boolean) as string[];
  for (const key of keys) {
    try {
      const modelName = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 600 } }) });
      const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
      if (response.ok && text) return { text, provider: 'gemini' };
    } catch (error) {
      console.warn('Gemini fallback key failed.', error);
    }
  }
  return { text: scope === 'customer' ? 'দুঃখিত, এই মুহূর্তে support assistant সংযোগ করা যাচ্ছে না। WhatsApp-এ যোগাযোগ করুন: +880 1738-745949' : 'AI assistant বর্তমানে unavailable। অনুগ্রহ করে dashboard-এর manual tools ব্যবহার করুন।', provider: 'fallback' };
}

function getBearer(c: { req: { header: (name: string) => string | undefined } }) {
  const authorization = c.req.header('Authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function customerPrincipal(c: { env: Bindings; req: { header: (name: string) => string | undefined } }) {
  const token = getBearer(c);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return c.env.DB.prepare("SELECT customer_id AS customerId FROM customer_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first<{ customerId: number }>();
}

async function refreshProductRating(env: Bindings, productId: number) {
  const aggregate = await env.DB.prepare("SELECT COUNT(*) AS reviewCount, COALESCE(ROUND(AVG(rating), 1), 0) AS rating FROM product_reviews WHERE product_id = ? AND status = 'approved'").bind(productId).first<{ reviewCount: number; rating: number }>();
  await env.DB.prepare('UPDATE products SET rating = ?, review_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(Number(aggregate?.rating || 0), Number(aggregate?.reviewCount || 0), productId).run();
}

async function findVerifiedPurchase(env: Bindings, body: { productId: number; orderCode?: unknown; invoiceNumber?: unknown; phone?: unknown }, customerId?: number | null) {
  const orderCode = normalize(body.orderCode);
  const invoiceNumber = normalize(body.invoiceNumber);
  const phone = normalize(body.phone);
  if (customerId) return env.DB.prepare("SELECT o.id, o.customer_id AS customerId, c.name AS customerName, o.status FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items oi ON oi.order_id = o.id WHERE o.customer_id = ? AND oi.product_id = ? AND o.status IN ('shipped','delivered','returned') AND (? = '' OR o.order_code = ?) AND (? = '' OR o.invoice_number = ?) ORDER BY o.created_at DESC LIMIT 1").bind(customerId, body.productId, orderCode, orderCode, invoiceNumber, invoiceNumber).first<{ id: number; customerId: number; customerName: string; status: string }>();
  if (!phone || (!orderCode && !invoiceNumber)) return null;
  return env.DB.prepare("SELECT o.id, o.customer_id AS customerId, c.name AS customerName, o.status FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items oi ON oi.order_id = o.id WHERE c.phone = ? AND oi.product_id = ? AND o.status IN ('shipped','delivered','returned') AND ((? <> '' AND o.order_code = ?) OR (? <> '' AND o.invoice_number = ?)) ORDER BY o.created_at DESC LIMIT 1").bind(phone, body.productId, orderCode, orderCode, invoiceNumber, invoiceNumber).first<{ id: number; customerId: number; customerName: string; status: string }>();
}

const blogMediaTypes: Record<string, { extension: string; type: 'image' | 'video' }> = {
  'image/jpeg': { extension: 'jpg', type: 'image' }, 'image/png': { extension: 'png', type: 'image' }, 'image/webp': { extension: 'webp', type: 'image' },
  'video/mp4': { extension: 'mp4', type: 'video' }, 'video/webm': { extension: 'webm', type: 'video' }, 'video/quicktime': { extension: 'mov', type: 'video' },
};
function validBlogMediaKey(value: unknown) { return /^blog\/[a-zA-Z0-9/_-]+\.(?:jpg|png|webp|mp4|webm|mov)$/i.test(normalize(value)); }
function storageConfigured(env: Bindings) { return Boolean(env.PRODUCT_IMAGES || r2S3Configured(env)); }
function mediaUrl(env: Bindings, request: Request, key: string) {
  const publicUrl = normalize(env.R2_PUBLIC_URL).replace(/\/$/, '');
  if (publicUrl && r2S3Configured(env)) return `${publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return `${new URL(request.url).origin}/media/${key}`;
}
async function storagePut(env: Bindings, key: string, body: BodyInit, contentType: string) {
  if (env.PRODUCT_IMAGES) {
    await env.PRODUCT_IMAGES.put(key, body as string | ArrayBuffer | Blob | ReadableStream | ArrayBufferView<ArrayBufferLike> | null, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
    return;
  }
  await r2S3Put(env, key, body, contentType);
}
async function storageGet(env: Bindings, key: string) {
  if (env.PRODUCT_IMAGES) {
    const object = await env.PRODUCT_IMAGES.get(key);
    if (!object) return null;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(object.body, { headers });
  }
  return r2S3Configured(env) ? r2S3Get(env, key) : null;
}
function blogMediaResult(env: Bindings, request: Request, key: string, type: 'image' | 'video', alt: string) { return { type, url: mediaUrl(env, request, key), alt: alt.replace(/\.[^.]+$/, '').slice(0, 160) }; }

app.post('/api/admin/blog-media', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!storageConfigured(c.env)) return json(c, { error: 'R2 media storage is not configured.' }, 503);
  const form = await c.req.raw.formData().catch(() => null);
  const fileValue = form?.get('file');
  if (!fileValue || typeof fileValue === 'string') return json(c, { error: 'Choose an image or video file first.' }, 400);
  const file = fileValue as File;
  const mediaType = blogMediaTypes[file.type];
  if (!mediaType) return json(c, { error: 'Only JPG, PNG, WEBP, MP4, WebM or MOV files are supported.' }, 400);
  if (!file.size || file.size > 64 * 1024 * 1024) return json(c, { error: 'Files over 64 MB must use the chunked upload flow.' }, 400);
  const key = `blog/${crypto.randomUUID()}.${mediaType.extension}`;
  await storagePut(c.env, key, file.stream(), file.type);
  return json(c, { ok: true, media: blogMediaResult(c.env, c.req.raw, key, mediaType.type, file.name) }, 201);
});
app.post('/api/admin/blog-media/multipart/start', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!storageConfigured(c.env)) return json(c, { error: 'R2 media storage is not configured.' }, 503);
  const body = await c.req.json<{ fileName?: string; contentType?: string; size?: number }>();
  const mediaType = blogMediaTypes[normalize(body.contentType)];
  if (!mediaType) return json(c, { error: 'Only JPG, PNG, WEBP, MP4, WebM or MOV files are supported.' }, 400);
  if (!Number.isFinite(Number(body.size)) || Number(body.size) <= 0 || Number(body.size) > 512 * 1024 * 1024) return json(c, { error: 'File size must be between 1 byte and 512 MB.' }, 400);
  const key = `blog/${crypto.randomUUID()}.${mediaType.extension}`;
  const uploadId = c.env.PRODUCT_IMAGES ? (await c.env.PRODUCT_IMAGES.createMultipartUpload(key, { httpMetadata: { contentType: normalize(body.contentType), cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { originalName: normalize(body.fileName).slice(0, 160), uploadedBy: actor } })).uploadId : await r2S3CreateMultipartUpload(c.env, key, normalize(body.contentType));
  return json(c, { ok: true, key, uploadId, type: mediaType.type, url: mediaUrl(c.env, c.req.raw, key) }, 201);
});
app.put('/api/admin/blog-media/multipart/part', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!storageConfigured(c.env)) return json(c, { error: 'R2 media storage is not configured.' }, 503);
  const key = c.req.header('X-Upload-Key');
  const uploadId = c.req.header('X-Upload-Id');
  const partNumber = Number(c.req.header('X-Part-Number'));
  if (!validBlogMediaKey(key) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1) return json(c, { error: 'Invalid multipart upload headers.' }, 400);
  if (c.env.PRODUCT_IMAGES) {
    const upload = c.env.PRODUCT_IMAGES.resumeMultipartUpload(key!, uploadId);
    const part = await upload.uploadPart(partNumber, await c.req.raw.arrayBuffer());
    return json(c, { ok: true, part: { partNumber: part.partNumber, etag: part.etag } });
  }
  const etag = await r2S3UploadPart(c.env, key!, uploadId, partNumber, await c.req.raw.arrayBuffer());
  return json(c, { ok: true, part: { partNumber, etag } });
});
app.post('/api/admin/blog-media/multipart/complete', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!storageConfigured(c.env)) return json(c, { error: 'R2 media storage is not configured.' }, 503);
  const key = c.req.header('X-Upload-Key');
  const uploadId = c.req.header('X-Upload-Id');
  if (!validBlogMediaKey(key) || !uploadId) return json(c, { error: 'Invalid multipart upload headers.' }, 400);
  const body = await c.req.json<{ parts?: Array<{ partNumber?: number; etag?: string }>; fileName?: string; contentType?: string }>();
  const parts = (body.parts || []).map((part) => ({ partNumber: Number(part.partNumber), etag: normalize(part.etag) })).filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag).sort((a, b) => a.partNumber - b.partNumber);
  if (!parts.length) return json(c, { error: 'At least one uploaded part is required.' }, 400);
  if (c.env.PRODUCT_IMAGES) {
    const upload = c.env.PRODUCT_IMAGES.resumeMultipartUpload(key!, uploadId);
    await upload.complete(parts);
  } else {
    await r2S3CompleteMultipartUpload(c.env, key!, uploadId, parts);
  }
  const mediaType = blogMediaTypes[normalize(body.contentType)] || { type: 'video' as const };
  return json(c, { ok: true, media: blogMediaResult(c.env, c.req.raw, key!, mediaType.type, normalize(body.fileName) || 'blog-media') }, 201);
});
app.get('/media/*', async (c) => {
  if (!storageConfigured(c.env)) return c.text('Product media storage is not enabled.', 503);
  const key = c.req.path.replace(/^\/media\//, '');
  if (!key || !/^[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|gif|avif|mp4|webm|mov)$/i.test(key)) return c.text('Invalid media path.', 400);
  const response = await storageGet(c.env, key);
  return response || c.text('Media not found.', 404);
});

app.get('/api/admin/media-status', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const configured = storageConfigured(c.env);
  let reachable: boolean | null = configured ? false : null;
  if (!c.env.PRODUCT_IMAGES && r2S3Configured(c.env)) {
    try { reachable = (await r2S3List(c.env)).ok; } catch { reachable = false; }
  } else if (c.env.PRODUCT_IMAGES) reachable = true;
  return json(c, { configured, reachable, mode: c.env.PRODUCT_IMAGES ? 'worker-binding' : r2S3Configured(c.env) ? 's3-api' : 'disabled', accountId: c.env.R2_ACCOUNT_ID || null, bucket: c.env.R2_BUCKET_NAME || null });
});

app.post('/api/admin/product-media', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!storageConfigured(c.env)) return json(c, { error: 'R2 media storage is not configured.' }, 503);
  const form = await c.req.raw.formData().catch(() => null);
  const fileValue = form?.get('file');
  if (!fileValue || typeof fileValue === 'string') return json(c, { error: 'Choose an image file first.' }, 400);
  const file = fileValue as File;
  const allowedTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  const extension = allowedTypes[file.type];
  if (!extension) return json(c, { error: 'Only JPG, PNG, WEBP, GIF or AVIF images are supported.' }, 400);
  if (!file.size || file.size > 8 * 1024 * 1024) return json(c, { error: 'Each image must be smaller than 8 MB.' }, 400);
  const key = `products/${crypto.randomUUID()}.${extension}`;
  await storagePut(c.env, key, file.stream(), file.type);
  return json(c, { ok: true, media: { type: 'image', url: mediaUrl(c.env, c.req.raw, key), alt: file.name.replace(/\.[^.]+$/, '').slice(0, 160) } }, 201);
});

app.post('/api/admin/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch((): { username?: string; password?: string } => ({}));
  const expectedUsername = c.env.ADMIN_USERNAME ?? 'admin';
  if (normalize(body.username).toLowerCase() !== expectedUsername.toLowerCase() || !c.env.ADMIN_PASSWORD || body.password !== c.env.ADMIN_PASSWORD) return json(c, { error: 'Invalid administrator credentials.' }, 401);
  const token = await createAdminSession(c.env, expectedUsername);
  return json(c, { ok: true, token, expiresInHours: 12, username: expectedUsername });
});

app.get('/api/admin/session', async (c) => {
  const username = await adminPrincipal(c);
  return username ? json(c, { authenticated: true, username }) : json(c, { authenticated: false }, 401);
});

app.post('/api/admin/logout', async (c) => {
  const authorization = c.req.header('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (token) await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json(c, { ok: true });
});

app.post('/api/account/register', async (c) => {
  const body = await c.req.json<{ name?: string; phone?: string; email?: string; password?: string }>();
  const name = normalize(body.name);
  const phone = normalize(body.phone);
  const password = normalize(body.password);
  if (!name || !phone || password.length < 8) return json(c, { error: 'Name, phone, and a password of at least 8 characters are required.' }, 400);
  const existing = await c.env.DB.prepare('SELECT id, password_hash AS passwordHash FROM customers WHERE phone = ?').bind(phone).first<{ id: number; passwordHash: string | null }>();
  if (existing?.passwordHash) return json(c, { error: 'An account already exists for this mobile number.' }, 409);
  const passwordHash = await hashPassword(password);
  const customer = existing
    ? await c.env.DB.prepare("UPDATE customers SET name = ?, email = ?, password_hash = ?, account_status = 'registered', updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING id").bind(name, body.email ?? null, passwordHash, existing.id).first<{ id: number }>()
    : await c.env.DB.prepare("INSERT INTO customers(name, phone, email, password_hash, account_status) VALUES (?, ?, ?, ?, 'registered') RETURNING id").bind(name, phone, body.email ?? null, passwordHash).first<{ id: number }>();
  if (!customer) return json(c, { error: 'Could not create account.' }, 500);
  const token = await createCustomerSession(c.env, customer.id);
  c.executionCtx.waitUntil(syncAccountLead(c.env, [new Date().toISOString(), 'account_created', name, phone, normalize(body.email) || null, customer.id, 'customer_account', 'registered']).catch(() => undefined));
  return json(c, { ok: true, token, customer: { id: customer.id, name, phone, email: body.email ?? null } }, 201);
});

app.post('/api/account/login', async (c) => {
  const body = await c.req.json<{ phone?: string; password?: string }>();
  const phone = normalize(body.phone);
  const customer = await c.env.DB.prepare('SELECT id, name, phone, email, password_hash AS passwordHash FROM customers WHERE phone = ?').bind(phone).first<{ id: number; name: string; phone: string; email: string | null; passwordHash: string | null }>();
  if (!customer || !(await verifyPassword(normalize(body.password), customer.passwordHash))) return json(c, { error: 'Invalid mobile number or password.' }, 401);
  await c.env.DB.prepare('UPDATE customers SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(customer.id).run();
  const token = await createCustomerSession(c.env, customer.id);
  return json(c, { ok: true, token, customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email } });
});

app.get('/api/account/me', async (c) => {
  const session = await customerPrincipal(c);
  if (!session) return json(c, { error: 'Unauthorized account request.' }, 401);
  const customer = await c.env.DB.prepare('SELECT id, name, phone, email, district, upazila, address, account_status AS accountStatus FROM customers WHERE id = ?').bind(session.customerId).first();
  return customer ? json(c, { customer }) : json(c, { error: 'Customer not found.' }, 404);
});

app.get('/api/account/orders', async (c) => {
  const session = await customerPrincipal(c);
  if (!session) return json(c, { error: 'Unauthorized account request.' }, 401);
  const result = await c.env.DB.prepare('SELECT id, order_code AS orderCode, invoice_number AS invoiceNumber, subtotal, delivery_fee AS deliveryFee, status, payment_status AS paymentStatus, courier_status AS courierStatus, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.customerId).all<{ id: number; orderCode: string; invoiceNumber: string; subtotal: number; deliveryFee: number; status: string; paymentStatus: string | null; courierStatus: string | null; createdAt: string }>();
  const orders = await Promise.all(result.results.map(async (order) => {
    const items = await c.env.DB.prepare('SELECT product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice FROM order_items WHERE order_id = ? ORDER BY id').bind(order.id).all();
    return { ...order, total: Number(order.subtotal || 0) + Number(order.deliveryFee || 0), items: items.results };
  }));
  return json(c, { orders });
});

app.post('/api/reviews', async (c) => {
  const body = await c.req.json<{ productId?: number; productSlug?: string; rating?: number; reviewText?: string; reviewerName?: string; orderCode?: string; invoiceNumber?: string; phone?: string }>();
  const productId = Number(body.productId || 0);
  const product = productId ? await c.env.DB.prepare('SELECT id, name FROM products WHERE id = ? AND active = 1').bind(productId).first<{ id: number; name: string }>() : await c.env.DB.prepare('SELECT id, name FROM products WHERE slug = ? AND active = 1').bind(normalize(body.productSlug)).first<{ id: number; name: string }>();
  const rating = Math.floor(Number(body.rating || 0));
  const reviewText = normalize(body.reviewText).slice(0, 1200);
  if (!product || rating < 1 || rating > 5 || reviewText.length < 3) return json(c, { error: 'Product, 1–5 star rating, and a review of at least 3 characters are required.' }, 400);
  const session = await customerPrincipal(c);
  const purchase = await findVerifiedPurchase(c.env, { productId: product.id, orderCode: body.orderCode, invoiceNumber: body.invoiceNumber, phone: body.phone }, session?.customerId);
  if (!purchase) return json(c, { error: session ? 'We could not find a shipped or delivered purchase of this product in your account.' : 'Please provide the phone number and order or invoice number used for this purchase.' }, 403);
  const reviewerName = session ? (await c.env.DB.prepare('SELECT name FROM customers WHERE id = ?').bind(purchase.customerId).first<{ name: string }>())?.name : normalize(body.reviewerName) || purchase.customerName;
  try {
    const result = await c.env.DB.prepare("INSERT INTO product_reviews(product_id, customer_id, order_id, reviewer_name, rating, review_text, status, verified_purchase) VALUES (?, ?, ?, ?, ?, ?, 'pending', 1) RETURNING id, rating, review_text AS reviewText, status").bind(product.id, session?.customerId || purchase.customerId, purchase.id, reviewerName || 'Verified buyer', rating, reviewText).first();
    return json(c, { ok: true, review: result, message: 'Review submitted for admin approval.' }, 201);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return json(c, { error: 'You have already submitted a review for this product and order.' }, 409);
    throw error;
  }
});

app.get('/api/products/:slug/reviews', async (c) => {
  const product = await c.env.DB.prepare('SELECT id, rating, review_count AS reviewCount FROM products WHERE slug = ? AND active = 1').bind(normalize(c.req.param('slug'))).first<{ id: number; rating: number; reviewCount: number }>();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  const reviews = await c.env.DB.prepare("SELECT reviewer_name AS reviewerName, rating, review_text AS reviewText, created_at AS createdAt FROM product_reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50").bind(product.id).all();
  return json(c, { ratingSummary: { average: Number(product.rating || 0), count: Number(product.reviewCount || 0) }, reviews: reviews.results });
});

app.post('/api/account/logout', async (c) => {
  const token = getBearer(c);
  if (token) await c.env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json(c, { ok: true });
});

app.post('/api/account/returns', async (c) => {
  const session = await customerPrincipal(c);
  if (!session) return json(c, { error: 'Unauthorized account request.' }, 401);
  const body = await c.req.json<{ orderCode?: string; reason?: string; notes?: string }>();
  const order = await c.env.DB.prepare("SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.delivery_fee AS deliveryFee, o.payment_method AS paymentMethod, o.status, c.name AS customerName, c.phone AS customerPhone, c.email AS customerEmail FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ? AND o.customer_id = ?").bind(normalize(body.orderCode), session.customerId).first<{ id: number; orderCode: string; invoiceNumber: string | null; subtotal: number; deliveryFee: number; paymentMethod: string; status: OrderStatus; customerName: string; customerPhone: string; customerEmail: string | null }>();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  if (!['delivered', 'shipped'].includes(order.status)) return json(c, { error: 'A return can be requested after shipment or delivery.' }, 400);
  const returnCode = `RET-${Date.now().toString(36).toUpperCase()}`;
  const result = await c.env.DB.prepare("INSERT INTO returns(order_id, return_code, reason, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, 'customer') RETURNING id, return_code AS returnCode, status").bind(order.id, returnCode, normalize(body.reason), order.subtotal, normalize(body.notes) || null).first();
  await c.env.DB.prepare("UPDATE orders SET return_status = 'requested', return_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(normalize(body.reason), order.id).run();
  await createAdminNotification(c.env, { type: 'return', title: 'New return request', message: `Return ${result?.returnCode || returnCode} was requested for order ${order.orderCode}.`, entityType: 'return', entityId: returnCode });
  c.executionCtx.waitUntil(syncActivityLead(c.env, [new Date().toISOString(), 'return', order.orderCode, order.invoiceNumber, order.customerName, order.customerPhone, order.customerEmail || null, 'requested', order.paymentMethod, order.subtotal, order.deliveryFee, Number(order.subtotal || 0) + Number(order.deliveryFee || 0), null, returnCode, normalize(body.reason), normalize(body.notes) || null]).catch(async () => { await createAdminNotification(c.env, { type: 'integration', title: 'Google Sheet sync failed', message: `Return lead ${returnCode} could not be added to the activity sheet.`, entityType: 'return', entityId: returnCode }); }));
  return json(c, { ok: true, return: result }, 201);
});

app.get('/api/orders/:orderCode/invoice', async (c) => {
  const admin = await adminPrincipal(c);
  const customerSession = admin ? null : await customerPrincipal(c);
  const order = await c.env.DB.prepare('SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.order_source AS orderSource, o.package_weight_grams AS packageWeightGrams, o.created_at AS createdAt, c.id AS customerId, c.name, c.phone, c.email, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(normalize(c.req.param('orderCode'))).first<{ id: number; orderCode: string; invoiceNumber: string | null; subtotal: number; deliveryFee: number; deliveryZone: string; paymentMethod: string; paymentStatus: string; status: string; orderSource: string; packageWeightGrams: number; createdAt: string; customerId: number; name: string; phone: string; email: string | null; district: string; upazila: string; address: string }>();
  if (!order || (!admin && (!customerSession || customerSession.customerId !== order.customerId))) return json(c, { error: 'Order not found.' }, 404);
  const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, oi.unit_price AS unitPrice, p.id AS productId, p.slug AS productSlug, p.sku AS sku, p.barcode AS barcode, COALESCE(p.weight_grams, 0) AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC').bind(order.id).all();
  const computedWeight = items.results.reduce((sum, item) => sum + Number((item as { quantity: number; weightGrams: number }).quantity) * Number((item as { quantity: number; weightGrams: number }).weightGrams), 0);
  return json(c, { invoice: { ...order, packageWeightGrams: Math.max(order.packageWeightGrams || 0, computedWeight), total: order.subtotal + order.deliveryFee }, items: items.results });
});

app.get('/api/admin/reviews', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const status = normalize(c.req.query('status'));
  const condition = status ? 'AND r.status = ?' : '';
  const result = await c.env.DB.prepare(`SELECT r.id, r.status, r.reviewer_name AS reviewerName, r.rating, r.review_text AS reviewText, r.verified_purchase AS verifiedPurchase, r.created_at AS createdAt, p.id AS productId, p.name AS productName, o.order_code AS orderCode, o.invoice_number AS invoiceNumber FROM product_reviews r JOIN products p ON p.id = r.product_id JOIN orders o ON o.id = r.order_id WHERE 1 = 1 ${condition} ORDER BY r.created_at DESC LIMIT 100`).bind(...(status ? [status] : [])).all();
  return json(c, { reviews: result.results });
});

app.patch('/api/admin/reviews/:id', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ status?: string }>();
  const status = normalize(body.status);
  if (!['pending','approved','rejected'].includes(status)) return json(c, { error: 'Unsupported review status.' }, 400);
  const review = await c.env.DB.prepare('SELECT product_id AS productId FROM product_reviews WHERE id = ?').bind(id).first<{ productId: number }>();
  if (!review) return json(c, { error: 'Review not found.' }, 404);
  await c.env.DB.prepare('UPDATE product_reviews SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, id).run();
  await refreshProductRating(c.env, review.productId);
  return json(c, { ok: true, reviewId: id, status, updatedBy: actor });
});

app.get('/api/admin/returns', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const status = normalize(c.req.query('status'));
  const condition = status ? 'WHERE r.status = ?' : '';
  const result = await c.env.DB.prepare(`SELECT r.id, r.return_code AS returnCode, r.status, r.reason, r.amount, r.notes, r.created_by AS createdBy, r.created_at AS createdAt, o.order_code AS orderCode, c.name, c.phone FROM returns r JOIN orders o ON o.id = r.order_id JOIN customers c ON c.id = o.customer_id ${condition} ORDER BY r.created_at DESC LIMIT 100`).bind(...(status ? [status] : [])).all();
  return json(c, { returns: result.results });
});

app.patch('/api/admin/returns/:id', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ status?: string; notes?: string; refundAmount?: number }>();
  const allowed = ['requested','approved','picked_up','received','refunded','rejected','cancelled'];
  if (!allowed.includes(normalize(body.status))) return json(c, { error: 'Unsupported return status.' }, 400);
  const current = await c.env.DB.prepare('SELECT id, order_id AS orderId, status FROM returns WHERE id = ?').bind(id).first<{ id: number; orderId: number; status: string }>();
  if (!current) return json(c, { error: 'Return not found.' }, 404);
  await c.env.DB.prepare('UPDATE returns SET status = ?, notes = COALESCE(?, notes), amount = COALESCE(?, amount), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(normalize(body.status), normalize(body.notes) || null, numberOrNull(body.refundAmount), id).run();
  if (normalize(body.status) === 'received' && !['received','refunded'].includes(current.status)) await restoreOrderInventory(c.env, current.orderId, actor, 'return');
  await c.env.DB.prepare("UPDATE orders SET return_status = ?, refund_status = CASE WHEN ? = 'refunded' THEN 'refunded' ELSE refund_status END, refund_amount = CASE WHEN ? = 'refunded' THEN COALESCE(?, refund_amount) ELSE refund_amount END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(normalize(body.status), normalize(body.status), normalize(body.status), numberOrNull(body.refundAmount), current.orderId).run();
  return json(c, { ok: true, returnId: id, status: normalize(body.status) });
});

app.get('/api/admin/pos/products', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const q = normalize(c.req.query('q'));
  const result = await c.env.DB.prepare('SELECT id, name, sku, barcode, price, cost_price AS costPrice, stock FROM products WHERE active = 1 AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) ORDER BY name ASC LIMIT 100').bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return json(c, { products: result.results });
});

app.post('/api/admin/pos/sales', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ items?: Array<{ productId: number; quantity: number }>; paymentMethod?: 'cash'|'bkash'|'nagad'|'rocket'|'card'; discount?: number }>();
  if (!body.items?.length || !body.paymentMethod) return json(c, { error: 'POS items and payment method are required.' }, 400);
  const ids = body.items.map((item) => item.productId);
  const products = await c.env.DB.prepare(`SELECT id, name, barcode, price, cost_price AS costPrice, stock FROM products WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: number; name: string; barcode: string | null; price: number; costPrice: number; stock: number }>();
  const byId = new Map(products.results.map((product) => [product.id, product]));
  const items = body.items.map((item) => { const product = byId.get(item.productId); if (!product || item.quantity < 1 || product.stock < item.quantity) throw new Error('A POS product is unavailable or out of stock.'); return { ...item, product }; });
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discount = Math.max(0, Math.min(subtotal, Number(body.discount) || 0));
  const receiptNumber = `POS-${Date.now().toString(36).toUpperCase()}`;
  const sale = await c.env.DB.prepare('INSERT INTO pos_sales(receipt_number, subtotal, discount, payment_method, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id, receipt_number AS receiptNumber').bind(receiptNumber, subtotal, discount, body.paymentMethod, actor).first<{ id: number; receiptNumber: string }>();
  if (!sale) return json(c, { error: 'Could not create POS sale.' }, 500);
  const statements: D1PreparedStatement[] = [];
  for (const item of items) {
    const next = item.product.stock - item.quantity;
    statements.push(
      c.env.DB.prepare('INSERT INTO pos_sale_items(sale_id, product_id, product_name, barcode, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(sale.id, item.product.id, item.product.name, item.product.barcode, item.quantity, item.product.price, item.product.costPrice),
      c.env.DB.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(next, item.product.id),
      c.env.DB.prepare('INSERT INTO stock_movements(product_id, quantity_delta, quantity_after, reason, note, actor) VALUES (?, ?, ?, \'sale\', ?, ?)').bind(item.product.id, -item.quantity, next, `POS ${receiptNumber}`, actor),
    );
  }
  await c.env.DB.batch(statements);
  const posItemSummary = items.map((item) => `${item.product.name} × ${item.quantity}`).join(' · ');
  c.executionCtx.waitUntil(syncActivityLead(c.env, [new Date().toISOString(), 'pos_sale', sale.receiptNumber, null, null, null, null, 'completed', body.paymentMethod, subtotal - discount, 0, subtotal - discount, posItemSummary, null, null, null]).catch(async () => { await createAdminNotification(c.env, { type: 'integration', title: 'Google Sheet sync failed', message: `POS sale ${sale.receiptNumber} could not be added to the activity sheet.`, entityType: 'pos_sale', entityId: sale.receiptNumber }); }));
  return json(c, { ok: true, sale: { ...sale, subtotal, discount, total: subtotal - discount, paymentMethod: body.paymentMethod } }, 201);
});

app.get('/api/content/home', async (c) => {
  const content = await c.env.DB.prepare("SELECT content_key AS key, content_type AS type, title, body_json AS body FROM cms_content WHERE status = 'published' ORDER BY content_key").all();
  const posts = await c.env.DB.prepare("SELECT slug, title, excerpt, body, category, subcategory, content_type AS contentType, media_url AS mediaUrl, image_url AS imageUrl, cover_image_url AS coverImageUrl, extra_file_url AS extraFileUrl, publish_date AS publishDate, duration, priority, seo_title AS seoTitle, meta_description AS metaDescription, keywords, allow_search_engines AS allowSearchEngines, rights, license_url AS licenseUrl, published_at AS publishedAt, author FROM blog_posts WHERE status = 'published' AND (publish_date IS NULL OR publish_date <= CURRENT_TIMESTAMP) ORDER BY priority DESC, published_at DESC, created_at DESC LIMIT 12").all();
  const offers = await c.env.DB.prepare("SELECT code, title, description, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, starts_at AS startsAt, ends_at AS endsAt FROM offers WHERE active = 1 AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP) ORDER BY created_at DESC LIMIT 20").all();
  const banners = await c.env.DB.prepare("SELECT id, title, eyebrow, body, image_url AS imageUrl, link_url AS linkUrl, placement, category_slug AS categorySlug, sort_order AS sortOrder, marquee_speed AS marqueeSpeed FROM marketing_banners WHERE active = 1 AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP) ORDER BY sort_order ASC, updated_at DESC, id DESC LIMIT 30").all();
  return json(c, { content: content.results, posts: posts.results, offers: offers.results, banners: banners.results });
});

app.post('/api/newsletter', async (c) => {
  const body = await c.req.json<{ email?: unknown; source?: unknown }>().catch((): { email?: unknown; source?: unknown } => ({}));
  const email = normalize(body.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return json(c, { error: 'Please enter a valid email address.' }, 400);
  const source = normalize(body.source).slice(0, 40) || 'footer';
  await c.env.DB.prepare("INSERT INTO newsletter_leads(email, source, status, updated_at, last_seen_at) VALUES (?, ?, 'subscribed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET source = excluded.source, status = 'subscribed', updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP").bind(email, source).run();
  await createAdminNotification(c.env, { type: 'lead', title: 'New newsletter lead', message: `A new newsletter signup arrived from ${source}.`, entityType: 'newsletter_lead', entityId: email });
  return json(c, { ok: true, message: 'You are on the softer list.' });
});

app.get('/api/content/pages/:slug', async (c) => {
  const page = await c.env.DB.prepare("SELECT slug, title, body, seo_title AS seoTitle, seo_description AS seoDescription FROM site_pages WHERE slug = ? AND status = 'published'").bind(normalize(c.req.param('slug'))).first();
  return page ? json(c, { page }) : json(c, { error: 'Page not found.' }, 404);
});
app.get('/api/content/posts', async (c) => {
  const posts = await c.env.DB.prepare("SELECT slug, title, excerpt, category, subcategory, content_type AS contentType, media_url AS mediaUrl, image_url AS imageUrl, cover_image_url AS coverImageUrl, publish_date AS publishDate, duration, priority, seo_title AS seoTitle, meta_description AS metaDescription, keywords, allow_search_engines AS allowSearchEngines, author, published_at AS publishedAt FROM blog_posts WHERE status = 'published' AND (publish_date IS NULL OR publish_date <= CURRENT_TIMESTAMP) ORDER BY priority DESC, published_at DESC, created_at DESC LIMIT 50").all();
  return json(c, { posts: posts.results });
});
app.get('/api/content/posts/:slug', async (c) => {
  const post = await c.env.DB.prepare("SELECT slug, title, excerpt, body, category, subcategory, content_type AS contentType, media_url AS mediaUrl, image_url AS imageUrl, cover_image_url AS coverImageUrl, extra_file_url AS extraFileUrl, publish_date AS publishDate, duration, priority, seo_title AS seoTitle, meta_description AS metaDescription, keywords, allow_search_engines AS allowSearchEngines, rights, license_url AS licenseUrl, author, published_at AS publishedAt FROM blog_posts WHERE slug = ? AND status = 'published' AND (publish_date IS NULL OR publish_date <= CURRENT_TIMESTAMP)").bind(normalize(c.req.param('slug'))).first();
  return post ? json(c, { post }) : json(c, { error: 'Post not found.' }, 404);
});

app.get('/api/admin/content', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const [content, pages, posts, offers, categories, banners, newsletter] = await Promise.all([
    c.env.DB.prepare('SELECT content_key AS key, content_type AS type, title, body_json AS body, status, updated_by AS updatedBy, updated_at AS updatedAt FROM cms_content ORDER BY content_key').all(),
    c.env.DB.prepare('SELECT id, slug, title, body, status, seo_title AS seoTitle, seo_description AS seoDescription, updated_at AS updatedAt FROM site_pages ORDER BY updated_at DESC').all(),
    c.env.DB.prepare('SELECT id, slug, title, excerpt, body, category, subcategory, content_type AS contentType, media_url AS mediaUrl, image_url AS imageUrl, cover_image_url AS coverImageUrl, extra_file_url AS extraFileUrl, publish_date AS publishDate, duration, priority, seo_title AS seoTitle, meta_description AS metaDescription, keywords, allow_search_engines AS allowSearchEngines, rights, license_url AS licenseUrl, status, published_at AS publishedAt, author, updated_at AS updatedAt FROM blog_posts ORDER BY updated_at DESC').all(),
    c.env.DB.prepare('SELECT id, code, title, description, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, starts_at AS startsAt, ends_at AS endsAt, active FROM offers ORDER BY updated_at DESC').all(),
    c.env.DB.prepare('SELECT id, name, slug, active FROM categories ORDER BY sort_order ASC, name ASC').all(),
    c.env.DB.prepare('SELECT id, title, eyebrow, body, image_url AS imageUrl, link_url AS linkUrl, placement, category_slug AS categorySlug, active, sort_order AS sortOrder, marquee_speed AS marqueeSpeed, starts_at AS startsAt, ends_at AS endsAt, updated_at AS updatedAt FROM marketing_banners ORDER BY placement, sort_order ASC, updated_at DESC, id DESC').all(),
    c.env.DB.prepare('SELECT id, email, source, status, created_at AS createdAt, updated_at AS updatedAt, last_seen_at AS lastSeenAt FROM newsletter_leads ORDER BY created_at DESC LIMIT 500').all(),
  ]);
    return json(c, { content: content.results, pages: pages.results, posts: posts.results, offers: offers.results, categories: categories.results, banners: banners.results, newsletter: newsletter.results });
});
app.get('/api/admin/analytics/summary', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const requestedDays = Number(c.req.query('days') || 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  return json(c, await analyticsSummary(c.env, days));
});

app.get('/api/admin/integrations/status', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!c.env.SERVICE_ACCOUNT_JSON) return json(c, { serviceAccountConfigured: false, sheets: { accountLeads: { configured: false, accessible: false }, activityLeads: { configured: false, accessible: false } } });
  try {
    const token = await googleAccessToken(c.env, 'https://www.googleapis.com/auth/spreadsheets');
    const [accountLeads, activityLeads] = await Promise.all([
      sheetsAccessCheck(c.env.GOOGLE_ACCOUNT_LEADS_SHEET_ID, token),
      sheetsAccessCheck(c.env.GOOGLE_ACTIVITY_LEADS_SHEET_ID, token),
    ]);
    return json(c, { serviceAccountConfigured: true, sheets: { accountLeads, activityLeads } });
  } catch {
    return json(c, { serviceAccountConfigured: true, sheets: { accountLeads: { configured: true, accessible: false, reason: 'Google Sheets authorization failed.' }, activityLeads: { configured: true, accessible: false, reason: 'Google Sheets authorization failed.' } } });
  }
});

app.get('/api/admin/notifications', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const unreadOnly = c.req.query('unread') === '1';
  const query = unreadOnly ? 'SELECT id, type, title, message, entity_type AS entityType, entity_id AS entityId, is_read AS isRead, created_at AS createdAt FROM admin_notifications WHERE is_read = 0 ORDER BY created_at DESC LIMIT 100' : 'SELECT id, type, title, message, entity_type AS entityType, entity_id AS entityId, is_read AS isRead, created_at AS createdAt FROM admin_notifications ORDER BY created_at DESC LIMIT 100';
  const [notifications, unread] = await Promise.all([c.env.DB.prepare(query).all(), c.env.DB.prepare('SELECT COUNT(*) AS count FROM admin_notifications WHERE is_read = 0').first<{ count: number }>()]);
  return json(c, { notifications: notifications.results, unreadCount: Number(unread?.count || 0) });
});

app.patch('/api/admin/notifications/:id/read', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Notification not found.' }, 404);
  await c.env.DB.prepare('UPDATE admin_notifications SET is_read = 1 WHERE id = ?').bind(id).run();
  return json(c, { ok: true, id });
});

app.post('/api/admin/notifications/read-all', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  await c.env.DB.prepare('UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0').run();
  return json(c, { ok: true });
});

app.get('/api/admin/media-library', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const [products, posts] = await Promise.all([
    c.env.DB.prepare('SELECT name, image_url AS url, media_json AS mediaJson FROM products WHERE image_url IS NOT NULL OR media_json IS NOT NULL ORDER BY updated_at DESC LIMIT 200').all<{ name: string; url: string | null; mediaJson: string | null }>(),
    c.env.DB.prepare('SELECT title AS name, cover_image_url AS url, media_url AS mediaUrl FROM blog_posts WHERE cover_image_url IS NOT NULL OR media_url IS NOT NULL ORDER BY updated_at DESC LIMIT 200').all<{ name: string; url: string | null; mediaUrl: string | null }>(),
  ]);
  const media: Array<{ name: string; url: string; source: string }> = [];
  const seen = new Set<string>();
  const add = (name: string, url: unknown, source: string) => { const value = normalize(url); if (!value || !/^(https:\/\/|\/assets\/|\/media\/)/i.test(value) || seen.has(value)) return; seen.add(value); media.push({ name: normalize(name) || 'Rinova media', url: value, source }); };
  products.results.forEach((product) => { add(product.name, product.url, 'product'); let parsed: unknown = []; try { parsed = JSON.parse(product.mediaJson || '[]'); } catch {} if (Array.isArray(parsed)) parsed.forEach((item) => add(product.name, typeof item === 'string' ? item : (item as Record<string, unknown>)?.url, 'product gallery')); });
  posts.results.forEach((post) => { add(post.name, post.url, 'blog cover'); add(post.name, post.mediaUrl, 'blog media'); });
  return json(c, { media });
});
app.put('/api/admin/content/:key', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ type?: string; title?: string; body?: unknown; status?: string }>();
  await c.env.DB.prepare('INSERT INTO cms_content(content_key, content_type, title, body_json, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(content_key) DO UPDATE SET content_type = excluded.content_type, title = excluded.title, body_json = excluded.body_json, status = excluded.status, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP').bind(normalize(c.req.param('key')), normalize(body.type) || 'text', normalize(body.title), JSON.stringify(body.body ?? {}), ['draft','published','archived'].includes(normalize(body.status)) ? normalize(body.status) : 'draft', actor).run();
  return json(c, { ok: true, key: normalize(c.req.param('key')) });
});

app.post('/api/admin/pages', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ slug?: string; title?: string; body?: string; status?: string; seoTitle?: string; seoDescription?: string }>();
  const slug = normalize(body.slug);
  if (!slug || !normalize(body.title)) return json(c, { error: 'Page slug and title are required.' }, 400);
  const status = ['draft','published','archived'].includes(normalize(body.status)) ? normalize(body.status) : 'draft';
  await c.env.DB.prepare('INSERT INTO site_pages(slug, title, body, status, seo_title, seo_description, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body = excluded.body, status = excluded.status, seo_title = excluded.seo_title, seo_description = excluded.seo_description, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP').bind(slug, normalize(body.title), normalize(body.body), status, normalize(body.seoTitle) || null, normalize(body.seoDescription) || null, actor).run();
  return json(c, { ok: true, slug });
});

app.post('/api/admin/posts', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ slug?: string; title?: string; excerpt?: string; body?: string; category?: string; subcategory?: string; contentType?: string; mediaUrl?: string; imageUrl?: string; coverImageUrl?: string; extraFileUrl?: string; publishDate?: string; duration?: string; priority?: number; seoTitle?: string; metaDescription?: string; keywords?: string; allowSearchEngines?: boolean | string; rights?: string; licenseUrl?: string; status?: string }>();
  const slug = normalize(body.slug).toLowerCase();
  if (!slug || !normalize(body.title)) return json(c, { error: 'Post slug and title are required.' }, 400);
  const status = ['draft','published','archived'].includes(normalize(body.status)) ? normalize(body.status) : 'draft';
  const coverImageUrl = normalize(body.coverImageUrl || body.imageUrl);
  const seo = calculateBlogSeo({ ...body, slug, coverImageUrl });
  if (status === 'published' && !seo.ready) return json(c, { error: 'Complete every SEO readiness item before publishing.', seo }, 400);
  const publishedAt = status === 'published' ? (normalize(body.publishDate) || new Date().toISOString()) : null;
  const allowSearchEngines = body.allowSearchEngines === false || normalize(body.allowSearchEngines).toLowerCase() === 'false' ? 0 : 1;
  const contentType = ['article','video'].includes(normalize(body.contentType)) ? normalize(body.contentType) : 'article';
  const rights = normalize(body.rights) || 'This is hosted here. The page will claim your copyright and link to your licence.';
  await c.env.DB.prepare('INSERT INTO blog_posts(slug, title, excerpt, body, image_url, category, subcategory, content_type, media_url, cover_image_url, extra_file_url, publish_date, duration, priority, seo_title, meta_description, keywords, allow_search_engines, rights, license_url, status, published_at, updated_by, author, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, image_url = excluded.image_url, category = excluded.category, subcategory = excluded.subcategory, content_type = excluded.content_type, media_url = excluded.media_url, cover_image_url = excluded.cover_image_url, extra_file_url = excluded.extra_file_url, publish_date = excluded.publish_date, duration = excluded.duration, priority = excluded.priority, seo_title = excluded.seo_title, meta_description = excluded.meta_description, keywords = excluded.keywords, allow_search_engines = excluded.allow_search_engines, rights = excluded.rights, license_url = excluded.license_url, status = excluded.status, published_at = excluded.published_at, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP').bind(slug, normalize(body.title), normalize(body.excerpt), normalize(body.body), coverImageUrl || null, normalize(body.category), normalize(body.subcategory), contentType, normalize(body.mediaUrl) || null, coverImageUrl || null, normalize(body.extraFileUrl) || null, normalize(body.publishDate) || null, normalize(body.duration) || null, Math.max(0, Math.floor(Number(body.priority) || 0)), normalize(body.seoTitle), normalize(body.metaDescription), normalize(body.keywords), allowSearchEngines, rights, normalize(body.licenseUrl) || null, status, publishedAt, actor, 'Rinova BD').run();
  return json(c, { ok: true, slug, status, seo });
});

app.post('/api/admin/offers', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ code?: string; title?: string; description?: string; discountType?: string; discountValue?: number; minSubtotal?: number; startsAt?: string; endsAt?: string; active?: boolean }>();
  if (!normalize(body.title)) return json(c, { error: 'Offer title is required.' }, 400);
  const type = ['fixed','percentage','free_delivery'].includes(normalize(body.discountType)) ? normalize(body.discountType) : 'fixed';
  await c.env.DB.prepare('INSERT INTO offers(code, title, description, discount_type, discount_value, min_subtotal, starts_at, ends_at, active, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(normalize(body.code) || null, normalize(body.title), normalize(body.description), type, Math.max(0, Number(body.discountValue) || 0), Math.max(0, Number(body.minSubtotal) || 0), normalize(body.startsAt) || null, normalize(body.endsAt) || null, body.active === false ? 0 : 1, actor).run();
  return json(c, { ok: true, title: normalize(body.title) }, 201);
});

app.post('/api/admin/marketing-banners', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<MarketingBannerInput>();
  let values;
  try { values = marketingBannerValues(body); } catch (error) { return json(c, { error: error instanceof Error ? error.message : 'Invalid banner.' }, 400); }
  if (!values.title && !values.body && !values.imageUrl) return json(c, { error: 'Add a title, message or image to the banner.' }, 400);
  await c.env.DB.prepare('INSERT INTO marketing_banners(title, eyebrow, body, image_url, link_url, placement, category_slug, active, sort_order, marquee_speed, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(values.title, values.eyebrow, values.body, values.imageUrl, values.linkUrl, values.placement, values.categorySlug, values.active, values.sortOrder, values.marqueeSpeed, values.startsAt, values.endsAt).run();
  return json(c, { ok: true, title: values.title }, 201);
});
app.patch('/api/admin/marketing-banners/:id', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid banner id.' }, 400);
  const body = await c.req.json<MarketingBannerInput>();
  let values;
  try { values = marketingBannerValues(body); } catch (error) { return json(c, { error: error instanceof Error ? error.message : 'Invalid banner.' }, 400); }
  if (!values.title && !values.body && !values.imageUrl) return json(c, { error: 'Add a title, message or image to the banner.' }, 400);
  const result = await c.env.DB.prepare('UPDATE marketing_banners SET title = ?, eyebrow = ?, body = ?, image_url = ?, link_url = ?, placement = ?, category_slug = ?, active = ?, sort_order = ?, marquee_speed = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(values.title, values.eyebrow, values.body, values.imageUrl, values.linkUrl, values.placement, values.categorySlug, values.active, values.sortOrder, values.marqueeSpeed, values.startsAt, values.endsAt, id).run();
  if (!result.meta.changes) return json(c, { error: 'Banner not found.' }, 404);
  return json(c, { ok: true, id, updatedBy: actor });
});

app.post('/api/chat/customer', async (c) => {
  const body = await c.req.json<{ visitorKey?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string }> }>();
  const messages = (body.messages ?? []).filter((message) => ['user','assistant'].includes(message.role) && normalize(message.content)).slice(-8);
  if (!messages.length || messages.at(-1)?.role !== 'user') return json(c, { error: 'A user message is required.' }, 400);
  const visitorKey = normalize(body.visitorKey).slice(0, 120) || `visitor-${crypto.randomUUID()}`;
  const conversation = await c.env.DB.prepare("INSERT INTO chat_conversations(visitor_key, channel) VALUES (?, 'customer_ai') RETURNING id").bind(visitorKey).first<{ id: number }>();
  if (!conversation) return json(c, { error: 'Could not start chat.' }, 500);
  await c.env.DB.prepare("INSERT INTO chat_messages(conversation_id, sender, content, provider) VALUES (?, 'user', ?, 'browser')").bind(conversation.id, messages.at(-1)!.content).run();
  const answer = await runShopAssistant(c.env, 'customer', messages);
  const productLinks = await findRelevantProducts(c.env, messages.at(-1)!.content);
  await c.env.DB.prepare("INSERT INTO chat_messages(conversation_id, sender, content, provider) VALUES (?, 'assistant', ?, ?)").bind(conversation.id, answer.text, answer.provider).run();
  return json(c, { ok: true, reply: answer.text, products: productLinks, provider: answer.provider, visitorKey });
});

app.post('/api/admin/chat', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ messages?: Array<{ role: 'user' | 'assistant'; content: string }> }>();
  const messages = (body.messages ?? []).filter((message) => ['user','assistant'].includes(message.role) && normalize(message.content)).slice(-8);
  if (!messages.length || messages.at(-1)?.role !== 'user') return json(c, { error: 'A user message is required.' }, 400);
  const conversation = await c.env.DB.prepare("INSERT INTO chat_conversations(visitor_key, channel, staff_scope) VALUES (?, 'staff_ai', ? ) RETURNING id").bind(`staff-${actor}`, actor).first<{ id: number }>();
  if (!conversation) return json(c, { error: 'Could not start staff chat.' }, 500);
  const answer = await runShopAssistant(c.env, 'staff', messages);
  await c.env.DB.prepare("INSERT INTO chat_messages(conversation_id, sender, content, provider) VALUES (?, 'assistant', ?, ?)").bind(conversation.id, answer.text, answer.provider).run();
  return json(c, { ok: true, reply: answer.text });
});

app.get('/api/admin/overview', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const period = Math.min(Math.max(Number(c.req.query('days') ?? 30) || 30, 7), 90);
  const revenue = await c.env.DB.prepare("SELECT COALESCE(SUM(o.subtotal + o.delivery_fee), 0) AS revenue, COUNT(*) AS orders FROM orders o WHERE o.created_at >= datetime('now', ?) AND o.status IN ('confirmed','processing','shipped','delivered')").bind(`-${period} days`).first<{ revenue: number; orders: number }>();
  const profit = await c.env.DB.prepare("SELECT COALESCE(SUM((oi.unit_price - COALESCE(p.cost_price, 0)) * oi.quantity), 0) AS grossProfit FROM orders o JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id WHERE o.created_at >= datetime('now', ?) AND o.status IN ('confirmed','processing','shipped','delivered')").bind(`-${period} days`).first<{ grossProfit: number }>();
  const stock = await c.env.DB.prepare('SELECT COALESCE(SUM(stock), 0) AS units, COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0) AS costValue, COALESCE(SUM(stock * price), 0) AS retailValue, SUM(CASE WHEN stock <= low_stock_threshold THEN 1 ELSE 0 END) AS needsRestock, COUNT(*) AS catalogue FROM products WHERE active = 1').first<{ units: number; costValue: number; retailValue: number; needsRestock: number; catalogue: number }>();
  const pipeline = await c.env.DB.prepare('SELECT status, COUNT(*) AS orders, COALESCE(SUM(subtotal + delivery_fee), 0) AS value FROM orders GROUP BY status ORDER BY orders DESC').all();
  const topProducts = await c.env.DB.prepare("SELECT oi.product_name AS productName, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.created_at >= datetime('now', ?) AND o.status IN ('confirmed','processing','shipped','delivered') GROUP BY oi.product_id, oi.product_name ORDER BY revenue DESC LIMIT 8").bind(`-${period} days`).all();
  return json(c, { periodDays: period, revenue: revenue ?? { revenue: 0, orders: 0 }, grossProfit: profit?.grossProfit ?? 0, stock: stock ?? { units: 0, costValue: 0, retailValue: 0, needsRestock: 0, catalogue: 0 }, pipeline: pipeline.results, topProducts: topProducts.results });
});

function maskSecret(value: string | undefined) { const secret = normalize(value); return secret ? `${secret.slice(0, 3)}${'•'.repeat(Math.max(4, secret.length - 6))}${secret.slice(-3)}` : 'Not configured'; }
app.post('/api/admin/steadfast/test', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!steadfastConfigured(c.env)) return json(c, { error: 'SteadFast API key and Secret key are not configured.' }, 400);
  try { const result = await steadfastRequest(c.env, '/balance'); return json(c, { ok: true, message: 'SteadFast credentials accepted.', balance: result.current_balance ?? result.balance ?? null }); } catch (error) { return json(c, { error: error instanceof Error ? error.message : 'SteadFast connection test failed.' }, 502); }
});
app.get('/api/admin/steadfast/config', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const requestUrl = new URL(c.req.url);
  return json(c, { configured: steadfastConfigured(c.env), baseUrl: (c.env.STEADFAST_BASE_URL ?? 'https://portal.packzy.com/api/v1').replace(/\/$/, ''), apiKey: maskSecret(c.env.STEADFAST_API_KEY), secretKey: maskSecret(c.env.STEADFAST_SECRET_KEY), webhookToken: maskSecret(c.env.STEADFAST_WEBHOOK_TOKEN), webhookUrl: `${requestUrl.origin}/api/webhooks/steadfast`, supportedServices: ['SteadFast Courier', 'Pathao Courier', 'RedX', 'Paperfly', 'Sundarban Courier', 'Local delivery / pickup'] });
});
app.get('/api/admin/settings', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const result = await c.env.DB.prepare('SELECT setting_key AS key, setting_value AS value FROM store_settings ORDER BY setting_key').all<{ key: string; value: string }>();
  return json(c, { settings: Object.fromEntries(result.results.map((item) => [item.key, item.value])) });
});

app.put('/api/admin/settings', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<Record<string, string>>();
  const allowed = new Set(['store_name','tagline','support_phone','support_email','currency_code','currency_symbol','delivery_inside_dhaka','delivery_outside_dhaka','free_delivery_over','order_whatsapp_number','bkash_number','nagad_number','rocket_number','tax_percentage','site_description','site_logo_url','favicon_url']);
  for (const [key, value] of Object.entries(body)) if (allowed.has(key)) await c.env.DB.prepare("INSERT INTO store_settings(setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP").bind(key, normalize(value)).run();
  return json(c, { ok: true, updatedBy: username });
});

app.get('/api/admin/products', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const query = normalize(c.req.query('q'));
  const status = normalize(c.req.query('status'));
  const condition = ['1 = 1'];
  const values: string[] = [];
  if (query) { condition.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  if (status) { condition.push('p.status = ?'); values.push(status); }
  const result = await c.env.DB.prepare(`SELECT p.id, p.category_id AS categoryId, p.name, p.slug, p.sku, NULL AS brand, p.description, p.short_description AS shortDescription, p.editor_note AS editorNote, p.price, p.compare_at_price AS compareAtPrice, p.cost_price AS costPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.low_stock_threshold AS lowStockThreshold, p.min_order_qty AS minOrderQty, p.status, p.featured, p.tags_json AS tagsJson, p.specs_json AS specsJson, p.volume_tiers_json AS volumeTiersJson, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${condition.join(' AND ')} ORDER BY p.updated_at DESC, p.created_at DESC`).bind(...values).all();
  return json(c, { products: result.results });
});

app.get('/api/admin/categories', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const result = await c.env.DB.prepare('SELECT id, name, slug, active FROM categories ORDER BY sort_order ASC, name ASC').all();
  return json(c, { categories: result.results });
});

app.get('/api/admin/products/:id', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const product = await c.env.DB.prepare('SELECT p.id, p.category_id AS categoryId, p.name, p.slug, p.sku, NULL AS brand, p.description, p.short_description AS shortDescription, p.editor_note AS editorNote, p.price, p.compare_at_price AS compareAtPrice, p.cost_price AS costPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.low_stock_threshold AS lowStockThreshold, p.min_order_qty AS minOrderQty, p.status, p.featured, p.tags_json AS tagsJson, p.specs_json AS specsJson, p.volume_tiers_json AS volumeTiersJson, c.name AS categoryName FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?').bind(id).first();
  return product ? json(c, { product }) : json(c, { error: 'Product not found.' }, 404);
});

app.get('/api/admin/products/:id/stock-movements', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const result = await c.env.DB.prepare('SELECT id, quantity_delta AS quantityDelta, quantity_after AS quantityAfter, reason, note, actor, created_at AS createdAt FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').bind(id).all();
  return json(c, { movements: result.results });
});

app.get('/api/admin/orders', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const status = normalize(c.req.query('status'));
  const query = normalize(c.req.query('q'));
  const condition = ['1 = 1'];
  const values: string[] = [];
  if (status) { condition.push('o.status = ?'); values.push(status); }
  if (query) { condition.push('(o.order_code LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  const result = await c.env.DB.prepare(`SELECT o.order_code AS orderCode, o.status, o.subtotal, o.delivery_fee AS deliveryFee, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.courier_status AS courierStatus, o.admin_note AS customerNote, o.created_at AS createdAt, c.name, c.phone, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${condition.join(' AND ')} ORDER BY o.created_at DESC LIMIT 100`).bind(...values).all();
  return json(c, { orders: result.results });
});

app.post('/api/admin/products', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<Record<string, unknown>>();
  const name = normalize(body.name);
  if (!name || body.price === undefined) return json(c, { error: 'Product name and price are required.' }, 400);
  const slug = normalize(body.slug) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const status = ['active', 'draft', 'archived'].includes(normalize(body.status)) ? normalize(body.status) : 'draft';
  const active = status === 'active' ? 1 : 0;
  const categoryId = Number(body.categoryId) || null;
  const volumeTiers = parseVolumeTiers(body.volumeTiers);
  const mediaJson = JSON.stringify(parseProductMedia(body.mediaJson));
  const badgesJson = JSON.stringify(parseProductBadges(body.badgesJson ?? body.badges));
  const primaryImage = normalizeMediaUrl(body.imageUrl) || null;
  const result = await c.env.DB.prepare("INSERT INTO products(category_id, name, slug, sku, description, short_description, editor_note, price, compare_at_price, cost_price, image_url, media_json, badges_json, barcode, weight_grams, stock, low_stock_threshold, min_order_qty, status, tags_json, specs_json, volume_tiers_json, featured, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id, name, slug").bind(categoryId, name, slug, normalize(body.sku) || `RNV-${Date.now().toString(36).toUpperCase()}`, normalize(body.description), normalize(body.shortDescription), normalize(body.editorNote), Number(body.price) || 0, numberOrNull(body.compareAtPrice), Number(body.costPrice) || 0, primaryImage, mediaJson, badgesJson, normalize(body.barcode) || null, Number(body.weightGrams) || 0, Math.max(0, Number(body.stock) || 0), Math.max(0, Number(body.lowStockThreshold) || 5), Math.max(1, Number(body.minOrderQty) || 1), status, JSON.stringify(body.tags ?? []), JSON.stringify(body.specs ?? []), JSON.stringify(volumeTiers), body.featured ? 1 : 0, active).first();
  if (!result) return json(c, { error: 'Could not create product.' }, 500);
  return json(c, { ok: true, product: result, createdBy: username }, 201);
});

app.patch('/api/admin/products/:id', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Record<string, unknown>>();
  const status = ['active', 'draft', 'archived'].includes(normalize(body.status)) ? normalize(body.status) : null;
  const active = status === null ? null : status === 'active' ? 1 : 0;
  const volumeTiers = body.volumeTiers === undefined ? null : JSON.stringify(parseVolumeTiers(body.volumeTiers));
  const mediaJson = body.mediaJson === undefined ? null : JSON.stringify(parseProductMedia(body.mediaJson));
  const badgesJson = body.badgesJson === undefined && body.badges === undefined ? null : JSON.stringify(parseProductBadges(body.badgesJson ?? body.badges));
  const result = await c.env.DB.prepare("UPDATE products SET name = COALESCE(?, name), sku = COALESCE(?, sku), description = COALESCE(?, description), short_description = COALESCE(?, short_description), editor_note = COALESCE(?, editor_note), price = COALESCE(?, price), compare_at_price = COALESCE(?, compare_at_price), cost_price = COALESCE(?, cost_price), image_url = COALESCE(?, image_url), media_json = COALESCE(?, media_json), badges_json = COALESCE(?, badges_json), barcode = COALESCE(?, barcode), weight_grams = COALESCE(?, weight_grams), low_stock_threshold = COALESCE(?, low_stock_threshold), min_order_qty = COALESCE(?, min_order_qty), status = COALESCE(?, status), active = COALESCE(?, active), featured = COALESCE(?, featured), tags_json = COALESCE(?, tags_json), specs_json = COALESCE(?, specs_json), volume_tiers_json = COALESCE(?, volume_tiers_json), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.name === undefined ? null : normalize(body.name), body.sku === undefined ? null : normalize(body.sku), body.description === undefined ? null : normalize(body.description), body.shortDescription === undefined ? null : normalize(body.shortDescription), body.editorNote === undefined ? null : normalize(body.editorNote), body.price === undefined ? null : Number(body.price), numberOrNull(body.compareAtPrice), body.costPrice === undefined ? null : numberOrNull(body.costPrice), body.imageUrl === undefined ? null : (normalizeMediaUrl(body.imageUrl) || null), mediaJson, badgesJson, body.barcode === undefined ? null : normalize(body.barcode), body.weightGrams === undefined ? null : Number(body.weightGrams), body.lowStockThreshold === undefined ? null : Number(body.lowStockThreshold), body.minOrderQty === undefined ? null : Number(body.minOrderQty), status, active, body.featured === undefined ? null : body.featured ? 1 : 0, body.tags === undefined ? null : JSON.stringify(body.tags), body.specs === undefined ? null : JSON.stringify(body.specs), volumeTiers, id).run();
  return json(c, { ok: result.meta.changes > 0, productId: id, updatedBy: username });
});

app.post('/api/admin/products/:id/stock', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ mode?: 'delta' | 'set'; quantity?: number; reason?: string; note?: string }>();
  const product = await c.env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(id).first<{ stock: number }>();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  const reason = ['restock','return','damage','adjustment','sale','cancellation'].includes(normalize(body.reason)) ? normalize(body.reason) : 'adjustment';
  const next = body.mode === 'set' ? Number(body.quantity) : product.stock + Number(body.quantity);
  if (!Number.isFinite(next) || next < 0) return json(c, { error: 'Stock cannot be negative.' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(Math.floor(next), id),
    c.env.DB.prepare('INSERT INTO stock_movements(product_id, quantity_delta, quantity_after, reason, note, actor) VALUES (?, ?, ?, ?, ?, ?)').bind(id, Math.floor(next - product.stock), Math.floor(next), reason, normalize(body.note) || null, username),
  ]);
  return json(c, { ok: true, productId: id, previousStock: product.stock, stock: Math.floor(next), quantityDelta: Math.floor(next - product.stock) });
});

app.get('/api/health', (c) => json(c, { ok: true, service: c.env.SHOP_NAME, timestamp: new Date().toISOString() }));

app.get('/api/config', (c) => json(c, {
  shop: { name: c.env.SHOP_NAME, phone: c.env.SHOP_PHONE, address: c.env.SHOP_ADDRESS },
  delivery: { dhaka: 90, outsideDhaka: 150, emergency: 250, customerCanSelect: false },
  paymentMethods: ['cod', 'bkash', 'nagad', 'rocket']
}));

app.get('/api/customer-tracking', async (c) => {
  const orderCode = normalize(c.req.query('orderId'));
  const invoiceNumber = normalize(c.req.query('invoiceNumber'));
  const phone = normalize(c.req.query('phone'));
  if (!orderCode && !invoiceNumber && !phone) return json(c, { error: 'Order ID, invoice number, or mobile number is required.' }, 400);
  const order = orderCode
    ? await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first<{ orderCode: string; invoiceNumber: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>()
    : invoiceNumber
      ? await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.invoice_number = ?').bind(invoiceNumber).first<{ orderCode: string; invoiceNumber: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>()
      : await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone = ? ORDER BY o.created_at DESC LIMIT 1').bind(phone).first<{ orderCode: string; invoiceNumber: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>();
  if (!order || (orderCode && phone && order.phone !== phone)) return json(c, { error: 'Order not found.' }, 404);
  const courierStatus = order.courierStatus ?? (order.status === 'delivered' ? 'delivered' : order.status);
  const message = courierStatus === 'delivered' ? 'আপনার অর্ডারটি ডেলিভারি সম্পন্ন হয়েছে।' : courierStatus === 'returned' ? 'আপনার অর্ডারটি কুরিয়ার থেকে রিটার্ন হয়েছে।' : courierStatus === 'shipped' || courierStatus === 'in_review' ? 'আপনার অর্ডারটি কুরিয়ারে পাঠানো হয়েছে; সাধারণত ২–৩ দিনে ডেলিভারি পাওয়া যাবে।' : 'আপনার অর্ডারটি প্রস্তুত করা হচ্ছে।';
  return json(c, { tracking: { orderCode: order.orderCode, invoiceNumber: order.invoiceNumber, status: order.status, courierProvider: order.courierProvider, trackingCode: order.trackingCode, courierStatus, lastUpdated: order.lastUpdated, message } });
});

app.post('/api/admin/orders/:orderCode/steadfast/book', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const orderCode = normalize(c.req.param('orderCode'));
  try {
    const order = await c.env.DB.prepare('SELECT o.id, o.order_code AS orderCode, o.subtotal, o.delivery_fee AS deliveryFee, o.package_weight_grams AS packageWeight, c.name, c.phone, c.address, c.district, c.upazila FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first<{ id: number; orderCode: string; subtotal: number; deliveryFee: number; packageWeight: number; name: string; phone: string; address: string; district: string; upazila: string }>();
    if (!order) return json(c, { error: 'Order not found.' }, 404);
    const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, COALESCE(p.weight_grams, 0) AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?').bind(order.id).all<{ productName: string; quantity: number; weightGrams: number }>();
    const packageWeight = Math.max(order.packageWeight, items.results.reduce((sum, item) => sum + item.quantity * item.weightGrams, 0));
    const payload = { invoice: order.orderCode, recipient_name: order.name, recipient_phone: order.phone, recipient_address: `${order.address}, ${order.upazila}, ${order.district}`, cod_amount: order.subtotal + order.deliveryFee, note: `Package weight: ${packageWeight}g` };
    const result = await steadfastRequest(c.env, '/create_order', { method: 'POST', body: JSON.stringify(payload) });
    const consignment = (result.consignment ?? result) as Record<string, unknown>;
    const consignmentId = normalize(consignment.consignment_id ?? consignment.consignmentId);
    const trackingCode = normalize(consignment.tracking_code ?? consignment.trackingCode);
    const courierStatus = normalize(consignment.status) || 'in_review';
    await c.env.DB.prepare('UPDATE orders SET package_weight_grams = ?, courier_provider = ?, courier_consignment_id = ?, courier_tracking_code = ?, courier_last_status = ?, courier_last_updated = CURRENT_TIMESTAMP, courier_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(packageWeight, 'steadfast', consignmentId || null, trackingCode || null, courierStatus, courierStatus, 'shipped', order.id).run();
    await c.env.DB.prepare('INSERT INTO order_status_history(order_id, from_status, to_status, reason) VALUES (?, ?, ?, ?)').bind(order.id, 'confirmed', 'shipped', 'Steadfast parcel booked').run();
    return json(c, { ok: true, orderCode, courier: { provider: 'steadfast', consignmentId, trackingCode, status: courierStatus, packageWeight }, response: result });
  } catch (error) {
    return json(c, { error: error instanceof Error ? error.message : 'Steadfast booking failed.' }, 502);
  }
});

app.get('/api/admin/orders/:orderCode/steadfast/status', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const orderCode = normalize(c.req.param('orderCode'));
  try {
    const order = await c.env.DB.prepare('SELECT id, order_code AS orderCode, courier_consignment_id AS consignmentId, courier_tracking_code AS trackingCode FROM orders WHERE order_code = ?').bind(orderCode).first<{ id: number; orderCode: string; consignmentId: string | null; trackingCode: string | null }>();
    if (!order) return json(c, { error: 'Order not found.' }, 404);
    const queryPath = order.consignmentId ? `/status_by_cid/${encodeURIComponent(order.consignmentId)}` : order.trackingCode ? `/status_by_trackingcode/${encodeURIComponent(order.trackingCode)}` : `/status_by_invoice/${encodeURIComponent(order.orderCode)}`;
    const result = await steadfastRequest(c.env, queryPath);
    const rawStatus = normalize(result.delivery_status ?? result.status ?? (result.consignment as Record<string, unknown> | undefined)?.status) || 'unknown';
    const mappedStatus = statusToOrderStatus(rawStatus);
    await c.env.DB.prepare('UPDATE orders SET courier_last_status = ?, courier_last_updated = CURRENT_TIMESTAMP, courier_status = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(rawStatus, normalizeCourierStatus(rawStatus), mappedStatus, order.id).run();
    if (mappedStatus) await c.env.DB.prepare('INSERT INTO order_status_history(order_id, to_status, reason) VALUES (?, ?, ?)').bind(order.id, mappedStatus, `Steadfast status check: ${rawStatus}`).run();
    return json(c, { ok: true, orderCode, courierStatus: rawStatus, orderStatus: mappedStatus ?? 'unchanged', response: result });
  } catch (error) {
    return json(c, { error: error instanceof Error ? error.message : 'Steadfast status lookup failed.' }, 502);
  }
});

app.post('/api/webhooks/steadfast', async (c) => {
  if (!authorizeSteadfastCallback(c)) return json(c, { error: 'Unauthorized webhook.' }, 401);
  const payload = await c.req.json<Record<string, unknown>>();
  const consignmentId = normalize(payload.consignment_id ?? payload.consignmentId);
  const invoice = normalize(payload.invoice);
  const trackingCode = normalize(payload.tracking_code ?? payload.trackingCode);
  const rawStatus = normalize(payload.status ?? payload.delivery_status) || 'unknown';
  const updatedAt = normalize(payload.updated_at) || new Date().toISOString();
  const eventId = `steadfast:${consignmentId || invoice || trackingCode}:${rawStatus}:${updatedAt}`;
  const order = await c.env.DB.prepare("SELECT id, status FROM orders WHERE (? <> '' AND courier_consignment_id = ?) OR (? <> '' AND order_code = ?) OR (? <> '' AND courier_tracking_code = ?) LIMIT 1").bind(consignmentId, consignmentId, invoice, invoice, trackingCode, trackingCode).first<{ id: number; status: OrderStatus }>();
  if (!order) return json(c, { ok: true, ignored: true, reason: 'No matching order.' });
  const mappedStatus = statusToOrderStatus(rawStatus);
  const event = await c.env.DB.prepare('INSERT OR IGNORE INTO integration_events(provider, event_name, event_id, order_id, payload_json, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').bind('steadfast', 'parcel.status', eventId, order.id, JSON.stringify(payload), 'processed').run();
  if (event.meta.changes === 0) return json(c, { ok: true, duplicate: true, orderId: order.id, status: rawStatus });
  await c.env.DB.prepare('UPDATE orders SET courier_last_status = ?, courier_last_updated = ?, courier_status = ?, status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(rawStatus, updatedAt, normalizeCourierStatus(rawStatus), mappedStatus, order.id).run();
  if (mappedStatus && mappedStatus !== order.status) await c.env.DB.prepare('INSERT INTO order_status_history(order_id, from_status, to_status, reason) VALUES (?, ?, ?, ?)').bind(order.id, order.status, mappedStatus, `Steadfast webhook: ${rawStatus}`).run();
  return json(c, { ok: true, orderId: order.id, status: rawStatus });
});

function escapeHtml(value: unknown) {
  return normalize(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function cleanProductUrl(origin: string, slug: string) {
  return `${origin}/products/${encodeURIComponent(slug)}`;
}

function absolutePublicImage(origin: string, value: unknown) {
  const image = normalize(value);
  if (image.startsWith('/')) return `${origin}${image}`;
  return /^https:\/\//i.test(image) ? image : '';
}

function applyProductSeo(html: string, origin: string, product: { name: string; slug: string; description?: string | null; shortDescription?: string | null; imageUrl?: string | null; price?: number; stock?: number; rating?: number; reviewCount?: number }) {
  const title = `${normalize(product.name)} · Rinova BD`;
  const description = normalize(product.shortDescription || product.description || `Shop ${product.name} from Rinova BD.`).slice(0, 158);
  const canonical = cleanProductUrl(origin, product.slug);
  const image = absolutePublicImage(origin, product.imageUrl);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    url: canonical,
    ...(image ? { image: [image] } : {}),
    offers: { '@type': 'Offer', url: canonical, priceCurrency: 'BDT', price: Number(product.price || 0), availability: Number(product.stock || 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: 'Rinova BD' } },
    ...(Number(product.reviewCount || 0) > 0 && Number(product.rating || 0) > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(product.rating), reviewCount: Number(product.reviewCount) } } : {}),
  }).replaceAll('<', '\\u003c');
  const replacements: Array<[RegExp, string]> = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`],
    [/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtml(description)}">`],
    [/<meta name="robots" content="[^"]*">/i, '<meta name="robots" content="index,follow">'],
    [/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${escapeHtml(canonical)}">`],
    [/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapeHtml(title)}">`],
    [/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapeHtml(description)}">`],
    [/<meta property="og:image" content="[^"]*">/i, `<meta property="og:image" content="${escapeHtml(image)}">`],
  ];
  let output = html;
  for (const [pattern, replacement] of replacements) output = output.replace(pattern, replacement);
  const script = `<script id="product-jsonld" type="application/ld+json">${jsonLd}</script>`;
  output = /<script id="product-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>/i.test(output) ? output.replace(/<script id="product-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>/i, script) : output.replace('</head>', `${script}</head>`);
  return output;
}

app.get('/products/:slug', async (c) => {
  const slug = normalize(c.req.param('slug'));
  const product = await c.env.DB.prepare('SELECT name, slug, description, short_description AS shortDescription, image_url AS imageUrl, price, stock, rating, review_count AS reviewCount FROM products WHERE active = 1 AND slug = ? LIMIT 1').bind(slug).first<{ name: string; slug: string; description: string | null; shortDescription: string | null; imageUrl: string | null; price: number; stock: number; rating: number; reviewCount: number }>();
  if (!product) return c.text('Product not found.', 404);
  if (!c.env.ASSETS) return c.text('Storefront assets are unavailable.', 503);
  const assetUrl = new URL('/product', c.req.url);
  const assetResponse = await c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
  if (!assetResponse.ok) return assetResponse;
  const headers = new Headers(assetResponse.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  return new Response(applyProductSeo(await assetResponse.text(), new URL(c.req.url).origin, product), { status: assetResponse.status, headers });
});

app.get('/product.html', async (c) => {
  const slug = normalize(c.req.query('slug'));
  if (slug) {
    const preview = c.req.query('admin_preview') === '1' ? '?admin_preview=1' : '';
    return c.redirect(`${cleanProductUrl(new URL(c.req.url).origin, slug)}${preview}`, 301);
  }
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text('Storefront assets are unavailable.', 503);
});

app.get('/robots.txt', (c) => { const origin = new URL(c.req.url).origin; return c.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, 200, { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'public, max-age=3600' }); });

app.get('/sitemap.xml', async (c) => {
  const origin = new URL(c.req.url).origin;
  const [products, blogPosts] = await Promise.all([
    c.env.DB.prepare('SELECT slug, updated_at AS updatedAt FROM products WHERE active = 1 AND slug IS NOT NULL AND slug <> \'\' ORDER BY updated_at DESC, created_at DESC').all<{ slug: string; updatedAt: string | null }>(),
    c.env.DB.prepare("SELECT slug, updated_at AS updatedAt FROM blog_posts WHERE status = 'published' AND allow_search_engines = 1 AND slug IS NOT NULL AND slug <> '' AND (publish_date IS NULL OR publish_date <= CURRENT_TIMESTAMP) ORDER BY updated_at DESC, created_at DESC").all<{ slug: string; updatedAt: string | null }>(),
  ]);
  const staticUrls = [`${origin}/`, `${origin}/sitemap.html`, `${origin}/blog`, `${origin}/track.html`];
  const productEntries = Array.from(new Map(products.results.map((product) => [product.slug, { url: cleanProductUrl(origin, product.slug), updatedAt: product.updatedAt }])).values());
  const blogEntries = Array.from(new Map(blogPosts.results.map((post) => [post.slug, { url: `${origin}/blog.html?slug=${encodeURIComponent(post.slug)}`, updatedAt: post.updatedAt }])).values());
  const xmlEscape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  const body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...staticUrls.map((url) => `<url><loc>${xmlEscape(url)}</loc></url>`), ...productEntries.map((entry) => `<url><loc>${xmlEscape(entry.url)}</loc>${entry.updatedAt ? `<lastmod>${xmlEscape(new Date(entry.updatedAt).toISOString())}</lastmod>` : ''}</url>`), ...blogEntries.map((entry) => `<url><loc>${xmlEscape(entry.url)}</loc>${entry.updatedAt ? `<lastmod>${xmlEscape(new Date(entry.updatedAt).toISOString())}</lastmod>` : ''}</url>`), '</urlset>'].join('');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=UTF-8', 'Cache-Control': 'public, max-age=300' } });
});

app.get('/api/categories', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name, slug, image_url AS imageUrl FROM categories WHERE active = 1 ORDER BY sort_order ASC').all();
  return json(c, { categories: result.results });
});

app.get('/api/products', async (c) => {
  const query = normalize(c.req.query('q'));
  const category = normalize(c.req.query('category'));
  const featured = normalize(c.req.query('featured'));
  const conditions = ['p.active = 1'];
  const values: string[] = [];
  if (query) { conditions.push('(p.name LIKE ? OR p.description LIKE ?)'); values.push(`%${query}%`, `%${query}%`); }
  if (category) { conditions.push('c.slug = ?'); values.push(category); }
  if (featured === 'true') conditions.push('p.featured = 1');
  const result = await c.env.DB.prepare(`SELECT p.id, p.name, p.slug, p.sku, p.description, p.short_description AS shortDescription, p.price, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.tags_json AS tagsJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.min_order_qty AS minOrderQty, p.featured, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} ORDER BY p.featured DESC, p.created_at DESC`).bind(...values).all();
  const response = json(c, { products: result.results });
  response.headers.set('Cache-Control', 'no-store');
  return response;
});

app.get('/api/products/:slug', async (c) => {
  const slug = normalize(c.req.param('slug'));
  const product = await c.env.DB.prepare('SELECT p.id, p.name, p.slug, p.description, p.short_description AS shortDescription, p.editor_note AS editorNote, p.price, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.min_order_qty AS minOrderQty, p.volume_tiers_json AS volumeTiersJson, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND (p.slug = ? OR CAST(p.id AS TEXT) = ?) LIMIT 1').bind(slug, slug).first();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  const reviews = await c.env.DB.prepare("SELECT reviewer_name AS reviewerName, rating, review_text AS reviewText, created_at AS createdAt FROM product_reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50").bind((product as { id: number }).id).all();
  const response = json(c, { product, ratingSummary: { average: Number((product as { rating?: number }).rating || 0), count: Number((product as { reviewCount?: number }).reviewCount || 0) }, reviews: reviews.results });
  response.headers.set('Cache-Control', 'no-store');
  return response;
});

app.get('/api/locations', async (c) => {
  const query = normalize(c.req.query('q'));
  const pattern = `%${query}%`;
  const result = await c.env.DB.prepare('SELECT district, upazila, zone FROM location_directory WHERE district LIKE ? OR upazila LIKE ? ORDER BY district, upazila LIMIT 20').bind(pattern, pattern).all();
  return json(c, { locations: result.results });
});

app.get('/api/delivery-fee', async (c) => {
  const district = normalize(c.req.query('district'));
  const upazila = normalize(c.req.query('upazila'));
  const emergency = c.req.query('emergency') === 'true';
  if (!district || !upazila) return json(c, { error: 'District and upazila are required.' }, 400);
  const location = await c.env.DB.prepare('SELECT district, upazila, zone FROM location_directory WHERE district = ? AND upazila = ? LIMIT 1').bind(district, upazila).first<{ district: string; upazila: string; zone: 'dhaka' | 'outside-dhaka' }>();
  const zone = emergency ? 'emergency' : location?.zone ?? (district.toLowerCase() === 'dhaka' ? 'dhaka' : 'outside-dhaka');
  const fee = zone === 'dhaka' ? 90 : zone === 'outside-dhaka' ? 150 : 250;
  return json(c, { district, upazila, zone, fee, label: zone === 'dhaka' ? 'Dhaka-এর ভিতরে' : zone === 'outside-dhaka' ? 'Dhaka-এর বাইরে' : 'Emergency delivery', customerCanSelect: false });
});

app.get('/api/customers/:phone/trust', async (c) => {
  const phone = normalize(c.req.param('phone'));
  const customer = await c.env.DB.prepare('SELECT id, name, phone, district, upazila, address FROM customers WHERE phone = ?').bind(phone).first();
  if (!customer) return json(c, { customer: null, trust: calculateTrust([]), recentOrders: [] });
  const orders = await c.env.DB.prepare('SELECT order_code AS orderCode, status, subtotal, delivery_fee AS deliveryFee, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10').bind((customer as { id: number }).id).all<{ status: string }>();
  return json(c, { customer, trust: calculateTrust(orders.results), recentOrders: orders.results });
});

app.post('/api/orders', async (c) => {
  const body = await c.req.json<{
    name: string; phone: string; email?: string; address: string; specialNote?: string;
    paymentMethod?: 'cod' | 'bkash' | 'nagad' | 'rocket'; trxId?: string;
    items: Array<{ productId: number; quantity: number }>;
  }>();
  const address = normalize(body.address);
  if (!body.name || !body.phone || !address || !body.items?.length) return json(c, { error: 'Please complete customer, address, and cart details.' }, 400);
  const zone: 'dhaka' | 'outside-dhaka' = /\bdhaka\b/i.test(address) || address.includes('ঢাকা') ? 'dhaka' : 'outside-dhaka';
  const deliveryFee = zone === 'dhaka' ? 90 : 150;
  const paymentMethod = ['cod', 'bkash', 'nagad', 'rocket'].includes(normalize(body.paymentMethod)) ? normalize(body.paymentMethod) : 'cod';
  const productIds = body.items.map((item) => item.productId);
  const products = await c.env.DB.prepare(`SELECT id, name, price, stock, min_order_qty AS minOrderQty, volume_tiers_json AS volumeTiersJson FROM products WHERE active = 1 AND id IN (${productIds.map(() => '?').join(',')})`).bind(...productIds).all<{ id: number; name: string; price: number; stock: number; minOrderQty: number; volumeTiersJson: string }>();
  const byId = new Map(products.results.map((product) => [product.id, product]));
  const lineItems = body.items.map((item) => {
    const product = byId.get(item.productId);
    if (!product || item.quantity < 1 || product.stock < item.quantity) throw new Error('A selected product is unavailable or out of stock.');
    const minimum = Math.max(1, Number(product.minOrderQty || 1));
    if (item.quantity < minimum) throw new Error(`${product.name} requires a minimum order quantity of ${minimum}.`);
    const tiers = parseVolumeTiers(product.volumeTiersJson);
    const tier = tiers.filter((entry) => item.quantity >= entry.minQty).at(-1);
    return { ...item, product, unitPrice: tier?.price ?? product.price };
  });
  const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const orderCode = `RNV-${Date.now().toString(36).toUpperCase()}`;
  const invoiceNumber = `RNV-INV-${Date.now().toString(36).toUpperCase()}`;
  const customer = await c.env.DB.prepare('INSERT INTO customers(name, phone, email, district, upazila, address, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(phone) DO UPDATE SET name=excluded.name, email=excluded.email, district=excluded.district, upazila=excluded.upazila, address=excluded.address, updated_at=CURRENT_TIMESTAMP RETURNING id').bind(body.name, body.phone, body.email ?? null, zone === 'dhaka' ? 'Dhaka' : '', '', address).first<{ id: number }>();
  if (!customer) return json(c, { error: 'Could not create customer profile.' }, 500);
  const order = await c.env.DB.prepare('INSERT INTO orders(order_code, invoice_number, customer_id, subtotal, delivery_fee, delivery_zone, payment_method, trx_id, admin_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, order_code AS orderCode, invoice_number AS invoiceNumber').bind(orderCode, invoiceNumber, customer.id, subtotal, deliveryFee, zone, paymentMethod, body.trxId ?? null, normalize(body.specialNote) || null).first<{ id: number; orderCode: string; invoiceNumber: string }>();
  if (!order) return json(c, { error: 'Could not create order.' }, 500);
  for (const item of lineItems) {
    await c.env.DB.prepare('INSERT INTO order_items(order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)').bind(order.id, item.product.id, item.product.name, item.quantity, item.unitPrice).run();
    await c.env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(item.quantity, item.product.id).run();
  }
  await c.env.DB.prepare('INSERT INTO order_status_history(order_id, to_status, reason) VALUES (?, ?, ?)').bind(order.id, 'pending', 'Customer order placed').run();
  await createAdminNotification(c.env, { type: 'order', title: 'New order received', message: `Order ${order.orderCode} is ready for review.`, entityType: 'order', entityId: order.orderCode });
  const itemSummary = lineItems.map((item) => `${item.product.name} × ${item.quantity}`).join(' · ');
  c.executionCtx.waitUntil(syncActivityLead(c.env, [new Date().toISOString(), 'sale', order.orderCode, order.invoiceNumber, body.name, normalize(body.phone), normalize(body.email) || null, 'pending', paymentMethod, subtotal, deliveryFee, subtotal + deliveryFee, itemSummary, null, null, body.specialNote ? normalize(body.specialNote) : null]).catch(async () => { await createAdminNotification(c.env, { type: 'integration', title: 'Google Sheet sync failed', message: `Sale lead ${order.orderCode} could not be added to the activity sheet.`, entityType: 'order', entityId: order.orderCode }); }));
  return json(c, { order: { ...order, subtotal, deliveryFee, total: subtotal + deliveryFee, zone, paymentMethod }, message: 'Order received successfully.' }, 201);
});

app.patch('/api/orders/:orderCode/status', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const orderCode = normalize(c.req.param('orderCode'));
  const body = await c.req.json<{ status: OrderStatus; reason?: string; adminNote?: string }>();
  const allowedStatuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'customer_cancelled', 'refused', 'delivery_failed', 'returned', 'admin_cancelled'];
  if (!allowedStatuses.includes(body.status)) return json(c, { error: 'Unsupported order status.' }, 400);
  const order = await c.env.DB.prepare('SELECT id, status FROM orders WHERE order_code = ?').bind(orderCode).first<{ id: number; status: OrderStatus }>();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  if (order.status === body.status) return json(c, { ok: true, orderCode, status: body.status, unchanged: true });
  await c.env.DB.prepare('UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.status, body.adminNote ?? null, order.id).run();
  if (restockOnStatuses.has(body.status) && !restockOnStatuses.has(order.status)) await restoreOrderInventory(c.env, order.id, actor, body.status === 'returned' ? 'return' : 'cancellation');
  await c.env.DB.prepare('INSERT INTO order_status_history(order_id, from_status, to_status, reason) VALUES (?, ?, ?, ?)').bind(order.id, order.status, body.status, body.reason ?? null).run();
  return json(c, { ok: true, orderCode, status: body.status });
});

app.get('/api/orders/:orderCode', async (c) => {
  const orderCode = normalize(c.req.param('orderCode'));
  const order = await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.subtotal, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.courier_status AS courierStatus, o.admin_note AS customerNote, o.created_at AS createdAt, c.name, c.phone, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  const items = await c.env.DB.prepare('SELECT product_name AS productName, quantity, unit_price AS unitPrice FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_code = ?)').bind(orderCode).all();
  return json(c, { order, items: items.results });
});

app.all('*', async (c) => {
  if (c.req.path.startsWith('/api/')) return json(c, { error: 'Not found.' }, 404);
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text('Rinova BD API is live. Storefront assets are deployed separately.', 404);
});

export default app;

