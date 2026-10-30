import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/evaluation-cache.ts', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const marker = 'SYNTHETIC_PRIVATE_CACHE_VALUE';
const studentId = marker + '-student';
const month = '2026-10';
const frozenNow = Date.parse('2026-10-30T00:00:00.000Z');
const headers = ['学籍番号', '氏名', '評価月', '評価データ', 'キャッシュ日時', '有効期限'];
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [frozenNow])); } static now() { return frozenNow; } }
function fixture(responses) {
  const logs = [], requests = [];
  let index = 0, textReads = 0;
  const box = { module: { exports: {} }, Date: FixedDate,
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => logs.push(args.join(' '))])),
    fetch: async (url, options) => {
      requests.push({ url, options });
      const response = responses[index++];
      if (response instanceof Error) throw response;
      if (!response) throw new Error('Unexpected synthetic request');
      return { ok: response.ok !== false, json: async () => { if (response.jsonError) throw new Error(marker); return response.data || {}; },
        text: async () => { textReads++; if (response.textError) throw new Error(marker); return marker; } };
    },
  };
  vm.runInNewContext(compiled, box);
  return { api: box.module.exports, logs, requests, textReads: () => textReads };
}
function privateLogsAbsent(f) { assert.equal(f.logs.join('\n').includes(marker), false); }
function row(data, cachedAt, id = studentId, valueMonth = month) {
  return [id, marker + '-name', valueMonth, typeof data === 'string' ? data : JSON.stringify(data), cachedAt, '2000-01-01T00:00:00.000Z'];
}
const complete = () => ({ privatePayload: marker, subscriberCount: 11, videosInMonth: 2, totalViews: 33 });
const read = (f, type = 'youtube') => f.api.getCachedEvaluation(marker + '-token', marker + '-sheet', studentId, month, type);
const save = (f) => f.api.saveCachedEvaluation(marker + '-token', marker + '-sheet', studentId, marker + '-name', month, 'youtube', complete());
const init = (f) => f.api.initializeCacheSheet(marker + '-token', marker + '-sheet', 'youtube');

test('cache read retains latest complete matching payload and ignores expiry without logging identifiers or JSON', async () => {
  const latest = { ...complete(), totalViews: 99 };
  const f = fixture([{ data: { values: [headers,
    row(complete(), '2026-01-01'), row(latest, '2026-02-01'),
    row({ ...complete(), videosInMonth: 0 }, '2026-03-01'), row({ ...complete(), totalViews: 999 }, '2026-04-01', 'other-id'),
  ] } }]);
  const result = await read(f);
  assert.equal(JSON.stringify(result) === JSON.stringify(latest), true);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].options.headers.Authorization === 'Bearer ' + marker + '-token', true);
  assert.equal(f.requests[0].url.endsWith('/values/youtube_cache'), true);
  assert.equal(f.logs.some(line => line === '[Cache] Cache hit'), true); privateLogsAbsent(f);
});
test('unrelated student or month remains a cache miss with fixed phase only', async () => {
  const f = fixture([{ data: { values: [headers, row(complete(), '2026-01-01', 'other-id'), row(complete(), '2026-01-01', studentId, '2025-01')] } }]);
  assert.equal(await read(f), null); assert.equal(f.logs.includes('[Cache] Cache miss'), true); privateLogsAbsent(f);
});
test('YouTube zero exclusions and X both-zero selection rules remain unchanged', async () => {
  for (const key of ['subscriberCount', 'videosInMonth', 'totalViews']) {
    const f = fixture([{ data: { values: [headers, row({ ...complete(), [key]: 0 }, '2026-01-01')] } }]);
    assert.equal(await read(f), null); privateLogsAbsent(f);
  }
  const empty = fixture([{ data: { values: [headers, row({ privatePayload: marker, tweetsInMonth: 0, followersCount: 0 }, '2026-01-01')] } }]);
  assert.equal(await read(empty, 'x'), null); privateLogsAbsent(empty);
  const data = { privatePayload: marker, tweetsInMonth: 0, followersCount: 1 };
  const usable = fixture([{ data: { values: [headers, row(data, '2026-01-01')] } }]);
  assert.equal(JSON.stringify(await read(usable, 'x')) === JSON.stringify(data), true); privateLogsAbsent(usable);
});
test('empty/header-invalid/invalid-JSON cache retains null contract with no private diagnostics', async () => {
  for (const values of [[], [headers], [['invalid-header'], ['synthetic']], [headers, row('not-json-' + marker, '2026-01-01')]]) {
    const f = fixture([{ data: { values } }]); assert.equal(await read(f), null); privateLogsAbsent(f);
  }
});
test('cache read provider rejection, fetch exception and JSON exception retain null and omit raw errors', async () => {
  for (const response of [{ ok: false }, new Error(marker), { jsonError: true }]) {
    const f = fixture([response]); assert.equal(await read(f), null); assert.equal(f.requests.length, 1); assert.equal(f.textReads(), 0); privateLogsAbsent(f);
  }
});
test('save keeps RAW append body, token, field order, 90-day expiry and true result', async () => {
  const f = fixture([{}]); assert.equal(await save(f), true);
  const request = f.requests[0]; const data = JSON.parse(request.options.body).values[0];
  assert.equal(request.url.endsWith('/values/youtube_cache:append?valueInputOption=RAW'), true); assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization === 'Bearer ' + marker + '-token', true);
  assert.equal(data[0] === studentId && data[1] === marker + '-name' && data[2] === month, true);
  assert.equal(data[3] === JSON.stringify(complete()), true); assert.equal(Date.parse(data[4]), frozenNow);
  assert.equal(Date.parse(data[5]) - frozenNow, 90 * 86400000); assert.equal(f.logs.includes('[Cache] Cache saved'), true); privateLogsAbsent(f);
});
test('save provider response body and exceptions never reach console; false and body draining retained', async () => {
  for (const response of [{ ok: false }, new Error(marker), { ok: false, textError: true }]) {
    const f = fixture([response]); assert.equal(await save(f), false); assert.equal(f.requests.length, 1);
    assert.equal(f.textReads(), response instanceof Error ? 0 : 1); privateLogsAbsent(f);
  }
});
test('cache initialization retains create and header RAW request contracts', async () => {
  const f = fixture([{ data: { sheets: [] } }, {}, {}]); assert.equal(await init(f), true); assert.equal(f.requests.length, 3);
  const create = f.requests[1], header = f.requests[2];
  assert.equal(create.url.endsWith(':batchUpdate'), true); assert.equal(create.options.method, 'POST');
  assert.equal(JSON.parse(create.options.body).requests[0].addSheet.properties.title, 'youtube_cache');
  assert.equal(header.url.endsWith('/values/youtube_cache!A1:F1?valueInputOption=RAW'), true); assert.equal(header.options.method, 'PUT');
  assert.equal(JSON.stringify(JSON.parse(header.options.body).values[0]) === JSON.stringify(headers), true);
  assert.equal(f.requests.every(r => r.options.headers.Authorization === 'Bearer ' + marker + '-token'), true); privateLogsAbsent(f);
});
test('existing cache sheet skips creation but preserves header write', async () => {
  const f = fixture([{ data: { sheets: [{ properties: { title: 'youtube_cache' } }] } }, {}]);
  assert.equal(await init(f), true); assert.equal(f.requests.length, 2); assert.equal(f.requests[1].options.method, 'PUT'); privateLogsAbsent(f);
});
test('initialization metadata/create/header and thrown failures keep false without leaking provider text', async () => {
  const cases = [[{ ok: false }], [new Error(marker)], [{ jsonError: true }],
    [{ data: { sheets: [] } }, { ok: false }], [{ data: { sheets: [] } }, { ok: false, textError: true }],
    [{ data: { sheets: [] } }, {}, { ok: false }], [{ data: { sheets: [] } }, {}, { ok: false, textError: true }]];
  for (const responses of cases) {
    const f = fixture(responses); assert.equal(await init(f), false); assert.equal(f.requests.length, responses.length); privateLogsAbsent(f);
  }
});
