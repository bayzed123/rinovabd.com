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
}

type App = Hono<{ Bindings: Bindings }>;
type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'customer_cancelled' | 'refused' | 'delivery_failed' | 'returned' | 'admin_cancelled';

const app: App = new Hono();
app.use('/api/*', cors({ origin: ['https://rinovabd.com', 'http://localhost:5173'], allowHeaders: ['Content-Type'], allowMethods: ['GET', 'POST', 'PATCH'] }));

const json = (c: { json: (body: unknown, status?: number) => Response }, body: unknown, status = 200) => c.json(body, status);

function normalize(value: unknown) {
  return String(value ?? '').trim();
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

app.get('/api/health', (c) => json(c, { ok: true, service: c.env.SHOP_NAME, timestamp: new Date().toISOString() }));

app.get('/api/config', (c) => json(c, {
  shop: { name: c.env.SHOP_NAME, phone: c.env.SHOP_PHONE, address: c.env.SHOP_ADDRESS },
  delivery: { dhaka: 90, outsideDhaka: 150, emergency: 250, customerCanSelect: false },
  paymentMethods: ['cod', 'bkash', 'nagad', 'rocket']
}));

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
  if (query) { conditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.concern LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  if (category) { conditions.push('c.slug = ?'); values.push(category); }
  if (featured === 'true') conditions.push('p.featured = 1');
  const result = await c.env.DB.prepare(`SELECT p.id, p.name, p.slug, p.description, p.price, p.compare_at_price AS compareAtPrice, p.image_url AS imageUrl, p.stock, p.skin_type AS skinType, p.concern, p.rating, p.review_count AS reviewCount, c.name AS categoryName, c.slug AS categorySlug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} ORDER BY p.featured DESC, p.created_at DESC`).bind(...values).all();
  return json(c, { products: result.results });
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
  const products = await c.env.DB.prepare(`SELECT id, name, price, stock FROM products WHERE active = 1 AND id IN (${productIds.map(() => '?').join(',')})`).bind(...productIds).all<{ id: number; name: string; price: number; stock: number }>();
  const byId = new Map(products.results.map((product) => [product.id, product]));
  const lineItems = body.items.map((item) => { const product = byId.get(item.productId); if (!product || item.quantity < 1 || product.stock < item.quantity) throw new Error('A selected product is unavailable or out of stock.'); return { ...item, product }; });
  const subtotal = lineItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const orderCode = `RNV-${Date.now().toString(36).toUpperCase()}`;
  const customer = await c.env.DB.prepare('INSERT INTO customers(name, phone, email, district, upazila, address, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(phone) DO UPDATE SET name=excluded.name, email=excluded.email, district=excluded.district, upazila=excluded.upazila, address=excluded.address, updated_at=CURRENT_TIMESTAMP RETURNING id').bind(body.name, body.phone, body.email ?? null, body.district, body.upazila, body.address).first<{ id: number }>();
  if (!customer) return json(c, { error: 'Could not create customer profile.' }, 500);
  const order = await c.env.DB.prepare('INSERT INTO orders(order_code, customer_id, subtotal, delivery_fee, delivery_zone, payment_method, trx_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, order_code AS orderCode').bind(orderCode, customer.id, subtotal, deliveryFee, zone, body.paymentMethod, body.trxId ?? null).first<{ id: number; orderCode: string }>();
  if (!order) return json(c, { error: 'Could not create order.' }, 500);
  for (const item of lineItems) {
    await c.env.DB.prepare('INSERT INTO order_items(order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)').bind(order.id, item.product.id, item.product.name, item.quantity, item.product.price).run();
    await c.env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(item.quantity, item.product.id).run();
  }
  await c.env.DB.prepare('INSERT INTO order_status_history(order_id, to_status, reason) VALUES (?, ?, ?)').bind(order.id, 'pending', 'Customer order placed').run();
  return json(c, { order: { ...order, subtotal, deliveryFee, total: subtotal + deliveryFee, zone, paymentMethod: body.paymentMethod }, message: 'Order received successfully.' }, 201);
});

app.patch('/api/orders/:orderCode/status', async (c) => {
  const orderCode = normalize(c.req.param('orderCode'));
  const body = await c.req.json<{ status: OrderStatus; reason?: string; adminNote?: string }>();
  if (!body.status) return json(c, { error: 'Status is required.' }, 400);
  const order = await c.env.DB.prepare('SELECT id, status FROM orders WHERE order_code = ?').bind(orderCode).first<{ id: number; status: OrderStatus }>();
  if (!order) return json(c, { error: 'Order not found.' }, 404);
  await c.env.DB.prepare('UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.status, body.adminNote ?? null, order.id).run();
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

