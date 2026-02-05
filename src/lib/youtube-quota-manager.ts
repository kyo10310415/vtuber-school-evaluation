/**
 * YouTube Data API v3 クォータ管理
 * 日次制限: 10,000ユニット/日
 * 
 * 消費量の計算:
 * - チャンネル情報取得: 1ユニット
 * - 動画検索: 100ユニット
 * - 動画詳細取得: 1ユニット/動画
 * 
 * 1人あたり平均: 約121ユニット
 * (チャンネル1 + 検索100 + 動画詳細20)
 */

export interface YouTubeQuotaStatus {
  date: string; // YYYY-MM-DD
  totalUnits: number; // 日次総消費ユニット
  remainingQuota: number; // 残りクォータ
  lastReset: string; // 最終リセット日時
}

const DAILY_QUOTA = 10000; // YouTube Data API v3 日次制限
const SAFETY_MARGIN = 1000; // 安全マージン（10%）
const USABLE_QUOTA = DAILY_QUOTA - SAFETY_MARGIN; // 9,000

const UNITS_PER_STUDENT = 121; // 1人あたりの平均消費ユニット

/**
 * 日次クォータの残量を取得
 */
export async function getYouTubeQuotaStatus(
  accessToken: string,
  spreadsheetId: string
): Promise<YouTubeQuotaStatus> {
  const currentDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  try {
    // スプレッドシートから使用量を取得
    const sheetName = 'YouTube_API_Quota';
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (!response.ok) {
      // シートが存在しない場合は初期化
      return {
        date: currentDate,
        totalUnits: 0,
        remainingQuota: USABLE_QUOTA,
        lastReset: new Date().toISOString()
      };
    }
    
    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length < 2) {
      return {
        date: currentDate,
        totalUnits: 0,
        remainingQuota: USABLE_QUOTA,
        lastReset: new Date().toISOString()
      };
    }
    
    // ヘッダー行をスキップ
    const latestRow = rows[rows.length - 1];
    const [date, totalUnits, , lastReset] = latestRow;
    
    // 日付が変わった場合はリセット
    if (date !== currentDate) {
      return {
        date: currentDate,
        totalUnits: 0,
        remainingQuota: USABLE_QUOTA,
        lastReset: new Date().toISOString()
      };
    }
    
    return {
      date,
      totalUnits: parseInt(totalUnits) || 0,
      remainingQuota: USABLE_QUOTA - (parseInt(totalUnits) || 0),
      lastReset
    };
  } catch (error) {
    console.error('[YouTube Quota] Failed to get quota status:', error);
    return {
      date: currentDate,
      totalUnits: 0,
      remainingQuota: USABLE_QUOTA,
      lastReset: new Date().toISOString()
    };
  }
}

/**
 * クォータ使用量を記録
 */
export async function recordYouTubeQuotaUsage(
  accessToken: string,
  spreadsheetId: string,
  units: number
): Promise<void> {
  const currentDate = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();
  
  try {
    const status = await getYouTubeQuotaStatus(accessToken, spreadsheetId);
    const newTotal = status.totalUnits + units;
    
    // スプレッドシートに記録
    const sheetName = 'YouTube_API_Quota';
    const values = [
      [currentDate, newTotal, USABLE_QUOTA - newTotal, timestamp]
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
    
    console.log(`[YouTube Quota] Recorded ${units} units. Total: ${newTotal}/${USABLE_QUOTA}`);
  } catch (error) {
    console.error('[YouTube Quota] Failed to record quota usage:', error);
  }
}

/**
 * クォータをチェックして評価可能な生徒数を計算
 */
export async function getAvailableYouTubeStudentCount(
  accessToken: string,
  spreadsheetId: string,
  totalStudents: number
): Promise<{ canEvaluate: boolean; maxStudents: number; status: YouTubeQuotaStatus }> {
  const status = await getYouTubeQuotaStatus(accessToken, spreadsheetId);
  
  // 1人あたり121ユニット消費
  const maxStudents = Math.floor(status.remainingQuota / UNITS_PER_STUDENT);
  
  return {
    canEvaluate: status.remainingQuota > 0 && maxStudents > 0,
    maxStudents: Math.min(maxStudents, totalStudents),
    status
  };
}

/**
 * クォータ管理シートを初期化
 */
export async function initializeYouTubeQuotaSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  try {
    const sheetName = 'YouTube_API_Quota';
    
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
      ['日付', '総消費ユニット', '残りクォータ', '最終更新日時']
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
    
    console.log('[YouTube Quota] Quota sheet initialized');
  } catch (error) {
    console.error('[YouTube Quota] Failed to initialize quota sheet:', error);
  }
}
