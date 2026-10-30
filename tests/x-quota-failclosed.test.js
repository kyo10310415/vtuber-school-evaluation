import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { createAccessMiddleware } from '../src/middleware/access.js';

const moduleCode = transformSync(readFileSync(new URL('../src/lib/x-quota-manager.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const source = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
const headers = ['月', '総リクエスト数', '残りクォータ', '最終更新日時'];
const row = (count = 25, month = '2026-10') => [month, count, 14000 - count, '2026-10-30T00:00:00.000Z'];
const response = (body, ok = true) => ({ ok, json: async () => body });
const good = () => response({ values: [headers, row()] });
const marker = 'synthetic-private-provider-marker';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-30T00:00:00Z'])); } }
function moduleFixture(replies = [good()]) {
  const calls = [], logs = [], exports = {};
  const module = { exports };
  runInNewContext(moduleCode, { module, exports, Date: FixedDate,
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = replies.shift();
      if (!next) throw Error('Unexpected synthetic request');
      if (next instanceof Error) throw next;
      return next;
    }
  });
  return { api: module.exports, calls, logs };
}
for (const [label, reply] of [
  ['missing', response({}, false)], ['HTTP failure', response({ error: marker }, false)],
  ['empty', response({ values: [] })], ['header only', response({ values: [headers] })],
  ['missing values', response({})], ['invalid values', response({ values: {} })],
  ['invalid header', response({ values: [['wrong'], row()] })],
  ['invalid row', response({ values: [headers, null] })],
  ['fractional count', response({ values: [headers, row(1.5)] })],
  ['negative count', response({ values: [headers, row(-1)] })],
  ['partial numeric', response({ values: [headers, ['2026-10', '2x', 13998, row()[3]]] })],
  ['inconsistent remaining', response({ values: [headers, ['2026-10', 25, 14000, row()[3]]] })],
  ['stale month', response({ values: [headers, row(25, '2026-09')] })],
  ['network failure', new Error(marker)], ['invalid JSON', { ok: true, json: async () => { throw Error(marker); } }]
]) test('quota ' + label + ' is unknown with null usage and no available students', async () => {
  const f = moduleFixture([reply]);
  const status = await f.api.getQuotaStatus('synthetic-access', 'synthetic-sheet');
  assert.equal(status.status, 'unknown'); assert.equal(status.totalRequests, null);
  assert.equal(status.remainingQuota, 0); assert.equal(status.lastReset, null);
  assert.equal(JSON.stringify(f.logs).includes(marker), false);
  const available = moduleFixture([reply]);
  assert.equal((await available.api.getAvailableStudentCount('synthetic', 'synthetic', 10)).canEvaluate, false);
});
test('current valid zero/nonzero/exhausted records retain known usage', async () => {
  for (const count of [0, 25, 14000, 15000]) {
    const f = moduleFixture([response({ values: [headers, row(count)] })]);
    const status = await f.api.getQuotaStatus('synthetic', 'synthetic');
    assert.equal(status.status, 'known'); assert.equal(status.totalRequests, count);
    assert.equal(status.remainingQuota, Math.max(0, 14000 - count));
  }
});
test('usage append maintains valid prior count and checks HTTP failure', async () => {
  const f = moduleFixture([good(), response({})]);
  await f.api.recordQuotaUsage('synthetic', 'synthetic', 3);
  const values = JSON.parse(f.calls[1].options.body).values;
  assert.equal(values[0][1], 28); assert.equal(values[0][2], 13972);
  const failed = moduleFixture([good(), response({ error: marker }, false)]);
  await assert.rejects(failed.api.recordQuotaUsage('synthetic', 'synthetic', 3), /recording failed/);
  assert.equal(JSON.stringify(failed.logs).includes(marker), false);
});
test('invalid usage counts cannot read or write and unknown usage cannot append', async () => {
  for (const count of [-1, 0.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
    const f = moduleFixture();
    await assert.rejects(f.api.recordQuotaUsage('synthetic', 'synthetic', count), /count invalid/);
    assert.equal(f.calls.length, 0);
  }
  const f = moduleFixture([response({ values: [headers] })]);
  await assert.rejects(f.api.recordQuotaUsage('synthetic', 'synthetic', 1), /usage unknown/);
  assert.equal(f.calls.length, 1);
});
test('initialization leaves existing sheet, header and records untouched', async () => {
  const f = moduleFixture([response({ sheets: [{ properties: { title: 'X_API_Quota' } }] }), good()]);
  await f.api.initializeQuotaSheet('synthetic', 'synthetic'); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.method, undefined);
  assert.equal(f.calls[1].options.method, undefined);
});
test('missing sheet creates structure only and never writes a zero usage record', async () => {
  const f = moduleFixture([response({ sheets: [] }), response({}), response({})]);
  await f.api.initializeQuotaSheet('synthetic', 'synthetic'); assert.equal(f.calls.length, 3);
  assert.equal(f.calls[1].options.method, 'POST'); assert.equal(f.calls[2].options.method, 'PUT');
  assert.deepEqual(JSON.parse(f.calls[2].options.body).values, [headers]);
});
test('initialization detects metadata/create/header failures without later writes', async () => {
  for (const replies of [[response({}, false)], [response({})], [response({ sheets: [] }), response({}, false)],
    [response({ sheets: [] }), response({}), response({}, false)]]) {
    const expected = replies.length; const f = moduleFixture(replies);
    await assert.rejects(f.api.initializeQuotaSheet('synthetic', 'synthetic'), /initialization failed/);
    assert.equal(f.calls.length, expected);
  }
});
test('existing empty tab recovers only headers; existing malformed content never gets overwritten', async () => {
  const metadata = () => response({ sheets: [{ properties: { title: 'X_API_Quota' } }] });
  const f = moduleFixture([metadata(), response({ values: [] }), response({})]);
  await f.api.initializeQuotaSheet('synthetic', 'synthetic');
  assert.equal(f.calls.length, 3); assert.equal(f.calls[2].options.method, 'PUT');
  assert.deepEqual(JSON.parse(f.calls[2].options.body).values, [headers]);
  for (const content of [response({ values: [['existing-private-marker']] }), response({}), response({}, false)]) {
    const invalid = moduleFixture([metadata(), content]);
    await assert.rejects(invalid.api.initializeQuotaSheet('synthetic', 'synthetic'), /initialization failed/);
    assert.equal(invalid.calls.length, 2);
    assert.equal(invalid.calls.every(call => !call.options.method), true);
  }
});

const config = { jwtSecret: 'synthetic-sso-key-'.repeat(4), jobSecret: 'synthetic-job-key-'.repeat(4), origin: 'https://school.example', dashboardUrl: 'https://dashboard.example' };
function routeFixture(replies) {
  const quota = moduleFixture(replies), app = new Hono(); let otherCalls = 0;
  app.use('*', createAccessMiddleware(config));
  for (const path of ["app.post('/api/auto-evaluate-x-only'", "app.get('/api/x/quota'"]) {
    const start = source.indexOf(path), end = source.indexOf('\n})', start) + 4;
    const code = transformSync(source.slice(start, end).replaceAll('await import(', 'await loadModule('), { loader: 'tsx', format: 'cjs' }).code;
    runInNewContext(code, { app, Date: FixedDate, console: { log() {}, error() {} },
      getEnv: () => 'synthetic-config', getAccessToken: async () => 'synthetic-access',
      loadModule: async name => { if (name === './lib/x-quota-manager') return quota.api; otherCalls++; throw Error('External dependency forbidden'); }
    });
  }
  const auth = role => ({ Origin: config.origin, Cookie: 'wannav_sso=' + jwt.sign({ type: 'sso', userId: 7, username: 'synthetic', role, targetUrl: config.origin }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' }) });
  return { app, quota, auth, otherCalls: () => otherCalls };
}
test('unknown quota stops actual authorized X handler before DB/provider/AI imports', async () => {
  const f = routeFixture([response({ values: [headers] })]);
  const result = await f.app.request('/api/auto-evaluate-x-only', { method: 'POST', headers: f.auth('leader') });
  const body = await result.json(); assert.equal(result.status, 503); assert.equal(body.error, 'X quota usage unknown');
  assert.equal(body.quota.totalRequests, null); assert.equal(f.otherCalls(), 0); assert.equal(f.quota.calls.length, 1);
});
test('unknown quota display is explicit and never renders NaN or false zero usage', async () => {
  const f = routeFixture([response({}, false)]);
  const result = await f.app.request('/api/x/quota', { headers: f.auth('crew') });
  const body = await result.json(); assert.equal(result.status, 200);
  assert.equal(body.usage.status, 'unknown'); assert.equal(body.usage.percentage, null);
  assert.equal(body.usage.canEvaluate, false); assert.equal(body.usage.maxStudents, 0); assert.equal(body.quota.totalRequests, null);
});
test('known quota display retains normal percentages and exhausted record remains 429', async () => {
  const normal = routeFixture([response({ values: [headers, row(7000)] })]);
  const body = await (await normal.app.request('/api/x/quota', { headers: normal.auth('crew') })).json();
  assert.equal(body.usage.status, 'known'); assert.equal(body.usage.percentage, '50.0%');
  assert.equal(body.usage.canEvaluate, true); assert.equal(body.quota.totalRequests, 7000);
  const exhausted = routeFixture([response({ values: [headers, row(14000)] })]);
  const r = await exhausted.app.request('/api/auto-evaluate-x-only', { method: 'POST', headers: exhausted.auth('admin') });
  assert.equal(r.status, 429); assert.equal(exhausted.otherCalls(), 0);
});
test('anonymous/crew POST and cross-origin manager remain denied before quota reads', async () => {
  const f = routeFixture([]);
  assert.equal((await f.app.request('/api/auto-evaluate-x-only', { method: 'POST' })).status, 401);
  assert.equal((await f.app.request('/api/auto-evaluate-x-only', { method: 'POST', headers: f.auth('crew') })).status, 403);
  assert.equal((await f.app.request('/api/auto-evaluate-x-only', { method: 'POST', headers: { ...f.auth('admin'), Origin: 'https://other.example' } })).status, 403);
  assert.equal(f.quota.calls.length, 0); assert.equal(f.otherCalls(), 0);
});
