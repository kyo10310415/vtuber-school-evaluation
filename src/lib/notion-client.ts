/**
 * Notion API Client
 * NotionデータベースからYouTubeチャンネルIDとXアカウントを取得
 */

export interface NotionStudentData {
  studentId: string;
  youtubeChannelId: string | null;
  xAccount: string | null;
}

/**
 * Notionデータベースから全生徒のSNSアカウント情報を取得
 */
export async function fetchNotionStudentData(
  notionToken: string,
  databaseId: string
): Promise<NotionStudentData[]> {
  const students: NotionStudentData[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_cursor: startCursor,
          page_size: 100, // 最大100件ずつ取得
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 各ページ（行）からデータを抽出
    for (const page of data.results) {
      const properties = page.properties;

      // 学籍番号（Title型）
      const studentIdProp = properties['学籍番号'];
      const studentId = studentIdProp?.title?.[0]?.text?.content || null;

      // YouTubeチャンネルID（Text型）
      const youtubeProp = properties['YTチャンネルID'];
      const youtubeChannelId = youtubeProp?.rich_text?.[0]?.text?.content || null;

      // Xアカウント（Text型）
      const xProp = properties['X ID（＠は無し）'];
      const xAccount = xProp?.rich_text?.[0]?.text?.content || null;

      if (studentId) {
        students.push({
          studentId,
          youtubeChannelId,
          xAccount,
        });
      }
    }

    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  console.log(`[Notion] 取得完了: ${students.length}件の生徒データ`);
  return students;
}

/**
 * 生徒マスタシートにYouTubeチャンネルIDとXアカウントを書き込む
 */
export async function updateStudentMasterWithSNS(
  serviceAccount: any,
  spreadsheetId: string,
  notionData: NotionStudentData[]
): Promise<void> {
  const { GoogleAuth } = await import('google-auth-library');
  const { google } = await import('googleapis');

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: auth as any });

  // 1. 既存の生徒マスタを取得
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: '生徒マスタ!A:Z',
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    throw new Error('生徒マスタが空です');
  }

  const headers = rows[0];
  const studentIdIndex = headers.indexOf('学籍番号');

  if (studentIdIndex === -1) {
    throw new Error('生徒マスタに「学籍番号」列が見つかりません');
  }

  // 2. YouTubeチャンネルIDとXアカウントの列を確認・追加
  let youtubeIndex = headers.indexOf('YouTubeチャンネルID');
  let xAccountIndex = headers.indexOf('Xアカウント');

  // 列が存在しない場合は追加
  if (youtubeIndex === -1) {
    youtubeIndex = headers.length;
    headers.push('YouTubeチャンネルID');
  }

  if (xAccountIndex === -1) {
    xAccountIndex = headers.length;
    headers.push('Xアカウント');
  }

  // 3. Notionデータを学籍番号でマッピング
  const notionMap = new Map<string, NotionStudentData>();
  for (const data of notionData) {
    notionMap.set(data.studentId, data);
  }

  // 4. 各行を更新
  const updatedRows: any[][] = [headers]; // ヘッダー行

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const studentId = row[studentIdIndex];
    const notionStudent = notionMap.get(studentId);

    // 行を拡張（不足している列を空文字で埋める）
    while (row.length < headers.length) {
      row.push('');
    }

    if (notionStudent) {
      row[youtubeIndex] = notionStudent.youtubeChannelId || '';
      row[xAccountIndex] = notionStudent.xAccount || '';
    }

    updatedRows.push(row);
  }

  // 5. シートを更新
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: '生徒マスタ!A:Z',
    valueInputOption: 'RAW',
    requestBody: {
      values: updatedRows,
    },
  });

  console.log(`[Google Sheets] 生徒マスタ更新完了: ${notionData.length}件のSNSアカウント情報`);
}
