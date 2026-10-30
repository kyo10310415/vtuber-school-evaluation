import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const marker = 'SYNTHETIC_PRIVATE_DOCUMENT_SENTINEL';
const google = readFileSync(new URL('../src/lib/google-client.ts', import.meta.url), 'utf8');
const start = google.indexOf('export async function fetchDocumentsInFolderByMonth(');
const end = google.indexOf('export async function fetchAnalyticsTargetStudents(', start);
assert.ok(start >= 0 && end > start);
const googleCode = transformSync(google.slice(start, end), { loader: 'ts', format: 'cjs' }).code;
const gemini = readFileSync(new URL('../src/lib/gemini-client.ts', import.meta.url), 'utf8');
const geminiCode = transformSync(gemini.slice(gemini.indexOf('export class GeminiAnalyzer')), { loader: 'ts', format: 'cjs' }).code;
function logger(logs) {
  return Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => logs.push(args)]));
}
function safe(logs) { assert.equal(JSON.stringify(logs).includes(marker), false); }
function googleFixture({ exportFailure = false } = {}) {
  const logs = [], requests = [];
  const fallback = marker + '-speaker: ' + marker + '-fallback';
  const text = [marker + '-speaker: ' + marker + '-first', 'Speaker: second', 'Tutor: third'].join('\n');
  const box = { module: { exports: {} }, console: logger(logs),
    getAccessToken: async () => marker + '-token', extractFolderId: () => marker + '-folder',
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/export?')) {
        if (exportFailure) throw new Error(marker + '-provider-error');
        return { ok: true, text: async () => text };
      }
      return { json: async () => url.includes('/drive/v3/files?')
        ? { files: [{ id: marker + '-id', name: marker + ' - 2026/09/01' }, { id: 'other', name: 'Other - 2026/08/01' }] }
        : { title: marker + '-title', tabs: [{ tabProperties: { title: marker + '-tab' } }],
            body: { content: [{ paragraph: { elements: [{ textRun: { content: fallback } }] } }] } } };
    },
  };
  vm.runInNewContext(googleCode, box);
  return { api: box.module.exports, logs, requests, text, fallback };
}
test('actual month/document fetch preserves names, IDs, transcript and messages without console previews', async () => {
  const f = googleFixture();
  const rows = await f.api.fetchDocumentsInFolderByMonth('synthetic-account', 'synthetic-folder', '2026-09');
  assert.equal(rows.length, 1); assert.equal(rows[0].id === marker + '-id', true);
  assert.equal(rows[0].name === marker + ' - 2026/09/01', true);
  const doc = await f.api.fetchDocumentContent('synthetic-account', marker + '-id');
  assert.equal(doc.title === marker + '-title', true);
  assert.equal(doc.documentId === marker + '-id', true);
  assert.equal(doc.content === f.text, true);
  assert.equal(doc.messages.length, 3);
  assert.equal(doc.messages[0].content === marker + '-first', true);
  assert.equal(f.requests.length, 3); safe(f.logs);
  assert.equal(f.logs.some(args => args[0] === '[parseMessages] Parsed messages count:' && args[1] === 3), true);
});
test('actual document export exception keeps body fallback and never logs provider exception or body', async () => {
  const f = googleFixture({ exportFailure: true });
  const doc = await f.api.fetchDocumentContent('synthetic-account', marker + '-id');
  assert.equal(doc.content.trim() === f.fallback, true);
  assert.equal(doc.messages.length, 1); safe(f.logs);
  assert.equal(f.logs.some(args => args[0] === '[fetchDocumentContent] Export failed; using document body fallback'), true);
});
function geminiFixture(fail) {
  const logs = [], prompts = [], calls = [];
  const box = { module: { exports: {} }, console: logger(logs),
    GoogleGenerativeAI: class { getGenerativeModel(options) { calls.push(options); return { generateContent: async prompt => {
      prompts.push(prompt);
      if (fail) throw new Error(marker + '-provider-error');
      return { response: { text: () => '```json\n' + JSON.stringify({ mission: { grade: 'a', reason: marker + '-reason' } }) + '\n```' } };
    } }; } },
  };
  vm.runInNewContext(geminiCode, box);
  return { analyzer: new box.module.exports.GeminiAnalyzer('synthetic-key'), logs, prompts, calls };
}
const memo = { documentId: marker + '-id', title: marker + '-title', content: marker,
  messages: [{ speaker: marker + '-speaker', content: marker + '-message' }] };
test('actual Gemini analysis keeps private prompt and parsed response while logging only phases and lengths', async () => {
  const f = geminiFixture(false); const result = await f.analyzer.analyzeTrainingSession(memo);
  assert.equal(f.prompts.length, 1); assert.equal(f.prompts[0].includes(marker + '-message'), true);
  assert.equal(result.mission.grade, 'A'); assert.equal(result.mission.reason === marker + '-reason', true);
  assert.equal(f.calls[0].model, 'gemini-2.5-flash'); safe(f.logs);
  assert.equal(f.logs.some(args => args[0] === '[GeminiAnalyzer] Response text length:' && args[1] > 0), true);
});
test('actual Gemini provider exception preserves default analysis and cause in result but not console', async () => {
  const f = geminiFixture(true); const result = await f.analyzer.analyzeTrainingSession(memo);
  assert.equal(result.mission.grade, 'C'); assert.equal(result.mission.reason.includes(marker + '-provider-error'), true);
  assert.equal(f.prompts.length, 1); safe(f.logs);
  assert.equal(f.logs.some(args => args[0] === '[GeminiAnalyzer] Analysis failed'), true);
});
