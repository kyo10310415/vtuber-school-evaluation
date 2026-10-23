import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createAccessMiddleware, JOB_PATHS } from '../src/middleware/access.js';
import { readSecurityConfig } from '../src/middleware/security-config.js';

const config = { jwtSecret: 'test-only-sso-key-'.repeat(4), jobSecret: 'test-only-job-key-'.repeat(4),
  origin: 'https://school.example', dashboardUrl: 'https://dashboard.example' };
function fixture() {
  const app = new Hono(); let effects = 0;
  app.use('*', createAccessMiddleware(config));
  app.all('*', c => { effects++; return c.json({ ok: true }); });
  return { app, effects: () => effects };
}
function sso(overrides = {}, key = config.jwtSecret, options = {}) {
  return jwt.sign({ type: 'sso', userId: 7, username: 'test-only', role: 'admin', targetUrl: config.origin, ...overrides }, key,
    { algorithm: 'HS256', expiresIn: '1h', ...options });
}
function job(path, overrides = {}, key = config.jobSecret, options = {}) {
  return jwt.sign({ scope: path, ...overrides }, key, { algorithm: 'HS256', expiresIn: '90s',
    audience: config.origin, issuer: 'school-evaluation-jobs', jwtid: randomUUID(), ...options });
}

test('strong SSO/job keys and HTTPS origin are mandatory and independent', () => {
  const env = { JWT_SECRET: config.jwtSecret, EVALUATION_JOB_TOKEN: config.jobSecret, APP_ORIGIN: config.origin };
  assert.equal(readSecurityConfig(env).origin, config.origin);
  for (const patch of [{ JWT_SECRET: '' }, { JWT_SECRET: 'wannav-secret-key-change-in-production' },
    { EVALUATION_JOB_TOKEN: '' }, { EVALUATION_JOB_TOKEN: config.jwtSecret }, { APP_ORIGIN: 'http://remote.example' }]) {
    assert.throws(() => readSecurityConfig({ ...env, ...patch }));
  }
});

test('health alone is public and HTTP migrations never reach handlers', async () => {
  const f = fixture();
  assert.equal((await f.app.request('/api/health')).status, 200);
  for (const method of ['GET', 'POST']) assert.equal((await f.app.request('/api/admin/run-migrations', { method })).status, 410);
  assert.equal(f.effects(), 0);
});

test('former anonymous APIs all reject before any business side effect', async () => {
  const f = fixture();
  for (const path of [...JOB_PATHS, '/api/analytics/by-type', '/api/analytics/check-env', '/api/debug/env',
    '/api/auto-evaluate/status', '/api/analytics/auto-fetch/test', '/api/wanami-usage', '/api/students']) {
    assert.equal((await f.app.request(path, { method: 'POST' })).status, 401, path);
  }
  assert.equal(f.effects(), 0);
});

test('SSO requires valid signature, type, role, expiry and matching target', async () => {
  const f = fixture();
  const bad = [sso({}, 'wannav-secret-key-change-in-production'), sso({ type: 'other' }),
    sso({ targetUrl: 'https://other.example' }), sso({}, config.jwtSecret, { expiresIn: -1 }),
    sso({}, config.jwtSecret, { expiresIn: '2h' })];
  for (const token of bad) assert.equal((await f.app.request('/api/students', { headers: { Cookie: 'wannav_sso=' + token } })).status, 401);
  for (const role of ['crew', 'unknown']) assert.equal((await f.app.request('/api/students', { headers: { Cookie: 'wannav_sso=' + sso({ role }) } })).status, 403);
  assert.equal(f.effects(), 0);
});

test('SSO login is limited to HTML landing and cleans only its token query', async () => {
  const f = fixture(); const token = sso();
  assert.equal((await f.app.request('/api/students?auth_token=' + token)).status, 401);
  const r = await f.app.request('/?view=detail&auth_token=' + token);
  assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), '/?view=detail');
  assert.match(r.headers.get('Set-Cookie'), /HttpOnly/); assert.match(r.headers.get('Set-Cookie'), /Secure/);
  assert.equal(f.effects(), 0);
});

test('admin/leader normal reads and same-origin writes continue; foreign writes fail', async () => {
  const f = fixture();
  for (const role of ['admin', 'leader']) {
    const Cookie = 'wannav_sso=' + sso({ role });
    assert.equal((await f.app.request('/api/students', { headers: { Cookie } })).status, 200);
    assert.equal((await f.app.request('/api/evaluate', { method: 'POST', headers: { Cookie, Origin: config.origin } })).status, 200);
    assert.equal((await f.app.request('/api/evaluate', { method: 'POST', headers: { Cookie, Origin: 'https://foreign.example' } })).status, 403);
  }
  assert.equal(f.effects(), 4);
});

test('cross-site browser GET cannot trigger legacy evaluation or cache APIs', async () => {
  const f = fixture(); const Cookie = 'wannav_sso=' + sso();
  assert.equal((await f.app.request('/api/youtube/evaluate/test-only', { headers: { Cookie, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await f.app.request('/api/students', { headers: { Cookie, 'Sec-Fetch-Site': 'same-site' } })).status, 403);
  assert.equal((await f.app.request('/api/students', { headers: { Cookie, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  assert.equal(f.effects(), 1);
});

test('jobs require short lived scoped JWT and cannot read student/admin data', async () => {
  const f = fixture();
  for (const path of JOB_PATHS) {
    const token = job(path);
    assert.equal((await f.app.request(path, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })).status, 200);
    assert.equal((await f.app.request(path, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })).status, 409);
  }
  for (const path of ['/api/students', '/api/debug/env']) assert.equal((await f.app.request(path, { headers: { Authorization: 'Bearer ' + job('/api/auto-evaluate') } })).status, 403);
  assert.equal(f.effects(), JOB_PATHS.size);
});

test('job token wrong scope, audience, key, expiry and lifetime are rejected', async () => {
  const f = fixture(); const path = '/api/auto-evaluate';
  const bad = [job('/api/analytics/auto-fetch'), job(path, {}, config.jwtSecret),
    job(path, {}, config.jobSecret, { audience: 'https://other.example' }),
    job(path, {}, config.jobSecret, { expiresIn: -1 }), job(path, {}, config.jobSecret, { expiresIn: '10m' })];
  for (const token of bad) assert.equal((await f.app.request(path, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })).status, 401);
  assert.equal(f.effects(), 0);
});

test('real app installs gate before business routes and removes public migration code', () => {
  const source = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf("app.use('*', ssoAuthMiddleware)") < source.indexOf("app.post('/api/auto-evaluate'"));
  assert.equal(source.includes('publicApiRoutes'), false);
  assert.equal(source.includes("app.post('/api/admin/run-migrations'"), false);
});
