import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Hono } from 'hono';

const source = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
const start = source.indexOf("app.post('/api/auto-evaluate-x-only'");
const next = source.indexOf('\napp.', start + 10);
const code = transformSync(source.slice(start, next < 0 ? source.length : next).replace(/await import\(/g, 'await loadModule('), { loader: 'ts', format: 'cjs' }).code;
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-15T00:00:00Z'])); } }
function fixture(saveSucceeds, partial = false, quotaFailure = false) {
  const calls = { saved: 0, ended: 0, quotaSuccesses: [], progressUpdates: 0 };
  let quotaReads = 0;
  const progress = { evaluation_month: '2026-09', current_batch_index: 0, completed_students: 0, total_students: 1, is_completed: false };
  const app = new Hono();
  const dependencies = { app, Date: FixedDate,
    getEnv: () => 'synthetic-only', getDatabaseConfig: () => ({}), getAccessToken: async () => 'synthetic-token',
    fetchStudents: async () => [{ studentId: 'synthetic-id', name: 'synthetic-name', status: 'アクティブ', xAccount: 'synthetic-x' }],
    getPreviousEvaluationFromSheet: async () => null,
    console: { log() {}, warn() {}, error() {} },
    loadModule: async name => {
      if (name === 'pg') return { Pool: class {
        async query(sql) { if (/UPDATE x_evaluation_progress/.test(sql)) calls.progressUpdates++; return { rows: /SELECT \*/.test(sql) || /INSERT INTO x_evaluation_progress/.test(sql) ? [progress] : [] }; }
        async end() { calls.ended++; }
      } };
      if (name === './lib/x-quota-manager') return {
        getQuotaStatus: async () => (++quotaReads > 1 && quotaFailure === 'late') ? { status: 'unknown', totalRequests: null, remainingQuota: 0 } : ({ status: 'known', totalRequests: 13000, remainingQuota: 1000, month: '2026-09' }), getAvailableStudentCount: () => 100,
        recordQuotaUsage: async (_token, _sheet, count) => { calls.quotaSuccesses.push(count); if (quotaFailure === true) throw Error('synthetic-private-provider-marker'); },
      };
      if (name === './lib/x-client') return { evaluateXAccount: async () => partial
        ? { rateLimited: true, partialData: { followersCount: 1, followingCount: 1 } }
        : { tweetsInMonth: 1, followersCount: 1 } };
      if (name === './lib/evaluation-cache') return { getCachedEvaluation: async () => null, saveCachedEvaluation: async () => { calls.saved++; return saveSucceeds; } };
      throw Error('Unexpected synthetic dependency');
    },
  };
  const keys = Object.keys(dependencies); new Function(...keys, code)(...keys.map(key => dependencies[key]));
  return { app, calls };
}
test('normal X cache save success preserves existing summary response', async () => {
  const f = fixture(true); const r = await f.app.request('/api/auto-evaluate-x-only?month=2026-09', { method: 'POST' }); const body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.summary.success, 1); assert.equal(body.summary.errors, 0);
  assert.equal(f.calls.saved, 1); assert.equal(f.calls.quotaSuccesses[0], 1); assert.equal(f.calls.ended, 1);
});
for (const partial of [false, true]) test('failed ' + (partial ? 'partial' : 'normal') + ' X cache save uses existing student error counter', async () => {
  const f = fixture(false, partial); const r = await f.app.request('/api/auto-evaluate-x-only?month=2026-09', { method: 'POST' }); const body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.summary.success, 0); assert.equal(body.summary.errors, 1);
  assert.equal(f.calls.saved, 1); assert.equal(f.calls.quotaSuccesses[0], 0); assert.equal(f.calls.ended, 1);
});
test('quota recording failure cannot report evaluation success or advance progress', async () => {
  const f = fixture(true, false, true);
  const r = await f.app.request('/api/auto-evaluate-x-only?month=2026-09', { method: 'POST' });
  const body = await r.json();
  assert.equal(r.status, 503); assert.equal(body.success, false);
  assert.equal(body.error, 'X quota usage recording failed');
  assert.equal(JSON.stringify(body).includes('synthetic-private-provider-marker'), false);
  assert.equal(f.calls.saved, 1); assert.equal(f.calls.progressUpdates, 0); assert.equal(f.calls.ended, 1);
});

test('quota becoming unknown after recording does not advance progress', async () => {
  const f = fixture(true, false, 'late');
  const r = await f.app.request('/api/auto-evaluate-x-only?month=2026-09', { method: 'POST' });
  const body = await r.json();
  assert.equal(r.status, 503); assert.equal(body.error, 'X quota usage unknown');
  assert.equal(body.quota.totalRequests, null); assert.equal(f.calls.progressUpdates, 0); assert.equal(f.calls.ended, 1);
});
