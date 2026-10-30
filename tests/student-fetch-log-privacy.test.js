import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const moduleSource = readFileSync(new URL('../src/lib/google-client.ts', import.meta.url), 'utf8');
const start = moduleSource.indexOf('export async function fetchStudents(');
const end = moduleSource.indexOf('export async function fetchAbsenceData(', start);
const source = transformSync(moduleSource.slice(start, end), { loader: 'ts', format: 'cjs' }).code;
const marker = 'SYNTHETIC_PRIVATE_STUDENT_VALUE';
function fixture({ values, phaseError, providerError = false } = {}) {
  const logs = [], requests = [], tokenArguments = [];
  const originalError = new Error(marker);
  const box = { module: { exports: {} },
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)])),
    getAccessToken: async value => { tokenArguments.push(value); if (phaseError === 'token') throw originalError; return marker + '-token'; },
    fetch: async (url, options) => {
      requests.push({ url, options }); if (phaseError === 'fetch') throw originalError;
      return { ok: !providerError, json: async () => { if (phaseError === 'json') throw originalError; return providerError ? { error: { message: marker } } : values === undefined ? {} : { values }; } };
    },
  };
  vm.runInNewContext(source, box);
  return { run: (...args) => box.module.exports.fetchStudents(...args), logs, requests, tokenArguments, originalError };
}
function assertSafeLogs(f, count) {
  assert.equal(JSON.stringify(f.logs).includes(marker), false);
  assert.equal(f.logs.length, 1); assert.equal(f.logs[0][0], '[fetchStudents] Rows fetched');
  assert.equal(JSON.stringify(f.logs[0][1]) === JSON.stringify({ rowCount: count }), true);
}

test('real student fetch preserves mapped rows/request while logging only numeric row count', async () => {
  const row = [marker + '-name', marker + '-id', marker + '-plan', 'アクティブ', marker + '-folder', marker + '-youtube', marker + '-x'];
  const f = fixture({ values: [row, []] });
  const sheet = marker + ' sheet []';
  const result = await f.run(marker + '-service-account', marker + '-spreadsheet', sheet);
  const expected = [{ studentId: row[1], name: row[0], enrollmentDate: row[2], status: row[3], talkMemoFolderUrl: row[4], youtubeChannelId: row[5], xAccount: row[6] },
    { studentId: '', name: '', enrollmentDate: '', status: '在籍中', talkMemoFolderUrl: '', youtubeChannelId: '', xAccount: '' }];
  assert.equal(JSON.stringify(result) === JSON.stringify(expected), true);
  assert.equal(f.tokenArguments.length, 1); assert.equal(f.tokenArguments[0] === marker + '-service-account', true);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url === `https://sheets.googleapis.com/v4/spreadsheets/${marker}-spreadsheet/values/${encodeURIComponent(sheet)}!A2:Z`, true);
  assert.equal(f.requests[0].options.headers.Authorization === 'Bearer ' + marker + '-token', true);
  assertSafeLogs(f, 2);
});
test('empty response keeps default sheet and empty result without logging sheet identifiers', async () => {
  for (const values of [undefined, []]) {
    const f = fixture({ values }); const result = await f.run(marker + '-service-account', marker + '-spreadsheet');
    assert.equal(Array.isArray(result) && result.length === 0, true);
    assert.equal(f.requests[0].url.endsWith('/values/' + encodeURIComponent('リスト') + '!A2:Z'), true);
    assertSafeLogs(f, 0);
  }
});
test('token/fetch/JSON exceptions preserve rejection identity without raw console output', async () => {
  for (const phaseError of ['token', 'fetch', 'json']) {
    const f = fixture({ phaseError }); let caught;
    try { await f.run(marker + '-service-account', marker + '-spreadsheet'); } catch (error) { caught = error; }
    assert.equal(caught === f.originalError, true); assert.equal(f.logs.length, 0);
    assert.equal(f.requests.length, phaseError === 'token' ? 0 : 1);
  }
});
test('provider error JSON keeps existing empty mapping contract and never logs provider text', async () => {
  const f = fixture({ providerError: true }); const result = await f.run(marker + '-service-account', marker + '-spreadsheet');
  assert.equal(Array.isArray(result) && result.length === 0, true); assertSafeLogs(f, 0);
});
