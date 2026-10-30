import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const secret = process.env.EVALUATION_JOB_TOKEN;
const base = process.env.EVALUATION_BASE_URL || 'https://vtuber-school-evaluation.onrender.com';
const path = process.argv[2];
const url = new URL(path, base);
const allowed = ['/api/auto-evaluate', '/api/auto-evaluate/plan', '/api/auto-evaluate/partition', '/api/auto-evaluate-x-only', '/api/x/evaluate-batch-auto', '/api/analytics/auto-fetch'];
if (!secret || secret.trim().length < 32 || url.origin !== new URL(base).origin || url.protocol !== 'https:' || !allowed.includes(url.pathname)) {
  throw new Error('Valid job configuration and a scoped HTTPS endpoint are required');
}
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ iss: 'school-evaluation-jobs', aud: url.origin, scope: url.pathname,
  iat: now, exp: now + 90, jti: randomUUID() });
const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
const headers = { Authorization: `Bearer ${header}.${payload}.${signature}` };
const isPlan = url.pathname === '/api/auto-evaluate/plan';
const isPartition = url.pathname === '/api/auto-evaluate/partition';
if (isPartition) {
  const revision = process.env.EVALUATION_ROSTER_REVISION ||
    (process.env.EVALUATION_ROSTER_REVISION_FILE ? readFileSync(process.env.EVALUATION_ROSTER_REVISION_FILE, 'utf8').trim() : '');
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error('A valid partition roster revision is required');
  headers['X-Evaluation-Roster-Revision'] = revision;
}
const response = await fetch(url, { method: 'POST', redirect: 'error',
  headers, signal: AbortSignal.timeout(1800000) });
const body = await response.json().catch(() => ({}));
// Emit only counts/state, never student records, raw errors or credentials.
const number = value => Number.isFinite(value) ? value : 0;
const safe = { successCount: number(body.successCount), errorCount: number(body.errorCount), skippedCount: number(body.skippedCount),
  progress: { isCompleted: body.progress?.isCompleted === true, completedStudents: number(body.progress?.completedStudents), totalStudents: number(body.progress?.totalStudents) },
  summary: { total: number(body.summary?.total), success: number(body.summary?.success), errors: number(body.summary?.errors) } };
const count = value => Number.isSafeInteger(value) && value >= 0;
if (url.pathname === '/api/auto-evaluate-x-only') {
  const summaryValid = body.summary && ['total', 'success', 'errors'].every(field => count(body.summary[field]));
  const completedValid = body.progress?.isCompleted === true &&
    count(body.progress.completedStudents) && count(body.progress.totalStudents);
  safe.requestFailed = body.success !== true || (!summaryValid && !completedValid);
}

if (isPlan) {
  if (!response.ok) throw new Error('Partition plan request failed');
  const plan = body.plan;
  const fields = ['planVersion', 'partitionDay', 'partitionCount', 'activeRows', 'eligibleStudents',
    'emptyTemplateCount', 'invalidActiveCount', 'partitionStudentCount', 'batchSize', 'totalBatches'];
  if (body.success !== true || !plan || typeof plan !== 'object' || Array.isArray(plan) ||
      fields.some(field => !count(plan[field])) || plan.planVersion !== 1 || plan.partitionCount !== 9 ||
      plan.partitionDay < 1 || plan.partitionDay > 9 || plan.batchSize < 1 || plan.batchSize > 100 ||
      plan.activeRows !== plan.eligibleStudents + plan.emptyTemplateCount + plan.invalidActiveCount ||
      plan.partitionStudentCount > plan.eligibleStudents || plan.totalBatches !== Math.ceil(plan.partitionStudentCount / plan.batchSize) ||
      !/^[a-f0-9]{64}$/.test(plan.rosterRevision || '')) throw new Error('Invalid partition plan response');
  safe.plan = Object.fromEntries(fields.map(field => [field, plan[field]]));
  // Protocol-only opaque revision: workflows capture stdout and never echo this object.
  safe.plan.rosterRevision = plan.rosterRevision;
}
const invalidPartitionResult = isPartition && response.ok && (typeof body.success !== 'boolean' ||
    body.success !== (body.errorCount === 0) ||
    !['successCount', 'errorCount', 'skippedCount'].every(field => count(body[field])));
console.log(JSON.stringify(invalidPartitionResult ? { invalidResult: true } : safe));
if (!process.argv.includes('--json-only')) console.log(`HTTP_STATUS:${response.status}`);
if (!response.ok || invalidPartitionResult || (isPartition && body.errorCount > 0)) process.exitCode = 1;
