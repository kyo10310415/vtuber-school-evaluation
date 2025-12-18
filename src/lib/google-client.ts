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
  
  return rows.map((row: any[]) => ({
    studentId: row[0] || '',           // A列: 学籍番号
    name: row[1] || '',                // B列: 氏名
    talkMemoFolderUrl: row[2] || '',   // C列: トークメモフォルダURL
    enrollmentDate: row[3] || '',      // D列: 入学年月
    status: row[4] || '在籍中',        // E列: ステータス
  }));
}

// 欠席データを取得
export async function fetchAbsenceData(
  serviceAccountJson: string,
  spreadsheetId: string,
  month: string
): Promise<AbsenceData[]> {
  const accessToken = await getAccessToken(serviceAccountJson);
  
  // 欠席データのスプレッドシートから取得
  // https://docs.google.com/spreadsheets/d/19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k/edit
  // F列: 学籍番号、G列: 前月の欠席回数
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:Z`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  const rows = data.values || [];
  const absenceData: AbsenceData[] = [];

  // F列（インデックス5）: 学籍番号
  // G列（インデックス6）: 前月の欠席回数
  for (const row of rows) {
    const studentId = row[5] || ''; // F列
    const absenceCount = parseInt(row[6] || '0', 10); // G列
    
    if (studentId) {
      absenceData.push({
        studentId,
        absenceCount,
        month,
      });
    }
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

// Googleドキュメントの内容を取得
export async function fetchDocumentContent(
  serviceAccountJson: string,
  documentId: string
): Promise<TalkMemoDocument> {
  const accessToken = await getAccessToken(serviceAccountJson);

  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const doc = await response.json();
  const title = doc.title || '';
  
  // ドキュメントの本文を抽出
  let content = '';
  if (doc.body?.content) {
    for (const element of doc.body.content) {
      if (element.paragraph?.elements) {
        for (const elem of element.paragraph.elements) {
          if (elem.textRun?.content) {
            content += elem.textRun.content;
          }
        }
      }
    }
  }

  // メッセージを解析（簡易的な実装）
  const messages = parseMessages(content);

  return {
    documentId,
    title,
    content,
    messages,
  };
}

// テキストからメッセージを解析
function parseMessages(content: string): TalkMessage[] {
  const messages: TalkMessage[] = [];
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // 「先生:」や「生徒名:」の形式を想定
    const match = line.match(/^(.+?)[:：](.+)$/);
    if (match) {
      messages.push({
        speaker: match[1].trim(),
        content: match[2].trim(),
      });
    } else if (line.trim()) {
      // 発言者がない場合は前の発言者に追加
      if (messages.length > 0) {
        messages[messages.length - 1].content += ' ' + line.trim();
      }
    }
  }

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
    '評価日時',
  ];

  const values = [headers, ...results];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW`,
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
}
