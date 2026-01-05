import type { Student, AbsenceData, PaymentData, TalkMemoDocument, TalkMessage } from '../types';

// JWT用の簡易実装
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Google JWTを生成してアクセストークンを取得
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const credentials = JSON.parse(serviceAccountJson);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/documents.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;

  // RS256署名を作成
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(credentials.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput)
  );

  const signatureEncoded = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  const jwt = `${signatureInput}.${signatureEncoded}`;

  // トークンを取得
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  return data.access_token;
}

// PEM形式の秘密鍵をArrayBufferに変換
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// スプレッドシートから生徒情報を取得
export async function fetchStudents(
  serviceAccountJson: string,
  spreadsheetId: string,
  sheetName: string = 'リスト'
): Promise<Student[]> {
  const accessToken = await getAccessToken(serviceAccountJson);
  
  // 生徒マスタースプレッドシートから取得
  // https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit
  // シート名は実際の名前に合わせて調整（デフォルト: 'リスト'）
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:Z`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  const rows = data.values || [];
  
  console.log('[fetchStudents] Response:', {
    spreadsheetId,
    sheetName,
    rowCount: rows.length,
    firstRow: rows[0] || null,
  });
  
  return rows.map((row: any[]) => ({
    studentId: row[1] || '',           // B列: 学籍番号
    name: row[0] || '',                // A列: 生徒名
    enrollmentDate: row[2] || '',      // C列: プラン（入学年月の代わりに使用）
    status: row[3] || '在籍中',        // D列: 会員ステータス
    talkMemoFolderUrl: row[4] || '',   // E列: トークメモフォルダURL
    youtubeChannelId: row[5] || '',    // F列: YouTubeチャンネルID
    xAccount: row[6] || '',            // G列: Xアカウント
  }));
}

// 欠席データを取得（直近3ヶ月以内のデータから集計）
export async function fetchAbsenceData(
  serviceAccountJson: string,
  spreadsheetId: string,
  month: string
): Promise<AbsenceData[]> {
  const accessToken = await getAccessToken(serviceAccountJson);
  
  // レッスン記録スプレッドシートから取得
  // https://docs.google.com/spreadsheets/d/19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k/edit
  // A列: タイムスタンプ
  // F列: 学籍番号
  // G列: 生徒様の出欠
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:G`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  const rows = data.values || [];
  
  // 直近3ヶ月の日付を計算
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  console.log('[fetchAbsenceData] Processing records:', {
    totalRecords: rows.length,
    threeMonthsAgo: threeMonthsAgo.toISOString(),
  });

  // 学籍番号ごとに欠席数を集計
  const absenceCountMap = new Map<string, number>();
  
  for (const row of rows) {
    const timestamp = row[0] || ''; // A列: タイムスタンプ
    const studentId = row[5] || '';  // F列: 学籍番号
    const attendance = row[6] || ''; // G列: 生徒様の出欠
    
    if (!studentId || !timestamp) continue;
    
    // タイムスタンプをパース
    // 形式: "2024/10/20 1:57:41"
    const recordDate = new Date(timestamp);
    
    // 直近3ヶ月以内かチェック
    if (recordDate >= threeMonthsAgo) {
      // 欠席の場合のみカウント
      if (attendance === '欠席') {
        const currentCount = absenceCountMap.get(studentId) || 0;
        absenceCountMap.set(studentId, currentCount + 1);
      }
    }
  }
  
  console.log('[fetchAbsenceData] Absence count:', {
    studentsWithAbsence: absenceCountMap.size,
    details: Array.from(absenceCountMap.entries()).slice(0, 5), // 最初の5件を表示
  });

  // AbsenceData配列に変換
  const absenceData: AbsenceData[] = [];
  for (const [studentId, count] of absenceCountMap.entries()) {
    absenceData.push({
      studentId,
      absenceCount: count,
      month,
    });
  }

  return absenceData;
}

// 列名（A,B,C...）をインデックスに変換
function columnToIndex(column: string): number {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 65 + 1);
  }
  return index - 1;
}

// 支払いデータを取得
export async function fetchPaymentData(
  serviceAccountJson: string,
  spreadsheetId: string,
  month: string
): Promise<PaymentData[]> {
  const accessToken = await getAccessToken(serviceAccountJson);
  
  // 支払いデータのスプレッドシートから取得
  // https://docs.google.com/spreadsheets/d/1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo/edit
  // ヘッダー行: 13行目
  // E列: 学籍番号
  // AN列以降: 支払いステータス（ヘッダーがyyyy/mm形式）
  
  // まずヘッダー行を取得して対象月の列を特定
  const headerResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('RAW_支払い状況')}!AN13:ZZ13`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const headerData = await headerResponse.json();
  const headers = headerData.values?.[0] || [];
  
  // monthをyyyy/mm形式に変換（例: 2024-12 → 2024/12）
  const targetMonth = month.replace('-', '/');
  
  // 対象月の列インデックスを検索
  let targetColumnOffset = -1;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === targetMonth) {
      targetColumnOffset = i;
      break;
    }
  }

  if (targetColumnOffset === -1) {
    console.warn(`Payment data not found for month: ${targetMonth}`);
    return [];
  }

  // AN列は40番目の列（インデックス39）
  const anColumnIndex = columnToIndex('AN');
  const targetColumnIndex = anColumnIndex + targetColumnOffset;
  
  // 列番号を列名に変換
  const targetColumn = indexToColumn(targetColumnIndex);

  // データ行を取得（14行目以降）
  const dataResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('RAW_支払い状況')}!E14:${targetColumn}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const dataData = await dataResponse.json();
  const rows = dataData.values || [];
  const paymentData: PaymentData[] = [];

  for (const row of rows) {
    const studentId = row[0] || ''; // E列
    const paymentStatusRaw = row[targetColumnOffset + (anColumnIndex - columnToIndex('E'))] || '';
    
    if (studentId) {
      // 支払いステータスを判定
      let paymentStatus: 'paid' | 'unpaid' | 'partial' = 'unpaid';
      
      if (paymentStatusRaw.includes('済') || paymentStatusRaw.includes('完了') || paymentStatusRaw === '○') {
        paymentStatus = 'paid';
      } else if (paymentStatusRaw.includes('一部') || paymentStatusRaw.includes('部分')) {
        paymentStatus = 'partial';
      } else if (paymentStatusRaw.includes('未') || paymentStatusRaw === '×' || paymentStatusRaw === '') {
        paymentStatus = 'unpaid';
      }

      paymentData.push({
        studentId,
        paymentStatus,
        month,
      });
    }
  }

  return paymentData;
}

// インデックスを列名に変換
function indexToColumn(index: number): string {
  let column = '';
  let temp = index;
  
  while (temp >= 0) {
    column = String.fromCharCode(65 + (temp % 26)) + column;
    temp = Math.floor(temp / 26) - 1;
  }
  
  return column;
}

// フォルダIDをURLから抽出
function extractFolderId(folderUrl: string): string {
  const match = folderUrl.match(/folders\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

// ドキュメントIDをURLから抽出
function extractDocumentId(documentUrl: string): string {
  const match = documentUrl.match(/document\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

// フォルダ内のドキュメント一覧を取得
export async function fetchDocumentsInFolder(
  serviceAccountJson: string,
  folderUrl: string
): Promise<string[]> {
  const accessToken = await getAccessToken(serviceAccountJson);
  const folderId = extractFolderId(folderUrl);

  if (!folderId) {
    throw new Error(`Invalid folder URL: ${folderUrl}`);
  }

  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime desc`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  return (data.files || []).map((file: any) => file.id || '');
}

// Googleドキュメントの内容を取得（「文字起こし」タブを優先）
export async function fetchDocumentContent(
  serviceAccountJson: string,
  documentId: string
): Promise<TalkMemoDocument> {
  const accessToken = await getAccessToken(serviceAccountJson);

  // まず通常のDocs APIでドキュメント情報を取得
  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}?fields=*`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const doc = await response.json();
  const title = doc.title || '';
  
  console.log('[fetchDocumentContent] Document structure:', {
    hasBody: !!doc.body,
    hasTabs: !!doc.tabs,
    tabsLength: doc.tabs?.length || 0,
    tabTitles: doc.tabs?.map((t: any) => t.tabProperties?.title || 'untitled') || []
  });
  
  // Google Meet録画の文字起こしを取得する戦略:
  // 1. Drive API Export でプレーンテキストを取得（全タブの内容が含まれる）
  // 2. テキストを解析して文字起こし部分を抽出
  
  let content = '';
  
  try {
    // Drive API の Export エンドポイントを使用してプレーンテキストを取得
    const exportResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${documentId}/export?mimeType=text/plain`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    if (exportResponse.ok) {
      const fullText = await exportResponse.text();
      console.log('[fetchDocumentContent] Exported text length:', fullText.length);
      console.log('[fetchDocumentContent] First 500 chars:', fullText.substring(0, 500));
      console.log('[fetchDocumentContent] Last 500 chars:', fullText.substring(Math.max(0, fullText.length - 500)));
      
      // Google Meetの文字起こしを検出する戦略:
      // 1. 行ごとに解析して、発話者パターン（"名前: 内容"）が連続する箇所を探す
      // 2. タイムスタンプ（"00:00:00"）も検出対象とする
      
      const lines = fullText.split('\n');
      const transcriptLines: string[] = [];
      let consecutiveSpeakerLines = 0;
      let transcriptStartIndex = -1;
      
      // まず、連続する発話者パターンを検出
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // タイムスタンプパターン: "00:00:00" または "0:00:00"
        const hasTimestamp = /^\d{1,2}:\d{2}:\d{2}/.test(line);
        
        // 発話者パターン: "名前: 内容" または "名前： 内容"
        // 名前部分は日本語、英数字、スペースなし
        const hasSpeaker = /^[^\s:：]{2,20}[:：]\s*.+/.test(line);
        
        if (hasTimestamp || hasSpeaker) {
          consecutiveSpeakerLines++;
          if (consecutiveSpeakerLines >= 3 && transcriptStartIndex === -1) {
            // 3行以上連続で発話パターンがあれば文字起こしと判定
            transcriptStartIndex = i - consecutiveSpeakerLines + 1;
            console.log('[fetchDocumentContent] Transcript detected at line', transcriptStartIndex, ':', lines[transcriptStartIndex].substring(0, 80));
          }
        } else if (!line) {
          // 空行は許容（継続）
        } else {
          // パターンが途切れたらリセット
          consecutiveSpeakerLines = 0;
        }
      }
      
      console.log('[fetchDocumentContent] Transcript detection results:', {
        totalLines: lines.length,
        transcriptStartIndex,
        consecutiveSpeakerLines,
      });
      
      // 文字起こしが検出された場合、その位置から最後までを抽出
      if (transcriptStartIndex >= 0) {
        for (let i = transcriptStartIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // 終了マーカーを検出
          if (line.includes('文字起こしが終了しました') || line.includes('文字起こしはコンピュータが生成')) {
            console.log('[fetchDocumentContent] Transcript end marker found at line', i);
            break;
          }
          
          transcriptLines.push(lines[i]);
        }
        
        content = transcriptLines.join('\n');
        console.log('[fetchDocumentContent] Extracted transcript lines:', transcriptLines.length);
        console.log('[fetchDocumentContent] Transcript preview:', content.substring(0, 300));
      } else {
        // 文字起こしパターンが見つからない場合は全テキストを使用
        console.log('[fetchDocumentContent] No transcript pattern found, using full text');
        content = fullText;
      }
    } else {
      console.error('[fetchDocumentContent] Export failed:', exportResponse.status);
      // フォールバック: body.content から取得
      content = extractTextFromContent(doc.body?.content || []);
    }
  } catch (error) {
    console.error('[fetchDocumentContent] Export error:', error);
    // フォールバック: body.content から取得
    content = extractTextFromContent(doc.body?.content || []);
  }

  console.log('[fetchDocumentContent] Result:', {
    extractionMethod: 'drive_export_api',
    contentLength: content.length,
    contentPreview: content.substring(0, 200)
  });
  
  // メッセージを解析（簡易的な実装）
  const messages = parseMessages(content);

  return {
    documentId,
    title,
    content,
    messages,
  };
}

// body.content からテキストを抽出（フォールバック用）
function extractTextFromContent(contentElements: any[]): string {
  let text = '';
  for (const element of contentElements) {
    if (element.paragraph?.elements) {
      for (const elem of element.paragraph.elements) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    }
  }
  return text;
}

// テキストからメッセージを解析
function parseMessages(content: string): TalkMessage[] {
  const messages: TalkMessage[] = [];
  const lines = content.split('\n').filter(line => line.trim());

  console.log('[parseMessages] Total lines after filtering:', lines.length);
  console.log('[parseMessages] First 5 lines:', lines.slice(0, 5));

  for (const line of lines) {
    // 行末の \r や \n を除去
    const cleanLine = line.replace(/[\r\n]+$/, '').trim();
    
    // 「先生:」や「生徒名:」の形式を想定
    const match = cleanLine.match(/^(.+?)[:：](.+)$/);
    if (match) {
      messages.push({
        speaker: match[1].trim(),
        content: match[2].trim(),
      });
    } else if (cleanLine) {
      // 発言者がない場合は前の発言者に追加
      if (messages.length > 0) {
        messages[messages.length - 1].content += ' ' + cleanLine;
      }
    }
  }

  console.log('[parseMessages] Parsed messages count:', messages.length);
  console.log('[parseMessages] First 3 messages:', messages.slice(0, 3));

  return messages;
}

// 結果をスプレッドシートに書き込み
export async function writeResultsToSheet(
  serviceAccountJson: string,
  spreadsheetId: string,
  sheetName: string,
  results: any[][]
): Promise<void> {
  const accessToken = await getAccessToken(serviceAccountJson);

  // ヘッダー行を追加
  const headers = [
    '評価月',
    '学籍番号',
    '氏名',
    '欠席',
    '遅刻',
    'ミッション',
    '支払い',
    'アクティブリスニング',
    '理解度',
    '総合評価',
    'コメント',
    '評価日時',
  ];

  const values = [headers, ...results];

  try {
    // シートが存在するか確認
    const getResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const spreadsheet = await getResponse.json();
    const sheetExists = spreadsheet.sheets?.some(
      (sheet: any) => sheet.properties?.title === sheetName
    );

    if (!sheetExists) {
      // シートを新規作成
      await fetch(
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
      
      console.log(`[writeResultsToSheet] Created new sheet: ${sheetName}`);
      
      // 新しいシートにヘッダーとデータを書き込み
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values,
          }),
        }
      );
    } else {
      // 既存シートに追記（ヘッダーはスキップ）
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z:append?valueInputOption=RAW`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: results, // ヘッダーなし、データのみ
          }),
        }
      );
    }
    
    console.log(`[writeResultsToSheet] Successfully wrote ${results.length} records to ${sheetName}`);
  } catch (error) {
    console.error('[writeResultsToSheet] Error:', error);
    throw error;
  }
}
