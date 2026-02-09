/**
 * 週次アナリティクスデータをスプレッドシートに書き込む
 */

/**
 * 所属生一覧シートを更新
 */
export async function updateStudentListSheet(
  accessToken: string,
  spreadsheetId: string,
  students: Array<{
    name: string;
    studentId: string;
    channelId: string;
    data: {
      shorts: any;
      regular: any;
      live: any;
      overall: any;
    };
  }>,
  weekLabel: string // 例: "2026-02-03~2026-02-09"
): Promise<void> {
  const sheetName = '所属生一覧';
  
  try {
    // シートが存在するか確認、なければ作成
    await ensureSheetExists(accessToken, spreadsheetId, sheetName);
    
    // 既存のヘッダーを取得
    const headerResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:ZZ1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    let headers: string[] = ['名前', '学籍番号'];
    let weekColumnIndex = -1;
    
    if (headerResponse.ok) {
      const headerData = await headerResponse.json();
      if (headerData.values && headerData.values[0]) {
        headers = headerData.values[0];
        weekColumnIndex = headers.indexOf(weekLabel);
      }
    }
    
    // 週のラベルがヘッダーになければ追加
    if (weekColumnIndex === -1) {
      weekColumnIndex = headers.length;
      headers.push(weekLabel);
      
      // ヘッダー行を更新
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:${getColumnLetter(headers.length)}1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [headers],
          }),
        }
      );
    }
    
    // 既存のデータを取得
    const dataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:B1000`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const existingData: string[][] = [];
    if (dataResponse.ok) {
      const data = await dataResponse.json();
      if (data.values) {
        existingData.push(...data.values);
      }
    }
    
    // 各生徒のデータを更新
    for (const student of students) {
      const rowIndex = existingData.findIndex(row => row[1] === student.studentId);
      const dataValue = formatStudentDataForList(student.data);
      
      if (rowIndex === -1) {
        // 新しい行を追加
        const newRowIndex = existingData.length + 2; // +2 because of header and 1-based index
        const columnLetter = getColumnLetter(weekColumnIndex + 1);
        
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A${newRowIndex}:${columnLetter}${newRowIndex}?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [[student.name, student.studentId, ...Array(weekColumnIndex - 2).fill(''), dataValue]],
            }),
          }
        );
        
        existingData.push([student.name, student.studentId]);
      } else {
        // 既存の行を更新
        const actualRowIndex = rowIndex + 2;
        const columnLetter = getColumnLetter(weekColumnIndex + 1);
        
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${columnLetter}${actualRowIndex}?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [[dataValue]],
            }),
          }
        );
      }
    }
    
    console.log(`[WeeklySpreadsheet] Updated ${sheetName} with ${students.length} students`);
  } catch (error: any) {
    console.error('[WeeklySpreadsheet] Failed to update student list:', error.message);
    throw error;
  }
}

/**
 * 個人データシートを更新（チャンネル名のシート）
 */
export async function updateIndividualSheet(
  accessToken: string,
  spreadsheetId: string,
  studentName: string,
  channelName: string,
  data: {
    shorts: any;
    regular: any;
    live: any;
    overall: any;
  },
  weekLabel: string
): Promise<void> {
  // チャンネル名をシート名として使用（Googleスプレッドシートの制限に合わせる）
  const sheetName = sanitizeSheetName(channelName);
  
  try {
    // シートが存在するか確認、なければ作成
    await ensureSheetExists(accessToken, spreadsheetId, sheetName);
    
    // 既存のヘッダーを取得（B1以降）
    const headerResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!B1:ZZ1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    let weekHeaders: string[] = [];
    if (headerResponse.ok) {
      const headerData = await headerResponse.json();
      if (headerData.values && headerData.values[0]) {
        weekHeaders = headerData.values[0];
      }
    }
    
    // 新しい週のラベルを追加
    const newColumnIndex = weekHeaders.length + 2; // +2 because B is column 2
    weekHeaders.push(weekLabel);
    
    // ヘッダー行を更新
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!B1:${getColumnLetter(newColumnIndex)}1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [weekHeaders],
        }),
      }
    );
    
    // データ項目とデータをA列と新しい列に書き込み
    const dataItems = buildIndividualDataRows(data);
    const rows = dataItems.map(item => [item.label, ...Array(weekHeaders.length - 1).fill(''), item.value]);
    
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:${getColumnLetter(newColumnIndex)}${dataItems.length + 1}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows,
        }),
      }
    );
    
    console.log(`[WeeklySpreadsheet] Updated ${sheetName} for ${studentName}`);
  } catch (error: any) {
    console.error(`[WeeklySpreadsheet] Failed to update individual sheet for ${studentName}:`, error.message);
    throw error;
  }
}

/**
 * シートが存在するか確認し、なければ作成
 */
async function ensureSheetExists(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // スプレッドシートのメタデータを取得
  const metadataResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  if (!metadataResponse.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${metadataResponse.status}`);
  }
  
  const metadata = await metadataResponse.json();
  const sheets = metadata.sheets || [];
  const sheetExists = sheets.some((s: any) => s.properties.title === sheetName);
  
  if (!sheetExists) {
    // シートを作成
    const createResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        }),
      }
    );
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create sheet: ${createResponse.status}`);
    }
    
    console.log(`[WeeklySpreadsheet] Created sheet: ${sheetName}`);
  }
}

/**
 * 列番号を列文字（A, B, C, ... Z, AA, AB, ...）に変換
 */
function getColumnLetter(columnNumber: number): string {
  let letter = '';
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return letter;
}

/**
 * シート名をサニタイズ（Googleスプレッドシートの制限に合わせる）
 */
function sanitizeSheetName(name: string): string {
  // スプレッドシートのシート名制限: 最大100文字、特殊文字を除外
  return name
    .replace(/[\/\\\?\*\[\]]/g, '_') // 特殊文字を_に置換
    .substring(0, 100); // 最大100文字
}

/**
 * 所属生一覧用のデータをフォーマット
 */
function formatStudentDataForList(data: any): string {
  const { overall } = data;
  return `Views: ${overall.totalViews || 0} | Likes: ${overall.totalLikes || 0} | Subs: ${overall.netSubscribers || 0}`;
}

/**
 * 個人データシート用のデータ行を構築
 */
function buildIndividualDataRows(data: any): Array<{ label: string; value: string | number }> {
  const { shorts, regular, live, overall } = data;
  
  return [
    // Overall metrics
    { label: '総視聴回数', value: overall.totalViews || 0 },
    { label: '総視聴時間（分）', value: overall.totalWatchTime || 0 },
    { label: '総高評価数', value: overall.totalLikes || 0 },
    { label: '純登録者数', value: overall.netSubscribers || 0 },
    
    // Shorts metrics
    { label: 'Shorts: 視聴回数', value: shorts.metrics?.views || 0 },
    { label: 'Shorts: 高評価', value: shorts.metrics?.likes || 0 },
    { label: 'Shorts: コメント', value: shorts.metrics?.comments || 0 },
    { label: 'Shorts: シェア', value: shorts.metrics?.shares || 0 },
    { label: 'Shorts: 視聴時間（分）', value: shorts.metrics?.estimatedMinutesWatched || 0 },
    { label: 'Shorts: 平均視聴時間（秒）', value: shorts.metrics?.averageViewDuration || 0 },
    { label: 'Shorts: 平均視聴率（%）', value: shorts.metrics?.averageViewPercentage || 0 },
    { label: 'Shorts: 登録者増加', value: shorts.metrics?.subscribersGained || 0 },
    { label: 'Shorts: 登録者減少', value: shorts.metrics?.subscribersLost || 0 },
    
    // Regular metrics
    { label: '通常動画: 視聴回数', value: regular.metrics?.views || 0 },
    { label: '通常動画: 高評価', value: regular.metrics?.likes || 0 },
    { label: '通常動画: コメント', value: regular.metrics?.comments || 0 },
    { label: '通常動画: シェア', value: regular.metrics?.shares || 0 },
    { label: '通常動画: 視聴時間（分）', value: regular.metrics?.estimatedMinutesWatched || 0 },
    { label: '通常動画: 平均視聴時間（秒）', value: regular.metrics?.averageViewDuration || 0 },
    { label: '通常動画: 平均視聴率（%）', value: regular.metrics?.averageViewPercentage || 0 },
    { label: '通常動画: 登録者増加', value: regular.metrics?.subscribersGained || 0 },
    { label: '通常動画: 登録者減少', value: regular.metrics?.subscribersLost || 0 },
    
    // Live metrics
    { label: 'ライブ: 視聴回数', value: live.metrics?.views || 0 },
    { label: 'ライブ: 高評価', value: live.metrics?.likes || 0 },
    { label: 'ライブ: コメント', value: live.metrics?.comments || 0 },
    { label: 'ライブ: シェア', value: live.metrics?.shares || 0 },
    { label: 'ライブ: 視聴時間（分）', value: live.metrics?.estimatedMinutesWatched || 0 },
    { label: 'ライブ: 平均視聴時間（秒）', value: live.metrics?.averageViewDuration || 0 },
    { label: 'ライブ: 平均視聴率（%）', value: live.metrics?.averageViewPercentage || 0 },
    { label: 'ライブ: 登録者増加', value: live.metrics?.subscribersGained || 0 },
    { label: 'ライブ: 登録者減少', value: live.metrics?.subscribersLost || 0 },
  ];
}
