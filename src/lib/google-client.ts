import { google } from 'googleapis';
import type { Student, AbsenceData, PaymentData, TalkMemoDocument, TalkMessage } from '../types';

// Google認証クライアントの初期化
export function createGoogleAuth(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson);
  
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
    ],
  });
}

// スプレッドシートから生徒情報を取得
export async function fetchStudents(
  auth: any,
  spreadsheetId: string,
  sheetName: string = '生徒マスター'
): Promise<Student[]> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:Z`, // ヘッダー行を除く
  });

  const rows = response.data.values || [];
  
  return rows.map((row) => ({
    studentId: row[0] || '',
    name: row[1] || '',
    talkMemoFolderUrl: row[2] || '',
    enrollmentDate: row[3] || '',
    status: row[4] || '在籍中',
  }));
}

// 欠席データを取得
export async function fetchAbsenceData(
  auth: any,
  spreadsheetId: string,
  month: string
): Promise<AbsenceData[]> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  // 欠席データのスプレッドシートから取得
  // https://docs.google.com/spreadsheets/d/19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k/edit
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A2:Z', // データ範囲を調整
  });

  const rows = response.data.values || [];
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
  auth: any,
  spreadsheetId: string,
  month: string
): Promise<PaymentData[]> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  // 支払いデータのスプレッドシートから取得
  // https://docs.google.com/spreadsheets/d/1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo/edit
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RAW_支払い状況!A2:Z',
  });

  const rows = response.data.values || [];
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
  auth: any,
  folderUrl: string
): Promise<string[]> {
  const drive = google.drive({ version: 'v3', auth });
  const folderId = extractFolderId(folderUrl);

  if (!folderId) {
    throw new Error(`Invalid folder URL: ${folderUrl}`);
  }

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  return (response.data.files || []).map(file => file.id || '');
}

// Googleドキュメントの内容を取得
export async function fetchDocumentContent(
  auth: any,
  documentId: string
): Promise<TalkMemoDocument> {
  const docs = google.docs({ version: 'v1', auth });

  const response = await docs.documents.get({
    documentId,
  });

  const doc = response.data;
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
  auth: any,
  spreadsheetId: string,
  sheetName: string,
  results: any[][]
): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth });

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

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values,
    },
  });
}
