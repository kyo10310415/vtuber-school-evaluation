import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { createAccessMiddleware } from '../src/middleware/access.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const config = { jwtSecret: 'test-only-sso-key-'.repeat(4), jobSecret: 'test-only-job-key-'.repeat(4), origin: 'https://school.example', dashboardUrl: 'https://dashboard.example' };
const cookie = 'wannav_sso=' + jwt.sign({ type: 'sso', userId: 7, username: 'test-only', role: 'crew', targetUrl: config.origin }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
function fixture() {
  const h = new Hono(); let calls = 0;
  h.use('*', createAccessMiddleware(config));
  h.all('*', c => { calls++; return c.json({ ok: true }); });
  return { h, calls: () => calls };
}

test('crew can view approved pages, saved evaluations and histories', async () => {
  const f = fixture();
  for (const path of ['/', '/evaluation-detail', '/monthly-report', '/analytics-history/test', '/static/app.js', '/api/students', '/api/results/test', '/api/prolevel/test', '/api/monthly-report/test', '/api/evaluation/complete/test', '/api/analytics/students', '/api/analytics/history/test', '/api/wanami-usage', '/api/x/quota', '/api/auto-evaluate/status']) {
    assert.equal((await f.h.request(path, { headers: { Cookie: cookie } })).status, 200, path);
  }
});

test('crew cannot run GET evaluations, OAuth/token operations, diagnostics or unknown routes', async () => {
  const f = fixture();
  for (const path of ['/analytics-data', '/api/youtube/evaluate/test', '/api/x/evaluate/test', '/api/analytics/token/test', '/api/analytics/tokens', '/api/analytics/auth/url', '/api/analytics/auth/callback', '/api/analytics/auto-fetch/test', '/api/debug/env', '/api/debug/raw-document/test', '/api/unknown']) {
    assert.equal((await f.h.request(path, { headers: { Cookie: cookie } })).status, 403, path);
  }
  assert.equal(f.calls(), 0);
});

test('crew cannot write even to read routes or invoke jobs with a session cookie', async () => {
  const f = fixture();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/api/students', '/api/evaluate', '/api/auto-evaluate', '/api/x/quota/reset']) {
      assert.equal((await f.h.request(path, { method, headers: { Cookie: cookie, Origin: config.origin } })).status, 403);
    }
  }
  assert.equal(f.calls(), 0);
});

test('read-only UI hides execution controls and leaves admin UI unchanged', () => {
  const source = readFileSync(new URL('../public/static/read-only.js', import.meta.url), 'utf8');
  for (const readOnly of ['true', 'false']) {
    const controls = [{ disabled: false, setAttribute() {} }]; let notices = 0, selector;
    const document = { readyState: 'complete', body: { dataset: { readOnly }, prepend() { notices++; } },
      querySelectorAll(value) { selector = value; return controls; }, addEventListener() {}, createElement() { return {}; } };
    runInNewContext(source, { document });
    assert.equal(controls[0].disabled, readOnly === 'true');
    assert.equal(notices, readOnly === 'true' ? 1 : 0);
    if (readOnly === 'true') { assert.match(selector, /run-evaluation-btn/); assert.match(selector, /re-eval-youtube-btn/); assert.match(selector, /analytics-data/); }
  }
});
