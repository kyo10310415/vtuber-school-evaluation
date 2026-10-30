import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/daily-evaluation.yml', import.meta.url), 'utf8');
const lines = workflow.split(/\r?\n/);
function fragment(name) {
  const start = lines.findIndex(line => line.includes('- name: ' + name));
  const run = lines.findIndex((line, index) => index > start && line.trim() === 'run: |');
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.length - line.trimStart().length < 10) break;
    body.push(line.startsWith('          ') ? line.slice(10) : '');
  }
  return body.join('\n');
}
const common = fragment('Process ProLevel + YouTube evaluation batches');
const aggregate = fragment('Aggregate evaluation outcome');
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
function replaceExpressions(source, values) {
  return source.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_whole, expression) => {
    const [key, fallback] = expression.split('||').map(value => value.trim());
    return values[key] ?? (fallback ? fallback.replace(/^'|'$/g, '') : '');
  });
}
function run(script, responses = []) {
  const temp = mkdtempSync(join(tmpdir(), 'evaluation-partition-batches-'));
  const output = join(temp, 'github-output.txt'), countFile = join(temp, 'calls-count.txt'), callsFile = join(temp, 'calls.txt');
  writeFileSync(output, ''); writeFileSync(countFile, '0'); writeFileSync(callsFile, '');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEST_NODE: process.execPath.replace(/\\/g, '/'),
    TEST_RESPONSES: JSON.stringify(responses), TEST_COUNT: countFile.replace(/\\/g, '/'), TEST_CALLS: callsFile.replace(/\\/g, '/'),
    GITHUB_OUTPUT: output.replace(/\\/g, '/'), RUNNER_TEMP: temp.replace(/\\/g, '/') };
  const stubs = `
    node(){ local n=$(cat "$TEST_COUNT"); printf '%s' "$((n+1))" > "$TEST_COUNT"; printf '%s\n' "$*" >> "$TEST_CALLS";
      "$TEST_NODE" -e 'const all=JSON.parse(process.env.TEST_RESPONSES);const r=all[Number(process.argv[1])];if(!r)process.exit(1);console.log(JSON.stringify(r.invalid?{invalidResult:true}:{errorCount:r.errors||0}));console.log("HTTP_STATUS:"+r.status);if(r.status>=400||r.errors||r.invalid)process.exitCode=1;' "$n"; }
    jq(){ "$TEST_NODE" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const d=JSON.parse(s);console.log(d.invalidResult?1:d.errorCount)});'; }
    sleep(){ :; }
  `;
  try {
    const child = spawnSync(bash, ['-c', 'PATH=/usr/bin:/bin:$PATH\n' + stubs + script], { env, encoding: 'utf8', timeout: 15000 });
    const values = Object.fromEntries(readFileSync(output, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => line.split('=')));
    return { status: child.status, values, calls: Number(readFileSync(countFile, 'utf8')), arguments: readFileSync(callsFile, 'utf8'), stdout: child.stdout };
  } finally {
    const absolute = resolve(temp);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('evaluation-partition-batches-')) throw Error('Unsafe synthetic cleanup');
    rmSync(absolute, { recursive: true, force: true });
  }
}
function batches(total, responses) {
  return run(replaceExpressions(common, { 'steps.get_month.outputs.month': '2026-09', 'steps.check_date.outputs.day': '9', 'steps.batch_range.outputs.total_batches': String(total) }), responses);
}
test('actual common batch fragment starts all planned indices from zero without the old cap', () => {
  const r = batches(3, [{ status: 200 }, { status: 200 }, { status: 200 }]);
  assert.equal(r.status, 0); assert.equal(r.calls, 3); assert.equal(r.values.failure_count, '0');
  for (const index of [0, 1, 2]) assert.equal(r.arguments.includes('batchIndex=' + index), true);
  assert.equal(r.arguments.includes('/api/auto-evaluate/partition'), true); assert.equal(r.arguments.includes('skipEvaluated=false'), true);
});
test('zero plan never launches an evaluation request', () => {
  const r = batches(0, []); assert.equal(r.calls, 0); assert.equal(r.values.failure_count, '0');
});
test('provider result errors continue later batches and never repeat AI requests', () => {
  const r = batches(2, [{ status: 200, errors: 1 }, { status: 200 }]);
  assert.equal(r.calls, 2); assert.equal(r.values.failure_count, '1');
  const invalid = batches(1, [{ status: 200, invalid: true }]); assert.equal(invalid.calls, 1); assert.equal(invalid.values.failure_count, '1');
});
test('HTTP-only retry remains capped at three and later batches can continue', () => {
  const r = batches(2, [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 200 }]);
  assert.equal(r.calls, 4); assert.equal(r.values.failure_count, '1');
});
test('roster conflict stops immediately without retries or automatic restart', () => {
  const r = batches(3, [{ status: 409 }]);
  assert.equal(r.calls, 1); assert.equal(r.values.roster_changed, 'true'); assert.equal(r.values.failure_count, '1');
});
function outcome(patch = {}) {
  return run(replaceExpressions(aggregate, {
    'steps.check_date.outputs.should_run': 'true', 'steps.batch_range.outputs.plan_failed': 'false',
    'steps.common_batches.outcome': 'success', 'steps.common_batches.outputs.failure_count': '0',
    'steps.batch_range.outputs.invalid_active': '0', ...patch,
  }));
}
test('final aggregate distinguishes normal empty template from invalid records and any request errors', () => {
  assert.equal(outcome().status, 0);
  for (const patch of [{ 'steps.batch_range.outputs.plan_failed': 'true' }, { 'steps.batch_range.outputs.invalid_active': '1' },
    { 'steps.common_batches.outputs.failure_count': '1' }, { 'steps.common_batches.outcome': 'failure' }]) assert.equal(outcome(patch).status, 1);
});
test('common evaluation aggregation does not depend on the independent X job', () => {
  assert.equal(aggregate.includes('steps.x_batches'), false);
  assert.equal(aggregate.includes('steps.reset_x'), false);
  assert.equal(/\n  x-evaluation:\r?\n/.test(workflow), true);
  const xJob = workflow.slice(workflow.indexOf('  x-evaluation:'));
  assert.equal(/\n\s+needs:/.test(xJob), false);
  assert.equal(outcome({ 'steps.common_batches.outputs.failure_count': '1' }).status, 1);
});
