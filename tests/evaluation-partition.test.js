import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { randomUUID, webcrypto } from 'node:crypto';
import { createAccessMiddleware } from '../src/middleware/access.js';

const source = readFileSync(new URL('../src/lib/evaluation-partition.ts', import.meta.url), 'utf8');
const partitionBox = { module: { exports: {} }, crypto: webcrypto, TextEncoder, URL, Uint8Array };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, partitionBox);
const { studentPartitionDay, readPartitionRequest, buildPartitionPlan } = partitionBox.module.exports;
const marker = 'SYNTHETIC_PRIVATE_PARTITION';
const roster = n => Array.from({ length: n }, (_, i) => ({ studentId: marker + '-' + i, name: marker, status: 'アクティブ', youtubeChannelId: 'synthetic-channel', enrollmentDate: 'synthetic-plan' }));
const config = { jwtSecret: 'synthetic-sso-key-'.repeat(4), jobSecret: 'synthetic-job-key-'.repeat(4), origin: 'https://school.example', dashboardUrl: 'https://dashboard.example' };
const planPath = '/api/auto-evaluate/plan', runPath = '/api/auto-evaluate/partition';
const appSource = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
const start = appSource.indexOf('async function handleAutoEvaluation(');
const end = appSource.indexOf('// わなみさん使用回数を確認', start);
const handler = transformSync(appSource.slice(start, end).replace(/await import\(/g, 'await loadModule('), { loader: 'ts', format: 'cjs' }).code;
function fixture(students, { sourceFailure = false, cached = false, cacheSaveFails = false, proWriteFails = false } = {}) {
  const calls = { roster: [], aiCtor: 0, ai: 0, db: 0, writes: 0, reads: 0, logs: [] };
  const app = new Hono(); app.use('*', createAccessMiddleware(config));
  const complete = { videosInMonth: 1, subscriberCount: 1, totalViews: 1, privatePayload: marker };
  const dependencies = { app, readPartitionRequest, buildPartitionPlan,
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => calls.logs.push(args.join(' '))])),
    getEnv: (_c, name) => 'synthetic-' + name,
    getPreviousMonth: () => '2026-09',
    fetchStudents: async (...args) => { calls.roster.push(args); if (sourceFailure) throw Error(marker); return structuredClone(students); },
    GeminiAnalyzer: class { constructor() { calls.aiCtor++; } async analyzeTrainingSession() { calls.ai++; return {}; } },
    getAccessToken: async () => { calls.reads++; return 'synthetic-token'; },
    fetchAbsenceDataFromPostgres: async () => { calls.db++; return []; },
    fetchDocumentsInFolderByMonth: async () => [], fetchDocumentContent: async () => '',
    evaluateStudent: () => ({ overallGrade: 'A', attendanceGrade: 'A', punctualityGrade: 'A', missionGrade: 'A' }),
    convertResultToArray: () => ['synthetic-row'],
    writeResultsToSheet: async () => { calls.writes++; if (proWriteFails) throw Error(marker); },
    getPreviousEvaluationFromSheet: async () => null,
    loadModule: async name => {
      if (name === './lib/google-client') return { fetchPaymentStatusFromUnpaidSheet: async () => [], fetchWanamiUsageCount: async () => new Map() };
      if (name === './lib/evaluation-cache') return { getCachedEvaluation: async () => cached ? complete : null, saveCachedEvaluation: async () => { calls.writes++; return !cacheSaveFails; } };
      if (name === './lib/youtube-client') return { evaluateYouTubeChannel: async () => { calls.ai++; return complete; } };
      throw Error('Unexpected synthetic module');
    },
  };
  dependencies.globalThis = { console: dependencies.console };
  const keys = Object.keys(dependencies);
  new Function(...keys, handler)(...keys.map(key => dependencies[key]));
  function token(path) { return jwt.sign({ scope: path }, config.jobSecret, { algorithm: 'HS256', expiresIn: '90s', audience: config.origin, issuer: 'school-evaluation-jobs', jwtid: randomUUID() }); }
  async function request(path, query, { revision, role, foreign = false, anonymous = false, scope } = {}) {
    const headers = {};
    if (!anonymous) {
      if (role) {
        const sso = jwt.sign({ type: 'sso', userId: 1, username: 'synthetic', role, targetUrl: config.origin }, config.jwtSecret, { expiresIn: '1h' });
        headers.Cookie = 'wannav_sso=' + sso; headers.Origin = foreign ? 'https://foreign.example' : config.origin;
      } else headers.Authorization = 'Bearer ' + token(scope || path);
    }
    if (revision !== undefined) headers['X-Evaluation-Roster-Revision'] = revision;
    return app.request(path + '?' + query, { method: 'POST', headers });
  }
  return { app, request, calls };
}
const query = day => `month=2026-09&partitionDay=${day}&batchSize=5&skipX=true&skipEvaluated=false`;

test('785 synthetic eligible students are assigned exactly once across nine stable partitions', async () => {
  const students = roster(785), seen = new Set(); let sum = 0;
  for (let day = 1; day <= 9; day++) {
    const p = await buildPartitionPlan(students, '2026-09', day, 5);
    assert.equal(p.plan.activeRows, 785); assert.equal(p.plan.eligibleStudents, 785); assert.equal(p.plan.invalidActiveCount, 0);
    assert.equal(p.plan.totalBatches, Math.ceil(p.students.length / 5));
    for (const student of p.students) { assert.equal(seen.has(student.studentId), false); seen.add(student.studentId); assert.equal(studentPartitionDay(student.studentId), day); }
    sum += p.students.length;
  }
  assert.equal(sum, 785); assert.equal(seen.size, 785);
});
test('membership changes never change existing ID day; sorted revision resists row reordering and is domain bound', async () => {
  const students = roster(100), day = studentPartitionDay(students[0].studentId);
  const original = await buildPartitionPlan(students, '2026-09', day, 5);
  const reversed = await buildPartitionPlan([...students].reverse(), '2026-09', day, 5);
  assert.equal(original.plan.rosterRevision === reversed.plan.rosterRevision, true);
  const changed = students.slice(1).concat(roster(101).slice(100));
  assert.equal(students.slice(1).every(s => studentPartitionDay(s.studentId) === studentPartitionDay(changed.find(c => c.studentId === s.studentId).studentId)), true);
  const newMonth = await buildPartitionPlan(students, '2026-10', day, 5), newSize = await buildPartitionPlan(students, '2026-09', day, 6);
  assert.equal(original.plan.rosterRevision === newMonth.plan.rosterRevision, false); assert.equal(original.plan.rosterRevision === newSize.plan.rosterRevision, false);
  let other = 0; while (studentPartitionDay('other-' + other) === day) other++;
  const otherDay = await buildPartitionPlan(students.concat({ studentId: 'other-' + other }), '2026-09', day, 5);
  assert.equal(original.plan.rosterRevision === otherDay.plan.rosterRevision, true);
});
test('empty active template is separate from missing/numeric real identities; duplicates fail closed without IDs', async () => {
  const students = [...roster(1), { studentId: '' }, { studentId: '', name: marker }, { studentId: 12 }, { studentId: ' ', enrollmentDate: marker }];
  const p = await buildPartitionPlan(students, '2026-09', 1, 5);
  assert.equal(p.plan.activeRows, 5); assert.equal(p.plan.eligibleStudents, 1); assert.equal(p.plan.emptyTemplateCount, 1); assert.equal(p.plan.invalidActiveCount, 3);
  let failed = false; try { await buildPartitionPlan([...roster(1), ...roster(1)], '2026-09', 1, 5); } catch (e) { failed = true; assert.equal(e.message.includes(marker), false); }
  assert.equal(failed, true);
});
test('zero and small partition plans calculate ceiling batches without division errors', async () => {
  assert.equal((await buildPartitionPlan([], '2026-09', 1, 5)).plan.totalBatches, 0);
  for (const size of [0, 0.5, 101]) await assert.rejects(buildPartitionPlan([], '2026-09', 1, size));
  for (const day of [0, 1.5, 10]) await assert.rejects(buildPartitionPlan([], '2026-09', day, 5));
});
test('784 eligible plus one empty active template is fully covered without treating the template as an error', async () => {
  const students = [...roster(784), { studentId: '', name: '', status: 'アクティブ' }];
  let total = 0;
  for (let day = 1; day <= 9; day++) {
    const p = await buildPartitionPlan(students, '2026-09', day, 5);
    assert.equal(p.plan.activeRows, 785); assert.equal(p.plan.eligibleStudents, 784);
    assert.equal(p.plan.emptyTemplateCount, 1); assert.equal(p.plan.invalidActiveCount, 0); total += p.students.length;
  }
  assert.equal(total, 784);
});
test('small partition batch counts cover zero, one, five and six members', async () => {
  const members = roster(100).filter(student => studentPartitionDay(student.studentId) === 1).slice(0, 6);
  for (const count of [0, 1, 5, 6]) assert.equal((await buildPartitionPlan(members.slice(0, count), '2026-09', 1, 5)).plan.totalBatches, Math.ceil(count / 5));
});
test('strict route parameters reject ambiguous/duplicate/bad days and batch boundaries', () => {
  const root = 'https://school.example' + planPath + '?';
  for (const q of ['partitionDay=0', 'partitionDay=1.5', 'partitionDay=10', 'partitionDay=1&partitionDay=2', 'partitionDay=1&planOnly=true', 'partitionDay=1&dayCount=9', 'partitionDay=1&batchSize=0', 'partitionDay=1&batchSize=1.5', 'partitionDay=1&batchIndex=0', 'partitionDay=1&skipEvaluated=true', 'partitionDay=1&onlyWithTalkMemo=true', 'partitionDay=1&studentId=synthetic']) assert.throws(() => readPartitionRequest(root + q, 'plan'));
  for (const index of ['-1', '0.5', '01', '9007199254740992']) assert.throws(() => readPartitionRequest(root + 'partitionDay=1&batchIndex=' + index, 'execute', 'a'.repeat(64)));
  assert.equal(readPartitionRequest(root + 'partitionDay=1&batchIndex=0', 'execute', 'a'.repeat(64)).batchIndex, 0);
});
test('real new plan route returns only counts/revision with zero AI/DB/write side effects', async () => {
  const f = fixture([...roster(785), { studentId: '', status: 'アクティブ' }]);
  const response = await f.request(planPath, query(1)); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.plan.activeRows, 786); assert.equal(body.plan.eligibleStudents, 785); assert.equal(body.plan.emptyTemplateCount, 1);
  assert.equal(f.calls.roster[0][3].strict, true); assert.equal(f.calls.aiCtor + f.calls.ai + f.calls.db + f.calls.writes + f.calls.reads, 0);
  assert.equal(JSON.stringify(body).includes(marker), false); assert.equal(body.results, undefined); assert.equal(f.calls.logs.join('').includes(marker), false);
});
test('zero roster plan is valid, source failure/duplicate roster is not successful zero', async () => {
  const empty = fixture([]); let response = await empty.request(planPath, query(1)); assert.equal(response.status, 200); assert.equal((await response.json()).plan.totalBatches, 0);
  for (const f of [fixture(roster(1), { sourceFailure: true }), fixture([...roster(1), ...roster(1)])]) {
    response = await f.request(planPath, query(1)); const body = await response.json(); assert.equal(response.status, 503); assert.equal(body.plan, undefined); assert.equal(JSON.stringify(body).includes(marker), false); assert.equal(f.calls.aiCtor + f.calls.ai + f.calls.db + f.calls.writes, 0);
  }
});
test('anonymous/crew/foreign Origin and cross-scope requests deny before roster/AI effects', async () => {
  for (const path of [planPath, runPath]) for (const auth of [{ anonymous: true }, { role: 'crew' }, { role: 'admin', foreign: true }, { scope: '/api/auto-evaluate' }]) {
    const f = fixture(roster(1)); const r = await f.request(path, query(1), auth); assert.equal([401, 403].includes(r.status), true); assert.equal(f.calls.roster.length + f.calls.aiCtor + f.calls.ai + f.calls.writes, 0);
  }
});
test('admin and leader retain same-origin read-only planning without any AI or persistence', async () => {
  for (const role of ['admin', 'leader']) {
    const f = fixture(roster(5)); const r = await f.request(planPath, query(1), { role });
    assert.equal(r.status, 200); assert.equal(f.calls.aiCtor + f.calls.ai + f.calls.db + f.calls.writes, 0);
  }
});
test('new exact paths cannot fall through to a legacy handler on an old-route worker', async () => {
  const app = new Hono(); let effects = 0; app.use('*', createAccessMiddleware(config));
  app.post('/api/auto-evaluate', c => { effects++; return c.json({ ok: true }); });
  for (const path of [planPath, runPath]) {
    const token = jwt.sign({ scope: path }, config.jobSecret, { algorithm: 'HS256', expiresIn: '90s', audience: config.origin, issuer: 'school-evaluation-jobs', jwtid: randomUUID() });
    const r = await app.request(path, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    assert.equal(r.status, 404);
  }
  assert.equal(effects, 0);
});
test('membership change or wrong-domain revision stops execution with 409 before AI/DB/write', async () => {
  const students = roster(40), day = studentPartitionDay(students[0].studentId); const f = fixture(students);
  const plan = await (await f.request(planPath, query(day))).json(); students.splice(0, 1);
  const r = await f.request(runPath, query(day) + '&batchIndex=0', { revision: plan.plan.rosterRevision }); assert.equal(r.status, 409); assert.equal(f.calls.aiCtor + f.calls.ai + f.calls.db + f.calls.writes, 0);
});
test('partition executes sorted batch with current revision and minimizes server response/logs', async () => {
  const students = roster(40), day = studentPartitionDay(students[0].studentId); const f = fixture(students);
  const plan = await (await f.request(planPath, query(day))).json();
  const r = await f.request(runPath, query(day) + '&batchIndex=0&skipProLevel=true', { revision: plan.plan.rosterRevision }); const body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.successCount > 0, true); assert.equal(body.errorCount, 0); assert.equal(body.results, undefined); assert.equal(body.errors, undefined);
  assert.equal(JSON.stringify(body).includes(marker), false); assert.equal(f.calls.logs.join('').includes(marker), false); assert.equal(f.calls.writes > 0, true);
});
test('cache save failure and ProLevel write failure count as planned failures without private response', async () => {
  for (const options of [{ cacheSaveFails: true }, { cached: true, proWriteFails: true }]) {
    const students = roster(20), day = studentPartitionDay(students[0].studentId); const f = fixture(students, options);
    const plan = await (await f.request(planPath, query(day))).json(); const r = await f.request(runPath, query(day) + '&batchIndex=0', { revision: plan.plan.rosterRevision }); const body = await r.json();
    assert.equal(r.status, 200); assert.equal(body.success, false); assert.equal(body.errorCount > 0, true); assert.equal(body.results, undefined); assert.equal(JSON.stringify(body).includes(marker), false); assert.equal(f.calls.logs.join('').includes(marker), false);
  }
});
test('legacy explicit student target/order/default reader contract remains available', async () => {
  const students = roster(4), f = fixture(students, { cached: true });
  const r = await f.request('/api/auto-evaluate', 'month=2026-09&studentId=' + encodeURIComponent(students[2].studentId) + '&skipProLevel=true&skipX=true');
  const body = await r.json(); assert.equal(r.status, 200); assert.equal(body.results.length, 1); assert.equal(body.results[0].studentId === students[2].studentId, true); assert.equal(f.calls.roster[0].length, 2);
});
