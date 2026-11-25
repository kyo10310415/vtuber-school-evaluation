import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/x-client.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '');
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
function fixture(replies = []) {
  const calls = [], module = { exports: {} };
  const sandbox = {
    module, URLSearchParams, console: { log() {}, warn() {}, error() {} }, canMakeRequest: () => true, recordRequest() {},
    fetch: async url => { calls.push(url); if (!replies.length) throw new Error('No synthetic reply'); return replies.shift(); },
  };
  runInNewContext(code, sandbox);
  return { api: module.exports, calls };
}
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const user = reply(200, { data: { id: '123', username: 'synthetic', public_metrics: {} } });

test('X rejects an email registration before any provider request', async () => {
  const f = fixture();
  const result = await f.api.evaluateXAccount('synthetic-token', 'sample@example.invalid', '2026-10');
  assert.equal(result.errorCode, 'INVALID_ACCOUNT_INPUT');
  assert.equal(f.calls.length, 0);
});
test('only a definitive X user-not-found response is classified as account data', async () => {
  const missing = fixture([reply(200, { errors: [{ resource_type: 'user', title: 'Not Found Error' }] })]);
  assert.equal((await missing.api.evaluateXAccount('synthetic-token', 'synthetic', '2026-10')).errorCode, 'ACCOUNT_NOT_FOUND');
  const generic = fixture([reply(503, {})]);
  const failure = await generic.api.evaluateXAccount('synthetic-token', 'synthetic', '2026-10');
  assert.ok(failure.error);
  assert.equal(failure.errorCode, undefined);
});
test('a failed X posts response does not yield a zero-post grade', async () => {
  const f = fixture([user, reply(503, {})]);
  const result = await f.api.evaluateXAccount('synthetic-token', 'https://x.com/synthetic', '2026-10');
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[0], /username\/synthetic\?/);
  assert.ok(result.error);
  assert.equal(result.overallGrade, undefined);
});

test('protected and explicitly inaccessible X timelines have no grade, distinct from a server failure', async () => {
  const protectedUser = fixture([reply(200, { data: { id: '123', protected: true, public_metrics: {} } })]);
  assert.equal((await protectedUser.api.evaluateXAccount('synthetic-token', 'synthetic', '2026-10')).errorCode, 'POSTS_NOT_ACCESSIBLE');
  assert.equal(protectedUser.calls.length, 1);
  const problem = { type: 'https://api.x.com/2/problems/not-authorized-for-resource' };
  const unavailable = fixture([user, reply(200, { errors: [problem] })]);
  const result = await unavailable.api.evaluateXAccount('synthetic-token', 'synthetic', '2026-10');
  assert.equal(result.errorCode, 'POSTS_NOT_ACCESSIBLE');
  assert.equal(result.overallGrade, undefined);
  const unknown = fixture([user, reply(200, { errors: [{ type: 'temporary-provider-error' }] })]);
  const failure = await unknown.api.evaluateXAccount('synthetic-token', 'synthetic', '2026-10');
  assert.ok(failure.error);
  assert.equal(failure.errorCode, undefined);
});
