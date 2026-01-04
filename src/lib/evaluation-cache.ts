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
 * キャッシュされた評価を取得
 */
export async function getCachedEvaluation(
  accessToken: string,
  cacheSpreadsheetId: string,
  studentId: string,
  month: string,
  evaluationType: 'youtube' | 'x'
): Promise<any | null> {
  try {
    const sheetName = evaluationType === 'youtube' ? 'youtube_cache' : 'x_cache'
    
    // シートのデータを取得
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cacheSpreadsheetId}/values/${encodeURIComponent(sheetName)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    
    if (!response.ok) {
      console.warn(`[Cache] Failed to fetch cache sheet: ${sheetName}`)
      return null
    }
    
    const data = await response.json()
    const rows = data.values || []
    
    if (rows.length < 2) {
      return null
    }
    
    const header = rows[0]
    const dataRows = rows.slice(1)
    
    // ヘッダーのインデックスを取得
    const studentIdIndex = header.findIndex((h: string) => h === '学籍番号')
    const monthIndex = header.findIndex((h: string) => h === '評価月')
    const dataIndex = header.findIndex((h: string) => h === '評価データ')
    const expiresAtIndex = header.findIndex((h: string) => h === '有効期限')
    
    if (studentIdIndex === -1 || monthIndex === -1 || dataIndex === -1) {
      return null
    }
    
    // 該当するキャッシュを検索
    for (const row of dataRows) {
      if (row[studentIdIndex] === studentId && row[monthIndex] === month) {
        // 有効期限チェック
        if (expiresAtIndex !== -1 && row[expiresAtIndex]) {
          const expiresAt = new Date(row[expiresAtIndex])
          if (expiresAt < new Date()) {
            console.log(`[Cache] Cache expired for ${studentId} ${month}`)
            continue
          }
        }
        
        // JSON文字列をパース
        try {
          const cachedData = JSON.parse(row[dataIndex])
          console.log(`[Cache] Cache hit for ${studentId} ${month}`)
          return cachedData
        } catch (e) {
          console.warn(`[Cache] Failed to parse cached data for ${studentId} ${month}`)
          return null
        }
      }
    }
    
    console.log(`[Cache] Cache miss for ${studentId} ${month}`)
    return null
  } catch (error: any) {
    console.error('[Cache] Error fetching cache:', error.message)
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
  try {
    const sheetName = evaluationType === 'youtube' ? 'youtube_cache' : 'x_cache'
    
    // 有効期限: 24時間後
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)
    
    const cachedAt = new Date().toISOString()
    
    // 評価データをJSON文字列化
    const dataJson = JSON.stringify(evaluationData)
    
    // 新しい行を追加
    const newRow = [
      studentId,
      studentName,
      month,
      dataJson,
      cachedAt,
      expiresAt.toISOString()
    ]
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cacheSpreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [newRow]
        })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Cache] Failed to save cache: ${errorText}`)
      return false
    }
    
    console.log(`[Cache] Saved cache for ${studentId} ${month}`)
    return true
  } catch (error: any) {
    console.error('[Cache] Error saving cache:', error.message)
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
      console.error(`[Cache] Failed to get spreadsheet info`)
      return false
    }
    
    const spreadsheetData = await checkResponse.json()
    const sheets = spreadsheetData.sheets || []
    const sheetExists = sheets.some((s: any) => s.properties.title === sheetName)
    
    // Step 2: シートが存在しない場合は作成
    if (!sheetExists) {
      console.log(`[Cache] Creating new sheet: ${sheetName}`)
      
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
        const errorText = await createResponse.text()
        console.error(`[Cache] Failed to create sheet: ${errorText}`)
        return false
      }
      
      console.log(`[Cache] Sheet created: ${sheetName}`)
    } else {
      console.log(`[Cache] Sheet already exists: ${sheetName}`)
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
      const errorText = await headerResponse.text()
      console.error(`[Cache] Failed to write header: ${errorText}`)
      return false
    }
    
    console.log(`[Cache] Initialized cache sheet: ${sheetName}`)
    return true
  } catch (error: any) {
    console.error('[Cache] Error initializing cache sheet:', error.message)
    return false
  }
}
