import { Hono, type Context } from 'hono';
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
  CAMPAIGN_PUBLIC_ORIGIN?: string;
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
  GOOGLE_PROJECT_HEALTH_SHEET_ID?: string;
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  GTM_ID?: string;
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  META_PIXEL_ID?: string;
  META_CAPI_TOKEN?: string;
  META_TEST_EVENT_CODE?: string;
  GSC_SITE_URL?: string;
}

type App = Hono<{ Bindings: Bindings }>;
type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'customer_cancelled' | 'refused' | 'delivery_failed' | 'returned' | 'admin_cancelled';

const app: App = new Hono();
app.use('/api/*', cors({ origin: ['https://rinovabd.com', 'https://www.rinovabd.com', 'http://rinovabd.com', 'http://www.rinovabd.com', 'https://bayzed123.github.io', 'http://localhost:5173'], allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] }));

/**
 * What a staff login may not do.
 *
 * A staff account could reach 62 of the 66 dashboard endpoints — everything except managing
 * other logins — so "limited access" was limited in name only. Anything that moves money,
 * holds a credential, or reconfigures the shop is the owner's alone; the day-to-day work of
 * running the shop is not.
 *
 * The rule lives here, in one list, rather than in sixty-odd handlers, so what staff can do can
 * be read off in one place and cannot drift as routes are added.
 */
const OWNER_ONLY: Array<{ method: string; pattern: RegExp; because: string }> = [
  { method: 'PUT', pattern: /^\/api\/admin\/settings$/, because: 'delivery charges and payment methods decide what customers are charged' },
  { method: 'POST', pattern: /^\/api\/admin\/offers$/, because: 'a discount is money out of the till' },
  { method: 'PATCH', pattern: /^\/api\/admin\/offers\/[^/]+$/, because: 'a discount is money out of the till' },
  { method: 'DELETE', pattern: /^\/api\/admin\/offers\/[^/]+$/, because: 'a discount is money out of the till' },
  { method: 'PUT', pattern: /^\/api\/admin\/tracking\/settings$/, because: 'analytics and pixel credentials' },
  { method: 'POST', pattern: /^\/api\/admin\/tracking\/verify$/, because: 'analytics and pixel credentials' },
  { method: 'GET', pattern: /^\/api\/admin\/steadfast\/config$/, because: 'courier API credentials' },
  { method: 'POST', pattern: /^\/api\/admin\/steadfast\/test$/, because: 'courier API credentials' },
  { method: 'GET', pattern: /^\/api\/admin\/integrations\/status$/, because: 'shows which credentials are configured' },
  { method: 'GET', pattern: /^\/api\/admin\/sheets$/, because: 'links to the business data exports' },
  { method: 'DELETE', pattern: /^\/api\/admin\/campaigns\/[^/]+$/, because: 'deleting a live ad landing page' },
];

app.use('/api/admin/*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = new URL(c.req.url).pathname;
  const restricted = OWNER_ONLY.find((rule) => rule.method === method && rule.pattern.test(path));
  if (!restricted) return next();
  const session = await adminSession(c);
  if (!session) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (session.role !== 'owner') {
    return json(c, { error: 'Only the shop owner can do this. Ask the owner to make this change.' }, 403);
  }
  return next();
});

const json = (c: { json: (body: unknown, status?: number) => Response }, body: unknown, status = 200) => c.json(body, status);

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

/** A validation failure the caller can fix — surfaced as a 400 instead of an opaque 500. */
class RequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

/**
 * Stock and validation checks throw from inside `.map()` callbacks, which Hono would otherwise
 * turn into a bare 500 "Internal Server Error" — the customer then sees no reason for the failure.
 */
app.onError((error, c) => {
  const status = error instanceof RequestError ? error.status : 500;
  if (status === 500) console.error('[rinova]', c.req.method, c.req.path, error);
  return c.json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message }, status as 400);
});

async function readSettings(env: Bindings, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const rows = await env.DB.prepare(`SELECT setting_key AS key, setting_value AS value FROM store_settings WHERE setting_key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all<{ key: string; value: string }>();
  return Object.fromEntries(rows.results.map((row) => [row.key, normalize(row.value)]));
}

const DELIVERY_FEE_DEFAULTS = { dhaka: 90, 'outside-dhaka': 150, emergency: 250 } as const;

/** Delivery charges are owner-editable in Settings; the historic 90/150/250 values stay as fallbacks. */
async function deliveryFeeTable(env: Bindings): Promise<{ dhaka: number; 'outside-dhaka': number; emergency: number }> {
  const settings = await readSettings(env, ['delivery_inside_dhaka', 'delivery_outside_dhaka', 'delivery_emergency']);
  const pick = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    dhaka: pick(settings.delivery_inside_dhaka, DELIVERY_FEE_DEFAULTS.dhaka),
    'outside-dhaka': pick(settings.delivery_outside_dhaka, DELIVERY_FEE_DEFAULTS['outside-dhaka']),
    emergency: pick(settings.delivery_emergency, DELIVERY_FEE_DEFAULTS.emergency),
  };
}

async function resolveDeliveryZone(env: Bindings, district: string, upazila: string, addressFallback: string): Promise<{ zone: 'dhaka' | 'outside-dhaka'; fee: number }> {
  const fees = await deliveryFeeTable(env);
  if (district && upazila) {
    const location = await env.DB.prepare('SELECT zone FROM location_directory WHERE district = ? AND upazila = ? LIMIT 1').bind(district, upazila).first<{ zone: 'dhaka' | 'outside-dhaka' }>();
    if (location?.zone) return { zone: location.zone, fee: fees[location.zone] };
  }
  const referenceText = `${district} ${addressFallback}`;
  const insideDhaka = /\bdhaka\b/i.test(referenceText) || referenceText.includes('ঢাকা');
  const zone: 'dhaka' | 'outside-dhaka' = insideDhaka ? 'dhaka' : 'outside-dhaka';
  return { zone, fee: fees[zone] };
}

const COURIER_PARTNERS: Record<string, string> = {
  steadfast: 'Steadfast',
  pathao: 'Pathao',
  redx: 'RedX',
  paperfly: 'Paperfly',
  sundarban: 'Sundarban Courier',
  local: 'Local delivery / pickup',
};

/** The courier is chosen once by the owner in Settings and shown locked at checkout. */
async function resolveDeliveryPartner(env: Bindings): Promise<{ id: string; name: string }> {
  const settings = await readSettings(env, ['delivery_partner']);
  const id = (settings.delivery_partner || 'steadfast').toLowerCase();
  return { id: COURIER_PARTNERS[id] ? id : 'steadfast', name: COURIER_PARTNERS[id] || COURIER_PARTNERS.steadfast };
}

type PaymentMethodId = 'cod' | 'bkash';

type PaymentMethodOption = { id: PaymentMethodId; label: string; labelBn: string; instructions: string; account: string; requiresTrxId: boolean };

/**
 * The storefront only ever offers what the owner switched on in Settings.
 * Advance payment is a manual bKash Send Money transfer verified by transaction ID.
 */
async function resolvePaymentMethods(env: Bindings): Promise<PaymentMethodOption[]> {
  const settings = await readSettings(env, ['payment_cod_enabled', 'payment_bkash_enabled', 'bkash_number', 'payment_bkash_instructions']);
  const enabled = (value: string | undefined, fallback: boolean) => (value === undefined || value === '' ? fallback : !['0', 'false', 'off', 'no'].includes(value.toLowerCase()));
  const methods: PaymentMethodOption[] = [];
  if (enabled(settings.payment_cod_enabled, true)) methods.push({ id: 'cod', label: 'Cash on delivery', labelBn: 'ক্যাশ অন ডেলিভারি', instructions: '', account: '', requiresTrxId: false });
  if (enabled(settings.payment_bkash_enabled, true)) {
    const account = settings.bkash_number || '';
    methods.push({
      id: 'bkash',
      label: 'bKash advance (Send Money)',
      labelBn: 'বিকাশ অ্যাডভান্স (সেন্ড মানি)',
      instructions: settings.payment_bkash_instructions || (account ? `Send Money to ${account} from your bKash app, then enter the transaction ID below.` : 'Advance payment is available through bKash Send Money only. After sending, enter the bKash transaction ID below.'),
      account,
      requiresTrxId: true,
    });
  }
  // Never leave the storefront with nothing to pick.
  if (!methods.length) methods.push({ id: 'cod', label: 'Cash on delivery', labelBn: 'ক্যাশ অন ডেলিভারি', instructions: '', account: '', requiresTrxId: false });
  return methods;
}

/**
 * Invoice numbers read INV-000001 so the shop owner never mistakes one for an order code.
 * Orders placed before the rename carry RNV-000001; every lookup below still accepts that form.
 */
function invoiceNumberForOrderId(orderId: unknown) {
  const id = Number(orderId);
  return Number.isInteger(id) && id > 0 ? `INV-${String(id).padStart(6, '0')}` : '';
}

function slugifyCategory(value: unknown) {
  const slug = normalize(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || `category-${Date.now()}`;
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

async function metaCapiEvent(env: Bindings, event: { eventName: string; eventId: string; sourceUrl: string; value?: number; currency?: string; user: { name?: string; email?: string; phone?: string; city?: string; region?: string; country?: string; externalId?: string }; items?: Array<{ id: string; name: string; quantity: number; price: number }> }) {
  const pixelId = normalize(env.META_PIXEL_ID); const token = normalize(env.META_CAPI_TOKEN); if (!pixelId || !token) return { skipped: true, reason: 'Meta CAPI is not configured.' };
  const split = normalize(event.user.name).split(/\\s+/); const userData: Record<string, unknown> = {};
  const hash = async (value: unknown) => { const normalized = normalize(value).toLowerCase(); return normalized ? sha256(normalized) : undefined; };
  const values: Record<string, unknown> = { em: event.user.email, ph: event.user.phone, fn: split[0], ln: split.slice(1).join(' '), ct: event.user.city, st: event.user.region, country: event.user.country || 'bd', external_id: event.user.externalId };
  for (const [key, value] of Object.entries(values)) { const hashed = await hash(value); if (hashed) userData[key] = hashed; }
  const payload = { data: [{ event_name: event.eventName, event_id: event.eventId, event_time: Math.floor(Date.now() / 1000), action_source: 'website', event_source_url: event.sourceUrl, user_data: userData, custom_data: { currency: event.currency || 'BDT', value: Number(event.value || 0), contents: (event.items || []).map((item) => ({ id: item.id, quantity: item.quantity, item_price: item.price })), content_type: 'product' } }], test_event_code: normalize(env.META_TEST_EVENT_CODE) || 'TEST72846' };
  const response = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`Meta CAPI returned HTTP ${response.status}.`); return { sent: true };
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

function trackingSetting(value: unknown) { return normalize(value).slice(0, 240); }
async function trackingHealth(env: Bindings, origin: string) {
  const results: Record<string, unknown> = {};
  const settingRows = await env.DB.prepare("SELECT setting_key AS key, setting_value AS value FROM store_settings WHERE setting_key IN ('tracking_gtm_id','tracking_ga4_measurement_id','tracking_meta_pixel_id','tracking_gsc_site_url')").all<{ key: string; value: string }>();
  const settings = Object.fromEntries(settingRows.results.map((row) => [row.key, row.value]));
  const ga4PropertyId = normalize(env.GA4_PROPERTY_ID);
  try {
    if (!env.SERVICE_ACCOUNT_JSON || !/^\d+$/.test(ga4PropertyId)) throw new Error('GA4 service account or property ID is not configured.');
    await runGa4Report(env, { dateRanges: [{ startDate: '1daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }], limit: '1' });
    results.ga4 = { status: 'healthy', message: 'GA4 Data API returned HTTP 200.' };
  } catch (error) { results.ga4 = { status: 'error', message: error instanceof Error ? error.message : 'GA4 verification failed.' }; console.error('[GA4]', error); }
  try {
    const siteUrl = normalize(settings.tracking_gsc_site_url || env.GSC_SITE_URL);
    if (!env.SERVICE_ACCOUNT_JSON || !siteUrl) throw new Error('GSC site URL or service account is not configured.');
    const token = await googleAccessToken(env, 'https://www.googleapis.com/auth/webmasters.readonly');
    const response = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), dimensions: ['date'], rowLimit: 7 }) });
    if (!response.ok) throw new Error('GSC verification failed with HTTP ' + response.status + '.');
    const gscData = await response.json<{ rows?: Array<{ clicks?: number; impressions?: number }> }>();
    results.gsc = { status: 'healthy', message: 'Search Console returned HTTP 200.', siteUrl, clicks: (gscData.rows || []).reduce((sum, row) => sum + Number(row.clicks || 0), 0), impressions: (gscData.rows || []).reduce((sum, row) => sum + Number(row.impressions || 0), 0) };
  } catch (error) { results.gsc = { status: 'error', message: error instanceof Error ? error.message : 'GSC verification failed.' }; console.error('[GSC]', error); }
  try {
    const pixelId = normalize(settings.tracking_meta_pixel_id || env.META_PIXEL_ID);
    const capiToken = normalize(env.META_CAPI_TOKEN);
    if (!pixelId || !capiToken) throw new Error('Meta Pixel ID or META_CAPI_TOKEN is not configured as a Worker secret.');
    const response = await fetch('https://graph.facebook.com/v20.0/' + encodeURIComponent(pixelId) + '/events?access_token=' + encodeURIComponent(capiToken), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [{ event_name: 'PageView', event_time: Math.floor(Date.now() / 1000), action_source: 'website', event_source_url: origin + '/campaign/health-check', user_data: {} }], test_event_code: normalize(env.META_TEST_EVENT_CODE) || 'TEST72846' }) });
    if (!response.ok) throw new Error('Meta CAPI verification failed with HTTP ' + response.status + '.');
    results.meta = { status: 'healthy', message: 'Meta CAPI returned HTTP 200.' };
  } catch (error) { results.meta = { status: 'error', message: error instanceof Error ? error.message : 'Meta CAPI verification failed.' }; console.error('[Meta CAPI]', error); }
  try {
    if (!env.SERVICE_ACCOUNT_JSON) throw new Error('SERVICE_ACCOUNT_JSON is not configured.');
    const sheetsToken = await googleAccessToken(env, 'https://www.googleapis.com/auth/spreadsheets');
    const [accountSheet, activitySheet] = await Promise.all([sheetsAccessCheck(env.GOOGLE_ACCOUNT_LEADS_SHEET_ID, sheetsToken), sheetsAccessCheck(env.GOOGLE_ACTIVITY_LEADS_SHEET_ID, sheetsToken)]);
    const sheetsHealthy = accountSheet.accessible && activitySheet.accessible;
    results.sheets = { status: sheetsHealthy ? 'healthy' : 'error', message: sheetsHealthy ? 'Both configured Google Sheets returned HTTP 200 and lead append routes are ready.' : `Sheet access failed: ${accountSheet.reason || activitySheet.reason || 'verify Editor permissions.'}`, accountLeads: accountSheet, activityLeads: activitySheet };
    results.gtm = { status: normalize(settings.tracking_gtm_id || env.GTM_ID) ? 'healthy' : 'warning', message: normalize(settings.tracking_gtm_id || env.GTM_ID) ? 'GTM ID is configured for client-side injection.' : 'GTM ID is not configured.' };
  } catch (error) { results.sheets = { status: 'error', message: error instanceof Error ? error.message : 'Sheets verification failed.' }; console.error('[Sheets]', error); }
  return results;
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

type AdminRole = 'owner' | 'staff';

/** The signed-in dashboard principal, with the role that decides owner-only actions. */
async function adminSession(c: { env: Bindings; req: { header: (name: string) => string | undefined } }): Promise<{ username: string; role: AdminRole } | null> {
  const authorization = c.req.header('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  if (c.env.ADMIN_API_TOKEN && token === c.env.ADMIN_API_TOKEN) return { username: 'api-admin', role: 'owner' };
  const tokenHash = await sha256(token);
  const session = await c.env.DB.prepare("SELECT username, role FROM admin_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first<{ username: string; role: string | null }>();
  if (!session) return null;
  return { username: session.username, role: session.role === 'staff' ? 'staff' : 'owner' };
}

async function adminPrincipal(c: { env: Bindings; req: { header: (name: string) => string | undefined } }) {
  return (await adminSession(c))?.username ?? null;
}

/** Creating or removing dashboard logins is the owner's alone. */
async function ownerPrincipal(c: { env: Bindings; req: { header: (name: string) => string | undefined } }) {
  const session = await adminSession(c);
  return session?.role === 'owner' ? session.username : null;
}

async function createAdminSession(env: Bindings, username: string, role: AdminRole = 'owner') {
  const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash = await sha256(token);
  await env.DB.prepare("INSERT INTO admin_sessions(token_hash, username, role, expires_at) VALUES (?, ?, ?, datetime('now', '+12 hours'))").bind(tokenHash, username, role).run();
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

/**
 * Slowing down password guessing on the dashboard login.
 *
 * The login counted nothing and locked nobody out, so the owner account could be guessed at as
 * fast as the network allowed. Failures are recorded and counted over a short window: per
 * username, so one account cannot be ground down, and per caller, so an attacker cannot spray
 * one guess each across many usernames instead.
 *
 * A correct password clears that username's failures immediately, so a customer who mistypes a
 * few times and then gets it right is never left locked out.
 */
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_PER_USERNAME = 8;
const LOGIN_MAX_PER_IP = 25;

function callerIp(c: Context<{ Bindings: Bindings }>) {
  return normalize(c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')).split(',')[0].trim() || 'unknown';
}

/** True when this caller or this account has failed too often to be allowed another guess. */
async function loginIsThrottled(env: Bindings, username: string, ip: string) {
  const since = `-${LOGIN_WINDOW_MINUTES} minutes`;
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN username = ? THEN 1 ELSE 0 END), 0) AS byUser,
       COALESCE(SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END), 0) AS byIp
     FROM admin_login_attempts
     WHERE created_at >= datetime('now', ?)`,
  ).bind(username, ip, since).first<{ byUser: number; byIp: number }>();
  return Number(row?.byUser || 0) >= LOGIN_MAX_PER_USERNAME || Number(row?.byIp || 0) >= LOGIN_MAX_PER_IP;
}

async function recordLoginFailure(env: Bindings, username: string, ip: string) {
  await env.DB.prepare('INSERT INTO admin_login_attempts(username, ip) VALUES (?, ?)').bind(username, ip).run();
  // Keep the table from growing forever; anything past the window can never throttle again.
  await env.DB.prepare("DELETE FROM admin_login_attempts WHERE created_at < datetime('now', '-1 day')").run();
}

const clearLoginFailures = (env: Bindings, username: string) =>
  env.DB.prepare('DELETE FROM admin_login_attempts WHERE username = ?').bind(username).run();

app.post('/api/admin/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch((): { username?: string; password?: string } => ({}));
  const username = normalize(body.username);
  const password = normalize(body.password);
  const expectedUsername = c.env.ADMIN_USERNAME ?? 'admin';
  const key = username.toLowerCase();
  const ip = callerIp(c);
  // Checked before the password so a locked-out attacker learns nothing from the response.
  if (await loginIsThrottled(c.env, key, ip)) {
    return json(c, { error: `Too many failed sign-ins. Please wait ${LOGIN_WINDOW_MINUTES} minutes and try again.` }, 429);
  }
  const refuse = async () => {
    await recordLoginFailure(c.env, key, ip);
    return json(c, { error: 'Invalid administrator credentials.' }, 401);
  };

  // The owner login lives in Worker secrets and is only changed by the developer.
  if (key === expectedUsername.toLowerCase()) {
    if (!c.env.ADMIN_PASSWORD || body.password !== c.env.ADMIN_PASSWORD) return refuse();
    await clearLoginFailures(c.env, key);
    const token = await createAdminSession(c.env, expectedUsername, 'owner');
    return json(c, { ok: true, token, expiresInHours: 12, username: expectedUsername, role: 'owner' });
  }

  // Staff logins are created by the owner from the dashboard.
  const staff = await c.env.DB.prepare('SELECT id, username, password_hash AS passwordHash, role, active FROM admin_users WHERE lower(username) = lower(?) LIMIT 1').bind(username).first<{ id: number; username: string; passwordHash: string; role: string; active: number }>();
  if (!staff || !Number(staff.active) || !await verifyPassword(password, staff.passwordHash)) return refuse();
  await clearLoginFailures(c.env, key);
  await c.env.DB.prepare('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(staff.id).run();
  const role: AdminRole = staff.role === 'owner' ? 'owner' : 'staff';
  const token = await createAdminSession(c.env, staff.username, role);
  return json(c, { ok: true, token, expiresInHours: 12, username: staff.username, role });
});

/**
 * Staff account management. Only the owner may create, edit or remove a login,
 * and no endpoint ever returns a password or a security answer.
 */
const SECURITY_QUESTIONS = [
  "Mother's name",
  'Village or home town',
  'First school name',
  'Favourite colour',
  'Pet name',
];

/**
 * Customer support for a forgotten password.
 *
 * Customer passwords are stored only as salted hashes and are never readable —
 * not by the dashboard and not from a spreadsheet. So instead of showing an agent
 * a password, this issues a fresh temporary one, shows it to the agent exactly once,
 * and records that a reset happened in the customer sheet.
 */
function temporaryPassword() {
  // No look-alike characters, so an agent can read it out over the phone.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `Rnv-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`;
}

/**
 * The two business spreadsheets the shop owner works from. The project-health sheet
 * used by the CI doctor is deliberately absent: it is a developer tool and carries
 * nothing an owner needs to see.
 */
app.get('/api/admin/sheets', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const definitions = [
    { key: 'sales', title: 'Sales & order leads', titleBn: 'বিক্রি ও অর্ডার', description: 'Every order, POS sale and return is appended here with customer, payment and totals.', id: normalize(c.env.GOOGLE_ACTIVITY_LEADS_SHEET_ID), columns: activityLeadHeaders },
    { key: 'customers', title: 'Customer accounts', titleBn: 'কাস্টমার অ্যাকাউন্ট', description: 'Every new customer account and every support password reset is appended here. Passwords are never written.', id: normalize(c.env.GOOGLE_ACCOUNT_LEADS_SHEET_ID), columns: accountLeadHeaders },
  ];
  let token = '';
  try { token = c.env.SERVICE_ACCOUNT_JSON ? await googleAccessToken(c.env, 'https://www.googleapis.com/auth/spreadsheets') : ''; } catch { token = ''; }
  const sheets = await Promise.all(definitions.map(async (definition) => {
    const access = token && definition.id ? await sheetsAccessCheck(definition.id, token) : { configured: Boolean(definition.id), accessible: false, reason: definition.id ? 'Google service account is not configured on the Worker.' : 'Sheet ID is not configured.' };
    return { ...definition, url: definition.id ? `https://docs.google.com/spreadsheets/d/${definition.id}/edit` : '', ...access };
  }));
  return json(c, { sheets, serviceAccountConfigured: Boolean(c.env.SERVICE_ACCOUNT_JSON) });
});

app.get('/api/admin/customers', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const query = normalize(c.req.query('q'));
  const pattern = `%${query}%`;
  const rows = query
    ? await c.env.DB.prepare("SELECT c.id, c.name, c.phone, c.email, c.district, c.upazila, c.account_status AS accountStatus, c.created_at AS createdAt, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orderCount, CASE WHEN c.password_hash IS NULL THEN 0 ELSE 1 END AS hasAccount FROM customers c WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? ORDER BY c.updated_at DESC LIMIT 50").bind(pattern, pattern, pattern).all()
    : await c.env.DB.prepare("SELECT c.id, c.name, c.phone, c.email, c.district, c.upazila, c.account_status AS accountStatus, c.created_at AS createdAt, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orderCount, CASE WHEN c.password_hash IS NULL THEN 0 ELSE 1 END AS hasAccount FROM customers c ORDER BY c.updated_at DESC LIMIT 50").all();
  return json(c, { customers: rows.results });
});

app.post('/api/admin/customers/:id/reset-password', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid customer id.' }, 400);
  const customer = await c.env.DB.prepare('SELECT id, name, phone, email, password_hash AS passwordHash FROM customers WHERE id = ? LIMIT 1').bind(id).first<{ id: number; name: string; phone: string; email: string | null; passwordHash: string | null }>();
  if (!customer) return json(c, { error: 'Customer not found.' }, 404);
  if (!customer.passwordHash) return json(c, { error: 'This customer has no account yet, so there is no password to reset.' }, 400);
  const password = temporaryPassword();
  await c.env.DB.prepare('UPDATE customers SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(await hashPassword(password), id).run();
  // Every existing sign-in must stop working once the password changes.
  await c.env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id = ?').bind(id).run();
  c.executionCtx.waitUntil(syncAccountLead(c.env, [new Date().toISOString(), 'password_reset', customer.name, customer.phone, customer.email, customer.id, `support:${actor}`, 'temporary password issued']).catch(() => undefined));
  await createAdminNotification(c.env, { type: 'account', title: 'Customer password reset', message: `${customer.name} (${customer.phone}) was given a temporary password by ${actor}.`, entityType: 'customer', entityId: String(customer.id) });
  // Returned once, to the agent on the call. It is not stored anywhere in readable form.
  return json(c, { ok: true, temporaryPassword: password, customer: { id: customer.id, name: customer.name, phone: customer.phone } });
});

app.get('/api/admin/staff', async (c) => {
  if (!await ownerPrincipal(c)) return json(c, { error: 'Only the shop owner can manage dashboard logins.' }, 403);
  const result = await c.env.DB.prepare('SELECT id, username, display_name AS displayName, security_question AS securityQuestion, role, active, created_by AS createdBy, last_login_at AS lastLoginAt, created_at AS createdAt FROM admin_users ORDER BY created_at DESC').all();
  return json(c, { staff: result.results, securityQuestions: SECURITY_QUESTIONS, ownerUsername: c.env.ADMIN_USERNAME ?? 'admin' });
});

app.post('/api/admin/staff', async (c) => {
  const owner = await ownerPrincipal(c);
  if (!owner) return json(c, { error: 'Only the shop owner can create dashboard logins.' }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  const username = normalize(body.username).toLowerCase();
  const password = normalize(body.password);
  const securityQuestion = normalize(body.securityQuestion);
  const securityAnswer = normalize(body.securityAnswer);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json(c, { error: 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore.' }, 400);
  if (username === normalize(c.env.ADMIN_USERNAME ?? 'admin').toLowerCase()) return json(c, { error: 'That username belongs to the owner login.' }, 409);
  if (password.length < 8) return json(c, { error: 'Password must be at least 8 characters.' }, 400);
  if (!securityQuestion || securityAnswer.length < 2) return json(c, { error: 'Choose a security question and give an answer.' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM admin_users WHERE lower(username) = ? LIMIT 1').bind(username).first();
  if (existing) return json(c, { error: 'That username is already taken.' }, 409);
  const created = await c.env.DB.prepare('INSERT INTO admin_users(username, display_name, password_hash, security_question, security_answer_hash, role, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(username, normalize(body.displayName).slice(0, 80) || null, await hashPassword(password), securityQuestion.slice(0, 120), await hashPassword(securityAnswer.toLowerCase()), normalize(body.role) === 'owner' ? 'owner' : 'staff', owner)
    .first<{ id: number }>();
  return json(c, { ok: true, id: created?.id, username }, 201);
});

app.patch('/api/admin/staff/:id', async (c) => {
  const owner = await ownerPrincipal(c);
  if (!owner) return json(c, { error: 'Only the shop owner can change dashboard logins.' }, 403);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid staff id.' }, 400);
  const body = await c.req.json<Record<string, unknown>>();
  const staff = await c.env.DB.prepare('SELECT id FROM admin_users WHERE id = ? LIMIT 1').bind(id).first();
  if (!staff) return json(c, { error: 'Staff account not found.' }, 404);
  if (body.password !== undefined) {
    const password = normalize(body.password);
    if (password.length < 8) return json(c, { error: 'Password must be at least 8 characters.' }, 400);
    await c.env.DB.prepare('UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(await hashPassword(password), id).run();
    // A password change must not leave old browser sessions signed in.
    await c.env.DB.prepare('DELETE FROM admin_sessions WHERE username = (SELECT username FROM admin_users WHERE id = ?)').bind(id).run();
  }
  if (body.securityQuestion !== undefined || body.securityAnswer !== undefined) {
    const question = normalize(body.securityQuestion);
    const answer = normalize(body.securityAnswer);
    if (!question || answer.length < 2) return json(c, { error: 'Give both the security question and its answer.' }, 400);
    await c.env.DB.prepare('UPDATE admin_users SET security_question = ?, security_answer_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(question.slice(0, 120), await hashPassword(answer.toLowerCase()), id).run();
  }
  if (body.active !== undefined) {
    await c.env.DB.prepare('UPDATE admin_users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.active ? 1 : 0, id).run();
    if (!body.active) await c.env.DB.prepare('DELETE FROM admin_sessions WHERE username = (SELECT username FROM admin_users WHERE id = ?)').bind(id).run();
  }
  if (body.displayName !== undefined) await c.env.DB.prepare('UPDATE admin_users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(normalize(body.displayName).slice(0, 80) || null, id).run();
  return json(c, { ok: true });
});

app.delete('/api/admin/staff/:id', async (c) => {
  const owner = await ownerPrincipal(c);
  if (!owner) return json(c, { error: 'Only the shop owner can remove dashboard logins.' }, 403);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid staff id.' }, 400);
  await c.env.DB.prepare('DELETE FROM admin_sessions WHERE username = (SELECT username FROM admin_users WHERE id = ?)').bind(id).run();
  await c.env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(id).run();
  return json(c, { ok: true });
});

app.get('/api/admin/session', async (c) => {
  const session = await adminSession(c);
  return session ? json(c, { authenticated: true, username: session.username, role: session.role }) : json(c, { authenticated: false }, 401);
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
  const result = await c.env.DB.prepare('SELECT id, order_code AS orderCode, invoice_number AS invoiceNumber, subtotal, discount_amount AS discount, delivery_fee AS deliveryFee, status, payment_status AS paymentStatus, courier_status AS courierStatus, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.customerId).all<{ id: number; orderCode: string; invoiceNumber: string; subtotal: number; discount: number; deliveryFee: number; status: string; paymentStatus: string | null; courierStatus: string | null; createdAt: string }>();
  const orders = await Promise.all(result.results.map(async (order) => {
    const items = await c.env.DB.prepare('SELECT product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice FROM order_items WHERE order_id = ? ORDER BY id').bind(order.id).all();
    return { ...order, discount: Number(order.discount || 0), total: Math.max(0, Number(order.subtotal || 0) - Number(order.discount || 0)) + Number(order.deliveryFee || 0), items: items.results };
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
  const order = await c.env.DB.prepare("SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.discount_amount AS discount, o.delivery_fee AS deliveryFee, o.payment_method AS paymentMethod, o.status, c.name AS customerName, c.phone AS customerPhone, c.email AS customerEmail FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ? AND o.customer_id = ?").bind(normalize(body.orderCode), session.customerId).first<{ id: number; orderCode: string; invoiceNumber: string | null; subtotal: number; discount: number; deliveryFee: number; paymentMethod: string; status: OrderStatus; customerName: string; customerPhone: string; customerEmail: string | null }>();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  if (!['delivered', 'shipped'].includes(order.status)) return json(c, { error: 'A return can be requested after shipment or delivery.' }, 400);
  const returnCode = `RET-${Date.now().toString(36).toUpperCase()}`;
  const result = await c.env.DB.prepare("INSERT INTO returns(order_id, return_code, reason, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, 'customer') RETURNING id, return_code AS returnCode, status").bind(order.id, returnCode, normalize(body.reason), Math.max(0, Number(order.subtotal || 0) - Number(order.discount || 0)), normalize(body.notes) || null).first();
  await c.env.DB.prepare("UPDATE orders SET return_status = 'requested', return_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(normalize(body.reason), order.id).run();
  await createAdminNotification(c.env, { type: 'return', title: 'New return request', message: `Return ${result?.returnCode || returnCode} was requested for order ${order.orderCode}.`, entityType: 'return', entityId: returnCode });
  c.executionCtx.waitUntil(syncActivityLead(c.env, [new Date().toISOString(), 'return', order.orderCode, order.invoiceNumber, order.customerName, order.customerPhone, order.customerEmail || null, 'requested', order.paymentMethod, order.subtotal, order.deliveryFee, Math.max(0, Number(order.subtotal || 0) - Number(order.discount || 0)) + Number(order.deliveryFee || 0), null, returnCode, normalize(body.reason), normalize(body.notes) || null]).catch(async () => { await createAdminNotification(c.env, { type: 'integration', title: 'Google Sheet sync failed', message: `Return lead ${returnCode} could not be added to the activity sheet.`, entityType: 'return', entityId: returnCode }); }));
  return json(c, { ok: true, return: result }, 201);
});

app.get('/api/admin/invoices/:invoiceNumber', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const invoiceNumber = normalize(c.req.param('invoiceNumber'));
  const order = await c.env.DB.prepare("SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.discount_amount AS discount, o.offer_code AS offerCode, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.order_source AS orderSource, o.package_weight_grams AS packageWeightGrams, o.created_at AS createdAt, c.id AS customerId, c.name, c.phone, c.email, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.invoice_number = ? OR printf('INV-%06d', o.id) = ? OR printf('RNV-%06d', o.id) = ? LIMIT 1").bind(invoiceNumber, invoiceNumber, invoiceNumber).first<{ id: number; orderCode: string; invoiceNumber: string | null; subtotal: number; discount: number; offerCode: string | null; deliveryFee: number; deliveryZone: string; paymentMethod: string; paymentStatus: string; status: string; orderSource: string; packageWeightGrams: number; createdAt: string; customerId: number; name: string; phone: string; email: string | null; district: string; upazila: string; address: string }>();
  if (!order) return json(c, { error: 'Invoice not found.' }, 404);
  const cleanInvoiceNumber = invoiceNumberForOrderId(order.id) || order.invoiceNumber || invoiceNumber;
  if (order.invoiceNumber !== cleanInvoiceNumber) await c.env.DB.prepare('UPDATE orders SET invoice_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(cleanInvoiceNumber, order.id).run();
  order.invoiceNumber = cleanInvoiceNumber;
  const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, oi.unit_price AS unitPrice, p.sku AS sku, p.barcode AS barcode, p.slug AS productSlug, COALESCE(p.weight_grams, 0) AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC').bind(order.id).all();
  return json(c, { shop: { name: c.env.SHOP_NAME, phone: c.env.SHOP_PHONE, address: c.env.SHOP_ADDRESS }, invoice: { ...order, total: Math.max(0, order.subtotal - Number(order.discount || 0)) + order.deliveryFee }, items: items.results });
});

app.get('/api/orders/:orderIdentifier/invoice', async (c) => {
  const admin = await adminPrincipal(c);
  const customerSession = admin ? null : await customerPrincipal(c);
  const identifier = normalize(c.req.param('orderIdentifier'));
  const order = await c.env.DB.prepare("SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.discount_amount AS discount, o.offer_code AS offerCode, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.order_source AS orderSource, o.package_weight_grams AS packageWeightGrams, o.created_at AS createdAt, c.id AS customerId, c.name, c.phone, c.email, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ? OR o.invoice_number = ? OR printf('INV-%06d', o.id) = ? OR printf('RNV-%06d', o.id) = ?").bind(identifier, identifier, identifier, identifier).first<{ id: number; orderCode: string; invoiceNumber: string | null; subtotal: number; discount: number; offerCode: string | null; deliveryFee: number; deliveryZone: string; paymentMethod: string; paymentStatus: string; status: string; orderSource: string; packageWeightGrams: number; createdAt: string; customerId: number; name: string; phone: string; email: string | null; district: string; upazila: string; address: string }>();
  if (!order || (!admin && (!customerSession || customerSession.customerId !== order.customerId))) return json(c, { error: 'Order not found.' }, 404);
  const cleanInvoiceNumber = invoiceNumberForOrderId(order.id) || order.invoiceNumber || order.orderCode;
  if (order.invoiceNumber !== cleanInvoiceNumber) await c.env.DB.prepare('UPDATE orders SET invoice_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(cleanInvoiceNumber, order.id).run();
  order.invoiceNumber = cleanInvoiceNumber;
  const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, oi.unit_price AS unitPrice, p.id AS productId, p.slug AS productSlug, p.sku AS sku, p.barcode AS barcode, COALESCE(p.weight_grams, 0) AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC').bind(order.id).all();
  const computedWeight = items.results.reduce((sum, item) => sum + Number((item as { quantity: number; weightGrams: number }).quantity) * Number((item as { quantity: number; weightGrams: number }).weightGrams), 0);
  return json(c, { shop: { name: c.env.SHOP_NAME, phone: c.env.SHOP_PHONE, address: c.env.SHOP_ADDRESS }, invoice: { ...order, packageWeightGrams: Math.max(order.packageWeightGrams || 0, computedWeight), total: Math.max(0, order.subtotal - Number(order.discount || 0)) + order.deliveryFee }, items: items.results });
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
  const result = await c.env.DB.prepare('SELECT id, name, sku, barcode, price, cost_price AS costPrice, stock, discount_percent AS discountPercent, discount_label AS discountLabel, discount_ends_at AS discountEndsAt FROM products WHERE active = 1 AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) ORDER BY name ASC LIMIT 100').bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  // The counter charges the advertised price: a shopper who saw 20% off online should not be
  // asked for the list price in the shop.
  return json(c, { products: result.results.map((row) => withOfferPrice(row as Record<string, unknown>)) });
});

app.post('/api/admin/pos/sales', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ items?: Array<{ sku: string; quantity: number }>; paymentMethod?: 'cash'|'bkash'|'nagad'|'rocket'|'card'; discount?: number }>();
  if (!body.items?.length || !body.paymentMethod) return json(c, { error: 'POS items and payment method are required.' }, 400);
  const skus = body.items.map((item) => normalize(item.sku)).filter(Boolean);
  if (skus.length !== body.items.length) return json(c, { error: 'Each POS item must include a product SKU.' }, 400);
  const products = await c.env.DB.prepare(`SELECT id, name, sku, barcode, price, cost_price AS costPrice, stock, discount_percent AS discountPercent, discount_ends_at AS discountEndsAt FROM products WHERE active = 1 AND sku IN (${skus.map(() => '?').join(',')})`).bind(...skus).all<{ id: number; name: string; sku: string; barcode: string | null; price: number; costPrice: number; stock: number; discountPercent: number; discountEndsAt: string | null }>();
  const bySku = new Map(products.results.map((product) => [product.sku, product]));
  // Priced from the database with the product's own offer applied, never from what the till sent.
  const items = body.items.map((item) => { const product = bySku.get(normalize(item.sku)); if (!product || item.quantity < 1 || product.stock < item.quantity) throw new Error('A POS product is unavailable or out of stock.'); return { ...item, product, unitPrice: discountedPrice(Number(product.price) || 0, activeDiscountPercent(product)) }; });
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = Math.max(0, Math.min(subtotal, Number(body.discount) || 0));
  const receiptNumber = `POS-${Date.now().toString(36).toUpperCase()}`;
  const sale = await c.env.DB.prepare('INSERT INTO pos_sales(receipt_number, subtotal, discount, payment_method, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id, receipt_number AS receiptNumber').bind(receiptNumber, subtotal, discount, body.paymentMethod, actor).first<{ id: number; receiptNumber: string }>();
  if (!sale) return json(c, { error: 'Could not create POS sale.' }, 500);
  const statements: D1PreparedStatement[] = [];
  for (const item of items) {
    const next = item.product.stock - item.quantity;
    statements.push(
      c.env.DB.prepare('INSERT INTO pos_sale_items(sale_id, product_id, product_name, barcode, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(sale.id, item.product.id, item.product.name, item.product.barcode, item.quantity, item.unitPrice, item.product.costPrice),
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
    c.env.DB.prepare('SELECT id, code, title, description, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, starts_at AS startsAt, ends_at AS endsAt, active, usage_limit AS usageLimit, used_count AS usedCount, auto_apply AS autoApply, product_ids_json AS productIdsJson FROM offers ORDER BY updated_at DESC').all(),
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
  const body = await c.req.json<{ code?: string; title?: string; description?: string; discountType?: string; discountValue?: number; minSubtotal?: number; startsAt?: string; endsAt?: string; active?: boolean; usageLimit?: number; autoApply?: boolean; productIds?: unknown }>();
  if (!normalize(body.title)) return json(c, { error: 'Offer title is required.' }, 400);
  const type = ['fixed','percentage','free_delivery'].includes(normalize(body.discountType)) ? normalize(body.discountType) : 'fixed';
  const value = Math.max(0, Number(body.discountValue) || 0);
  // A percentage over 100 would hand money back, and a percentage of nothing is a dead offer.
  if (type === 'percentage' && (value <= 0 || value > 100)) return json(c, { error: 'A percentage discount must be between 1 and 100.' }, 400);
  if (type === 'fixed' && value <= 0) return json(c, { error: 'A fixed discount needs an amount above zero.' }, 400);
  const code = normalize(body.code).toUpperCase();
  const autoApply = body.autoApply === true;
  if (!code && !autoApply) return json(c, { error: 'Give the offer a coupon code, or mark it as applied automatically.' }, 400);
  if (code) {
    const clash = await c.env.DB.prepare('SELECT id FROM offers WHERE upper(code) = ? LIMIT 1').bind(code).first();
    if (clash) return json(c, { error: 'That coupon code already exists.' }, 409);
  }
  // An empty product list means the whole shop; naming products limits the discount to them.
  const productIds = JSON.stringify(offerProductScope(JSON.stringify(body.productIds ?? [])));
  await c.env.DB.prepare('INSERT INTO offers(code, title, description, discount_type, discount_value, min_subtotal, starts_at, ends_at, active, usage_limit, auto_apply, product_ids_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(code || null, normalize(body.title), normalize(body.description), type, value, Math.max(0, Number(body.minSubtotal) || 0), normalize(body.startsAt) || null, normalize(body.endsAt) || null, body.active === false ? 0 : 1, Math.max(0, Number(body.usageLimit) || 0), autoApply ? 1 : 0, productIds, actor).run();
  return json(c, { ok: true, title: normalize(body.title) }, 201);
});

/** Pause, re-open, retarget or reset the counter on an existing offer. */
app.patch('/api/admin/offers/:id', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid offer id.' }, 400);
  const body = await c.req.json<{ active?: boolean; usageLimit?: number; discountValue?: number; minSubtotal?: number; resetUsage?: boolean; autoApply?: boolean; productIds?: unknown }>();
  const existing = await c.env.DB.prepare('SELECT id, discount_type AS discountType FROM offers WHERE id = ? LIMIT 1').bind(id).first<{ id: number; discountType: string }>();
  if (!existing) return json(c, { error: 'Offer not found.' }, 404);
  const sets: string[] = [];
  const values: Array<string | number> = [];
  if (typeof body.active === 'boolean') { sets.push('active = ?'); values.push(body.active ? 1 : 0); }
  if (typeof body.autoApply === 'boolean') { sets.push('auto_apply = ?'); values.push(body.autoApply ? 1 : 0); }
  if (body.usageLimit !== undefined) { sets.push('usage_limit = ?'); values.push(Math.max(0, Number(body.usageLimit) || 0)); }
  if (body.minSubtotal !== undefined) { sets.push('min_subtotal = ?'); values.push(Math.max(0, Number(body.minSubtotal) || 0)); }
  if (body.discountValue !== undefined) {
    const value = Math.max(0, Number(body.discountValue) || 0);
    if (existing.discountType === 'percentage' && (value <= 0 || value > 100)) return json(c, { error: 'A percentage discount must be between 1 and 100.' }, 400);
    sets.push('discount_value = ?'); values.push(value);
  }
  if (body.productIds !== undefined) { sets.push('product_ids_json = ?'); values.push(JSON.stringify(offerProductScope(JSON.stringify(body.productIds ?? [])))); }
  if (body.resetUsage === true) sets.push('used_count = 0');
  if (!sets.length) return json(c, { error: 'Nothing to update.' }, 400);
  await c.env.DB.prepare(`UPDATE offers SET ${sets.join(', ')}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, actor, id).run();
  return json(c, { ok: true });
});

app.delete('/api/admin/offers/:id', async (c) => {
  const actor = await adminPrincipal(c);
  if (!actor) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid offer id.' }, 400);
  await c.env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(id).run();
  return json(c, { ok: true });
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
  const revenue = await c.env.DB.prepare("SELECT COALESCE(SUM(o.subtotal - o.discount_amount + o.delivery_fee), 0) AS revenue, COUNT(*) AS orders FROM orders o WHERE o.created_at >= datetime('now', ?) AND o.status IN ('confirmed','processing','shipped','delivered')").bind(`-${period} days`).first<{ revenue: number; orders: number }>();
  const profit = await c.env.DB.prepare("SELECT COALESCE(SUM((oi.unit_price - COALESCE(p.cost_price, 0)) * oi.quantity), 0) AS grossProfit FROM orders o JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id WHERE o.created_at >= datetime('now', ?) AND o.status IN ('confirmed','processing','shipped','delivered')").bind(`-${period} days`).first<{ grossProfit: number }>();
  const stock = await c.env.DB.prepare('SELECT COALESCE(SUM(stock), 0) AS units, COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0) AS costValue, COALESCE(SUM(stock * price), 0) AS retailValue, SUM(CASE WHEN stock <= low_stock_threshold THEN 1 ELSE 0 END) AS needsRestock, COUNT(*) AS catalogue FROM products WHERE active = 1').first<{ units: number; costValue: number; retailValue: number; needsRestock: number; catalogue: number }>();
  const pipeline = await c.env.DB.prepare('SELECT status, COUNT(*) AS orders, COALESCE(SUM(subtotal + delivery_fee), 0) AS value FROM orders GROUP BY status ORDER BY orders DESC').all();
  const topProducts = await c.env.DB.prepare("SELECT oi.product_name AS productName, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.created_at >= datetime('now', ?) AND o.status IN ('confirmed','processing','shipped','delivered') GROUP BY oi.product_id, oi.product_name ORDER BY revenue DESC LIMIT 8").bind(`-${period} days`).all();
  return json(c, { periodDays: period, revenue: revenue ?? { revenue: 0, orders: 0 }, grossProfit: profit?.grossProfit ?? 0, stock: stock ?? { units: 0, costValue: 0, retailValue: 0, needsRestock: 0, catalogue: 0 }, pipeline: pipeline.results, topProducts: topProducts.results });
});


app.get('/api/admin/overview-insights', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const period = Math.min(Math.max(Number(c.req.query('days') ?? 30) || 30, 7), 90);
  const orderFilter = "o.status IN ('confirmed','processing','shipped','delivered')";
  const trend = await c.env.DB.prepare(`SELECT date(o.created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(o.subtotal - o.discount_amount + o.delivery_fee), 0) AS revenue FROM orders o WHERE o.created_at >= datetime('now', ?) AND ${orderFilter} GROUP BY date(o.created_at) ORDER BY day ASC`).bind(`-${period} days`).all();
  const districts = await c.env.DB.prepare(`SELECT COALESCE(NULLIF(TRIM(c.district), ''), 'Other / not mapped') AS district, COUNT(DISTINCT c.id) AS customers, COUNT(o.id) AS orders, COALESCE(SUM(o.subtotal - o.discount_amount + o.delivery_fee), 0) AS revenue FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.created_at >= datetime('now', ?) GROUP BY COALESCE(NULLIF(TRIM(c.district), ''), 'Other / not mapped') ORDER BY customers DESC, orders DESC LIMIT 20`).bind(`-${period} days`).all();
  const totals = await c.env.DB.prepare(`SELECT COUNT(DISTINCT c.id) AS customers, COUNT(o.id) AS orders, COALESCE(SUM(o.subtotal - o.discount_amount + o.delivery_fee), 0) AS revenue FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.created_at >= datetime('now', ?)`).bind(`-${period} days`).first();
  const returnClients = await c.env.DB.prepare(`SELECT c.id AS customerId, c.name, c.phone, c.email, c.district, COUNT(r.id) AS returns, MAX(r.created_at) AS lastReturn FROM returns r JOIN orders o ON o.id = r.order_id JOIN customers c ON c.id = o.customer_id WHERE r.created_at >= datetime('now', ?) GROUP BY c.id ORDER BY lastReturn DESC LIMIT 8`).bind(`-${period} days`).all();
  const cancelClients = await c.env.DB.prepare(`SELECT c.id AS customerId, c.name, c.phone, c.email, c.district, COUNT(o.id) AS cancelledOrders, MAX(o.created_at) AS lastCancelled FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.created_at >= datetime('now', ?) AND o.status IN ('customer_cancelled','admin_cancelled') GROUP BY c.id ORDER BY lastCancelled DESC LIMIT 8`).bind(`-${period} days`).all();
  const [financeRevenue, financeCost, courier] = await Promise.all([
    c.env.DB.prepare(`SELECT COALESCE(SUM(o.subtotal), 0) AS productRevenue, COALESCE(SUM(o.delivery_fee), 0) AS deliveryCharges, COUNT(*) AS orders FROM orders o WHERE o.created_at >= datetime('now', ?) AND ${orderFilter}`).bind(`-${period} days`).first(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(COALESCE(p.cost_price, 0) * oi.quantity), 0) AS productCost FROM orders o JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id WHERE o.created_at >= datetime('now', ?) AND ${orderFilter}`).bind(`-${period} days`).first(),
    c.env.DB.prepare(`SELECT COALESCE(NULLIF(TRIM(o.courier_provider), ''), 'Not assigned') AS courierProvider, COALESCE(NULLIF(TRIM(o.delivery_zone), ''), 'Unknown zone') AS deliveryZone, COUNT(*) AS orders, COALESCE(SUM(o.delivery_fee), 0) AS deliveryCharges FROM orders o WHERE o.created_at >= datetime('now', ?) GROUP BY COALESCE(NULLIF(TRIM(o.courier_provider), ''), 'Not assigned'), COALESCE(NULLIF(TRIM(o.delivery_zone), ''), 'Unknown zone') ORDER BY orders DESC, deliveryCharges DESC LIMIT 12`).bind(`-${period} days`).all(),
  ]);
  return json(c, { periodDays: period, trend: trend.results, districts: districts.results, totals: totals ?? { customers: 0, orders: 0, revenue: 0 }, returnClients: returnClients.results, cancelClients: cancelClients.results, finance: { ...(financeRevenue ?? { productRevenue: 0, deliveryCharges: 0, orders: 0 }), ...(financeCost ?? { productCost: 0 }) }, courier: courier.results });
});
app.get('/api/admin/overview-search', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const query = normalize(c.req.query('q'));
  if (!query) return json(c, { results: [] });
  const like = `%${query}%`;
  const result = await c.env.DB.prepare(`SELECT o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.status, o.created_at AS createdAt, c.name, c.phone, c.email, c.district, c.upazila, (o.subtotal - o.discount_amount + o.delivery_fee) AS total FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code LIKE ? OR o.invoice_number LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.name LIKE ? ORDER BY o.created_at DESC LIMIT 20`).bind(like, like, like, like, like).all();
  return json(c, { results: result.results });
});
function maskSecret(value: string | undefined) { const secret = normalize(value); return secret ? `${secret.slice(0, 3)}${'•'.repeat(Math.max(4, secret.length - 6))}${secret.slice(-3)}` : 'Not configured'; }
app.post('/api/admin/steadfast/test', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  if (!steadfastConfigured(c.env)) return json(c, { error: 'SteadFast API key and Secret key are not configured.' }, 400);
  try { const result = await steadfastRequest(c.env, '/get_balance'); return json(c, { ok: true, message: 'SteadFast credentials accepted.', balance: result.current_balance ?? result.balance ?? null }); } catch (error) { return json(c, { error: error instanceof Error ? error.message : 'SteadFast connection test failed.' }, 502); }
});
app.get('/api/admin/steadfast/config', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const requestUrl = new URL(c.req.url);
  return json(c, { configured: steadfastConfigured(c.env), baseUrl: (c.env.STEADFAST_BASE_URL ?? 'https://portal.packzy.com/api/v1').replace(/\/$/, ''), apiKey: maskSecret(c.env.STEADFAST_API_KEY), secretKey: maskSecret(c.env.STEADFAST_SECRET_KEY), webhookToken: maskSecret(c.env.STEADFAST_WEBHOOK_TOKEN), webhookUrl: `${requestUrl.origin}/api/webhooks/steadfast`, supportedServices: ['SteadFast Courier', 'Pathao Courier', 'RedX', 'Paperfly', 'Sundarban Courier', 'Local delivery / pickup'] });
});

app.get('/api/admin/tracking/settings', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const rows = await c.env.DB.prepare("SELECT setting_key AS key, setting_value AS value FROM store_settings WHERE setting_key IN ('tracking_gtm_id','tracking_ga4_measurement_id','tracking_meta_pixel_id','tracking_gsc_site_url')").all<{ key: string; value: string }>();
  const values = Object.fromEntries(rows.results.map((row) => [row.key, row.value]));
  return json(c, { gtmId: values.tracking_gtm_id || c.env.GTM_ID || '', ga4MeasurementId: values.tracking_ga4_measurement_id || c.env.GA4_MEASUREMENT_ID || '', metaPixelId: values.tracking_meta_pixel_id || c.env.META_PIXEL_ID || '', gscSiteUrl: values.tracking_gsc_site_url || c.env.GSC_SITE_URL || '', capiToken: c.env.META_CAPI_TOKEN ? maskSecret(c.env.META_CAPI_TOKEN) : 'Worker secret not configured' });
});
app.put('/api/admin/tracking/settings', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<Record<string, unknown>>();
  const values: Record<string, string> = { tracking_gtm_id: trackingSetting(body.gtmId), tracking_ga4_measurement_id: trackingSetting(body.ga4MeasurementId), tracking_meta_pixel_id: trackingSetting(body.metaPixelId), tracking_gsc_site_url: trackingSetting(body.gscSiteUrl) };
  for (const [key, value] of Object.entries(values)) await c.env.DB.prepare("INSERT INTO store_settings(setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP").bind(key, value).run();
  return json(c, { ok: true, message: 'Public tracking IDs saved. META_CAPI_TOKEN must remain a Worker secret.' });
});
app.post('/api/admin/tracking/verify', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const results = await trackingHealth(c.env, new URL(c.req.url).origin);
  return json(c, { results, verifiedAt: new Date().toISOString() });
});
const CAMPAIGN_COLUMNS = 'id, slug, title, eyebrow, description, image_url AS imageUrl, meta_title AS metaTitle, meta_description AS metaDescription, cta_label AS ctaLabel, cta_url AS ctaUrl, product_ids_json AS productIdsJson, active, starts_at AS startsAt, ends_at AS endsAt, updated_at AS updatedAt';

type CampaignRow = { id: number; slug: string; title: string; eyebrow: string | null; description: string | null; imageUrl: string | null; metaTitle: string | null; metaDescription: string | null; ctaLabel: string | null; ctaUrl: string | null; productIdsJson: string | null; active: number; startsAt: string | null; endsAt: string | null };

/**
 * Cloudflare Assets answers a ".html" path with a 307 to its extensionless form.
 * Forwarding that redirect is what made campaign pages bounce instead of render,
 * so follow it here and hand back the real document.
 */
/**
 * Campaign pages are reached through a proxy Worker on ads.rinovabd.com, because the zone and
 * this Worker sit in different Cloudflare accounts. That proxy forwards the original host, so
 * the social card and canonical tag can name the brand domain instead of the workers.dev
 * origin this Worker actually sees. Only hosts on rinovabd.com are trusted: the header is
 * attacker-supplied on a direct workers.dev request, and an unchecked value would let anyone
 * mint canonical and og:url tags pointing at a site they control.
 */
function publicOrigin(c: { req: { url: string; header: (name: string) => string | undefined } }): string {
  const forwarded = normalize(c.req.header('X-Forwarded-Host')).toLowerCase().split(',')[0].trim();
  if (forwarded && /^[a-z0-9.-]+$/.test(forwarded) && (forwarded === 'rinovabd.com' || forwarded.endsWith('.rinovabd.com'))) return `https://${forwarded}`;
  return new URL(c.req.url).origin;
}

/**
 * The link the owner copies into Meta Ads Manager. The dashboard calls this API on the
 * workers.dev origin, so without an explicit public host the owner would be handed an
 * unbranded link to advertise.
 */
function campaignPublicOrigin(c: { env: Bindings; req: { url: string; header: (name: string) => string | undefined } }): string {
  const configured = normalize(c.env.CAMPAIGN_PUBLIC_ORIGIN).replace(/\/+$/, '');
  if (/^https:\/\/[a-z0-9.-]+$/i.test(configured)) return configured;
  return publicOrigin(c);
}

async function fetchAssetHtml(env: Bindings, requestUrl: string, path: string): Promise<Response> {
  if (!env.ASSETS) return new Response('Storefront assets are unavailable.', { status: 503 });
  let response = await env.ASSETS.fetch(new Request(new URL(path, requestUrl)));
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location');
    if (location) response = await env.ASSETS.fetch(new Request(new URL(location, requestUrl)));
  }
  return response;
}

function campaignSlug(value: unknown) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function campaignImageOk(value: string) {
  return !value || /^(https:\/\/|\/assets\/|\/media\/)/i.test(value);
}

/** Product ids the owner picked for a campaign, as a clean integer list. */
function parseCampaignProductIds(value: unknown): number[] {
  let parsed: unknown = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value || '[]'); } catch { parsed = []; } }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.map((item) => Math.floor(Number(item))).filter((item) => Number.isInteger(item) && item > 0))].slice(0, 48);
}

function campaignIsLive(campaign: Pick<CampaignRow, 'active' | 'startsAt' | 'endsAt'>, now = Date.now()) {
  if (Number(campaign.active) !== 1) return false;
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > now) return false;
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() < now) return false;
  return true;
}

app.get('/api/admin/campaigns', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const result = await c.env.DB.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM campaign_pages ORDER BY updated_at DESC, id DESC`).all<CampaignRow>();
  const origin = campaignPublicOrigin(c);
  // The owner needs the finished ad URL in front of them, not a slug to assemble by hand.
  return json(c, { campaigns: result.results.map((campaign) => ({ ...campaign, productIds: parseCampaignProductIds(campaign.productIdsJson), url: `${origin}/campaign/${campaign.slug}`, live: campaignIsLive(campaign) })) });
});

app.get('/api/admin/campaigns/:id', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid campaign id.' }, 400);
  const campaign = await c.env.DB.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM campaign_pages WHERE id = ? LIMIT 1`).bind(id).first<CampaignRow>();
  if (!campaign) return json(c, { error: 'Campaign not found.' }, 404);
  const origin = campaignPublicOrigin(c);
  return json(c, { campaign: { ...campaign, productIds: parseCampaignProductIds(campaign.productIdsJson), url: `${origin}/campaign/${campaign.slug}`, live: campaignIsLive(campaign) } });
});

app.post('/api/admin/campaigns', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<Record<string, unknown>>();
  const title = normalize(body.title).slice(0, 160);
  if (!title) return json(c, { error: 'Campaign title is required.' }, 400);
  // The owner names the campaign; the ad URL is derived for them.
  const slug = campaignSlug(body.slug) || campaignSlug(title) || `campaign-${Date.now().toString(36)}`;
  const imageUrl = normalize(body.imageUrl);
  if (!campaignImageOk(imageUrl)) return json(c, { error: 'Campaign image must use https://, /assets/ or /media/.' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM campaign_pages WHERE slug = ? LIMIT 1').bind(slug).first();
  if (existing) return json(c, { error: `The link /campaign/${slug} is already used by another campaign. Pick a different name.` }, 409);
  const created = await c.env.DB.prepare('INSERT INTO campaign_pages(slug,title,eyebrow,description,image_url,meta_title,meta_description,cta_label,cta_url,product_ids_json,active,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(slug, title, normalize(body.eyebrow).slice(0, 100), normalize(body.description).slice(0, 1200), imageUrl || null, normalize(body.metaTitle).slice(0, 160) || null, normalize(body.metaDescription).slice(0, 320) || null, normalize(body.ctaLabel).slice(0, 80) || 'Shop now', normalize(body.ctaUrl).slice(0, 240) || '#campaign-products', JSON.stringify(parseCampaignProductIds(body.productIds)), body.active ? 1 : 0, normalize(body.startsAt) || null, normalize(body.endsAt) || null)
    .first<{ id: number }>();
  return json(c, { ok: true, id: created?.id, slug, url: `${new URL(c.req.url).origin}/campaign/${slug}` }, 201);
});

app.patch('/api/admin/campaigns/:id', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid campaign id.' }, 400);
  const body = await c.req.json<Record<string, unknown>>();
  const campaign = await c.env.DB.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM campaign_pages WHERE id = ? LIMIT 1`).bind(id).first<CampaignRow>();
  if (!campaign) return json(c, { error: 'Campaign not found.' }, 404);
  // Only the fields present in the request change — a pause toggle must not wipe the schedule.
  const keep = <T>(key: string, current: T, next: T) => (body[key] === undefined ? current : next);
  const slug = body.slug === undefined ? campaign.slug : campaignSlug(body.slug) || campaign.slug;
  if (slug !== campaign.slug) {
    const clash = await c.env.DB.prepare('SELECT id FROM campaign_pages WHERE slug = ? AND id <> ? LIMIT 1').bind(slug, id).first();
    if (clash) return json(c, { error: `The link /campaign/${slug} is already used by another campaign.` }, 409);
  }
  const imageUrl = keep('imageUrl', campaign.imageUrl, normalize(body.imageUrl) || null);
  if (imageUrl && !campaignImageOk(imageUrl)) return json(c, { error: 'Campaign image must use https://, /assets/ or /media/.' }, 400);
  await c.env.DB.prepare('UPDATE campaign_pages SET slug=?, title=?, eyebrow=?, description=?, image_url=?, meta_title=?, meta_description=?, cta_label=?, cta_url=?, product_ids_json=?, active=?, starts_at=?, ends_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(
      slug,
      keep('title', campaign.title, normalize(body.title).slice(0, 160) || campaign.title),
      keep('eyebrow', campaign.eyebrow, normalize(body.eyebrow).slice(0, 100) || null),
      keep('description', campaign.description, normalize(body.description).slice(0, 1200) || null),
      imageUrl,
      keep('metaTitle', campaign.metaTitle, normalize(body.metaTitle).slice(0, 160) || null),
      keep('metaDescription', campaign.metaDescription, normalize(body.metaDescription).slice(0, 320) || null),
      keep('ctaLabel', campaign.ctaLabel, normalize(body.ctaLabel).slice(0, 80) || 'Shop now'),
      keep('ctaUrl', campaign.ctaUrl, normalize(body.ctaUrl).slice(0, 240) || '#campaign-products'),
      keep('productIds', campaign.productIdsJson || '[]', JSON.stringify(parseCampaignProductIds(body.productIds))),
      keep('active', Number(campaign.active) ? 1 : 0, body.active ? 1 : 0),
      keep('startsAt', campaign.startsAt, normalize(body.startsAt) || null),
      keep('endsAt', campaign.endsAt, normalize(body.endsAt) || null),
      id,
    ).run();
  return json(c, { ok: true, id, slug, url: `${new URL(c.req.url).origin}/campaign/${slug}` });
});

app.delete('/api/admin/campaigns/:id', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return json(c, { error: 'Invalid campaign id.' }, 400);
  await c.env.DB.prepare('DELETE FROM campaign_pages WHERE id = ?').bind(id).run();
  return json(c, { ok: true });
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
  const allowed = new Set(['store_name','tagline','support_phone','support_email','currency_code','currency_symbol','delivery_inside_dhaka','delivery_outside_dhaka','delivery_emergency','delivery_partner','free_delivery_over','order_whatsapp_number','bkash_number','nagad_number','rocket_number','tax_percentage','site_description','site_logo_url','favicon_url','payment_cod_enabled','payment_bkash_enabled','payment_bkash_instructions']);
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
  const result = await c.env.DB.prepare(`SELECT p.id, p.category_id AS categoryId, p.name, p.slug, p.sku, NULL AS brand, p.description, p.short_description AS shortDescription, p.editor_note AS editorNote, p.price, p.discount_percent AS discountPercent, p.discount_label AS discountLabel, p.discount_ends_at AS discountEndsAt, p.compare_at_price AS compareAtPrice, p.cost_price AS costPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.low_stock_threshold AS lowStockThreshold, p.min_order_qty AS minOrderQty, p.status, p.featured, p.tags_json AS tagsJson, p.specs_json AS specsJson, p.volume_tiers_json AS volumeTiersJson, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${condition.join(' AND ')} ORDER BY p.updated_at DESC, p.created_at DESC`).bind(...values).all();
  return json(c, { products: result.results });
});

app.get('/api/admin/categories', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const result = await c.env.DB.prepare('SELECT c.id, c.name, c.slug, c.image_url AS imageUrl, c.sort_order AS sortOrder, c.active, COUNT(p.id) AS productCount FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.sort_order ASC, c.name ASC').all();
  return json(c, { categories: result.results });
});
app.post('/api/admin/categories', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const body = await c.req.json<{ name?: string; slug?: string; imageUrl?: string; sortOrder?: number; active?: boolean }>();
  const name = normalize(body.name);
  if (!name) return json(c, { error: 'Category name is required.' }, 400);
  const slug = slugifyCategory(body.slug || name);
  try {
    const result = await c.env.DB.prepare('INSERT INTO categories(name, slug, image_url, sort_order, active) VALUES (?, ?, ?, ?, ?) RETURNING id, name, slug, image_url AS imageUrl, sort_order AS sortOrder, active').bind(name, slug, normalize(body.imageUrl) || null, Math.max(0, Number(body.sortOrder) || 0), body.active === false ? 0 : 1).first();
    return json(c, { ok: true, category: result, createdBy: username }, 201);
  } catch (error) {
    return json(c, { error: error instanceof Error && /unique/i.test(error.message) ? 'A category with this name or slug already exists.' : 'Could not create category.' }, 409);
  }
});
app.patch('/api/admin/categories/:id', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; slug?: string; imageUrl?: string; sortOrder?: number; active?: boolean }>();
  const current = await c.env.DB.prepare('SELECT name, slug, image_url AS imageUrl, sort_order AS sortOrder, active FROM categories WHERE id = ?').bind(id).first<{ name: string; slug: string; imageUrl: string | null; sortOrder: number; active: number }>();
  if (!current) return json(c, { error: 'Category not found.' }, 404);
  const name = body.name === undefined ? current.name : normalize(body.name);
  if (!name) return json(c, { error: 'Category name is required.' }, 400);
  const slug = body.slug === undefined ? current.slug : slugifyCategory(body.slug || name);
  try {
    const result = await c.env.DB.prepare('UPDATE categories SET name = ?, slug = ?, image_url = ?, sort_order = ?, active = ? WHERE id = ?').bind(name, slug, body.imageUrl === undefined ? current.imageUrl : (normalize(body.imageUrl) || null), body.sortOrder === undefined ? current.sortOrder : Math.max(0, Number(body.sortOrder) || 0), body.active === undefined ? current.active : body.active ? 1 : 0, id).run();
    return json(c, { ok: result.meta.changes > 0, categoryId: id, updatedBy: username });
  } catch (error) {
    return json(c, { error: error instanceof Error && /unique/i.test(error.message) ? 'A category with this name or slug already exists.' : 'Could not update category.' }, 409);
  }
});

app.get('/api/admin/products/sku/:sku', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const sku = normalize(c.req.param('sku'));
  const product = await c.env.DB.prepare('SELECT p.id, p.category_id AS categoryId, p.name, p.slug, p.sku, NULL AS brand, p.description, p.short_description AS shortDescription, p.editor_note AS editorNote, p.price, p.discount_percent AS discountPercent, p.discount_label AS discountLabel, p.discount_ends_at AS discountEndsAt, p.compare_at_price AS compareAtPrice, p.cost_price AS costPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.low_stock_threshold AS lowStockThreshold, p.min_order_qty AS minOrderQty, p.status, p.featured, p.tags_json AS tagsJson, p.specs_json AS specsJson, p.volume_tiers_json AS volumeTiersJson, c.name AS categoryName FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.sku = ?').bind(sku).first();
  return product ? json(c, { product }) : json(c, { error: 'Product not found.' }, 404);
});

app.get('/api/admin/products/sku/:sku/stock-movements', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const sku = normalize(c.req.param('sku'));
  const result = await c.env.DB.prepare('SELECT sm.id, sm.quantity_delta AS quantityDelta, sm.quantity_after AS quantityAfter, sm.reason, sm.note, sm.actor, sm.created_at AS createdAt FROM stock_movements sm JOIN products p ON p.id = sm.product_id WHERE p.sku = ? ORDER BY sm.created_at DESC, sm.id DESC LIMIT 100').bind(sku).all();
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
  const result = await c.env.DB.prepare(`SELECT o.order_code AS orderCode, printf('INV-%06d', o.id) AS invoiceNumber, o.status, o.subtotal, o.discount_amount AS discount, o.offer_code AS offerCode, o.delivery_fee AS deliveryFee, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.courier_status AS courierStatus, o.admin_note AS customerNote, o.created_at AS createdAt, c.name, c.phone, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${condition.join(' AND ')} ORDER BY o.created_at DESC LIMIT 100`).bind(...values).all();
  return json(c, { orders: result.results });
});

app.get('/api/admin/orders/:orderCode', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const orderCode = normalize(c.req.param('orderCode'));
  const order = await c.env.DB.prepare("SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.trx_id AS trxId, o.status, o.courier_provider AS courierProvider, o.courier_status AS courierStatus, o.admin_note AS customerNote, o.created_at AS createdAt, c.id AS customerId, c.name, c.phone, c.email, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ? LIMIT 1").bind(orderCode).first();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  const items = await c.env.DB.prepare('SELECT oi.id, oi.product_id AS productId, oi.product_name AS productName, oi.quantity, oi.unit_price AS unitPrice, p.sku, p.stock, p.weight_grams AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC').bind((order as { id: number }).id).all();
  return json(c, { order: { ...order, total: Number((order as { subtotal: number }).subtotal || 0) + Number((order as { deliveryFee: number }).deliveryFee || 0) }, items: items.results });
});

app.patch('/api/admin/orders/:orderCode', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const orderCode = normalize(c.req.param('orderCode'));
  const body = await c.req.json<{ name?: string; phone?: string; email?: string; district?: string; upazila?: string; address?: string; items?: Array<{ sku?: string; quantity?: number; details?: string }> }>();
  const existing = await c.env.DB.prepare('SELECT o.id, o.customer_id AS customerId, o.subtotal, o.delivery_fee AS deliveryFee FROM orders o WHERE o.order_code = ? LIMIT 1').bind(orderCode).first<{ id: number; customerId: number; subtotal: number; deliveryFee: number }>();
  if (!existing) return json(c, { error: 'Order not found.' }, 404);
  const customer = await c.env.DB.prepare('SELECT name, phone, email, district, upazila, address FROM customers WHERE id = ?').bind(existing.customerId).first<{ name: string; phone: string; email: string | null; district: string; upazila: string; address: string }>();
  if (!customer) return json(c, { error: 'Customer not found.' }, 404);
  const name = body.name === undefined ? customer.name : normalize(body.name);
  const phone = body.phone === undefined ? customer.phone : normalize(body.phone);
  const email = body.email === undefined ? customer.email : normalize(body.email) || null;
  const district = body.district === undefined ? customer.district : normalize(body.district);
  const upazila = body.upazila === undefined ? customer.upazila : normalize(body.upazila);
  const address = body.address === undefined ? customer.address : normalize(body.address);
  if (!name || !phone || !district || !upazila || !address) return json(c, { error: 'Name, phone, district, upazila, and address are required.' }, 400);
  try {
    await c.env.DB.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, district = ?, upazila = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, phone, email, district, upazila, address, existing.customerId).run();
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return json(c, { error: 'That phone number is already used by another customer.' }, 409);
    throw error;
  }
  // The shipping charge follows the delivery zone, so correcting a district has to re-price the order.
  const relocated = district !== customer.district || upazila !== customer.upazila || address !== customer.address;
  if (relocated) {
    const { zone, fee } = await resolveDeliveryZone(c.env, district, upazila, address);
    await c.env.DB.prepare('UPDATE orders SET delivery_zone = ?, delivery_fee = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(zone, fee, existing.id).run();
  }
  if (body.items !== undefined) {
    // The editor can list the same product on two rows; treat that as one line with the combined quantity.
    const merged = new Map<string, { sku: string; quantity: number; details: string }>();
    for (const item of body.items) {
      const sku = normalize(item.sku);
      const quantity = Math.floor(Number(item.quantity || 0));
      if (!sku || quantity <= 0) continue;
      const current = merged.get(sku);
      if (current) current.quantity += quantity;
      else merged.set(sku, { sku, quantity, details: normalize(item.details) });
    }
    const requested = [...merged.values()];
    if (!requested.length) return json(c, { error: 'Keep at least one order item.' }, 400);
    const oldItems = await c.env.DB.prepare('SELECT product_id AS productId, quantity FROM order_items WHERE order_id = ?').bind(existing.id).all<{ productId: number; quantity: number }>();
    const oldByProduct = new Map<number, number>();
    for (const item of oldItems.results) oldByProduct.set(Number(item.productId), Number(oldByProduct.get(Number(item.productId)) || 0) + Number(item.quantity));
    const products = await c.env.DB.prepare(`SELECT id, name, sku, price, stock, weight_grams AS weightGrams, discount_percent AS discountPercent, discount_ends_at AS discountEndsAt FROM products WHERE active = 1 AND sku IN (${requested.map(() => '?').join(',')})`).bind(...requested.map((item) => item.sku)).all<{ id: number; name: string; sku: string; price: number; stock: number; weightGrams: number; discountPercent: number; discountEndsAt: string | null }>();
    const bySku = new Map(products.results.map((product) => [product.sku, product]));
    const unavailable = requested.filter((item) => !bySku.has(item.sku)).map((item) => item.sku);
    if (unavailable.length) return json(c, { error: `These products are no longer available: ${unavailable.join(', ')}.` }, 400);
    const newByProduct = new Map<number, number>();
    const lines: Array<{ product: { id: number; name: string; price: number; discountPercent: number; discountEndsAt: string | null }; quantity: number; details: string }> = [];
    for (const item of requested) {
      const product = bySku.get(item.sku)!;
      // Quantity already committed to this order is still reservable, so add it back before comparing.
      const available = Number(product.stock || 0) + Number(oldByProduct.get(product.id) || 0);
      if (item.quantity > available) return json(c, { error: `${product.name} only has ${available} in stock.` }, 400);
      newByProduct.set(product.id, item.quantity);
      lines.push({ product, quantity: item.quantity, details: item.details });
    }
    // Re-price against the chosen variant, not the base price: an order holding the 100g jar
    // would otherwise be rewritten at the 50g price the moment an admin touched it.
    const editIds = lines.map((line) => line.product.id);
    const editVariants = editIds.length
      ? await c.env.DB.prepare(`SELECT product_id AS productId, label, price FROM product_variants WHERE active = 1 AND kind = 'size' AND price IS NOT NULL AND product_id IN (${editIds.map(() => '?').join(',')})`).bind(...editIds).all<{ productId: number; label: string; price: number }>()
      : { results: [] as Array<{ productId: number; label: string; price: number }> };
    const editVariantBy = new Map(editVariants.results.map((row) => [`${row.productId}|${String(row.label).toLowerCase()}`, row.price]));
    const priceFor = (line: { product: { id: number; price: number; discountPercent?: number; discountEndsAt?: string | null }; details?: string }) => {
      const label = /size:\s*([^·]+)/i.exec(String(line.details || ''))?.[1]?.trim().toLowerCase();
      const listPrice = (label ? editVariantBy.get(`${line.product.id}|${label}`) : undefined) ?? Number(line.product.price || 0);
      // The product's own offer applies here too, or editing an order would quietly re-price a
      // discounted line back up to the list price the customer never agreed to.
      return discountedPrice(listPrice, activeDiscountPercent(line.product));
    };
    const subtotal = lines.reduce((sum, line) => sum + priceFor(line) * line.quantity, 0);
    const statements = [c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(existing.id)];
    // Walk both sides so a product removed from the order gets its reserved stock back.
    for (const productId of new Set([...oldByProduct.keys(), ...newByProduct.keys()])) {
      const before = Number(oldByProduct.get(productId) || 0);
      const after = Number(newByProduct.get(productId) || 0);
      if (before !== after) statements.push(c.env.DB.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(before - after, productId));
    }
    for (const line of lines) statements.push(c.env.DB.prepare('INSERT INTO order_items(order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)').bind(existing.id, line.product.id, line.details || line.product.name, line.quantity, priceFor(line)));
    // A discount from the original order can outgrow a shrunken basket, which would make the
    // total negative or the saving larger than the goods. Never let it exceed the subtotal.
    statements.push(c.env.DB.prepare('UPDATE orders SET subtotal = ?, discount_amount = MIN(discount_amount, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(subtotal, subtotal, existing.id));
    await c.env.DB.batch(statements);
  }
  const currentStatus = await c.env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(existing.id).first<{ status: string }>();
  await c.env.DB.prepare('INSERT INTO order_status_history(order_id, to_status, reason) VALUES (?, ?, ?)').bind(existing.id, currentStatus?.status || 'pending', `Order details edited by ${username}`).run();
  const updated = await c.env.DB.prepare('SELECT subtotal, discount_amount AS discount, delivery_fee AS deliveryFee, delivery_zone AS deliveryZone FROM orders WHERE id = ?').bind(existing.id).first<{ subtotal: number; discount: number; deliveryFee: number; deliveryZone: string }>();
  return json(c, { ok: true, orderCode, subtotal: updated?.subtotal || 0, discount: updated?.discount || 0, deliveryFee: updated?.deliveryFee || 0, deliveryZone: updated?.deliveryZone || '', total: Math.max(0, Number(updated?.subtotal || 0) - Number(updated?.discount || 0)) + Number(updated?.deliveryFee || 0), updatedBy: username });
});

/**
 * Priced size/weight variants. A size used to be just a label in specs_json, so "50ml or
 * 150ml" carried one price and the shop could not charge more for the bigger jar. Prices are
 * held here and read back server-side when an order is priced.
 */
function parseProductVariants(value: unknown) {
  const raw = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return []; } })() : value;
  if (!Array.isArray(raw)) return [] as Array<{ kind: 'size' | 'color'; label: string; price: number | null; stock: number; sortOrder: number }>;
  const seen = new Set<string>();
  return raw
    .map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const kind = normalize(item.kind) === 'color' ? 'color' as const : 'size' as const;
      const label = normalize(item.label).slice(0, 80);
      const priceRaw = item.price;
      const price = priceRaw === '' || priceRaw === null || priceRaw === undefined ? null : Math.max(0, Math.round(Number(priceRaw) || 0));
      return { kind, label, price, stock: Math.max(0, Math.round(Number(item.stock) || 0)), sortOrder: index };
    })
    .filter((entry) => {
      if (!entry.label) return false;
      const key = `${entry.kind}|${entry.label.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
}

type DiscountFields = { discountPercent?: number | null; discountEndsAt?: string | null; discountLabel?: string | null };

/**
 * A discount that belongs to the product itself, set in the product editor rather than on a
 * separate offers page. Offers used to be invisible to the customer: a percentage was worked
 * out at checkout and no card or product page ever showed a changed price.
 *
 * Because this is the advertised price it has to be computed identically on the card, the
 * product page, the campaign page and the order, and it has to be computed here — a percentage
 * that lives in the browser is a percentage the browser can choose.
 */
function activeDiscountPercent(row: DiscountFields | null | undefined) {
  const percent = Math.round(Number(row?.discountPercent) || 0);
  if (percent < 1 || percent > 99) return 0;
  const ends = normalize(row?.discountEndsAt);
  // A date with no time means the offer runs to the end of that day, not to midnight at its start.
  if (ends && Date.parse(ends.length <= 10 ? `${ends}T23:59:59Z` : ends) < Date.now()) return 0;
  return percent;
}

function discountedPrice(price: number, percent: number) {
  const base = Math.max(0, Math.round(Number(price) || 0));
  if (!percent) return base;
  return Math.max(0, Math.round((base * (100 - percent)) / 100));
}

/**
 * Adds what the storefront needs to draw the badge: the live percentage, the price after it and
 * the price it was. `price` itself is left alone so nothing that already reads it changes
 * meaning; a page that knows nothing about discounts keeps showing the list price.
 */
function withOfferPrice<T extends DiscountFields & { price?: number | null; compareAtPrice?: number | null }>(row: T) {
  const percent = activeDiscountPercent(row);
  const price = Math.max(0, Math.round(Number(row?.price) || 0));
  const salePrice = discountedPrice(price, percent);
  return {
    ...row,
    discountPercent: percent,
    discountLabel: percent ? normalize(row?.discountLabel) || `${percent}% off` : '',
    salePrice,
    // Struck-through price: the offer's own "was" wins over a manually typed compare-at price.
    wasPrice: percent ? price : Math.max(0, Math.round(Number(row?.compareAtPrice) || 0)) || null,
  };
}

/** Replaces a product's variants wholesale, which is what the editor sends. */
async function saveProductVariants(env: Bindings, productId: number, value: unknown) {
  const variants = parseProductVariants(value);
  await env.DB.prepare('DELETE FROM product_variants WHERE product_id = ?').bind(productId).run();
  for (const variant of variants) {
    await env.DB.prepare('INSERT INTO product_variants(product_id, kind, label, price, stock, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(productId, variant.kind, variant.label, variant.price, variant.stock, variant.sortOrder).run();
  }
}

/** The product FAQ was identical on every product because it was hard-coded in product.js. */
function parseProductFaq(value: unknown) {
  const raw = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return []; } })() : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({ question: normalize((entry as Record<string, unknown>)?.question).slice(0, 200), answer: normalize((entry as Record<string, unknown>)?.answer).slice(0, 2000) }))
    .filter((entry) => entry.question && entry.answer)
    .slice(0, 12);
}

/**
 * The product's own offer, read off whatever the editor sent. A percentage of 0 turns the offer
 * off, which is why it is clamped rather than dropped, and an empty label or end date clears
 * those rather than leaving yesterday's wording behind.
 */
function productOfferFields(body: Record<string, unknown>, partial: boolean) {
  const percentGiven = body.discountPercent !== undefined || body.offerPercent !== undefined;
  const raw = body.discountPercent ?? body.offerPercent;
  const percent = Math.min(99, Math.max(0, Math.round(Number(raw) || 0)));
  const labelGiven = body.discountLabel !== undefined || body.offerLabel !== undefined;
  const endsGiven = body.discountEndsAt !== undefined || body.offerEndsAt !== undefined;
  return {
    offerPercent: partial && !percentGiven ? null : percent,
    offerLabel: partial && !labelGiven ? null : normalize(body.discountLabel ?? body.offerLabel).slice(0, 60),
    offerEndsAt: partial && !endsGiven ? null : normalize(body.discountEndsAt ?? body.offerEndsAt).slice(0, 30),
  };
}

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
  const { offerPercent, offerLabel, offerEndsAt } = productOfferFields(body, false);
  const result = await c.env.DB.prepare("INSERT INTO products(category_id, name, slug, sku, description, short_description, editor_note, price, compare_at_price, cost_price, image_url, media_json, badges_json, barcode, weight_grams, stock, low_stock_threshold, min_order_qty, status, tags_json, specs_json, volume_tiers_json, discount_percent, discount_label, discount_ends_at, featured, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id, name, slug").bind(categoryId, name, slug, normalize(body.sku) || `RNV-${Date.now().toString(36).toUpperCase()}`, normalize(body.description), normalize(body.shortDescription), normalize(body.editorNote), Number(body.price) || 0, numberOrNull(body.compareAtPrice), Number(body.costPrice) || 0, primaryImage, mediaJson, badgesJson, normalize(body.barcode) || null, Number(body.weightGrams) || 0, Math.max(0, Number(body.stock) || 0), Math.max(0, Number(body.lowStockThreshold) || 5), Math.max(1, Number(body.minOrderQty) || 1), status, JSON.stringify(body.tags ?? []), JSON.stringify(body.specs ?? []), JSON.stringify(volumeTiers), offerPercent, offerLabel, offerEndsAt, body.featured ? 1 : 0, active).first();
  if (!result) return json(c, { error: 'Could not create product.' }, 500);
  const createdId = Number((result as { id: number }).id);
  if (body.variants !== undefined) await saveProductVariants(c.env, createdId, body.variants);
  if (body.faq !== undefined) await c.env.DB.prepare('UPDATE products SET faq_json = ? WHERE id = ?').bind(JSON.stringify(parseProductFaq(body.faq)), createdId).run();
  return json(c, { ok: true, product: result, createdBy: username }, 201);
});

app.patch('/api/admin/products/sku/:sku', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const sku = normalize(c.req.param('sku'));
  const body = await c.req.json<Record<string, unknown>>();
  const status = ['active', 'draft', 'archived'].includes(normalize(body.status)) ? normalize(body.status) : null;
  const active = status === null ? null : status === 'active' ? 1 : 0;
  const volumeTiers = body.volumeTiers === undefined ? null : JSON.stringify(parseVolumeTiers(body.volumeTiers));
  const mediaJson = body.mediaJson === undefined ? null : JSON.stringify(parseProductMedia(body.mediaJson));
  const badgesJson = body.badgesJson === undefined && body.badges === undefined ? null : JSON.stringify(parseProductBadges(body.badgesJson ?? body.badges));
  const { offerPercent, offerLabel, offerEndsAt } = productOfferFields(body, true);
  const result = await c.env.DB.prepare("UPDATE products SET name = COALESCE(?, name), sku = COALESCE(?, sku), description = COALESCE(?, description), short_description = COALESCE(?, short_description), editor_note = COALESCE(?, editor_note), price = COALESCE(?, price), compare_at_price = COALESCE(?, compare_at_price), cost_price = COALESCE(?, cost_price), image_url = COALESCE(?, image_url), media_json = COALESCE(?, media_json), badges_json = COALESCE(?, badges_json), barcode = COALESCE(?, barcode), weight_grams = COALESCE(?, weight_grams), low_stock_threshold = COALESCE(?, low_stock_threshold), min_order_qty = COALESCE(?, min_order_qty), status = COALESCE(?, status), active = COALESCE(?, active), featured = COALESCE(?, featured), tags_json = COALESCE(?, tags_json), specs_json = COALESCE(?, specs_json), volume_tiers_json = COALESCE(?, volume_tiers_json), discount_percent = COALESCE(?, discount_percent), discount_label = COALESCE(?, discount_label), discount_ends_at = COALESCE(?, discount_ends_at), updated_at = CURRENT_TIMESTAMP WHERE sku = ?").bind(body.name === undefined ? null : normalize(body.name), body.sku === undefined ? null : normalize(body.sku), body.description === undefined ? null : normalize(body.description), body.shortDescription === undefined ? null : normalize(body.shortDescription), body.editorNote === undefined ? null : normalize(body.editorNote), body.price === undefined ? null : Number(body.price), numberOrNull(body.compareAtPrice), body.costPrice === undefined ? null : numberOrNull(body.costPrice), body.imageUrl === undefined ? null : (normalizeMediaUrl(body.imageUrl) || null), mediaJson, badgesJson, body.barcode === undefined ? null : normalize(body.barcode), body.weightGrams === undefined ? null : Number(body.weightGrams), body.lowStockThreshold === undefined ? null : Number(body.lowStockThreshold), body.minOrderQty === undefined ? null : Number(body.minOrderQty), status, active, body.featured === undefined ? null : body.featured ? 1 : 0, body.tags === undefined ? null : JSON.stringify(body.tags), body.specs === undefined ? null : JSON.stringify(body.specs), volumeTiers, offerPercent, offerLabel, offerEndsAt, sku).run();
  if (body.variants !== undefined || body.faq !== undefined) {
    const row = await c.env.DB.prepare('SELECT id FROM products WHERE sku = ? LIMIT 1').bind(sku).first<{ id: number }>();
    if (row) {
      if (body.variants !== undefined) await saveProductVariants(c.env, row.id, body.variants);
      if (body.faq !== undefined) await c.env.DB.prepare('UPDATE products SET faq_json = ? WHERE id = ?').bind(JSON.stringify(parseProductFaq(body.faq)), row.id).run();
    }
  }
  return json(c, { ok: result.meta.changes > 0, productSku: sku, updatedBy: username });
});

/** The editor needs a product's saved variants and FAQ back when it reopens one. */
app.get('/api/admin/products/sku/:sku/detail', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const sku = normalize(c.req.param('sku'));
  const product = await c.env.DB.prepare('SELECT id, faq_json AS faqJson FROM products WHERE sku = ? LIMIT 1').bind(sku).first<{ id: number; faqJson: string }>();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  const variants = await c.env.DB.prepare('SELECT kind, label, price, stock FROM product_variants WHERE product_id = ? ORDER BY kind, sort_order, id').bind(product.id).all();
  return json(c, { variants: variants.results, faq: parseProductFaq(product.faqJson) });
});

app.post('/api/admin/products/sku/:sku/stock', async (c) => {
  const username = await adminPrincipal(c);
  if (!username) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const sku = normalize(c.req.param('sku'));
  const body = await c.req.json<{ mode?: 'delta' | 'set'; quantity?: number; reason?: string; note?: string }>();
  const product = await c.env.DB.prepare('SELECT id, sku, stock FROM products WHERE sku = ?').bind(sku).first<{ id: number; sku: string; stock: number }>();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  const reason = ['restock','return','damage','adjustment','sale','cancellation'].includes(normalize(body.reason)) ? normalize(body.reason) : 'adjustment';
  const next = body.mode === 'set' ? Number(body.quantity) : product.stock + Number(body.quantity);
  if (!Number.isFinite(next) || next < 0) return json(c, { error: 'Stock cannot be negative.' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE sku = ?').bind(Math.floor(next), sku),
    c.env.DB.prepare('INSERT INTO stock_movements(product_id, quantity_delta, quantity_after, reason, note, actor) VALUES (?, ?, ?, ?, ?, ?)').bind(product.id, Math.floor(next - product.stock), Math.floor(next), reason, normalize(body.note) || null, username),
  ]);
  return json(c, { ok: true, productSku: product.sku, previousStock: product.stock, stock: Math.floor(next), quantityDelta: Math.floor(next - product.stock) });
});

app.get('/api/health', (c) => json(c, { ok: true, service: c.env.SHOP_NAME, timestamp: new Date().toISOString() }));

app.get('/api/config', async (c) => {
  const [fees, paymentMethods, partner] = await Promise.all([deliveryFeeTable(c.env), resolvePaymentMethods(c.env), resolveDeliveryPartner(c.env)]);
  return json(c, {
    shop: { name: c.env.SHOP_NAME, phone: c.env.SHOP_PHONE, address: c.env.SHOP_ADDRESS },
    delivery: { dhaka: fees.dhaka, outsideDhaka: fees['outside-dhaka'], emergency: fees.emergency, partner: partner.name, partnerId: partner.id, customerCanSelect: false },
    paymentMethods,
  });
});

app.get('/api/customer-tracking', async (c) => {
  const orderCode = normalize(c.req.query('orderId'));
  const invoiceNumber = normalize(c.req.query('invoiceNumber'));
  const phone = normalize(c.req.query('phone'));
  if (!orderCode && !invoiceNumber && !phone) return json(c, { error: 'Order ID, invoice number, or mobile number is required.' }, 400);
  const order = orderCode
    ? await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first<{ orderCode: string; invoiceNumber: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>()
    : invoiceNumber
      ? await c.env.DB.prepare("SELECT o.order_code AS orderCode, printf('INV-%06d', o.id) AS invoiceNumber, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.invoice_number = ? OR printf('INV-%06d', o.id) = ? OR printf('RNV-%06d', o.id) = ?").bind(invoiceNumber, invoiceNumber, invoiceNumber).first<{ orderCode: string; invoiceNumber: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>()
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
    const order = await c.env.DB.prepare('SELECT o.id, o.order_code AS orderCode, o.subtotal, o.discount_amount AS discount, o.delivery_fee AS deliveryFee, o.package_weight_grams AS packageWeight, c.name, c.phone, c.address, c.district, c.upazila FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first<{ id: number; orderCode: string; subtotal: number; discount: number; deliveryFee: number; packageWeight: number; name: string; phone: string; address: string; district: string; upazila: string }>();
    if (!order) return json(c, { error: 'Order not found.' }, 404);
    const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, COALESCE(p.weight_grams, 0) AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?').bind(order.id).all<{ productName: string; quantity: number; weightGrams: number }>();
    const packageWeight = Math.max(order.packageWeight, items.results.reduce((sum, item) => sum + item.quantity * item.weightGrams, 0));
    const payload = { invoice: order.orderCode, recipient_name: order.name, recipient_phone: order.phone, recipient_address: `${order.address}, ${order.upazila}, ${order.district}`, cod_amount: Math.max(0, order.subtotal - Number(order.discount || 0)) + order.deliveryFee, note: `Package weight: ${packageWeight}g` };
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


app.get('/campaign/:slug', async (c) => {
  const slug = normalize(c.req.param('slug')).toLowerCase();
  const campaign = await c.env.DB.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM campaign_pages WHERE slug = ? LIMIT 1`).bind(slug).first<CampaignRow>();
  if (!campaign) return c.text('Campaign not available.', 404);
  // A paused campaign still has to be openable by the owner, otherwise it cannot be checked before going live.
  const preview = c.req.query('preview') === '1' && Boolean(await adminPrincipal(c));
  if (!campaignIsLive(campaign) && !preview) return c.text('Campaign not available.', 404);
  if (!c.env.ASSETS) return c.text('Storefront assets are unavailable.', 503);
  const asset = await fetchAssetHtml(c.env, c.req.url, '/campaign-template.html');
  if (!asset.ok) return asset;
  const html = await asset.text();
  const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } as Record<string, string>)[char]);
  const settings = await c.env.DB.prepare("SELECT setting_key AS key, setting_value AS value FROM store_settings WHERE setting_key IN ('tracking_gtm_id','tracking_ga4_measurement_id','tracking_meta_pixel_id')").all<{ key: string; value: string }>();
  const tracking = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));

  // Show the products the owner picked, in the order they picked them; fall back to the
  // featured catalogue only when no selection was made.
  const chosenIds = parseCampaignProductIds(campaign.productIdsJson);
  const products = chosenIds.length
    ? await c.env.DB.prepare(`SELECT id, name, slug, sku, price, compare_at_price AS compareAtPrice, discount_percent AS discountPercent, discount_label AS discountLabel, discount_ends_at AS discountEndsAt, image_url AS imageUrl FROM products WHERE active = 1 AND id IN (${chosenIds.map(() => '?').join(',')})`).bind(...chosenIds).all()
    : await c.env.DB.prepare('SELECT id, name, slug, sku, price, compare_at_price AS compareAtPrice, discount_percent AS discountPercent, discount_label AS discountLabel, discount_ends_at AS discountEndsAt, image_url AS imageUrl FROM products WHERE active = 1 ORDER BY featured DESC, updated_at DESC LIMIT 24').all();
  const ordered = (chosenIds.length
    ? chosenIds.map((id) => products.results.find((product) => Number((product as { id: number }).id) === id)).filter(Boolean)
    : products.results).map((row) => withOfferPrice(row as Record<string, unknown>));

  const origin = publicOrigin(c);
  const canonical = `${origin}/campaign/${campaign.slug}`;
  const metaTitle = normalize(campaign.metaTitle) || `${campaign.title} · ${c.env.SHOP_NAME}`;
  const metaDescription = normalize(campaign.metaDescription) || normalize(campaign.description).slice(0, 200) || `Shop the ${campaign.title} edit from ${c.env.SHOP_NAME}.`;
  const rawImage = normalize(campaign.imageUrl);
  const socialImage = rawImage ? (/^https?:\/\//i.test(rawImage) ? rawImage : `${origin}${rawImage}`) : `${origin}/assets/rinova-bd-hero-pink.png`;
  // Meta's ad crawler does not run JavaScript, so the social card has to be in the served HTML.
  const head = [
    `<title>${safe(metaTitle)}</title>`,
    `<meta name="description" content="${safe(metaDescription)}">`,
    `<link rel="canonical" href="${safe(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${safe(c.env.SHOP_NAME)}">`,
    `<meta property="og:title" content="${safe(metaTitle)}">`,
    `<meta property="og:description" content="${safe(metaDescription)}">`,
    `<meta property="og:url" content="${safe(canonical)}">`,
    `<meta property="og:image" content="${safe(socialImage)}">`,
    `<meta property="og:image:width" content="1080">`,
    `<meta property="og:image:height" content="1080">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${safe(metaTitle)}">`,
    `<meta name="twitter:description" content="${safe(metaDescription)}">`,
    `<meta name="twitter:image" content="${safe(socialImage)}">`,
  ].join('');

  const payload = {
    campaign: { slug: campaign.slug, title: campaign.title, eyebrow: campaign.eyebrow, description: campaign.description, imageUrl: campaign.imageUrl, ctaLabel: campaign.ctaLabel || 'Shop now', ctaUrl: campaign.ctaUrl || '#campaign-products', url: canonical, preview: preview && !campaignIsLive(campaign) },
    products: ordered,
    tracking,
  };
  const output = html
    .replace('<title>Rinova BD Campaign</title>', head)
    // An ad landing page has to be indexable for the crawler to fetch its card.
    .replace('<meta name="robots" content="noindex,nofollow">', preview ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow">')
    .replace('<script id="campaign-data" type="application/json"></script>', '<script id="campaign-data" type="application/json">' + safe(JSON.stringify(payload)) + '</script>');
  return new Response(output, { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': preview ? 'no-store' : 'public, max-age=60' } });
});

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
  const result = await c.env.DB.prepare('SELECT id, name, slug, image_url AS imageUrl, sort_order AS sortOrder FROM categories WHERE active = 1 ORDER BY sort_order ASC, name ASC').all();
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
  const result = await c.env.DB.prepare(`SELECT p.id, p.name, p.slug, p.sku, p.description, p.short_description AS shortDescription, COALESCE(NULLIF(p.price, 0), (SELECT MIN(v.price) FROM product_variants v WHERE v.product_id = p.id AND v.kind = 'size' AND v.active = 1 AND v.price IS NOT NULL), p.price) AS price, p.discount_percent AS discountPercent, p.discount_label AS discountLabel, p.discount_ends_at AS discountEndsAt, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.tags_json AS tagsJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.min_order_qty AS minOrderQty, p.featured, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} ORDER BY p.featured DESC, p.created_at DESC`).bind(...values).all();
  const response = json(c, { products: result.results.map((row) => withOfferPrice(row as Record<string, unknown>)) });
  response.headers.set('Cache-Control', 'no-store');
  return response;
});

app.get('/api/products/:slug', async (c) => {
  const slug = normalize(c.req.param('slug'));
  const product = await c.env.DB.prepare(`SELECT p.id, p.name, p.slug, p.sku, p.description, p.short_description AS shortDescription, p.editor_note AS editorNote, COALESCE(NULLIF(p.price, 0), (SELECT MIN(v.price) FROM product_variants v WHERE v.product_id = p.id AND v.kind = 'size' AND v.active = 1 AND v.price IS NOT NULL), p.price) AS price, p.discount_percent AS discountPercent, p.discount_label AS discountLabel, p.discount_ends_at AS discountEndsAt, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.badges_json AS badgesJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.min_order_qty AS minOrderQty, p.volume_tiers_json AS volumeTiersJson, p.specs_json AS specsJson, p.faq_json AS faqJson, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND (p.slug = ? OR p.sku = ?) LIMIT 1`).bind(slug, slug).first();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  const reviews = await c.env.DB.prepare("SELECT reviewer_name AS reviewerName, rating, review_text AS reviewText, created_at AS createdAt FROM product_reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50").bind((product as { id: number }).id).all();
  // Priced sizes and colours, so the page can show a real price per size and change it on select.
  const variants = await c.env.DB.prepare('SELECT kind, label, price, stock FROM product_variants WHERE product_id = ? AND active = 1 ORDER BY kind, sort_order, id').bind((product as { id: number }).id).all<{ kind: string; label: string; price: number | null; stock: number }>();
  const response = json(c, { product: { ...withOfferPrice(product as Record<string, unknown>), faq: parseProductFaq((product as { faqJson?: string }).faqJson) }, variants: variants.results, ratingSummary: { average: Number((product as { rating?: number }).rating || 0), count: Number((product as { reviewCount?: number }).reviewCount || 0) }, reviews: reviews.results });
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
  const fees = await deliveryFeeTable(c.env);
  const fee = fees[zone];
  return json(c, { district, upazila, zone, fee, partner: (await resolveDeliveryPartner(c.env)).name, label: zone === 'dhaka' ? 'Dhaka-এর ভিতরে' : zone === 'outside-dhaka' ? 'Dhaka-এর বাইরে' : 'Emergency delivery', customerCanSelect: false });
});

app.get('/api/customers/:phone/trust', async (c) => {
  const phone = normalize(c.req.param('phone'));
  const customer = await c.env.DB.prepare('SELECT id, name, phone, district, upazila, address FROM customers WHERE phone = ?').bind(phone).first();
  if (!customer) return json(c, { customer: null, trust: calculateTrust([]), recentOrders: [] });
  const orders = await c.env.DB.prepare('SELECT order_code AS orderCode, status, subtotal, delivery_fee AS deliveryFee, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10').bind((customer as { id: number }).id).all<{ status: string }>();
  return json(c, { customer, trust: calculateTrust(orders.results), recentOrders: orders.results });
});

type OfferRow = { id: number; code: string | null; title: string; discountType: string; discountValue: number; minSubtotal: number; usageLimit: number; usedCount: number; productIdsJson: string | null };
/** What an offer needs to know about the basket: which product each taka belongs to. */
type OfferLine = { productId: number; lineTotal: number };

/** An empty list means the whole shop, which is what every offer meant before scoping existed. */
function offerProductScope(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

/**
 * Works out what an offer is actually worth. Offers used to be stored and listed but never
 * applied to anything: the order had nowhere to record a discount and checkout had no coupon
 * field, so creating a percentage offer changed no price anywhere. The maths lives here, on
 * the server, because a discount the browser calculates is a discount the browser can choose.
 *
 * A coupon is matched by code. An offer marked auto_apply carries no code and applies itself
 * as soon as the subtotal qualifies; when several qualify, the customer gets the best one.
 *
 * An offer can name the products it covers. A 20%-off-face-wash coupon then takes 20% of what
 * the face washes cost, not 20% of a basket that also holds a dress — so the minimum subtotal
 * is still judged on the whole basket, but the discount is only ever computed on the part the
 * offer actually covers.
 */
async function resolveOffer(env: Bindings, lines: OfferLine[], deliveryFee: number, code: string) {
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, Number(line.lineTotal) || 0), 0);
  const wanted = normalize(code).toUpperCase();
  const rows = await env.DB.prepare(
    `SELECT id, code, title, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, usage_limit AS usageLimit, used_count AS usedCount, product_ids_json AS productIdsJson
     FROM offers
     WHERE active = 1
       AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
       AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
       AND (${wanted ? 'upper(code) = ?' : 'auto_apply = 1'})`,
  ).bind(...(wanted ? [wanted] : [])).all<OfferRow>();

  /** The part of the basket this offer covers — the whole of it when the offer names no products. */
  const covered = (offer: OfferRow) => {
    const scope = offerProductScope(offer.productIdsJson);
    if (!scope.length) return subtotal;
    return lines.filter((line) => scope.includes(Number(line.productId))).reduce((sum, line) => sum + Math.max(0, Number(line.lineTotal) || 0), 0);
  };
  const value = (offer: OfferRow) => {
    const base = covered(offer);
    if (offer.discountType === 'percentage') return Math.min(base, Math.round((base * Number(offer.discountValue || 0)) / 100));
    if (offer.discountType === 'free_delivery') return 0;
    return Math.min(base, Math.max(0, Number(offer.discountValue || 0)));
  };
  const usable = rows.results.filter((offer) => {
    if (subtotal < Number(offer.minSubtotal || 0)) return false;
    // A limit of 0 means unlimited; anything else stops the coupon once it is used up.
    if (Number(offer.usageLimit || 0) > 0 && Number(offer.usedCount || 0) >= Number(offer.usageLimit)) return false;
    // A product offer whose products are not in the bag is worth nothing, and free delivery is
    // worth something even though it discounts no line.
    if (offer.discountType !== 'free_delivery' && covered(offer) <= 0) return false;
    return true;
  });

  if (!usable.length) {
    if (!wanted) return { discount: 0, deliveryFee, offer: null as OfferRow | null, error: '' };
    const known = rows.results[0];
    if (!known) return { discount: 0, deliveryFee, offer: null, error: 'That coupon code is not valid.' };
    if (subtotal < Number(known.minSubtotal || 0)) return { discount: 0, deliveryFee, offer: null, error: `This coupon needs a subtotal of at least ${known.minSubtotal}.` };
    if (covered(known) <= 0) return { discount: 0, deliveryFee, offer: null, error: 'This coupon only applies to selected products, and none of them are in your bag.' };
    return { discount: 0, deliveryFee, offer: null, error: 'This coupon has already been used the maximum number of times.' };
  }

  // Best for the customer: compare the discount plus any delivery saved.
  const worth = (offer: OfferRow) => value(offer) + (offer.discountType === 'free_delivery' ? deliveryFee : 0);
  const best = usable.reduce((winner, offer) => (worth(offer) > worth(winner) ? offer : winner), usable[0]);
  return { discount: value(best), deliveryFee: best.discountType === 'free_delivery' ? 0 : deliveryFee, offer: best, error: '' };
}

/**
 * Lets checkout preview a coupon before the order is placed, using the same maths.
 *
 * Now that an offer can be limited to certain products, the preview needs to know which
 * products the money belongs to, not just the total. Checkout sends the bag's SKUs and
 * quantities and the line totals are priced here, so the preview matches the order rather than
 * trusting a browser that could otherwise claim any basket it liked.
 */
app.post('/api/offers/validate', async (c) => {
  const body = await c.req.json<{ subtotal?: number; deliveryFee?: number; code?: string; items?: Array<{ sku?: string; quantity?: number }> }>();
  const deliveryFee = Math.max(0, Math.round(Number(body.deliveryFee) || 0));
  const wantedItems = (body.items || []).map((item) => ({ sku: normalize(item.sku), quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)) })).filter((item) => item.sku && item.quantity);
  let lines: OfferLine[] = [];
  if (wantedItems.length) {
    const skus = wantedItems.map((item) => item.sku);
    const rows = await c.env.DB.prepare(`SELECT id, sku, price, volume_tiers_json AS volumeTiersJson, discount_percent AS discountPercent, discount_ends_at AS discountEndsAt FROM products WHERE active = 1 AND sku IN (${skus.map(() => '?').join(',')})`).bind(...skus).all<{ id: number; sku: string; price: number; volumeTiersJson: string; discountPercent: number; discountEndsAt: string | null }>();
    const bySku = new Map(rows.results.map((row) => [row.sku, row]));
    lines = wantedItems.flatMap((item) => {
      const product = bySku.get(item.sku);
      if (!product) return [];
      const tier = parseVolumeTiers(product.volumeTiersJson).filter((entry) => item.quantity >= entry.minQty).at(-1);
      const offerPrice = discountedPrice(Number(product.price) || 0, activeDiscountPercent(product));
      const unitPrice = tier?.price === undefined ? offerPrice : Math.min(Number(tier.price), offerPrice);
      return [{ productId: product.id, lineTotal: unitPrice * item.quantity }];
    });
  }
  // An older checkout, or a caller with no basket, can still preview against a bare subtotal.
  if (!lines.length) lines = [{ productId: 0, lineTotal: Math.max(0, Math.round(Number(body.subtotal) || 0)) }];
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const result = await resolveOffer(c.env, lines, deliveryFee, normalize(body.code));
  if (result.error) return json(c, { ok: false, error: result.error }, 400);
  return json(c, {
    ok: true,
    subtotal,
    discount: result.discount,
    deliveryFee: result.deliveryFee,
    total: Math.max(0, subtotal - result.discount) + result.deliveryFee,
    offer: result.offer ? { code: result.offer.code, title: result.offer.title, discountType: result.offer.discountType, discountValue: result.offer.discountValue, wholeShop: offerProductScope(result.offer.productIdsJson).length === 0 } : null,
  });
});

app.post('/api/orders', async (c) => {
  const body = await c.req.json<{
    name: string; phone: string; email?: string; address: string; district?: string; upazila?: string; specialNote?: string;
    paymentMethod?: 'cod' | 'bkash' | 'nagad' | 'rocket'; trxId?: string; couponCode?: string;
    items: Array<{ sku: string; quantity: number; options?: { size?: string; color?: string; gram?: string } }>;
  }>();
  const address = normalize(body.address);
  const district = normalize(body.district);
  const upazila = normalize(body.upazila);
  if (!body.name || !body.phone || !address || !district || !upazila || !body.items?.length) return json(c, { error: 'Please complete customer, district, upazila, address, and cart details.' }, 400);
  const { zone, fee: deliveryFee } = await resolveDeliveryZone(c.env, district, upazila, address);
  const availableMethods = await resolvePaymentMethods(c.env);
  const requestedMethod = normalize(body.paymentMethod);
  const selectedMethod = availableMethods.find((method) => method.id === requestedMethod) ?? availableMethods.find((method) => method.id === 'cod') ?? availableMethods[0];
  if (requestedMethod && requestedMethod !== selectedMethod.id) return json(c, { error: 'That payment method is not available right now. Please pick another one.' }, 400);
  const paymentMethod = selectedMethod.id;
  const trxId = normalize(body.trxId);
  if (selectedMethod.requiresTrxId && !trxId) return json(c, { error: 'Please enter the bKash transaction ID for an advance payment.' }, 400);
  const skus = body.items.map((item) => normalize(item.sku)).filter(Boolean);
  if (skus.length !== body.items.length) return json(c, { error: 'Each order item must include a product SKU.' }, 400);
  const products = await c.env.DB.prepare(`SELECT id, name, sku, price, stock, min_order_qty AS minOrderQty, volume_tiers_json AS volumeTiersJson, discount_percent AS discountPercent, discount_ends_at AS discountEndsAt FROM products WHERE active = 1 AND sku IN (${skus.map(() => '?').join(',')})`).bind(...skus).all<{ id: number; name: string; sku: string; price: number; stock: number; minOrderQty: number; volumeTiersJson: string; discountPercent: number; discountEndsAt: string | null }>();
  const bySku = new Map(products.results.map((product) => [product.sku, product]));
  const productIds = products.results.map((product) => product.id);
  type SizeVariant = { id: number; productId: number; label: string; price: number | null; stock: number };
  const variantRows = productIds.length
    ? await c.env.DB.prepare(`SELECT id, product_id AS productId, label, price, stock FROM product_variants WHERE active = 1 AND kind = 'size' AND product_id IN (${productIds.map(() => '?').join(',')})`).bind(...productIds).all<SizeVariant>()
    : { results: [] as SizeVariant[] };
  const variantBySku = new Map(variantRows.results.map((row) => [`${row.productId}|${String(row.label).toLowerCase()}`, row]));
  // A shop that prices by size may leave the base price at zero, which the storefront shows as
  // "From <cheapest>". Without this, an order naming no size would price that product at zero
  // and the customer would get it free.
  const cheapestVariant = new Map<number, number>();
  // A shop counts stock per size only if it has entered some. All sizes at zero means "not
  // tracked separately", so the product total still decides; once any size carries a number,
  // every size of that product is judged on its own — including the ones sitting at zero.
  const tracksSizeStock = new Set<number>();
  for (const row of variantRows.results) {
    if (Number(row.stock || 0) > 0) tracksSizeStock.add(row.productId);
    if (row.price === null || row.price === undefined) continue;
    const current = cheapestVariant.get(row.productId);
    if (current === undefined || Number(row.price) < current) cheapestVariant.set(row.productId, Number(row.price));
  }
  const lineItems = body.items.map((item) => {
    const product = bySku.get(normalize(item.sku));
    if (!product || item.quantity < 1 || product.stock < item.quantity) throw new RequestError('A selected product is unavailable or out of stock.');
    const minimum = Math.max(1, Number(product.minOrderQty || 1));
    if (item.quantity < minimum) throw new RequestError(`${product.name} requires a minimum order quantity of ${minimum}.`);
    const tiers = parseVolumeTiers(product.volumeTiersJson);
    const tier = tiers.filter((entry) => item.quantity >= entry.minQty).at(-1);
    const options = Object.fromEntries(Object.entries(item.options || {}).filter(([key, value]) => ['size', 'color', 'gram'].includes(key) && normalize(value)));
    // A priced variant (50g, 100g, a clothing size) overrides the base price. The price comes
    // from the database, never from the request, so a customer cannot name their own.
    const variantLabel = normalize(options.size) || normalize(options.gram);
    const variant = variantLabel ? variantBySku.get(`${product.id}|${variantLabel.toLowerCase()}`) : undefined;
    // Sizes carry their own stock, so a shop with two S left and thirty L cannot sell three S
    // just because the product total is thirty-two.
    if (variant && tracksSizeStock.has(product.id) && Number(variant.stock || 0) < item.quantity) {
      throw new RequestError(Number(variant.stock || 0) ? `${product.name} has only ${variant.stock} left in ${variant.label}.` : `${product.name} is sold out in ${variant.label}.`);
    }
    const listPrice = variant?.price ?? (Number(product.price) || cheapestVariant.get(product.id) || product.price);
    // The product's own offer percentage, applied here so the price the customer was shown is
    // the price they are charged. A volume tier is already a negotiated price, so the two never
    // stack: the customer gets whichever is cheaper, never both discounts at once.
    const offerPrice = discountedPrice(listPrice, activeDiscountPercent(product));
    const unitPrice = tier?.price === undefined ? offerPrice : Math.min(Number(tier.price), offerPrice);
    return { sku: product.sku, quantity: item.quantity, product, unitPrice, options, variantLabel: variant ? variant.label : '', variantId: variant?.id ?? null };
  });
  const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  // Offers finally do something: a coupon code, or an auto-apply offer when none is given.
  const offerResult = await resolveOffer(c.env, lineItems.map((line) => ({ productId: line.product.id, lineTotal: line.unitPrice * line.quantity })), deliveryFee, normalize(body.couponCode));
  if (offerResult.error) return json(c, { error: offerResult.error }, 400);
  const discountAmount = offerResult.discount;
  const chargedDeliveryFee = offerResult.deliveryFee;
  const orderCode = `RNV-${Date.now().toString(36).toUpperCase()}`;
  const invoicePlaceholder = `PENDING-${orderCode}`;
  const customer = await c.env.DB.prepare('INSERT INTO customers(name, phone, email, district, upazila, address, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(phone) DO UPDATE SET name=excluded.name, email=excluded.email, district=excluded.district, upazila=excluded.upazila, address=excluded.address, updated_at=CURRENT_TIMESTAMP RETURNING id').bind(body.name, body.phone, body.email ?? null, district, upazila, address).first<{ id: number }>();
  if (!customer) return json(c, { error: 'Could not create customer profile.' }, 500);
  const order = await c.env.DB.prepare('INSERT INTO orders(order_code, invoice_number, customer_id, subtotal, delivery_fee, delivery_zone, payment_method, trx_id, admin_note, discount_amount, offer_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, order_code AS orderCode, invoice_number AS invoiceNumber').bind(orderCode, invoicePlaceholder, customer.id, subtotal, chargedDeliveryFee, zone, paymentMethod, trxId || null, normalize(body.specialNote) || null, discountAmount, offerResult.offer?.code ?? null).first<{ id: number; orderCode: string; invoiceNumber: string }>();
  if (!order) return json(c, { error: 'Could not create order.' }, 500);
  const invoiceNumber = invoiceNumberForOrderId(order.id) || invoicePlaceholder;
  await c.env.DB.prepare('UPDATE orders SET invoice_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(invoiceNumber, order.id).run();
  order.invoiceNumber = invoiceNumber;
  for (const item of lineItems) {
    await c.env.DB.prepare('INSERT INTO order_items(order_id, product_id, product_name, quantity, unit_price, variant_label) VALUES (?, ?, ?, ?, ?, ?)').bind(order.id, item.product.id, item.options && Object.keys(item.options).length ? `${item.product.name} · ${Object.entries(item.options).map(([key, value]) => `${key === 'size' ? 'Size' : key === 'color' ? 'Colour' : 'Weight'}: ${value}`).join(' · ')}` : item.product.name, item.quantity, item.unitPrice, item.variantLabel || null).run();
    await c.env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(item.quantity, item.product.id).run();
    // Per-size stock only counts down once the shop has actually recorded some; a size left at
    // zero means "not tracked separately" rather than "sold out".
    if (item.variantId) await c.env.DB.prepare('UPDATE product_variants SET stock = MAX(0, stock - ?) WHERE id = ? AND stock > 0').bind(item.quantity, item.variantId).run();
  }
  // Count a coupon only once the order exists, so an abandoned checkout never burns a use.
  if (offerResult.offer) await c.env.DB.prepare('UPDATE offers SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(offerResult.offer.id).run();
  await c.env.DB.prepare('INSERT INTO order_status_history(order_id, to_status, reason) VALUES (?, ?, ?)').bind(order.id, 'pending', 'Customer order placed').run();
  await createAdminNotification(c.env, { type: 'order', title: 'New order received', message: `Order ${order.orderCode} is ready for review.`, entityType: 'order', entityId: order.orderCode });
  c.executionCtx.waitUntil(metaCapiEvent(c.env, { eventName: 'Purchase', eventId: order.orderCode, sourceUrl: new URL('/checkout', c.req.url).toString(), value: Math.max(0, subtotal - discountAmount) + chargedDeliveryFee, user: { name: body.name, email: body.email, phone: body.phone, city: zone === 'dhaka' ? 'Dhaka' : undefined, region: zone, country: 'bd', externalId: String(customer.id) }, items: lineItems.map((item) => ({ id: item.product.sku, name: item.product.name, quantity: item.quantity, price: item.unitPrice })) }).catch(async (error) => { console.error('[Meta CAPI Purchase]', error); await createAdminNotification(c.env, { type: 'integration', title: 'Meta CAPI purchase sync failed', message: `Purchase event ${order.orderCode} could not be sent.`, entityType: 'order', entityId: order.orderCode }); }));
  const itemSummary = lineItems.map((item) => `${item.product.name} × ${item.quantity}`).join(' · ');
  c.executionCtx.waitUntil(syncActivityLead(c.env, [new Date().toISOString(), 'sale', order.orderCode, order.invoiceNumber, body.name, normalize(body.phone), normalize(body.email) || null, 'pending', paymentMethod, subtotal, chargedDeliveryFee, Math.max(0, subtotal - discountAmount) + chargedDeliveryFee, itemSummary, null, null, body.specialNote ? normalize(body.specialNote) : null]).catch(async () => { await createAdminNotification(c.env, { type: 'integration', title: 'Google Sheet sync failed', message: `Sale lead ${order.orderCode} could not be added to the activity sheet.`, entityType: 'order', entityId: order.orderCode }); }));
  const customerToken = await createCustomerSession(c.env, customer.id);
  return json(c, { order: { ...order, subtotal, deliveryFee: chargedDeliveryFee, discount: discountAmount, offerCode: offerResult.offer?.code ?? null, total: Math.max(0, subtotal - discountAmount) + chargedDeliveryFee, zone, paymentMethod }, customerToken, message: 'Order received successfully.' }, 201);
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

/**
 * A single order, for the admin dashboard or for the customer who placed it.
 *
 * This used to answer anybody. It matches on printf('INV-%06d', id), which is a plain counter,
 * so INV-000001, INV-000002, ... walked the whole customer base and handed back every name,
 * phone number, email and home address without so much as a cookie. It is guarded the same way
 * its /invoice sibling always was, and answers "not found" rather than "not allowed" so it
 * cannot be used to confirm which invoice numbers exist.
 */
app.get('/api/orders/:orderIdentifier', async (c) => {
  const admin = await adminPrincipal(c);
  const customerSession = admin ? null : await customerPrincipal(c);
  if (!admin && !customerSession) return json(c, { error: 'Order not found.' }, 404);
  const identifier = normalize(c.req.param('orderIdentifier'));
  const order = await c.env.DB.prepare("SELECT o.id, o.customer_id AS customerId, o.order_code AS orderCode, printf('INV-%06d', o.id) AS invoiceNumber, o.subtotal, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.courier_status AS courierStatus, o.admin_note AS customerNote, o.created_at AS createdAt, c.name, c.phone, c.email, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ? OR o.invoice_number = ? OR printf('INV-%06d', o.id) = ? OR printf('RNV-%06d', o.id) = ? LIMIT 1").bind(identifier, identifier, identifier, identifier).first<{ id: number; customerId: number }>();
  // A signed-in customer may only read their own order, never another one by guessing its number.
  if (!order || (!admin && customerSession?.customerId !== order.customerId)) return json(c, { error: 'Order not found.' }, 404);
  const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, oi.unit_price AS unitPrice, p.sku AS sku FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id').bind((order as { id: number }).id).all();
  return json(c, { order, items: items.results });
});

app.all('*', async (c) => {
  if (c.req.path.startsWith('/api/')) return json(c, { error: 'Not found.' }, 404);
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text('Rinova BD API is live. Storefront assets are deployed separately.', 404);
});

export default app;