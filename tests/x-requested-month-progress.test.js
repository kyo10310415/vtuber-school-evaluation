import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
const start = source.indexOf("app.post('/api/auto-evaluate-x-only',");
const end = source.indexOf('\n})', start) + 4;
assert.ok(start >= 0 && end > start);
const code = transformSync(source.slice(start, end).replaceAll('await import(', 'await loadModule('), { loader: 'tsx', format: 'cjs' }).code;
function fixture(initial = {}) {
  const rows = new Map(Object.entries(initial).map(([month, row]) => [month, { ...row, evaluation_month: month }]));
  const queries = [], selected = [], counters = { source: 0, end: 0, provider: 0, save: 0 };
  class Pool {
    async query(sql, args) {
      const kind = sql.trim().split(/\s/)[0]; queries.push({ kind, args: [...args] });
      if (kind === 'SELECT') return { rows: rows.has(args[0]) ? [{ ...rows.get(args[0]) }] : [] };
      if (kind === 'DELETE') { rows.delete(args[0]); return { rows: [] }; }
      if (kind === 'INSERT') {
        if (rows.has(args[0])) throw new Error('SYNTHETIC_DUPLICATE_PROGRESS');
        const row = { evaluation_month: args[0], current_batch_index: 0, total_students: args[1], completed_students: 0, is_completed: false };
        rows.set(args[0], row); return { rows: [{ ...row }] };
      }
      if (kind === 'UPDATE') {
        const row = rows.get(args.at(-1));
        if (args.length === 4) Object.assign(row, { current_batch_index: args[0], completed_students: args[1], is_completed: args[2] });
        else row.is_completed = true;
        return { rows: [] };
      }
      throw new Error('Unexpected synthetic SQL operation');
    }
    async end() { counters.end++; }
  }
  let handler;
  const modules = {
    pg: { Pool },
    './lib/x-quota-manager': { getQuotaStatus: async () => ({ status: 'known', remainingQuota: 1000, totalRequests: 13000 }), getAvailableStudentCount: async () => 1000, recordQuotaUsage: async () => {} },
    './lib/x-client': { evaluateXAccount: async () => { counters.provider++; throw new Error('External provider forbidden'); } },
    './lib/evaluation-cache': { getCachedEvaluation: async (_token, _sheet, id) => { selected.push(id); return { rateLimited: false }; }, saveCachedEvaluation: async () => { counters.save++; throw new Error('External cache write forbidden'); } },
  };
  const box = { app: { post: (_path, fn) => { handler = fn; } },
    console: { log() {}, error() {}, warn() {} },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-30T00:00:00Z'])); } },
    getEnv: () => 'synthetic-configuration', getAccessToken: async () => 'synthetic-access', getDatabaseConfig: () => ({}),
    loadModule: async name => { if (!modules[name]) throw new Error('Forbidden module'); return modules[name]; },
    fetchStudents: async () => { counters.source++; return ['synthetic-a', 'synthetic-b', 'synthetic-c'].map(studentId => ({ studentId, name: 'Synthetic', status: 'アクティブ', xAccount: 'synthetic-account' })); },
  };
  vm.runInNewContext(code, box);
  return { rows, queries, selected, counters,
    run: (params = {}) => handler({ req: { query: () => ({ month: '2026-09', batchSize: '1', ...params }) }, json: (body, status = 200) => ({ body, status }) }) };
}
const pending = { current_batch_index: 1, total_students: 3, completed_students: 1, is_completed: false };
test('actual X handler resumes requested previous-month progress without duplicate INSERT', async () => {
  const f = fixture({ '2026-09': pending });
  const first = await f.run(); assert.equal(first.status, 200); assert.equal(first.body.progress.currentBatchIndex, 1);
  const second = await f.run(); assert.equal(second.status, 200); assert.equal(second.body.progress.currentBatchIndex, 2);
  assert.deepEqual(f.selected, ['synthetic-b', 'synthetic-c']);
  assert.equal(f.queries.some(q => ['INSERT', 'DELETE'].includes(q.kind)), false);
  assert.equal(f.counters.provider, 0); assert.equal(f.counters.save, 0); assert.equal(f.counters.end, 2);
});
test('actual X handler preserves completed requested-month progress without source or writes', async () => {
  const f = fixture({ '2026-09': { ...pending, is_completed: true, completed_students: 3 } });
  const result = await f.run(); assert.equal(result.status, 200); assert.equal(result.body.progress.isCompleted, true);
  assert.equal(f.queries.length, 1); assert.equal(f.queries[0].kind, 'SELECT');
  assert.equal(f.counters.source, 0); assert.equal(f.counters.end, 1);
});
test('actual X explicit reset deletes only requested progress and starts its first batch', async () => {
  const f = fixture({ '2026-09': pending, '2026-08': { ...pending } });
  const result = await f.run({ reset: 'true' }); assert.equal(result.status, 200);
  assert.equal(result.body.progress.currentBatchIndex, 0); assert.deepEqual(f.selected, ['synthetic-a']);
  assert.deepEqual(f.queries.filter(q => q.kind === 'DELETE').map(q => q.args), [['2026-09']]);
  assert.equal(f.rows.get('2026-08').current_batch_index, 1);
  assert.equal(f.queries.filter(q => q.kind === 'INSERT').length, 1);
});
test('actual X new requested month initializes its own progress without deleting prior month', async () => {
  const f = fixture({ '2026-09': pending });
  const result = await f.run({ month: '2026-08' }); assert.equal(result.status, 200);
  assert.equal(result.body.progress.currentBatchIndex, 0); assert.deepEqual(f.selected, ['synthetic-a']);
  assert.equal(f.rows.get('2026-09').current_batch_index, 1);
  assert.equal(f.queries.filter(q => q.kind === 'DELETE').length, 0);
  assert.deepEqual(f.queries.filter(q => q.kind === 'INSERT').map(q => q.args[0]), ['2026-08']);
});
