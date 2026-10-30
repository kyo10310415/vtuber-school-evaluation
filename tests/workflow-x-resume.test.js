import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/daily-evaluation.yml', import.meta.url), 'utf8');
const xJob = workflow.slice(workflow.indexOf('  x-evaluation:'));
const lines = xJob.split(/\r?\n/);
function fragment(name) {
  const start = lines.findIndex(line => line.includes('- name: ' + name));
  assert.equal(start >= 0, true);
  const run = lines.findIndex((line, index) => index > start && line.trim() === 'run: |');
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.length - line.trimStart().length < 10) break;
    body.push(line.startsWith('          ') ? line.slice(10) : '');
  }
  return body.join('\n');
}
const resume = fragment('Resume X monthly evaluation');
const aggregate = fragment('Aggregate X monthly resume outcome');
const dateCheck = fragment('Check X monthly evaluation window');
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
function expressions(source, values) {
  return source.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_whole, key) => values[key.trim()] ?? '');
}
function run(script, responses = [], extraEnv = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'evaluation-x-resume-'));
  const output = join(temp, 'output.txt'), count = join(temp, 'count.txt'), calls = join(temp, 'calls.txt'), sleeps = join(temp, 'sleeps.txt');
  for (const file of [output, calls, sleeps]) writeFileSync(file, ''); writeFileSync(count, '0');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEST_NODE: process.execPath.replace(/\\/g, '/'),
    TEST_RESPONSES: JSON.stringify(responses), TEST_COUNT: count.replace(/\\/g, '/'), TEST_CALLS: calls.replace(/\\/g, '/'),
    TEST_SLEEPS: sleeps.replace(/\\/g, '/'), GITHUB_OUTPUT: output.replace(/\\/g, '/'), INPUT_DAY: '', INPUT_MONTH: '2026-09', ...extraEnv };
  const stubs = `
    node(){ local n=$(cat "$TEST_COUNT"); printf '%s' "$((n+1))" > "$TEST_COUNT"; printf '%s\n' "$*" >> "$TEST_CALLS";
      "$TEST_NODE" -e 'const r=JSON.parse(process.env.TEST_RESPONSES)[Number(process.argv[1])];if(!r||r.httpFailure)process.exit(1);console.log(JSON.stringify({errorCount:0,summary:{errors:r.errors||0},requestFailed:r.requestFailed||false,progress:{isCompleted:r.completed||false},private:"SYNTHETIC_PRIVATE_X_RESPONSE"}));' "$n"; }
    jq(){ "$TEST_NODE" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const d=JSON.parse(s),e=process.argv[1];if(e.includes("summary.errors"))console.log((d.errorCount||0)+(d.summary.errors||0)+(d.requestFailed?1:0));else if(e.includes("isCompleted"))console.log(d.progress.isCompleted);else console.log(d.requestFailed||false)});' "$2"; }
    sleep(){ printf '%s\n' "$1" >> "$TEST_SLEEPS"; }
  `;
  try {
    const child = spawnSync(bash, ['-c', 'PATH=/usr/bin:/bin:$PATH\n' + stubs + script], { env, encoding: 'utf8', timeout: 15000 });
    const values = Object.fromEntries(readFileSync(output, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => line.split('=')));
    return { status: child.status, values, calls: Number(readFileSync(count, 'utf8')), arguments: readFileSync(calls, 'utf8'),
      sleeps: readFileSync(sleeps, 'utf8').trim().split(/\r?\n/).filter(Boolean), stdout: child.stdout };
  } finally {
    const absolute = resolve(temp);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('evaluation-x-resume-')) throw Error('Unsafe synthetic cleanup');
    rmSync(absolute, { recursive: true, force: true });
  }
}
function resumeDay(day, responses) {
  return run(expressions(resume, { 'steps.get_month.outputs.month': '2026-09', 'steps.check_date.outputs.day': String(day) }), responses);
}
function outcome(day, values = {}, patch = {}) {
  return run(expressions(aggregate, { 'steps.check_date.outputs.should_run': 'true', 'steps.check_date.outputs.day': String(day),
    'steps.wake_x.outcome': 'success', 'steps.get_month.outcome': 'success', 'steps.x_batches.outcome': 'success',
    'steps.x_batches.outputs.failure_count': values.failure_count ?? '0', 'steps.x_batches.outputs.is_completed': values.is_completed ?? 'false', ...patch }));
}

test('X has an independent 120-minute job and a constant non-cancelling schedule/manual concurrency group', () => {
  assert.equal(/\nconcurrency:\r?\n  group: school-evaluation-monthly-resume\r?\n  cancel-in-progress: false/.test(workflow), true);
  assert.equal(/\n\s+needs:/.test(xJob), false); assert.equal(xJob.includes('timeout-minutes: 120'), true);
  assert.equal(xJob.includes('reset=true'), false); assert.equal(resume.includes('REQUEST<2'), true);
  assert.equal(resume.includes('sleep 1800'), true); assert.equal(xJob.includes('timeout-minutes: 95'), true);
  assert.equal(2 * 30 + 30, 90); assert.equal(5 + 1 + 4 + 1 + 95 < 120, true);
  const helper = readFileSync(new URL('../.github/scripts/evaluation-request.mjs', import.meta.url), 'utf8');
  assert.equal(helper.includes('AbortSignal.timeout(1800000)'), true);
});
test('one day resumes at most two requests with one 30-minute delay and no reset', () => {
  const r = resumeDay(1, [{}, {}]);
  assert.equal(r.status, 0); assert.equal(r.calls, 2); assert.equal(r.sleeps.length, 1); assert.equal(r.sleeps[0], '1800');
  assert.equal(r.arguments.includes('/api/auto-evaluate-x-only?month=2026-09'), true); assert.equal(r.arguments.includes('reset='), false);
  assert.equal(r.values.state, 'continue'); assert.equal(r.stdout.includes('SYNTHETIC_PRIVATE_X_RESPONSE'), false);
});
test('already complete progress stops after its first request with no wait', () => {
  const r = resumeDay(3, [{ completed: true }]);
  assert.equal(r.calls, 1); assert.equal(r.sleeps.length, 0); assert.equal(r.values.state, 'completed'); assert.equal(outcome(3, r.values).status, 0);
});
test('unfinished progress continues on days one through eight but fails on day nine', () => {
  for (let day = 1; day <= 8; day++) assert.equal(outcome(day).status, 0);
  assert.equal(outcome(9).status, 1); assert.equal(outcome(9, { is_completed: 'true' }).status, 0);
  const r = resumeDay(9, [{}, {}]); assert.equal(r.values.state, 'incomplete_day9'); assert.equal(outcome(9, r.values).status, 1);
});
test('partial errors always remain failures even if the second request completes the month', () => {
  const r = resumeDay(1, [{ errors: 2 }, { completed: true }]);
  assert.equal(r.calls, 2); assert.equal(r.values.failure_count, '2'); assert.equal(r.values.state, 'partial_error'); assert.equal(outcome(1, r.values).status, 1);
});
test('HTTP or invalid provider state stops without an automatic extra request', () => {
  for (const response of [{ httpFailure: true }, { requestFailed: true }]) {
    const r = resumeDay(1, [response]); assert.equal(r.calls, 1); assert.equal(r.sleeps.length, 0);
    assert.equal(r.values.state, 'request_failed'); assert.equal(outcome(1, r.values).status, 1);
  }
});
test('failed setup/request step cannot be mistaken for continuation success', () => {
  for (const key of ['steps.wake_x.outcome', 'steps.get_month.outcome', 'steps.x_batches.outcome']) assert.equal(outcome(1, {}, { [key]: 'failure' }).status, 1);
});
test('actual X date window accepts days one through nine, rejects day thirty and honors manual day', () => {
  for (const day of [1, 2, 9, 30]) {
    const r = run(`date(){ printf '%s\\n' '${day}'; };\n` + dateCheck);
    assert.equal(r.values.should_run, day <= 9 ? 'true' : 'false'); assert.equal(r.values.day, String(day));
  }
  const manual = run("date(){ printf '%s\\n' '30'; };\n" + dateCheck, [], { INPUT_DAY: '2' });
  assert.equal(manual.values.should_run, 'true'); assert.equal(manual.values.day, '2');
});
test('a synthetic 784-person saved progress can finish across daily requests without monthly reset', () => {
  let completed = 0, totalCalls = 0;
  for (let day = 1; day <= 9; day++) {
    const responses = [];
    for (let request = 0; request < 2; request++) {
      completed = Math.min(784, completed + 100); responses.push({ completed: completed === 784 });
      if (completed === 784) break;
    }
    const r = resumeDay(day, responses); totalCalls += r.calls;
    assert.equal(r.calls <= 2, true); assert.equal(outcome(day, r.values).status, 0); assert.equal(r.arguments.includes('reset='), false);
    if (r.values.is_completed === 'true') break;
  }
  assert.equal(completed, 784); assert.equal(totalCalls, 8);
});
