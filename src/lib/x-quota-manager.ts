/**
 * X API クォータ管理
 * Basic プラン: 15,000 Posts リクエスト/月
 * 
 * 重要: 1人あたりの消費は「ツイート取得のページネーション回数」
 * - 月100ツイート未満: 1リクエスト/人
 * - 月100ツイート以上: 2+リクエスト/人（ページネーション発生）
 * 
 * 対策: maxPages=1 に制限して1人あたり1リクエストに固定
 */

export interface QuotaStatus {
  month: string; // YYYY-MM
  totalRequests: number; // 月間総リクエスト数
  remainingQuota: number; // 残りクォータ
  lastReset: string; // 最終リセット日時
}

const MONTHLY_QUOTA = 15000; // Basic プラン
const SAFETY_MARGIN = 1000; // 安全マージン（13%）
const USABLE_QUOTA = MONTHLY_QUOTA - SAFETY_MARGIN; // 14,000

/**
 * 月間クォータの残量を取得
 */
export async function getQuotaStatus(
  accessToken: string,
  spreadsheetId: string
): Promise<QuotaStatus> {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  try {
    // スプレッドシートから使用量を取得
    const sheetName = 'X_API_Quota';
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (!response.ok) {
      // シートが存在しない場合は初期化
      return {
        month: currentMonth,
        totalRequests: 0,
        remainingQuota: USABLE_QUOTA,
        lastReset: new Date().toISOString()
      };
    }
    
    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length < 2) {
      return {
        month: currentMonth,
        totalRequests: 0,
        remainingQuota: USABLE_QUOTA,
        lastReset: new Date().toISOString()
      };
    }
    
    // ヘッダー行をスキップ
    const latestRow = rows[rows.length - 1];
    const [month, totalRequests, , lastReset] = latestRow;
    
    // 月が変わった場合はリセット
    if (month !== currentMonth) {
      return {
        month: currentMonth,
        totalRequests: 0,
        remainingQuota: USABLE_QUOTA,
        lastReset: new Date().toISOString()
      };
    }
    
    return {
      month,
      totalRequests: parseInt(totalRequests) || 0,
      remainingQuota: USABLE_QUOTA - (parseInt(totalRequests) || 0),
      lastReset
    };
  } catch (error) {
    console.error('[X Quota] Failed to get quota status:', error);
    return {
      month: currentMonth,
      totalRequests: 0,
      remainingQuota: USABLE_QUOTA,
      lastReset: new Date().toISOString()
    };
  }
}

/**
 * クォータ使用量を記録
 */
export async function recordQuotaUsage(
  accessToken: string,
  spreadsheetId: string,
  requestCount: number
): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const timestamp = new Date().toISOString();
  
  try {
    const status = await getQuotaStatus(accessToken, spreadsheetId);
    const newTotal = status.totalRequests + requestCount;
    
    // スプレッドシートに記録
    const sheetName = 'X_API_Quota';
    const values = [
      [currentMonth, newTotal, USABLE_QUOTA - newTotal, timestamp]
    ];
    
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      }
    );
    
    console.log(`[X Quota] Recorded ${requestCount} requests. Total: ${newTotal}/${USABLE_QUOTA}`);
  } catch (error) {
    console.error('[X Quota] Failed to record quota usage:', error);
  }
}

/**
 * クォータをチェックして評価可能な生徒数を計算
 */
export async function getAvailableStudentCount(
  accessToken: string,
  spreadsheetId: string,
  totalStudents: number
): Promise<{ canEvaluate: boolean; maxStudents: number; status: QuotaStatus }> {
  const status = await getQuotaStatus(accessToken, spreadsheetId);
  
  // 1人あたり1リクエスト（ツイート取得のみ、ユーザー情報は別枠）
  const maxStudents = Math.floor(status.remainingQuota / 1);
  
  return {
    canEvaluate: status.remainingQuota > 0 && maxStudents > 0,
    maxStudents: Math.min(maxStudents, totalStudents),
    status
  };
}

/**
 * クォータ管理シートを初期化
 */
export async function initializeQuotaSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  try {
    const sheetName = 'X_API_Quota';
    
    // シートを作成
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName
                }
              }
            }
          ]
        })
      }
    );
    
    // ヘッダー行を追加
    const values = [
      ['月', '総リクエスト数', '残りクォータ', '最終更新日時']
    ];
    
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:D1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      }
    );
    
    console.log('[X Quota] Quota sheet initialized');
  } catch (error) {
    console.error('[X Quota] Failed to initialize quota sheet:', error);
  }
}
