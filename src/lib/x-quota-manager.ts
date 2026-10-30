/** Monthly usage is authoritative only with a valid current-month record. */
export interface QuotaStatus {
  month: string;
  status: 'known' | 'unknown';
  totalRequests: number | null;
  remainingQuota: number;
  lastReset: string | null;
  reason?: 'unavailable' | 'empty' | 'malformed' | 'stale-month';
}
const USABLE_QUOTA = 14000;
const SHEET_NAME = 'X_API_Quota';
const HEADERS = ['月', '総リクエスト数', '残りクォータ', '最終更新日時'];
const unknown = (month: string, reason: QuotaStatus['reason']): QuotaStatus => ({
  month, status: 'unknown', totalRequests: null, remainingQuota: 0, lastReset: null, reason
});
function integer(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
export async function getQuotaStatus(accessToken: string, spreadsheetId: string): Promise<QuotaStatus> {
  const month = new Date().toISOString().slice(0, 7);
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(SHEET_NAME)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) return unknown(month, 'unavailable');
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return unknown(month, 'malformed');
    const rows = data.values;
    if (rows === undefined || (Array.isArray(rows) && rows.length === 0)) return unknown(month, 'empty');
    if (!Array.isArray(rows) || !Array.isArray(rows[0]) || HEADERS.some((header, i) => rows[0][i] !== header)) return unknown(month, 'malformed');
    if (rows.length < 2) return unknown(month, 'empty');
    const latest = rows[rows.length - 1];
    if (!Array.isArray(latest) || latest.length !== 4) return unknown(month, 'malformed');
    const [recordMonth, count, remaining, timestamp] = latest;
    const totalRequests = integer(count);
    if (typeof recordMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(recordMonth) ||
        totalRequests === null || totalRequests < 0 || integer(remaining) !== USABLE_QUOTA - totalRequests ||
        typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return unknown(month, 'malformed');
    if (recordMonth !== month) return unknown(month, 'stale-month');
    return { month, status: 'known', totalRequests, remainingQuota: Math.max(0, USABLE_QUOTA - totalRequests), lastReset: timestamp };
  } catch {
    console.error('[X Quota] Status unavailable');
    return unknown(month, 'unavailable');
  }
}
/** Failed accounting must not be reported as success. */
export async function recordQuotaUsage(accessToken: string, spreadsheetId: string, requestCount: number): Promise<void> {
  if (!Number.isSafeInteger(requestCount) || requestCount < 0) throw new Error('X quota count invalid');
  const status = await getQuotaStatus(accessToken, spreadsheetId);
  if (status.status !== 'known' || status.totalRequests === null) throw new Error('X quota usage unknown');
  const newTotal = status.totalRequests + requestCount;
  if (!Number.isSafeInteger(newTotal)) throw new Error('X quota count invalid');
  if (requestCount === 0) return;
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(SHEET_NAME)}:append?valueInputOption=RAW`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[status.month, newTotal, USABLE_QUOTA - newTotal, new Date().toISOString()]] }) }
    );
    if (!response.ok) throw new Error('Append rejected');
  } catch { throw new Error('X quota usage recording failed'); }
  console.log('[X Quota] Usage recorded');
}
export async function getAvailableStudentCount(accessToken: string, spreadsheetId: string, totalStudents: number):
  Promise<{ canEvaluate: boolean; maxStudents: number; status: QuotaStatus }> {
  const status = await getQuotaStatus(accessToken, spreadsheetId);
  const maxStudents = status.status === 'known' ? Math.min(status.remainingQuota, totalStudents) : 0;
  return { canEvaluate: maxStudents > 0, maxStudents, status };
}
/** Create missing structure only; never replace existing records or invent zero usage. */
export async function initializeQuotaSheet(accessToken: string, spreadsheetId: string): Promise<void> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  try {
    const metadata = await fetch(`${base}?fields=sheets.properties.title`, { headers });
    if (!metadata.ok) throw new Error('Metadata unavailable');
    const data = await metadata.json();
    if (!data || !Array.isArray(data.sheets) || data.sheets.some((sheet: any) => typeof sheet?.properties?.title !== 'string')) throw new Error('Metadata invalid');
    if (data.sheets.some((sheet: any) => sheet.properties.title === SHEET_NAME)) {
      // Inspect the entire used range: blank leading cells do not prove an empty sheet.
      const existing = await fetch(`${base}/values/${encodeURIComponent(SHEET_NAME)}`, { headers });
      if (!existing.ok) throw new Error('Existing sheet unavailable');
      const content = await existing.json();
      if (!content || typeof content !== 'object' || Array.isArray(content) ||
          (!Array.isArray(content.values) && !(content.values === undefined && typeof content.range === 'string'))) {
        throw new Error('Existing sheet invalid');
      }
      const rows = content.values || [];
      if (rows.length > 0) {
        if (!Array.isArray(rows[0]) || HEADERS.some((header, i) => rows[0][i] !== header)) throw new Error('Existing header invalid');
        return;
      }
      // A previously created but completely empty tab can safely recover its header.
    } else {
      const created = await fetch(`${base}:batchUpdate`, {
        method: 'POST', headers, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] })
      });
      if (!created.ok) throw new Error('Create rejected');
    }
    const written = await fetch(`${base}/values/${encodeURIComponent(SHEET_NAME)}!A1:D1?valueInputOption=RAW`, {
      method: 'PUT', headers, body: JSON.stringify({ values: [HEADERS] })
    });
    if (!written.ok) throw new Error('Headers rejected');
    console.log('[X Quota] Sheet structure created');
  } catch { throw new Error('X quota sheet initialization failed'); }
}
