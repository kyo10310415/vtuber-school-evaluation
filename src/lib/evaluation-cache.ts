/**
 * YouTube/X評価結果キャッシュ管理
 * スプレッドシートに評価結果を保存・取得することで、APIクォータを節約
 */

export interface CachedEvaluation {
  studentId: string
  month: string
  evaluationType: 'youtube' | 'x'
  evaluationData: any
  cachedAt: string
  expiresAt: string
}

/**
 * 前月を計算（YYYY-MM形式）
 */
export function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(year, monthNum - 1, 1);
  date.setMonth(date.getMonth() - 1);
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${prevYear}-${prevMonth}`;
}

// Scheduled jobs share one snapshot per sheet within each request.
export async function loadEvaluationSheetRows(
  accessToken: string, spreadsheetId: string, sheetName: string
): Promise<any[][]> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await response.json()
  if (!response.ok) {
    if (response.status === 400 && data.error?.message?.startsWith('Unable to parse range:')) return []
    console.warn('[Cache] Evaluation sheet read failed, HTTP', response.status)
    throw new Error('Evaluation sheet unavailable')
  }
  if (Array.isArray(data.values)) return data.values
  if (data.values === undefined && typeof data.range === 'string') return []
  throw new Error('Invalid evaluation sheet response')
}

/**
 * キャッシュされた評価を取得
 */
export async function getCachedEvaluation(
  accessToken: string,
  cacheSpreadsheetId: string,
  studentId: string,
  month: string,
  evaluationType: 'youtube' | 'x',
  snapshot?: any[][]
): Promise<any | null> {
  try {
    const sheetName = evaluationType === 'youtube' ? 'youtube_cache' : 'x_cache'
    
    const rows = snapshot ?? await loadEvaluationSheetRows(accessToken, cacheSpreadsheetId, sheetName)

    if (rows.length < 2) {
      return null
    }
    
    const header = rows[0]
    const dataRows = rows.slice(1)
    
    // ヘッダーのインデックスを取得
    const studentIdIndex = header.findIndex((h: string) => h === '学籍番号')
    const monthIndex = header.findIndex((h: string) => h === '評価月')
    const dataIndex = header.findIndex((h: string) => h === '評価データ')
    // 有効期限は月次レポートで過去データを表示するために無視（expiresAtIndexは不要）
    
    if (studentIdIndex === -1 || monthIndex === -1 || dataIndex === -1) {
      return null
    }
    
    // 該当するキャッシュを検索（複数ある場合は最新の完全データを使用）
    let latestCachedData = null
    let latestCachedAt = null
    
    for (const row of dataRows) {
      if (row[studentIdIndex] === studentId && row[monthIndex] === month) {
        // ✅ 有効期限チェックを削除（月次レポートで過去データを表示するため）
        // スプレッドシートにデータがある限り、常に利用可能
        
        // JSON文字列をパース
        try {
          const cachedData = JSON.parse(row[dataIndex])
          const cachedAt = row[header.findIndex((h: string) => h === 'キャッシュ日時')] || ''
          
          // Keep cache diagnostics free of identifiers and evaluation payloads.
          console.log('[Cache] Matching cache row found')
          
          // ✅ 不完全なデータは候補から除外（YouTube/X評価の場合）
          let isIncomplete = false
          
          if (evaluationType === 'youtube') {
            isIncomplete = cachedData.videosInMonth === 0 || 
                          cachedData.subscriberCount === 0 || 
                          cachedData.totalViews === 0;
            if (isIncomplete) {
              console.log('[Cache] Incomplete YouTube cache skipped')
              continue  // 不完全データは候補から除外
            }
          }
          
          if (evaluationType === 'x') {
            isIncomplete = cachedData.tweetsInMonth === 0 && cachedData.followersCount === 0;
            if (isIncomplete) {
              console.log('[Cache] Incomplete X cache skipped')
              continue  // 不完全データは候補から除外
            }
          }
          
          // ✅ 完全データの中から最新（キャッシュ日時が最も新しい）を保持
          if (!latestCachedAt || cachedAt > latestCachedAt) {
            latestCachedData = cachedData
            latestCachedAt = cachedAt
            console.log('[Cache] Complete cache candidate found')
          }
        } catch (e) {
          console.warn('[Cache] Cached data parse failed')
        }
      }
    }
    
    if (latestCachedData) {
      console.log('[Cache] Cache hit')
      
      // Record the cache phase without individual metrics.
      if (evaluationType === 'youtube') {
        console.log('[Cache] YouTube cache loaded')
      } else if (evaluationType === 'x') {
        console.log('[Cache] X cache loaded')
      }
      
      return latestCachedData
    }
    
    console.log('[Cache] Cache miss')
    return null
  } catch (error: any) {
    console.error('[Cache] Cache lookup failed')
    return null
  }
}

/**
 * 評価結果をキャッシュに保存
 */
export async function saveCachedEvaluation(
  accessToken: string,
  cacheSpreadsheetId: string,
  studentId: string,
  studentName: string,
  month: string,
  evaluationType: 'youtube' | 'x',
  evaluationData: any
): Promise<boolean> {
  return saveCachedEvaluations(accessToken, cacheSpreadsheetId, month, evaluationType,
    [{ studentId, studentName, evaluationData }])
}

export async function saveCachedEvaluations(
  accessToken: string,
  cacheSpreadsheetId: string,
  month: string,
  evaluationType: 'youtube' | 'x',
  evaluations: { studentId: string; studentName: string; evaluationData: any }[]
): Promise<boolean> {
  if (evaluations.length === 0) return true
  try {
    const sheetName = evaluationType === 'youtube' ? 'youtube_cache' : 'x_cache'
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 90)
    const cachedAt = new Date().toISOString()
    const values = evaluations.map(({ studentId, studentName, evaluationData }) =>
      [studentId, studentName, month, JSON.stringify(evaluationData), cachedAt, expiresAt.toISOString()])
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cacheSpreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values
        })
      }
    )
    
    if (!response.ok) {
      await response.text()
      console.error('[Cache] Cache save request failed')
      return false
    }
    
    console.log('[Cache] Cache saved')
    return true
  } catch (error: any) {
    console.error('[Cache] Cache save failed')
    return false
  }
}

/**
 * キャッシュシートを初期化（シートが存在しない場合は作成し、ヘッダー行を作成）
 */
export async function initializeCacheSheet(
  accessToken: string,
  cacheSpreadsheetId: string,
  evaluationType: 'youtube' | 'x'
): Promise<boolean> {
  try {
    const sheetName = evaluationType === 'youtube' ? 'youtube_cache' : 'x_cache'
    
    // Step 1: シートが存在するか確認
    const checkResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cacheSpreadsheetId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    
    if (!checkResponse.ok) {
      console.error('[Cache] Cache spreadsheet lookup failed')
      return false
    }
    
    const spreadsheetData = await checkResponse.json()
    const sheets = spreadsheetData.sheets || []
    const sheetExists = sheets.some((s: any) => s.properties.title === sheetName)
    
    // Step 2: シートが存在しない場合は作成
    if (!sheetExists) {
      console.log('[Cache] Creating cache sheet')
      
      const createResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${cacheSpreadsheetId}:batchUpdate`,
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
      )
      
      if (!createResponse.ok) {
        await createResponse.text()
        console.error('[Cache] Cache sheet creation request failed')
        return false
      }
      
      console.log('[Cache] Cache sheet created')
    } else {
      console.log('[Cache] Cache sheet already exists')
    }
    
    // Step 3: ヘッダー行を書き込み
    const header = [
      '学籍番号',
      '氏名',
      '評価月',
      '評価データ',
      'キャッシュ日時',
      '有効期限'
    ]
    
    const headerResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cacheSpreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:F1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [header]
        })
      }
    )
    
    if (!headerResponse.ok) {
      await headerResponse.text()
      console.error('[Cache] Cache header write request failed')
      return false
    }
    
    console.log('[Cache] Cache sheet initialized')
    return true
  } catch (error: any) {
    console.error('[Cache] Cache sheet initialization failed')
    return false
  }
}
