import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { getDatabaseConfig } from '../src/lib/database-config.js';

const url = 'postgresql://fixture:fixture-only@database.example/fixture';
function parameters(target, env) {
  // Real pg parsing, without connecting or sending credentials.
  return new pg.Client(getDatabaseConfig(target, env)).connectionParameters;
}

test('external DBs retain TLS certificate validation after pg parses URL flags', () => {
  for (const query of ['', '?sslmode=disable', '?sslmode=no-verify', '?ssl=false',
    '?ssl=0', '?sslmode=require&uselibpqcompat=true']) {
    const parsed = parameters(url + query, { RENDER: 'true' });
    assert.equal(parsed.ssl.rejectUnauthorized, true, query);
    assert.equal(parsed.ssl.checkServerIdentity, undefined, query);
    assert.equal(parsed.host, 'database.example');
  }
});

test('CA and mTLS file settings survive without replacing strict verification', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.db-tls-fixture-'));
  try {
    const target = new URL(url);
    for (const [parameter, value] of [['sslrootcert', 'SYNTHETIC_CA'], ['sslcert', 'SYNTHETIC_CERT'], ['sslkey', 'SYNTHETIC_KEY']]) {
      const file = join(directory, parameter);
      await writeFile(file, value);
      target.searchParams.set(parameter, file);
    }
    target.searchParams.set('sslmode', 'no-verify');
    const parsed = parameters(target.toString(), {});
    assert.equal(parsed.ssl.ca, 'SYNTHETIC_CA');
    assert.equal(parsed.ssl.cert, 'SYNTHETIC_CERT');
    assert.equal(parsed.ssl.key, 'SYNTHETIC_KEY');
    assert.equal(parsed.ssl.rejectUnauthorized, true);
    assert.equal(parsed.ssl.checkServerIdentity, undefined);
    assert.throws(() => getDatabaseConfig(url + '?sslrootcert=not-a-real-file', {}), { message: 'Invalid PostgreSQL TLS certificate configuration' });
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(process.cwd()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('only Render short internal Postgres names permit self-signed certificates', () => {
  const internal = 'postgresql://fixture:fixture-only@dpg-fixture123-a/fixture';
  assert.equal(parameters(internal, { RENDER: 'true' }).ssl.rejectUnauthorized, false);
  assert.equal(parameters(internal, {}).ssl.rejectUnauthorized, true);
  for (const host of ['dpg-fixture123-a.example', 'dpg-fixture123-a.render.com', 'localhost', '127.0.0.1', 'other-internal']) {
    assert.equal(parameters(url.replace('database.example', host), { RENDER: 'true' }).ssl.rejectUnauthorized, true, host);
  }
});

test('Render internal TLS cannot be disabled by URL parameters', () => {
  const parsed = parameters('postgresql://fixture:fixture-only@dpg-fixture123-a/fixture?sslmode=disable&ssl=0', { RENDER: 'true' });
  assert.equal(typeof parsed.ssl, 'object');
  assert.equal(parsed.ssl.rejectUnauthorized, false);
});

test('query target overrides, invalid URLs and global bypass fail without disclosing input', () => {
  for (const target of ['SYNTHETIC_SECRET', 'https://fixture:fixture-only@database.example/', url + '?host=other.example']) {
    assert.throws(() => getDatabaseConfig(target, {}), { message: 'Invalid PostgreSQL connection configuration' });
  }
  assert.throws(() => getDatabaseConfig(url, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), { message: 'Global TLS verification bypass is not supported' });
});

test('credentials, database, port and normal driver options remain intact', () => {
  const parsed = parameters('postgresql://fixture%40user:p%40ss%3Aword@database.example:5544/db%20name?application_name=fixture&connect_timeout=5', {});
  assert.equal(parsed.user, 'fixture@user');
  assert.equal(parsed.password, 'p@ss:word');
  assert.equal(parsed.database, 'db name');
  assert.equal(parsed.port, 5544);
  assert.equal(parsed.application_name, 'fixture');
  assert.equal(new URL(getDatabaseConfig('postgresql://database.example/fixture?connect_timeout=5', {}).connectionString).searchParams.get('connect_timeout'), '5');
});
