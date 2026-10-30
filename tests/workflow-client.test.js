import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHmac, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

test('Actions client signs scoped short JWT and emits only counts', async () => {
  const code = readFileSync(new URL('../.github/scripts/evaluation-request.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const output = []; let request;
  const secret = 'test-only-workflow-key-'.repeat(3);
  const context = { createHmac, randomUUID, Buffer, Date, URL, AbortSignal,
    process: { env: { EVALUATION_JOB_TOKEN: secret }, argv: ['node', 'script', '/api/auto-evaluate?month=2026-01'] },
    console: { log: x => output.push(x) },
    fetch: async (url, options) => { request = { url, options }; return { ok: true, status: 200,
      json: async () => ({ successCount: 3, results: [{ studentName: 'test-only-private' }], error: 'test-only-secret-error' }) }; },
  };
  await runInNewContext(`(async () => { ${code} })()`, context);
  const claims = jwt.verify(request.options.headers.Authorization.slice(7), secret, { algorithms: ['HS256'] });
  assert.equal(claims.scope, '/api/auto-evaluate');
  assert.equal(claims.aud, 'https://vtuber-school-evaluation.onrender.com');
  assert.equal(claims.exp - claims.iat, 90);
  assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.parse(output[0]).successCount, 3);
  assert.equal(output.join('').includes('test-only-private'), false);
  assert.equal(output.join('').includes('test-only-secret-error'), false);
  assert.equal(output[1], 'HTTP_STATUS:200');
});

async function partitionClient(path, body, { status = 200, env = {}, jsonOnly = true } = {}) {
  const code = readFileSync(new URL('../.github/scripts/evaluation-request.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const output = [], requests = [], fileReads = [];
  const secret = 'synthetic-workflow-key-'.repeat(3);
  const process = { env: { EVALUATION_JOB_TOKEN: secret, ...env }, argv: ['node', 'script', path, ...(jsonOnly ? ['--json-only'] : [])] };
  const context = { createHmac, randomUUID, Buffer, Date, URL, AbortSignal, process,
    readFileSync: file => { fileReads.push(file); return 'b'.repeat(64); },
    console: { log: value => output.push(value) },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: status >= 200 && status < 300, status, json: async () => body }; },
  };
  return { output, requests, fileReads, process, secret,
    run: () => runInNewContext(`(async () => { ${code} })()`, context) };
}
const safePlan = () => ({ success: true, plan: { planVersion: 1, partitionDay: 1, partitionCount: 9,
  activeRows: 785, eligibleStudents: 784, emptyTemplateCount: 1, invalidActiveCount: 0,
  partitionStudentCount: 7, batchSize: 5, totalBatches: 2, rosterRevision: 'b'.repeat(64),
  studentIds: ['SYNTHETIC_PRIVATE_PLAN_VALUE'] }, results: ['SYNTHETIC_PRIVATE_PLAN_VALUE'] });

test('new planning helper scopes JWT to exact plan route and emits integer counts plus opaque revision only', async () => {
  const f = await partitionClient('/api/auto-evaluate/plan?partitionDay=1', safePlan(), { env: { EVALUATION_ROSTER_REVISION_FILE: 'synthetic-file' } });
  await f.run(); const response = JSON.parse(f.output[0]);
  assert.equal(response.plan.totalBatches, 2); assert.equal(response.plan.rosterRevision === 'b'.repeat(64), true);
  assert.equal(f.output.join('').includes('SYNTHETIC_PRIVATE_PLAN_VALUE'), false); assert.equal(f.fileReads.length, 0);
  assert.equal(f.requests[0].options.headers['X-Evaluation-Roster-Revision'], undefined);
  assert.equal(jwt.verify(f.requests[0].options.headers.Authorization.slice(7), f.secret).scope, '/api/auto-evaluate/plan');
});
test('HTTP and malformed plan responses fail without emitting successful zero counts', async () => {
  const cases = [{ status: 403, body: safePlan() }];
  for (const change of [{ totalBatches: 0.5 }, { totalBatches: '2' }, { eligibleStudents: -1 }, { rosterRevision: 'invalid' }]) {
    const body = safePlan(); Object.assign(body.plan, change); cases.push({ status: 200, body });
  }
  for (const item of cases) {
    const f = await partitionClient('/api/auto-evaluate/plan?partitionDay=1', item.body, { status: item.status });
    await assert.rejects(f.run()); assert.equal(f.output.length, 0);
  }
});
test('partition helper transports revision only in dedicated header and returns failure counts without records', async () => {
  const f = await partitionClient('/api/auto-evaluate/partition?partitionDay=1&batchIndex=0',
    { success: false, successCount: 0, errorCount: 1, skippedCount: 0, results: ['SYNTHETIC_PRIVATE_RESULT'] },
    { env: { EVALUATION_ROSTER_REVISION_FILE: 'synthetic-file' }, jsonOnly: false });
  await f.run(); assert.equal(f.fileReads.length, 1); assert.equal(f.process.exitCode, 1);
  assert.equal(f.requests[0].options.headers['X-Evaluation-Roster-Revision'] === 'b'.repeat(64), true);
  assert.equal(f.requests[0].url.search.includes('roster'), false);
  assert.equal(f.output.join('').includes('SYNTHETIC_PRIVATE_RESULT'), false); assert.equal(f.output.join('').includes('b'.repeat(64)), false);
  assert.equal(JSON.parse(f.output[0]).errorCount, 1); assert.equal(f.output[1], 'HTTP_STATUS:200');
});
test('partition helper rejects missing or malformed revision before any request', async () => {
  for (const value of [undefined, 'invalid', 'A'.repeat(64)]) {
    const f = await partitionClient('/api/auto-evaluate/partition?partitionDay=1&batchIndex=0', {}, { env: { EVALUATION_ROSTER_REVISION: value } });
    await assert.rejects(f.run()); assert.equal(f.requests.length, 0); assert.equal(f.output.length, 0);
  }
});
test('invalid partition HTTP200 result keeps status and explicit invalid flag to prevent AI retries', async () => {
  const f = await partitionClient('/api/auto-evaluate/partition?partitionDay=1&batchIndex=0',
    { success: true, successCount: 'bad', errorCount: 0, skippedCount: 0, error: 'SYNTHETIC_PRIVATE_RESULT' },
    { env: { EVALUATION_ROSTER_REVISION: 'b'.repeat(64) }, jsonOnly: false });
  await f.run(); assert.equal(f.process.exitCode, 1); assert.equal(f.output[0], '{"invalidResult":true}'); assert.equal(f.output[1], 'HTTP_STATUS:200');
});
test('X response exposes summary errors and marks failed reset state without records', async () => {
  const f = await partitionClient('/api/auto-evaluate-x-only?reset=true&month=2026-09',
    { success: true, summary: { total: 1, success: 0, errors: 1 }, results: ['SYNTHETIC_PRIVATE_X_RESULT'] });
  await f.run(); const result = JSON.parse(f.output[0]);
  assert.equal(result.summary.errors, 1); assert.equal(result.errorCount, 0); assert.equal(result.requestFailed, false);
  assert.equal(f.output.join('').includes('SYNTHETIC_PRIVATE_X_RESULT'), false);
  const failed = await partitionClient('/api/auto-evaluate-x-only?reset=true', { success: false, error: 'SYNTHETIC_PRIVATE_X_RESULT' });
  await failed.run(); assert.equal(JSON.parse(failed.output[0]).requestFailed, true);
});
test('X completed-zero early response stays normal while malformed success state is visible', async () => {
  const done = await partitionClient('/api/auto-evaluate-x-only', { success: true, progress: { isCompleted: true, completedStudents: 0, totalStudents: 0 } });
  await done.run(); assert.equal(JSON.parse(done.output[0]).requestFailed, false);
  const invalid = await partitionClient('/api/auto-evaluate-x-only', { success: true });
  await invalid.run(); assert.equal(JSON.parse(invalid.output[0]).requestFailed, true);
});
