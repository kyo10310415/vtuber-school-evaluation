import type { PaymentData } from '../types';

const unpaidStatuses = new Set(['未払い（連絡なし）', '未払い（遅れ）', '未払い（期限切れ）']);

export async function fetchPaymentStatusFromManagement(
  baseUrl: string,
  readToken: string,
  evaluationMonth: string
): Promise<PaymentData[]> {
  if (!baseUrl || !readToken) throw new Error('支払い管理APIの接続設定がありません');
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(evaluationMonth) || evaluationMonth === '0001-01') {
    throw new Error('支払い評価の対象月が不正です');
  }

  const [year, month] = evaluationMonth.split('-').map(Number);
  const billingYear = String(month === 1 ? year - 1 : year).padStart(4, '0');
  const billingMonth = `${billingYear}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
  const url = new URL('/integrations/chatgpt/v1/query', baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('支払い管理APIの接続先には認証情報を含まないHTTPS URLが必要です');
  }
  url.searchParams.set('request', JSON.stringify({
    dataset: 'billing',
    month: billingMonth,
    filters: [{ field: 'status', op: 'contains', value: '未払い' }],
  }));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${readToken}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new Error('支払い管理APIに接続できませんでした');
  });
  if (!response.ok) throw new Error(`支払い管理APIの取得に失敗しました (HTTP ${response.status})`);

  const data = await response.json().catch(() => {
    throw new Error('支払い管理APIの応答がJSONではありません');
  });
  if (data?.version !== 1 || data.dataset !== 'billing' || data.truncated !== false || !Array.isArray(data.rows)) {
    throw new Error('支払い管理APIの応答形式が不正、または取得結果が上限を超えています');
  }

  const unpaidStudentIds = new Set<string>();
  for (const row of data.rows) {
    if (row?.month !== billingMonth || typeof row?.student_id !== 'string' || typeof row?.status !== 'string') {
      throw new Error('支払い管理APIの明細に不正な値が含まれています');
    }
    const studentId = row.student_id.trim();
    if (studentId && unpaidStatuses.has(row.status)) unpaidStudentIds.add(studentId);
  }
  return Array.from(unpaidStudentIds, studentId => ({ studentId, paymentStatus: 'unpaid', month: evaluationMonth }));
}
