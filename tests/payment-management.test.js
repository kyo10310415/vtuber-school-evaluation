import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/payment-management.ts', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const origin = 'https://payments.example';
const token = 'synthetic-payment-service-read-token';
const month = '2026-01';

function fixture(response) {
  const requests = [];
  const context = { module: { exports: {} }, URL, AbortSignal, fetch: async (url, options) => {
    requests.push({ url, options });
    return response;
  } };
  vm.runInNewContext(code, context);
  return { request: context.module.exports.fetchPaymentStatusFromManagement, requests };
}

const report = (rows, truncated = false) => ({ ok: true, json: async () => ({
  version: 1, dataset: 'billing', rows, truncated,
}) });

test('reads previous billing month with bearer auth and only returns explicit unpaid students', async () => {
  const payment = (studentId, status) => ({ student_id: studentId, month: '2025-12', status });
  const f = fixture(report([
    payment('A', '未払い（連絡なし）'), payment('B', '未払い（遅れ）'),
    payment('C', '未払い（期限切れ）'), payment('A', '未払い（遅れ）'),
    payment('D', '一部入金'), payment('E', '未確認'), payment('', '未払い（遅れ）'),
  ]));
  const result = JSON.parse(JSON.stringify(await f.request(origin, token, month)));
  assert.deepEqual(result, ['A', 'B', 'C'].map(studentId => ({ studentId, paymentStatus: 'unpaid', month })));
  const [{ url, options }] = f.requests;
  assert.equal(url.pathname, '/integrations/chatgpt/v1/query');
  assert.deepEqual(JSON.parse(url.searchParams.get('request')), {
    dataset: 'billing', month: '2025-12', filters: [{ field: 'status', op: 'contains', value: '未払い' }],
  });
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.redirect, 'error');
});

test('unavailable, incomplete or wrong-month payment data fails the evaluation lookup', async () => {
  for (const [response, error] of [
    [{ ok: false, status: 401 }, /HTTP 401/],
    [report([], true), /上限/],
    [report([{ month, student_id: 'A', status: '未払い（遅れ）' }]), /明細に不正/],
  ]) {
    const f = fixture(response);
    await assert.rejects(() => f.request(origin, token, month), error);
  }
  const f = fixture(report([]));
  await assert.rejects(() => f.request(origin, '', month), /接続設定/);
  assert.equal(f.requests.length, 0);
});
