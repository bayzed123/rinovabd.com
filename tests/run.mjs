#!/usr/bin/env node
// Runs the behaviour suites against a local Worker.
//
// Until this existed the suites lived on one machine and CI never saw them: a change could
// break checkout pricing, the offer engine or the order lookup and still ship, because the only
// gate was `tsc`. This boots a Worker on a throwaway D1, runs every suite against it, and fails
// the build if any check fails.
//
//   node tests/run.mjs                 every suite
//   node tests/run.mjs --api-only      just the ones that need no browser
//   node tests/run.mjs security offers only those suites
//   node tests/run.mjs --keep          leave the Worker running afterwards, to poke at it

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WORKER = join(ROOT, 'worker');
const PORT = Number(process.env.RINOVA_TEST_PORT || 8899);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_USERNAME = process.env.RINOVA_TEST_ADMIN_USERNAME || 'Rinova';
const ADMIN_PASSWORD = process.env.RINOVA_TEST_ADMIN_PASSWORD || 'AdminRinova';

const args = process.argv.slice(2);
const apiOnly = args.includes('--api-only');
const keepAlive = args.includes('--keep');
const wanted = args.filter((a) => !a.startsWith('--'));

// Suites that drive a browser need Chromium; the rest are plain fetch calls.
const BROWSER_SUITES = new Set(['general', 'commerce', 'admin2', 'ux', 'origin', 'bag-copy', 'offers', 'viewer', 'icons', 'stepper']);

const log = (...parts) => console.log(...parts);
const run = (command, cmdArgs, options = {}) =>
  spawnSync(command, cmdArgs, { cwd: WORKER, encoding: 'utf8', ...options });

function suiteFiles() {
  const all = readdirSync(join(HERE, 'suites')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort();
  let chosen = wanted.length ? all.filter((name) => wanted.includes(name)) : all;
  if (apiOnly) chosen = chosen.filter((name) => !BROWSER_SUITES.has(name));
  const missing = wanted.filter((name) => !all.includes(name));
  if (missing.length) { console.error(`Unknown suite(s): ${missing.join(', ')}. Available: ${all.join(', ')}`); process.exit(2); }
  return chosen;
}

/**
 * The Worker reads the dashboard login from .dev.vars, which is gitignored, so a CI runner has
 * none. Write one when it is missing; never touch a developer's own file.
 */
function ensureDevVars() {
  const path = join(WORKER, '.dev.vars');
  if (existsSync(path)) { log('· using the existing worker/.dev.vars'); return; }
  writeFileSync(path, `ADMIN_USERNAME=${ADMIN_USERNAME}\nADMIN_PASSWORD=${ADMIN_PASSWORD}\n`);
  log('· wrote a throwaway worker/.dev.vars for the test login');
}

function applyMigrations() {
  log('· applying migrations to the local database');
  const result = run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'rinovabd-db', '--local']);
  if (result.status !== 0) {
    console.error(result.stdout || '', result.stderr || '');
    throw new Error('Migrations failed — the suites would be testing an empty schema.');
  }
}

async function waitForWorker(child, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The Worker exited early with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${BASE}/api/config`);
      if (response.ok) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The Worker did not answer on ${BASE} within ${timeoutMs / 1000}s.`);
}

/**
 * Waits for the port to be bindable.
 *
 * An HTTP probe is not the same question: a dying workerd still holds the socket while answering
 * nothing, which is how a previous run's leftovers made the next one fail deep inside the
 * runtime with "address already in use". This asks the only thing that matters — can we bind?
 */
const portIsFree = () => new Promise((resolve) => {
  const probe = createServer();
  probe.once('error', () => resolve(false));
  probe.once('listening', () => probe.close(() => resolve(true)));
  probe.listen(PORT, '127.0.0.1');
});

async function requireFreePort(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let waited = false;
  while (Date.now() < deadline) {
    if (await portIsFree()) {
      if (waited) log('· the port came free');
      return;
    }
    if (!waited) { log(`· port ${PORT} is busy, waiting for it to clear`); waited = true; killStrayWorkerd(); }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${PORT} is still in use. Stop whatever is holding it, or set RINOVA_TEST_PORT to another port.`);
}

function startWorker() {
  log(`· starting the Worker on ${BASE}`);
  // `wrangler dev` spawns workerd as a grandchild. Killing the npx wrapper leaves workerd holding
  // the port, which broke the next run with "address already in use", so the whole group is put
  // into its own session and signalled together.
  const child = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT)], {
    cwd: WORKER,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, RINOVA_TEST: '1' },
  });
  const tail = [];
  const keep = (chunk) => { tail.push(String(chunk)); if (tail.length > 40) tail.shift(); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.tail = () => tail.join('');
  return child;
}

/** Kills any workerd left bound to our port, identified by its own command line. */
function killStrayWorkerd() {
  const listed = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  if (listed.status !== 0) return;
  for (const line of (listed.stdout || '').split('\n')) {
    if (!line.includes('workerd') || !line.includes(`:${PORT}`)) continue;
    const pid = Number(line.trim().split(/\s+/)[0]);
    if (!Number.isInteger(pid) || pid <= 1) continue;
    try { process.kill(pid, 'SIGKILL'); log(`· killed a stray workerd (pid ${pid}) still holding port ${PORT}`); } catch { /* gone already */ }
  }
}

function runSuite(name) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [join(HERE, 'suites', `${name}.mjs`)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      RINOVA_TEST_BASE: BASE,
      RINOVA_TEST_ADMIN_USERNAME: ADMIN_USERNAME,
      RINOVA_TEST_ADMIN_PASSWORD: ADMIN_PASSWORD,
    },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const summary = /(\d+)\/(\d+) checks passed/.exec(output);
  return {
    name,
    ok: result.status === 0,
    passed: summary ? Number(summary[1]) : 0,
    total: summary ? Number(summary[2]) : 0,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
    output,
  };
}

async function main() {
  const suites = suiteFiles();
  if (!suites.length) { console.error('No suites selected.'); process.exit(2); }
  log(`Running ${suites.length} suite(s): ${suites.join(', ')}\n`);

  ensureDevVars();
  await requireFreePort();
  applyMigrations();
  const worker = startWorker();
  let stopped = false;
  const stop = () => {
    if (stopped || keepAlive) return;
    stopped = true;
    // Negative pid signals the whole group, so workerd goes with the wrapper.
    try { process.kill(-worker.pid, 'SIGTERM'); } catch { try { worker.kill('SIGTERM'); } catch { /* already gone */ } }
  };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  process.on('SIGTERM', () => { stop(); process.exit(143); });
  /**
   * Stops the Worker and waits for the socket, so a following run does not trip over it.
   *
   * wrangler's workerd sometimes outlives the wrapper that spawned it and keeps the port — an
   * orphan that made the next run die inside the runtime with "address already in use". If the
   * socket has not come free politely, the workerd holding this exact port is killed by name.
   */
  const shutDown = async () => {
    stop();
    for (let i = 0; i < 20 && !(await portIsFree()); i += 1) await new Promise((r) => setTimeout(r, 250));
    if (await portIsFree()) return;
    killStrayWorkerd();
    for (let i = 0; i < 12 && !(await portIsFree()); i += 1) await new Promise((r) => setTimeout(r, 250));
  };

  try {
    await waitForWorker(worker);
  } catch (error) {
    console.error(`\n${error.message}\n\nLast Worker output:\n${worker.tail?.() || '(none)'}`);
    stop();
    process.exit(1);
  }
  log('· the Worker is answering\n');

  const results = [];
  for (const name of suites) {
    process.stdout.write(`▸ ${name} … `);
    const result = runSuite(name);
    results.push(result);
    log(result.ok ? `${result.passed}/${result.total} in ${result.seconds}s` : `FAILED (${result.passed}/${result.total}) in ${result.seconds}s`);
    // Only the failures are worth the scrollback; a passing suite is one line.
    if (!result.ok) log(result.output.split('\n').filter((line) => /^FAIL|Error|error:/.test(line)).slice(0, 25).map((l) => `    ${l}`).join('\n') || `    ${result.output.slice(-1200)}`);
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.reduce((sum, r) => sum + r.passed, 0);
  const total = results.reduce((sum, r) => sum + r.total, 0);
  log(`\n${'─'.repeat(56)}\n${passed}/${total} checks across ${results.length} suite(s)`);
  if (failed.length) {
    log(`FAILED: ${failed.map((r) => r.name).join(', ')}`);
    await shutDown();
    process.exit(1);
  }
  log('All suites passed.');
  if (keepAlive) { log(`\nWorker left running on ${BASE}. Ctrl-C to stop.`); return; }
  await shutDown();
  process.exit(0);
}

mkdirSync(join(HERE, 'suites'), { recursive: true });
main().catch((error) => { console.error(error); process.exit(1); });
