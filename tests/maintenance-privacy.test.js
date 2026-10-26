import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { getDatabaseConfig } from '../src/lib/database-config.js';

let sequence = 0;
const marker = 'SYNTHETIC_PRIVATE_MAINTENANCE_VALUE';
async function fixture(file, { configured = true, queryFailure = false, endFailure = false, origin } = {}) {
  const logs = [], queries = [], requests = [], configs = [];
  let closed = 0;
  const env = configured ? { DATABASE_URL: `postgresql://fixture:${marker}@database.example/fixture`, RENDER: 'true' } : {};
  if (origin) env.DIAGNOSTIC_ORIGIN = origin;
  class Pool {
    constructor(config) { configs.push(new pg.Client(config).connectionParameters); }
    async query(sql, params) {
      queries.push({ sql, params });
      if (queryFailure) throw new Error(marker);
      return { rows: [{ total: 3, expired: 1, count: 1, student_id: marker, access_token: marker }] };
    }
    async end() { closed++; if (endFailure) throw new Error(marker); }
  }
  const dependencies = { pkg: { Pool }, getDatabaseConfig: target => getDatabaseConfig(target, env),
    process: { env, argv: [] }, console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    fetch: async (url, options) => { requests.push({ url, options }); return { status: 200, json() { throw new Error('Body must not be read'); } }; } };
  let source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  source = source.replace(/^#!.*\r?\n/, '').replace("import pkg from 'pg';", 'const pkg = deps.pkg;')
    .replace("import { getDatabaseConfig } from './src/lib/database-config.js';", 'const getDatabaseConfig = deps.getDatabaseConfig;');
  const key = 'maintenanceFixture' + sequence++;
  globalThis[key] = dependencies;
  let mod;
  try {
    mod = await import(`data:text/javascript;base64,${Buffer.from(`const deps = globalThis[${JSON.stringify(key)}]; const process = deps.process; const console = deps.console; const fetch = deps.fetch;\n${source}`).toString('base64')}`);
  } finally { delete globalThis[key]; }
  return { mod, logs, queries, requests, configs, closed: () => closed };
}

test('maintenance imports do no I/O and require an explicit database setting', async () => {
  for (const [file, run] of [['check-tokens.js', 'runTokenCheck'], ['test-production.js', 'runDiagnostics']]) {
    const f = await fixture(file, { configured: false });
    assert.equal(f.configs.length, 0);
    assert.equal(await f.mod[run](), false);
    assert.equal(f.configs.length, 0);
    assert.equal(f.requests.length, 0);
  }
});

test('token check queries aggregates only, enforces TLS and prints no individual data', async () => {
  const f = await fixture('check-tokens.js');
  assert.equal(await f.mod.runTokenCheck(), true);
  assert.equal(f.queries.length, 1);
  assert.match(f.queries[0].sql, /COUNT\(\*\)/);
  assert.equal(/^\s*SELECT/i.test(f.queries[0].sql), true);
  assert.equal(f.configs[0].ssl.rejectUnauthorized, true);
  assert.equal(f.closed(), 1);
  assert.ok(f.logs.includes('登録件数: 3'));
  assert.ok(f.logs.includes('期限切れ件数: 1'));
  assert.equal(f.logs.join('\n').includes(marker), false);
});

test('production diagnostic reads DB metadata and checks only explicitly selected health endpoint', async () => {
  const f = await fixture('test-production.js', { origin: 'https://example.test/' });
  assert.equal(await f.mod.runDiagnostics(), true);
  assert.equal(f.queries.length, 2);
  assert.ok(f.queries.every(call => /^\s*SELECT/i.test(call.sql)));
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://example.test/health');
  assert.equal(f.requests[0].options.redirect, 'manual');
  assert.equal(f.logs.join('\n').includes(marker), false);
  const skipped = await fixture('test-production.js');
  assert.equal(await skipped.mod.runDiagnostics(), true);
  assert.equal(skipped.requests.length, 0);
  const invalid = await fixture('test-production.js', { origin: `https://fixture:${marker}@example.test/` });
  assert.equal(await invalid.mod.runDiagnostics(), false);
  assert.equal(invalid.requests.length, 0);
  assert.equal(invalid.logs.join('\n').includes(marker), false);
});

test('provider and cleanup failures produce only fixed messages and still close pools', async () => {
  for (const [file, run] of [['check-tokens.js', 'runTokenCheck'], ['test-production.js', 'runDiagnostics']]) {
    for (const options of [{ queryFailure: true }, { endFailure: true }]) {
      const f = await fixture(file, options);
      assert.equal(await f.mod[run](), false);
      assert.equal(f.closed(), 1);
      assert.equal(f.logs.join('\n').includes(marker), false);
    }
  }
});
