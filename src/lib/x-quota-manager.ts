/** X Post consumption comes from the provider counter, never student counts or a local month reset. */
export const APPLICATION_POST_CAP = 14000;
// evaluateXAccount currently reads at most one page of 100 Posts per uncached student.
export const X_POSTS_PER_STUDENT_BOUND = 100;

export interface QuotaStatus {
  month: string; // Legacy display only; it does not define or reset the provider period.
  status: 'known' | 'unknown';
  unit: 'posts';
  source: 'x_usage_api';
  periodSource: 'provider_counter';
  totalPosts: number | null;
  providerCap: number | null;
  applicationCap: number;
  effectiveCap: number | null;
  remainingQuota: number;
  resetDay: number | null;
  checkedAt: string;
  /** Deprecated: Post consumption must not be represented as estimated requests. */
  totalRequests: null;
  /** The provider response has no exact last-reset timestamp. */
  lastReset: null;
  reason?: 'missing-token' | 'unavailable' | 'malformed' | 'partial';
}
const SHEET_NAME = 'X_API_Quota';
const HEADERS = ['月', '総リクエスト数', '残りクォータ', '最終更新日時'];
function integer(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[0-9]+$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
export async function getQuotaStatus(bearerToken: string): Promise<QuotaStatus> {
  const checkedAt = new Date().toISOString();
  const base = {
    month: checkedAt.slice(0, 7), unit: 'posts' as const, source: 'x_usage_api' as const,
    periodSource: 'provider_counter' as const, applicationCap: APPLICATION_POST_CAP,
    checkedAt, totalRequests: null, lastReset: null
  };
  const unknown = (reason: QuotaStatus['reason']): QuotaStatus => ({
    ...base, status: 'unknown', totalPosts: null, providerCap: null, effectiveCap: null,
    remainingQuota: 0, resetDay: null, reason
  });
  if (typeof bearerToken !== 'string' || !bearerToken.trim()) return unknown('missing-token');
  try {
    const response = await fetch(
      'https://api.x.com/2/usage/tweets?days=1&usage.fields=project_usage,project_cap,cap_reset_day',
      { method: 'GET', headers: { Authorization: `Bearer ${bearerToken.trim()}` },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) }
    );
    if (!response.ok) return unknown('unavailable');
    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return unknown('malformed');
    if (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length > 0)) {
      return unknown(Array.isArray(body.errors) ? 'partial' : 'malformed');
    }
    const totalPosts = integer(body.data.project_usage);
    const providerCap = integer(body.data.project_cap);
    const resetDay = integer(body.data.cap_reset_day);
    if (totalPosts === null || providerCap === null || resetDay === null || resetDay < 1 || resetDay > 31) {
      return unknown('malformed');
    }
    const effectiveCap = Math.min(APPLICATION_POST_CAP, providerCap);
    return { ...base, status: 'known', totalPosts, providerCap, effectiveCap, resetDay,
      remainingQuota: Math.max(0, effectiveCap - totalPosts) };
  } catch {
    // Never expose the bearer token, provider account identifiers, or raw SDK/error details.
    return unknown('unavailable');
  }
}
/** Conservative estimate for uncached students; it is not a Post-to-student identity. */
export async function getAvailableStudentCount(bearerToken: string, totalStudents: number):
  Promise<{ canEvaluate: boolean; maxStudents: number; status: QuotaStatus }> {
  const status = await getQuotaStatus(bearerToken);
  const validCount = Number.isSafeInteger(totalStudents) && totalStudents >= 0;
  const maxStudents = status.status === 'known' && validCount
    ? Math.min(Math.floor(status.remainingQuota / X_POSTS_PER_STUDENT_BOUND), totalStudents) : 0;
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
