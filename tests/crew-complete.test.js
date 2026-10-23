import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Hono } from 'hono';

const indexSource = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
const start = indexSource.indexOf("app.get('/api/evaluation/complete/:studentId'");
const end = indexSource.indexOf('// X評価取得', start);
const handlerSource = transformSync(indexSource.slice(start, end).replace(/await import\(/g, 'await loadModule('), { loader: 'ts', format: 'cjs' }).code;

function fixture(role, cacheValue = null, hasApiKeys = true) {
  const calls = { cache: 0, evaluate: 0, save: 0, fetch: 0 };
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('user', { id: 1, role }); await next(); });
  const loadModule = async path => {
    if (path === './lib/evaluation-cache') return {
      getCachedEvaluation: async () => { calls.cache++; return cacheValue; },
      saveCachedEvaluation: async () => { calls.save++; },
    };
    const evaluate = async () => { calls.evaluate++; return { videosInMonth: 1, tweetsInMonth: 1, followersCount: 1 }; };
    if (path === './lib/youtube-client') return { evaluateYouTubeChannel: evaluate };
    if (path === './lib/x-client') return { evaluateXAccount: evaluate };
    throw new Error('Unexpected module');
  };
  const getEnv = (_c, name) => ['YOUTUBE_API_KEY', 'X_BEARER_TOKEN'].includes(name) && !hasApiKeys ? '' : 'test-only-value';
  const fetch = async () => { calls.fetch++; return { ok: true, json: async () => ({ sheets: [] }) }; };
  new Function('app', 'getEnv', 'fetchStudents', 'getPreviousMonth', 'getAccessToken', 'loadModule', 'fetch', 'console', handlerSource)(
    app, getEnv, async () => [{ studentId: 'TEST_ONLY', name: 'test-only', youtubeChannelId: 'test-channel', xAccount: 'test-account' }],
    () => '2026-01', async () => 'test-only-access-token', loadModule, fetch, { log() {}, error() {} },
  );
  return { app, calls };
}

test('real complete handler: crew cache miss never evaluates or writes, even cache=false', async () => {
  const { app, calls } = fixture('crew');
  const response = await app.request('/api/evaluation/complete/TEST_ONLY?cache=false');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.youtube.error, /保存済み/);
  assert.match(body.x.error, /保存済み/);
  assert.equal(calls.cache, 2);
  assert.equal(calls.evaluate, 0);
  assert.equal(calls.save, 0);
});

test('real complete handler: crew can read cached results without evaluation API keys', async () => {
  const { app, calls } = fixture('crew', { score: 'test-only-score' }, false);
  const response = await app.request('/api/evaluation/complete/TEST_ONLY?cache=false');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.youtube.cached, true);
  assert.equal(body.youtube.score, 'test-only-score');
  assert.equal(body.x.cached, true);
  assert.equal(calls.evaluate, 0);
  assert.equal(calls.save, 0);
});

for (const role of ['admin', 'leader']) {
  test(`real complete handler: ${role} retains cache miss evaluation and saving`, async () => {
    const { app, calls } = fixture(role);
    assert.equal((await app.request('/api/evaluation/complete/TEST_ONLY')).status, 200);
    assert.equal(calls.cache, 2);
    assert.equal(calls.evaluate, 2);
    assert.equal(calls.save, 2);
  });
}

test('real complete handler: admin force-refresh still bypasses cache and skips saving', async () => {
  const { app, calls } = fixture('admin', { score: 'test-only-score' });
  assert.equal((await app.request('/api/evaluation/complete/TEST_ONLY?cache=false')).status, 200);
  assert.equal(calls.cache, 0);
  assert.equal(calls.evaluate, 2);
  assert.equal(calls.save, 0);
});
