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
  sheetName: string = '生徒マスター'
): Promise<Student[]> {
  const accessToken = await getAccessToken(serviceAccountJson);
  
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
    studentId: row[0] || '',
    name: row[1] || '',
    talkMemoFolderUrl: row[2] || '',
    enrollmentDate: row[3] || '',
    status: row[4] || '在籍中',
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

  // スプレッドシートの構造に応じて調整が必要
  // 仮の実装：列A=学籍番号、列B=欠席回数、列C=対象月
  for (const row of rows) {
    if (row[2] === month) { // 対象月のデータのみ
      absenceData.push({
        studentId: row[0] || '',
        absenceCount: parseInt(row[1] || '0', 10),
        month: row[2] || '',
      });
    }
  }

  return absenceData;
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
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('RAW_支払い状況')}!A2:Z`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  const rows = data.values || [];
  const paymentData: PaymentData[] = [];

  // スプレッドシートの構造に応じて調整が必要
  // 仮の実装：列A=学籍番号、列B=支払い状況、列C=対象月
  for (const row of rows) {
    if (row[2] === month) {
      paymentData.push({
        studentId: row[0] || '',
        paymentStatus: row[1] === '支払い済み' ? 'paid' : row[1] === '未払い' ? 'unpaid' : 'partial',
        month: row[2] || '',
      });
    }
  }

  return paymentData;
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
