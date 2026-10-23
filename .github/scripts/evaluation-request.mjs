import { createHmac, randomUUID } from 'node:crypto';

const secret = process.env.EVALUATION_JOB_TOKEN;
const base = process.env.EVALUATION_BASE_URL || 'https://vtuber-school-evaluation.onrender.com';
const path = process.argv[2];
const url = new URL(path, base);
const allowed = ['/api/auto-evaluate', '/api/auto-evaluate-x-only', '/api/x/evaluate-batch-auto', '/api/analytics/auto-fetch'];
if (!secret || secret.trim().length < 32 || url.origin !== new URL(base).origin || url.protocol !== 'https:' || !allowed.includes(url.pathname)) {
  throw new Error('Valid job configuration and a scoped HTTPS endpoint are required');
}
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ iss: 'school-evaluation-jobs', aud: url.origin, scope: url.pathname,
  iat: now, exp: now + 90, jti: randomUUID() });
const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
const response = await fetch(url, { method: 'POST', redirect: 'error',
  headers: { Authorization: `Bearer ${header}.${payload}.${signature}` }, signal: AbortSignal.timeout(1800000) });
const body = await response.json().catch(() => ({}));
// Emit only counts/state, never student records, raw errors or credentials.
const number = value => Number.isFinite(value) ? value : 0;
const safe = { successCount: number(body.successCount), errorCount: number(body.errorCount), skippedCount: number(body.skippedCount),
  progress: { isCompleted: body.progress?.isCompleted === true, completedStudents: number(body.progress?.completedStudents), totalStudents: number(body.progress?.totalStudents) },
  summary: { total: number(body.summary?.total), success: number(body.summary?.success), errors: number(body.summary?.errors) } };
console.log(JSON.stringify(safe));
if (!process.argv.includes('--json-only')) console.log(`HTTP_STATUS:${response.status}`);
if (!response.ok) process.exitCode = 1;
