import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const lines = readFileSync(new URL('../.github/workflows/daily-evaluation.yml', import.meta.url), 'utf8').split(/\r?\n/);
function fragment(name) {
  const start = lines.findIndex(line => line.includes('- name: ' + name));
  assert.ok(start >= 0);
  const run = lines.findIndex((line, index) => index > start && line.trim() === 'run: |');
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.length - line.trimStart().length < 10) break;
    body.push(line.startsWith('          ') ? line.slice(10) : '');
  }
  return body.join('\n');
}
const dateCheck = fragment('Check if within first 9 days of month');
const batchRange = fragment('Calculate batch range for today');
const xDayCheck = fragment('Check if Day 1 for X evaluation');
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
function runFragments(today, manualDay) {
  const temp = mkdtempSync(join(tmpdir(), 'evaluation-workflow-day-'));
  const output = join(temp, 'github-output.txt'); writeFileSync(output, '');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, INPUT_DAY: manualDay, INPUT_MONTH: '2026-09', GITHUB_OUTPUT: output.replace(/\\/g, '/') };
  function execute(script) {
    const child = spawnSync(bash, ['-c', 'PATH=/usr/bin:/bin:$PATH\n' + script], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0);
    return Object.fromEntries(readFileSync(output, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => line.split('=')));
  }
  try {
    let values = execute(`date(){ printf '%s\\n' '${today}'; };\n` + dateCheck);
    if (values.should_run !== 'true') return { ...values, loopIterations: 0, batchSkipped: true };
    values = execute(batchRange.replaceAll('${{ steps.check_date.outputs.day }}', values.day));
    values = execute(xDayCheck.replaceAll('${{ steps.check_date.outputs.day }}', values.day));
    return { ...values, loopIterations: Math.max(0, Number(values.end_batch) - Number(values.start_batch) + 1), batchSkipped: false };
  } finally {
    const absolute = resolve(temp);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('evaluation-workflow-day-')) throw new Error('Synthetic cleanup target outside temporary directory');
    rmSync(absolute, { recursive: true, force: true });
  }
}
for (const c of [
  { name: 'normal day 1', today: '01', manual: '', day: '1', run: 'true', start: '0', end: '15', loops: 16, x: 'true' },
  { name: 'normal day 2', today: '02', manual: '', day: '2', run: 'true', start: '16', end: '30', loops: 15, x: 'false' },
  { name: 'normal day 9 preserves existing configured batch cap', today: '09', manual: '', day: '9', run: 'true', start: '128', end: '30', loops: 0, x: 'false' },
  { name: 'normal day 30 skips business branches', today: '30', manual: '', day: '30', run: 'false', loops: 0 },
  { name: 'manual day 1 overrides calendar day 30 for range and X branch', today: '30', manual: '1', day: '1', run: 'true', start: '0', end: '15', loops: 16, x: 'true' },
  { name: 'manual day 2 overrides calendar day 30 for range', today: '30', manual: '2', day: '2', run: 'true', start: '16', end: '30', loops: 15, x: 'false' },
]) {
  test('actual isolated Bash workflow fragments: ' + c.name, () => {
    const result = runFragments(c.today, c.manual);
    assert.equal(result.day, c.day); assert.equal(result.should_run, c.run); assert.equal(result.loopIterations, c.loops);
    assert.equal(result.start_batch, c.start); assert.equal(result.end_batch, c.end); assert.equal(result.is_day1, c.x);
    assert.equal(result.batchSkipped, c.run === 'false');
  });
}
