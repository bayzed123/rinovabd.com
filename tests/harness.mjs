// Shared plumbing for the behaviour suites.
//
// Every suite used to hard-code the port, the admin password and the path to Chromium, which is
// why they only ever ran on one laptop. They read all three from here so the same files run on a
// developer's machine and in CI without editing.

export const BASE = process.env.RINOVA_TEST_BASE || 'http://127.0.0.1:8801';
export const ADMIN_USERNAME = process.env.RINOVA_TEST_ADMIN_USERNAME || 'Rinova';
export const ADMIN_PASSWORD = process.env.RINOVA_TEST_ADMIN_PASSWORD || 'AdminRinova';

/** Chromium lives in a different place on a CI runner than in the dev container. */
export const CHROMIUM_PATH = process.env.RINOVA_TEST_CHROMIUM || process.env.CHROME_PATH || undefined;
export const launchOptions = () => (CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});

/** Collects pass/fail so a suite can report a total and exit with the right code. */
export function createChecker() {
  const results = [];
  const check = (name, pass, detail = '') => {
    results.push(Boolean(pass));
    console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`);
  };
  const finish = () => {
    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    process.exit(passed === results.length ? 0 : 1);
  };
  return { check, finish, results };
}

export const json = async (response) => {
  try { return await response.json(); } catch { return {}; }
};

export const api = {
  get: async (path, headers = {}) => {
    const r = await fetch(`${BASE}${path}`, { headers });
    return { status: r.status, json: await json(r) };
  },
  post: async (path, body, headers = {}) => {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, json: await json(r) };
  },
  send: async (path, method, body, headers = {}) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await json(r) };
  },
};

/** Signs in as the shop owner and returns the bearer token the admin endpoints want. */
export async function adminToken() {
  const response = await api.post('/api/admin/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (!response.json?.token) throw new Error(`Could not sign in as ${ADMIN_USERNAME}: HTTP ${response.status} ${JSON.stringify(response.json)}`);
  return response.json.token;
}

export const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

/** A phone number no other run will collide with; orders are keyed by phone. */
export const uniquePhone = (prefix = '017') => `${prefix}${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;

/**
 * Console errors worth failing on. The CI runner and the dev sandbox both block outbound hosts,
 * so a load failure for a third-party script is the environment rather than the page.
 */
export function collectConsoleErrors(page) {
  const errors = [];
  const blocked = [];
  page.on('requestfailed', (request) => { if (!request.url().startsWith(BASE)) blocked.push(request.url()); });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource/i.test(text) && blocked.some((url) => text.includes(url))) return;
    if (/Failed to load resource/i.test(text) && !String(message.location()?.url || '').startsWith(BASE)) return;
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED|googletagmanager|jsdelivr|smartgentools/i.test(text)) return;
    errors.push(`${text} @ ${message.location()?.url || '?'}`);
  });
  return errors;
}
