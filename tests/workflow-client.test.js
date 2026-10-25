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
