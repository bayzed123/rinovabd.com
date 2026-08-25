import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Bindings {
  DB: D1Database;
  PRODUCT_IMAGES: R2Bucket;
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
}

type App = Hono<{ Bindings: Bindings }>;
type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'customer_cancelled' | 'refused' | 'delivery_failed' | 'returned' | 'admin_cancelled';

const app: App = new Hono();
app.use('/api/*', cors({ origin: ['https://rinovabd.com', 'http://localhost:5173'], allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'] }));

const json = (c: { json: (body: unknown, status?: number) => Response }, body: unknown, status = 200) => c.json(body, status);

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || normalize(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

type ShopProductLink = { slug: string; name: string; price: number; stock: number; imageUrl: string | null; categoryName: string | null };

function parseProductMedia(value: unknown): Array<{ type: 'image' | 'video'; url: string; alt?: string }> {
  let items: unknown[] = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) items = parsed; } catch {}
  }
  return items.map((item) => {
    if (typeof item === 'string') return { type: 'image' as const, url: normalizeMediaUrl(item) };
    const media = item as Record<string, unknown>;
    return { type: media.type === 'video' ? 'video' as const : 'image' as const, url: normalizeMediaUrl(media.url), alt: normalize(media.alt) || undefined };
  }).filter((item) => Boolean(item.url));
}

function normalizeMediaUrl(value: unknown) {
  const url = normalize(value);
  return /^(https:\/\/|\/assets\/)/i.test(url) ? url : '';
}

async function findRelevantProducts(env: Bindings, question: string): Promise<ShopProductLink[]> {
  const products = await env.DB.prepare('SELECT p.slug, p.name, p.price, p.stock, p.image_url AS imageUrl, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 ORDER BY p.featured DESC, p.created_at DESC LIMIT 40').all<ShopProductLink & { categorySlug: string | null }>();
  const stopWords = new Set(['the','and','for','with','about','please','show','give','link','product','products','price','details','দাও','দেখাও','লিংক','প্রোডাক্ট','দাম']);
  const terms = normalize(question).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1 && !stopWords.has(term));
  const ranked = products.results.map((product) => {
    const haystack = `${product.name} ${product.categoryName || ''}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0);
    return { product, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const selected = (ranked.length ? ranked.map((item) => item.product) : products.results).slice(0, 4);
  return selected.map((product) => ({ slug: product.slug, name: product.name, price: Number(product.price || 0), stock: Number(product.stock || 0), imageUrl: product.imageUrl, categoryName: product.categoryName }));
}

function shopOnlyInstruction(scope: 'customer' | 'staff') {
  return scope === 'customer'
    ? 'You are Rinova BD customer support. Answer only questions about Rinova products, prices, stock, skincare/makeup usage, delivery fees, orders, returns, payments, and store policies. Never invent product facts, never reveal private customer/admin data, and politely refuse unrelated topics. Respond in the user language, preferably concise Bangla when the user writes Bangla.'
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
  return JSON.stringify({ store: Object.fromEntries(settings.results.map((item) => [item.key, item.value])), categories: categories.results, products: products.results.map((product) => ({ ...product, productUrl: `/product.html?slug=${encodeURIComponent(String(product.slug))}` })), offers: offers.results, staffData });
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
  const result = await c.env.DB.prepare('SELECT order_code AS orderCode, invoice_number AS invoiceNumber, subtotal, delivery_fee AS deliveryFee, status, payment_status AS paymentStatus, courier_status AS courierStatus, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.customerId).all();
  return json(c, { orders: result.results });
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
  const order = await c.env.DB.prepare("SELECT id, order_code AS orderCode, subtotal, status FROM orders WHERE order_code = ? AND customer_id = ?").bind(normalize(body.orderCode), session.customerId).first<{ id: number; orderCode: string; subtotal: number; status: OrderStatus }>();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  if (!['delivered', 'shipped'].includes(order.status)) return json(c, { error: 'A return can be requested after shipment or delivery.' }, 400);
  const returnCode = `RET-${Date.now().toString(36).toUpperCase()}`;
  const result = await c.env.DB.prepare("INSERT INTO returns(order_id, return_code, reason, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, 'customer') RETURNING id, return_code AS returnCode, status").bind(order.id, returnCode, normalize(body.reason), order.subtotal, normalize(body.notes) || null).first();
  await c.env.DB.prepare("UPDATE orders SET return_status = 'requested', return_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(normalize(body.reason), order.id).run();
  return json(c, { ok: true, return: result }, 201);
});

app.get('/api/orders/:orderCode/invoice', async (c) => {
  const admin = await adminPrincipal(c);
  const customerSession = admin ? null : await customerPrincipal(c);
  const order = await c.env.DB.prepare('SELECT o.id, o.order_code AS orderCode, o.invoice_number AS invoiceNumber, o.subtotal, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.order_source AS orderSource, o.package_weight_grams AS packageWeightGrams, o.created_at AS createdAt, c.id AS customerId, c.name, c.phone, c.email, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(normalize(c.req.param('orderCode'))).first<{ id: number; orderCode: string; invoiceNumber: string | null; subtotal: number; deliveryFee: number; deliveryZone: string; paymentMethod: string; paymentStatus: string; status: string; orderSource: string; packageWeightGrams: number; createdAt: string; customerId: number; name: string; phone: string; email: string | null; district: string; upazila: string; address: string }>();
  if (!order || (!admin && (!customerSession || customerSession.customerId !== order.customerId))) return json(c, { error: 'Order not found.' }, 404);
  const items = await c.env.DB.prepare('SELECT oi.product_name AS productName, oi.quantity, oi.unit_price AS unitPrice, COALESCE(p.weight_grams, 0) AS weightGrams FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id ASC').bind(order.id).all();
  const computedWeight = items.results.reduce((sum, item) => sum + Number((item as { quantity: number; weightGrams: number }).quantity) * Number((item as { quantity: number; weightGrams: number }).weightGrams), 0);
  return json(c, { invoice: { ...order, packageWeightGrams: Math.max(order.packageWeightGrams || 0, computedWeight), total: order.subtotal + order.deliveryFee }, items: items.results });
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
  return json(c, { ok: true, sale: { ...sale, subtotal, discount, total: subtotal - discount, paymentMethod: body.paymentMethod } }, 201);
});

app.get('/api/content/home', async (c) => {
  const content = await c.env.DB.prepare("SELECT content_key AS key, content_type AS type, title, body_json AS body FROM cms_content WHERE status = 'published' ORDER BY content_key").all();
  const posts = await c.env.DB.prepare("SELECT slug, title, excerpt, body, image_url AS imageUrl, published_at AS publishedAt, author FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC, created_at DESC LIMIT 12").all();
  const offers = await c.env.DB.prepare("SELECT code, title, description, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, starts_at AS startsAt, ends_at AS endsAt FROM offers WHERE active = 1 AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP) ORDER BY created_at DESC LIMIT 20").all();
  return json(c, { content: content.results, posts: posts.results, offers: offers.results });
});

app.get('/api/content/pages/:slug', async (c) => {
  const page = await c.env.DB.prepare("SELECT slug, title, body, seo_title AS seoTitle, seo_description AS seoDescription FROM site_pages WHERE slug = ? AND status = 'published'").bind(normalize(c.req.param('slug'))).first();
  return page ? json(c, { page }) : json(c, { error: 'Page not found.' }, 404);
});

app.get('/api/admin/content', async (c) => {
  if (!await adminPrincipal(c)) return json(c, { error: 'Unauthorized admin request.' }, 401);
  const [content, pages, posts, offers] = await Promise.all([
    c.env.DB.prepare('SELECT content_key AS key, content_type AS type, title, body_json AS body, status, updated_by AS updatedBy, updated_at AS updatedAt FROM cms_content ORDER BY content_key').all(),
    c.env.DB.prepare('SELECT id, slug, title, body, status, seo_title AS seoTitle, seo_description AS seoDescription, updated_at AS updatedAt FROM site_pages ORDER BY updated_at DESC').all(),
    c.env.DB.prepare('SELECT id, slug, title, excerpt, body, image_url AS imageUrl, status, published_at AS publishedAt, author, updated_at AS updatedAt FROM blog_posts ORDER BY updated_at DESC').all(),
    c.env.DB.prepare('SELECT id, code, title, description, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, starts_at AS startsAt, ends_at AS endsAt, active FROM offers ORDER BY updated_at DESC').all(),
  ]);
  return json(c, { content: content.results, pages: pages.results, posts: posts.results, offers: offers.results });
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
  const body = await c.req.json<{ slug?: string; title?: string; excerpt?: string; body?: string; imageUrl?: string; status?: string }>();
  const slug = normalize(body.slug);
  if (!slug || !normalize(body.title)) return json(c, { error: 'Post slug and title are required.' }, 400);
  const status = ['draft','published','archived'].includes(normalize(body.status)) ? normalize(body.status) : 'draft';
  const publishedAt = status === 'published' ? new Date().toISOString() : null;
  await c.env.DB.prepare('INSERT INTO blog_posts(slug, title, excerpt, body, image_url, status, published_at, updated_by, author, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, image_url = excluded.image_url, status = excluded.status, published_at = excluded.published_at, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP').bind(slug, normalize(body.title), normalize(body.excerpt), normalize(body.body), normalize(body.imageUrl) || null, status, publishedAt, actor, 'Rinova BD').run();
  return json(c, { ok: true, slug });
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
  const result = await c.env.DB.prepare(`SELECT p.id, p.category_id AS categoryId, p.name, p.slug, p.sku, NULL AS brand, p.description, p.short_description AS shortDescription, p.price, p.compare_at_price AS compareAtPrice, p.cost_price AS costPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.low_stock_threshold AS lowStockThreshold, p.min_order_qty AS minOrderQty, p.status, p.featured, p.tags_json AS tagsJson, p.specs_json AS specsJson, p.volume_tiers_json AS volumeTiersJson, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${condition.join(' AND ')} ORDER BY p.updated_at DESC, p.created_at DESC`).bind(...values).all();
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
  const product = await c.env.DB.prepare('SELECT p.id, p.category_id AS categoryId, p.name, p.slug, p.sku, NULL AS brand, p.description, p.short_description AS shortDescription, p.price, p.compare_at_price AS compareAtPrice, p.cost_price AS costPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.low_stock_threshold AS lowStockThreshold, p.min_order_qty AS minOrderQty, p.status, p.featured, p.tags_json AS tagsJson, p.specs_json AS specsJson, p.volume_tiers_json AS volumeTiersJson, c.name AS categoryName FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?').bind(id).first();
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
  const result = await c.env.DB.prepare(`SELECT o.order_code AS orderCode, o.status, o.subtotal, o.delivery_fee AS deliveryFee, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.courier_status AS courierStatus, o.created_at AS createdAt, c.name, c.phone, c.district, c.upazila FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${condition.join(' AND ')} ORDER BY o.created_at DESC LIMIT 100`).bind(...values).all();
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
  const primaryImage = normalizeMediaUrl(body.imageUrl) || null;
  const result = await c.env.DB.prepare("INSERT INTO products(category_id, name, slug, sku, description, short_description, price, compare_at_price, cost_price, image_url, media_json, barcode, weight_grams, stock, low_stock_threshold, min_order_qty, status, tags_json, specs_json, volume_tiers_json, featured, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id, name, slug").bind(categoryId, name, slug, normalize(body.sku) || `RNV-${Date.now().toString(36).toUpperCase()}`, normalize(body.description), normalize(body.shortDescription), Number(body.price) || 0, numberOrNull(body.compareAtPrice), Number(body.costPrice) || 0, primaryImage, mediaJson, normalize(body.barcode) || null, Number(body.weightGrams) || 0, Math.max(0, Number(body.stock) || 0), Math.max(0, Number(body.lowStockThreshold) || 5), Math.max(1, Number(body.minOrderQty) || 1), status, JSON.stringify(body.tags ?? []), JSON.stringify(body.specs ?? []), JSON.stringify(volumeTiers), body.featured ? 1 : 0, active).first();
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
  const result = await c.env.DB.prepare("UPDATE products SET name = COALESCE(?, name), sku = COALESCE(?, sku), description = COALESCE(?, description), short_description = COALESCE(?, short_description), price = COALESCE(?, price), compare_at_price = COALESCE(?, compare_at_price), cost_price = COALESCE(?, cost_price), image_url = COALESCE(?, image_url), media_json = COALESCE(?, media_json), barcode = COALESCE(?, barcode), weight_grams = COALESCE(?, weight_grams), low_stock_threshold = COALESCE(?, low_stock_threshold), min_order_qty = COALESCE(?, min_order_qty), status = COALESCE(?, status), active = COALESCE(?, active), featured = COALESCE(?, featured), tags_json = COALESCE(?, tags_json), specs_json = COALESCE(?, specs_json), volume_tiers_json = COALESCE(?, volume_tiers_json), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.name === undefined ? null : normalize(body.name), body.sku === undefined ? null : normalize(body.sku), body.description === undefined ? null : normalize(body.description), body.shortDescription === undefined ? null : normalize(body.shortDescription), body.price === undefined ? null : Number(body.price), numberOrNull(body.compareAtPrice), body.costPrice === undefined ? null : numberOrNull(body.costPrice), body.imageUrl === undefined ? null : (normalizeMediaUrl(body.imageUrl) || null), mediaJson, body.barcode === undefined ? null : normalize(body.barcode), body.weightGrams === undefined ? null : Number(body.weightGrams), body.lowStockThreshold === undefined ? null : Number(body.lowStockThreshold), body.minOrderQty === undefined ? null : Number(body.minOrderQty), status, active, body.featured === undefined ? null : body.featured ? 1 : 0, body.tags === undefined ? null : JSON.stringify(body.tags), body.specs === undefined ? null : JSON.stringify(body.specs), volumeTiers, id).run();
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
  const phone = normalize(c.req.query('phone'));
  if (!orderCode && !phone) return json(c, { error: 'Order ID or mobile number is required.' }, 400);
  const order = orderCode
    ? await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first<{ orderCode: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>()
    : await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.status, o.courier_provider AS courierProvider, o.courier_tracking_code AS trackingCode, o.courier_last_status AS courierStatus, o.courier_last_updated AS lastUpdated, o.created_at AS createdAt, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone = ? ORDER BY o.created_at DESC LIMIT 1').bind(phone).first<{ orderCode: string; status: string; courierProvider: string | null; trackingCode: string | null; courierStatus: string | null; lastUpdated: string | null; createdAt: string; phone: string }>();
  if (!order || (orderCode && phone && order.phone !== phone)) return json(c, { error: 'Order not found.' }, 404);
  const courierStatus = order.courierStatus ?? (order.status === 'delivered' ? 'delivered' : order.status);
  const message = courierStatus === 'delivered' ? 'আপনার অর্ডারটি ডেলিভারি সম্পন্ন হয়েছে।' : courierStatus === 'returned' ? 'আপনার অর্ডারটি কুরিয়ার থেকে রিটার্ন হয়েছে।' : courierStatus === 'shipped' || courierStatus === 'in_review' ? 'আপনার অর্ডারটি কুরিয়ারে পাঠানো হয়েছে; সাধারণত ২–৩ দিনে ডেলিভারি পাওয়া যাবে।' : 'আপনার অর্ডারটি প্রস্তুত করা হচ্ছে।';
  return json(c, { tracking: { orderCode: order.orderCode, status: order.status, courierProvider: order.courierProvider, trackingCode: order.trackingCode, courierStatus, lastUpdated: order.lastUpdated, message } });
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

app.get('/sitemap.xml', async (c) => {
  const origin = new URL(c.req.url).origin;
  const products = await c.env.DB.prepare('SELECT slug FROM products WHERE active = 1 ORDER BY updated_at DESC, created_at DESC').all<{ slug: string }>();
  const staticUrls = ['/', '/product.html', '/checkout.html', '/account.html'].map((path) => `${origin}${path}`);
  const productUrls = products.results.map((product) => `${origin}/product.html?slug=${encodeURIComponent(product.slug)}`);
  const xmlEscape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...[...staticUrls, ...productUrls].map((url) => `<url><loc>${xmlEscape(url)}</loc></url>`), '</urlset>'].join('');
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
  const result = await c.env.DB.prepare(`SELECT p.id, p.name, p.slug, p.description, p.price, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} ORDER BY p.featured DESC, p.created_at DESC`).bind(...values).all();
  return json(c, { products: result.results });
});

app.get('/api/products/:slug', async (c) => {
  const slug = normalize(c.req.param('slug'));
  const product = await c.env.DB.prepare('SELECT p.id, p.name, p.slug, p.description, p.short_description AS shortDescription, p.price, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.media_json AS mediaJson, p.barcode, p.weight_grams AS weightGrams, p.stock, p.min_order_qty AS minOrderQty, p.volume_tiers_json AS volumeTiersJson, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND (p.slug = ? OR CAST(p.id AS TEXT) = ?) LIMIT 1').bind(slug, slug).first();
  if (!product) return json(c, { error: 'Product not found.' }, 404);
  return json(c, { product });
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
    name: string; phone: string; email?: string; district: string; upazila: string; address: string;
    paymentMethod: 'cod' | 'bkash' | 'nagad' | 'rocket'; trxId?: string;
    items: Array<{ productId: number; quantity: number }>;
  }>();
  if (!body.name || !body.phone || !body.district || !body.upazila || !body.address || !body.items?.length) return json(c, { error: 'Please complete customer, address, and cart details.' }, 400);
  const location = await c.env.DB.prepare('SELECT zone FROM location_directory WHERE district = ? AND upazila = ? LIMIT 1').bind(body.district, body.upazila).first<{ zone: 'dhaka' | 'outside-dhaka' }>();
  const zone = location?.zone ?? (body.district.toLowerCase() === 'dhaka' ? 'dhaka' : 'outside-dhaka');
  const deliveryFee = zone === 'dhaka' ? 90 : 150;
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
  const customer = await c.env.DB.prepare('INSERT INTO customers(name, phone, email, district, upazila, address, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(phone) DO UPDATE SET name=excluded.name, email=excluded.email, district=excluded.district, upazila=excluded.upazila, address=excluded.address, updated_at=CURRENT_TIMESTAMP RETURNING id').bind(body.name, body.phone, body.email ?? null, body.district, body.upazila, body.address).first<{ id: number }>();
  if (!customer) return json(c, { error: 'Could not create customer profile.' }, 500);
  const order = await c.env.DB.prepare('INSERT INTO orders(order_code, invoice_number, customer_id, subtotal, delivery_fee, delivery_zone, payment_method, trx_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, order_code AS orderCode, invoice_number AS invoiceNumber').bind(orderCode, invoiceNumber, customer.id, subtotal, deliveryFee, zone, body.paymentMethod, body.trxId ?? null).first<{ id: number; orderCode: string; invoiceNumber: string }>();
  if (!order) return json(c, { error: 'Could not create order.' }, 500);
  for (const item of lineItems) {
    await c.env.DB.prepare('INSERT INTO order_items(order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)').bind(order.id, item.product.id, item.product.name, item.quantity, item.unitPrice).run();
    await c.env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(item.quantity, item.product.id).run();
  }
  await c.env.DB.prepare('INSERT INTO order_status_history(order_id, to_status, reason) VALUES (?, ?, ?)').bind(order.id, 'pending', 'Customer order placed').run();
  return json(c, { order: { ...order, subtotal, deliveryFee, total: subtotal + deliveryFee, zone, paymentMethod: body.paymentMethod }, message: 'Order received successfully.' }, 201);
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
  const order = await c.env.DB.prepare('SELECT o.order_code AS orderCode, o.subtotal, o.delivery_fee AS deliveryFee, o.delivery_zone AS deliveryZone, o.payment_method AS paymentMethod, o.payment_status AS paymentStatus, o.status, o.courier_status AS courierStatus, o.created_at AS createdAt, c.name, c.phone, c.district, c.upazila, c.address FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_code = ?').bind(orderCode).first();
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

