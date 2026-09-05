import { BASE, ADMIN_USERNAME, ADMIN_PASSWORD } from '../harness.mjs';
// Customer data must not be readable by strangers, and the dashboard login must not be
// guessable at speed. Both of these passed happily before the fix, which is the point.

const results = [];
const check = (name, pass, detail = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`); };
const get = async (path, headers = {}) => { const r = await fetch(`${BASE}${path}`, { headers }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const post = async (path, body, headers = {}) => { const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

const admin = await post('/api/admin/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
const AUTH = { Authorization: `Bearer ${admin.json.token}` };
check('The suite can sign in as the owner', admin.status === 200 && Boolean(admin.json.token), `status ${admin.status}`);

// A real order to look up, with details we can recognise if they leak.
const phone = `017${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
const products = await get('/api/products');
const sku = (products.json.products || products.json)[0].sku;
const placed = await post('/api/orders', { name: 'Audit Subject', phone, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'Secret House 7', paymentMethod: 'cod', items: [{ sku, quantity: 1 }] });
const orderCode = placed.json.order?.orderCode;
const invoiceNumber = placed.json.order?.invoiceNumber;
const customerToken = placed.json.customerToken;
check('A test order was placed', Boolean(orderCode && invoiceNumber), `${orderCode} / ${invoiceNumber}`);

// ---- The order lookup must not hand personal details to a stranger -------------------------
const leaks = (payload) => {
  const text = JSON.stringify(payload || {});
  return ['Audit Subject', phone, 'Secret House 7'].filter((needle) => text.includes(needle));
};

const anon = await get(`/api/orders/${encodeURIComponent(invoiceNumber)}`);
check('A stranger cannot read an order by its invoice number', anon.status === 404 && leaks(anon.json).length === 0, `status ${anon.status} leaked ${JSON.stringify(leaks(anon.json))}`);
const anonByCode = await get(`/api/orders/${encodeURIComponent(orderCode)}`);
check('Nor by its order code', anonByCode.status === 404 && leaks(anonByCode.json).length === 0, `status ${anonByCode.status}`);

// Invoice numbers are a plain counter, so this is the walk an attacker would actually do.
const walked = [];
for (let n = 1; n <= 6; n += 1) {
  const row = await get(`/api/orders/INV-${String(n).padStart(6, '0')}`);
  if (row.status === 200 && row.json.order?.phone) walked.push(row.json.order.phone);
}
check('Walking INV-000001 upwards returns no customer records at all', walked.length === 0, `${walked.length} records exposed`);

// The people who should see it, still do.
const asAdmin = await get(`/api/orders/${encodeURIComponent(invoiceNumber)}`, AUTH);
check('The admin dashboard can still read the order', asAdmin.status === 200 && asAdmin.json.order?.phone === phone, `status ${asAdmin.status}`);
const asOwner = await get(`/api/orders/${encodeURIComponent(invoiceNumber)}`, { Authorization: `Bearer ${customerToken}` });
check('The customer who placed it can still read their own order', asOwner.status === 200 && asOwner.json.order?.phone === phone, `status ${asOwner.status}`);

// A signed-in customer must not be able to read somebody else's order by guessing a number.
const other = await post('/api/orders', { name: 'Someone Else', phone: `018${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`, district: 'Rajshahi', upazila: 'Rajshahi Sadar', address: 'Other House', paymentMethod: 'cod', items: [{ sku, quantity: 1 }] });
const cross = await get(`/api/orders/${encodeURIComponent(other.json.order?.invoiceNumber)}`, { Authorization: `Bearer ${customerToken}` });
check('One customer cannot read another customer order', cross.status === 404, `status ${cross.status}`);

// Tracking stays open on purpose — but it must carry no personal details.
const tracking = await get(`/api/customer-tracking?invoiceNumber=${encodeURIComponent(invoiceNumber)}`);
check('Public tracking still works without a login', tracking.status === 200 && Boolean(tracking.json.tracking), `status ${tracking.status}`);
check('Public tracking exposes no name, phone or address', leaks(tracking.json).length === 0, JSON.stringify(leaks(tracking.json)));

// ---- The dashboard login must not be guessable at speed -------------------------------------
const guessUser = `audit${Math.floor(Math.random() * 1000000)}`;
let firstRefusal = 0;
let throttledAt = 0;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  const tried = await post('/api/admin/login', { username: guessUser, password: `guess-${attempt}` });
  if (attempt === 1) firstRefusal = tried.status;
  if (tried.status === 429) { throttledAt = attempt; break; }
}
check('A wrong password is refused', firstRefusal === 401, `status ${firstRefusal}`);
check('Repeated guessing gets locked out rather than running forever', throttledAt > 0 && throttledAt <= 10, throttledAt ? `locked out on attempt ${throttledAt}` : 'never locked out');

// Being locked out must not tell an attacker whether the password was right.
const rightPasswordWhileLocked = await post('/api/admin/login', { username: guessUser, password: 'guess-1' });
check('A locked-out account answers the same however it is probed', rightPasswordWhileLocked.status === 429, `status ${rightPasswordWhileLocked.status}`);

// And the owner, who has not been guessing, must still be able to work.
const ownerStillWorks = await post('/api/admin/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
check('A different account is not locked out by someone else failing', ownerStillWorks.status === 200, `status ${ownerStillWorks.status}`);

// A few typos then the right password must not leave the real owner stranded.
const typoUser = ADMIN_USERNAME;
for (let i = 0; i < 3; i += 1) await post('/api/admin/login', { username: typoUser, password: 'wrong-on-purpose' });
const recovered = await post('/api/admin/login', { username: typoUser, password: ADMIN_PASSWORD });
check('Getting it right after a few typos still signs you in', recovered.status === 200, `status ${recovered.status}`);
const afterSuccess = await post('/api/admin/login', { username: typoUser, password: 'wrong-again' });
check('A success clears the earlier failures', afterSuccess.status === 401, `status ${afterSuccess.status}`);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
