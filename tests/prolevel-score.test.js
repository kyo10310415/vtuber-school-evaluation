import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/evaluation.ts', import.meta.url), 'utf8');
const context = { module: { exports: {} } };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, context);
const { calculateOverallGrade } = context.module.exports;

test('perfect attendance, punctuality and payment still yield B with standard learning grades', () => {
  assert.equal(calculateOverallGrade({
    absence: 'S', lateness: 'S', payment: 'S',
    mission: 'B', activeListening: 'B', comprehension: 'B',
  }), 'B');
});

test('learning grades can raise or lower the overall grade with the same attendance and payment', () => {
  for (const grade of ['S', 'A', 'C']) {
    assert.equal(calculateOverallGrade({
      absence: 'S', lateness: 'S', payment: 'S',
      mission: grade, activeListening: grade, comprehension: grade,
    }), grade);
  }
});

test('attendance, punctuality and payment still affect the overall grade near a boundary', () => {
  assert.equal(calculateOverallGrade({
    absence: 'S', lateness: 'S', payment: 'S',
    mission: 'A', activeListening: 'B', comprehension: 'B',
  }), 'A');
  assert.equal(calculateOverallGrade({
    absence: 'S', lateness: 'S', payment: 'D',
    mission: 'A', activeListening: 'B', comprehension: 'B',
  }), 'B');
});

test('unassessed comprehension is omitted from the learning average and saved as a blank cell', () => {
  const scores = {
    absence: 'S', lateness: 'S', payment: 'S',
    mission: 'B', activeListening: 'B', comprehension: null,
  };
  const overallGrade = calculateOverallGrade(scores);
  assert.equal(overallGrade, 'B');
  const row = context.module.exports.convertResultToArray({ scores, overallGrade });
  assert.equal(row[8], '');
  assert.equal(row[9], 'B');
});
