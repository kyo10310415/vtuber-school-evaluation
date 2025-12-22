/**
 * WannaV トークメモ自動移動システム
 * 
 * 機能:
 * - Meet RecordingsフォルダからGeminiメモを取得
 * - Googleカレンダーのメモ欄から学籍番号を抽出
 * - 学籍番号フォルダにメモを自動移動
 * - フォルダが存在しない場合は自動作成
 * 
 * セットアップ:
 * 1. スクリプトプロパティに以下を設定:
 *    - ACCOUNT_MAPPING_SPREADSHEET_ID: アカウントマッピングシートのID
 *    - STUDENT_FOLDERS_PARENT_ID: 学籍番号フォルダの親フォルダID
 * 
 * 2. トリガーを設定:
 *    - 関数: autoMoveMemos
 *    - イベントソース: 時間主導型
 *    - 時間ベースのトリガー: 2時間おき
 */

// ========================================
// 設定
// ========================================

// アカウントマッピングスプレッドシートID
// https://docs.google.com/spreadsheets/d/1gFrIbkRxNcpKuT0vRNfaUdSrJWynlCdfqhGQz9vWwWo/edit
const ACCOUNT_MAPPING_SPREADSHEET_ID = '1gFrIbkRxNcpKuT0vRNfaUdSrJWynlCdfqhGQz9vWwWo';

// 学籍番号フォルダの親フォルダID
// https://drive.google.com/drive/folders/18YfaP1CrW5Lq_sAeVAR56tIRZR3GwMDS
const STUDENT_FOLDERS_PARENT_ID = '18YfaP1CrW5Lq_sAeVAR56tIRZR3GwMDS';

// 学籍番号の正規表現パターン
const STUDENT_ID_PATTERN = /[A-Z]{4}\d{6}-[A-Z]{2}/g;

// ========================================
// メイン処理
// ========================================

/**
 * メイン関数: トークメモの自動移動を実行
 * トリガーで2時間おきに実行される
 */
function autoMoveMemos() {
  console.log('=== トークメモ自動移動開始 ===');
  
  try {
    // アカウントマッピングを取得
    const accountMappings = getAccountMappings();
    console.log(`処理対象アカウント数: ${accountMappings.length}`);
    
    let totalProcessed = 0;
    let totalMoved = 0;
    let totalErrors = 0;
    
    // 各アカウントのMeet Recordingsフォルダを処理
    for (const mapping of accountMappings) {
      try {
        console.log(`\n--- 処理中: ${mapping.email} ---`);
        
        const result = processMeetRecordingsFolder(
          mapping.meetRecordingsFolderId,
          mapping.email
        );
        
        totalProcessed += result.processed;
        totalMoved += result.moved;
        totalErrors += result.errors;
        
        console.log(`処理完了: ${result.processed}件中${result.moved}件移動、${result.errors}件エラー`);
        
      } catch (error) {
        console.error(`アカウント ${mapping.email} の処理でエラー:`, error);
        totalErrors++;
      }
    }
    
    console.log('\n=== トークメモ自動移動完了 ===');
    console.log(`総処理数: ${totalProcessed}件`);
    console.log(`総移動数: ${totalMoved}件`);
    console.log(`総エラー数: ${totalErrors}件`);
    
  } catch (error) {
    console.error('トークメモ自動移動でエラーが発生:', error);
    throw error;
  }
}

// ========================================
// アカウントマッピング取得
// ========================================

/**
 * スプレッドシートからアカウントマッピングを取得
 * @returns {Array<{email: string, meetRecordingsFolderId: string}>}
 */
function getAccountMappings() {
  try {
    const sheet = SpreadsheetApp.openById(ACCOUNT_MAPPING_SPREADSHEET_ID).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップして処理
    const mappings = [];
    for (let i = 1; i < data.length; i++) {
      const email = data[i][0]; // A列: メールアドレス
      const folderUrl = data[i][1]; // B列: Meet RecordingsフォルダURL
      
      if (!email || !folderUrl) continue;
      
      // フォルダIDを抽出
      const folderId = extractFolderIdFromUrl(folderUrl);
      if (!folderId) {
        console.warn(`無効なフォルダURL (行${i + 1}): ${folderUrl}`);
        continue;
      }
      
      mappings.push({
        email: email.trim(),
        meetRecordingsFolderId: folderId
      });
    }
    
    return mappings;
    
  } catch (error) {
    console.error('アカウントマッピングの取得に失敗:', error);
    throw error;
  }
}

/**
 * Google DriveのURLからフォルダIDを抽出
 * @param {string} url - Google DriveのURL
 * @returns {string|null} - フォルダID
 */
function extractFolderIdFromUrl(url) {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ========================================
// Meet Recordingsフォルダ処理
// ========================================

/**
 * Meet RecordingsフォルダからGeminiメモを取得して移動
 * @param {string} meetRecordingsFolderId - Meet RecordingsフォルダのID
 * @param {string} accountEmail - アカウントのメールアドレス
 * @returns {{processed: number, moved: number, errors: number}}
 */
function processMeetRecordingsFolder(meetRecordingsFolderId, accountEmail) {
  let processed = 0;
  let moved = 0;
  let errors = 0;
  
  try {
    const meetRecordingsFolder = DriveApp.getFolderById(meetRecordingsFolderId);
    const files = meetRecordingsFolder.getFiles();
    
    while (files.hasNext()) {
      const file = files.next();
      processed++;
      
      try {
        // Geminiメモ（Googleドキュメント）のみを対象
        if (file.getMimeType() !== MimeType.GOOGLE_DOCS) {
          continue;
        }
        
        console.log(`処理中: ${file.getName()}`);
        
        // ファイルの作成日時からカレンダーイベントを検索
        const createdDate = file.getDateCreated();
        const studentId = findStudentIdFromCalendar(accountEmail, createdDate);
        
        if (!studentId) {
          console.log(`  → 学籍番号が見つかりません (スキップ)`);
          continue;
        }
        
        console.log(`  → 学籍番号: ${studentId}`);
        
        // 学籍番号フォルダを取得または作成
        const studentFolder = getOrCreateStudentFolder(studentId);
        
        // ファイルを移動
        file.moveTo(studentFolder);
        moved++;
        
        console.log(`  → 移動完了: ${studentFolder.getName()}`);
        
      } catch (error) {
        console.error(`  → ファイル処理エラー: ${file.getName()}`, error);
        errors++;
      }
    }
    
  } catch (error) {
    console.error('Meet Recordingsフォルダの処理でエラー:', error);
    errors++;
  }
  
  return { processed, moved, errors };
}

// ========================================
// Googleカレンダー連携
// ========================================

/**
 * Googleカレンダーから学籍番号を検索
 * @param {string} accountEmail - アカウントのメールアドレス
 * @param {Date} targetDate - 対象日時
 * @returns {string|null} - 学籍番号
 */
function findStudentIdFromCalendar(accountEmail, targetDate) {
  try {
    // 対象日時の前後30分のイベントを検索
    const startTime = new Date(targetDate.getTime() - 30 * 60 * 1000);
    const endTime = new Date(targetDate.getTime() + 30 * 60 * 1000);
    
    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEvents(startTime, endTime);
    
    for (const event of events) {
      const description = event.getDescription();
      
      if (!description) continue;
      
      // メモ欄から学籍番号を抽出
      const matches = description.match(STUDENT_ID_PATTERN);
      if (matches && matches.length > 0) {
        return matches[0]; // 最初に見つかった学籍番号を返す
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('カレンダーイベントの検索でエラー:', error);
    return null;
  }
}

// ========================================
// 学籍番号フォルダ管理
// ========================================

/**
 * 学籍番号フォルダを取得または作成
 * @param {string} studentId - 学籍番号
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateStudentFolder(studentId) {
  try {
    const parentFolder = DriveApp.getFolderById(STUDENT_FOLDERS_PARENT_ID);
    
    // 既存のフォルダを検索
    const folders = parentFolder.getFoldersByName(studentId);
    if (folders.hasNext()) {
      return folders.next();
    }
    
    // フォルダが存在しない場合は作成
    console.log(`  → フォルダ作成: ${studentId}`);
    return parentFolder.createFolder(studentId);
    
  } catch (error) {
    console.error(`学籍番号フォルダの取得/作成でエラー: ${studentId}`, error);
    throw error;
  }
}

// ========================================
// テスト用関数
// ========================================

/**
 * テスト実行: 1件のメモファイルのみ処理
 */
function testAutoMoveMemos() {
  console.log('=== テスト実行: トークメモ自動移動 ===');
  
  try {
    const accountMappings = getAccountMappings();
    
    if (accountMappings.length === 0) {
      console.error('アカウントマッピングが見つかりません');
      return;
    }
    
    const firstAccount = accountMappings[0];
    console.log(`テスト対象: ${firstAccount.email}`);
    
    const meetRecordingsFolder = DriveApp.getFolderById(firstAccount.meetRecordingsFolderId);
    const files = meetRecordingsFolder.getFiles();
    
    if (!files.hasNext()) {
      console.log('処理対象のファイルがありません');
      return;
    }
    
    const file = files.next();
    console.log(`テストファイル: ${file.getName()}`);
    
    const createdDate = file.getDateCreated();
    const studentId = findStudentIdFromCalendar(firstAccount.email, createdDate);
    
    if (!studentId) {
      console.log('学籍番号が見つかりません');
      return;
    }
    
    console.log(`学籍番号: ${studentId}`);
    
    const studentFolder = getOrCreateStudentFolder(studentId);
    console.log(`移動先フォルダ: ${studentFolder.getName()}`);
    
    console.log('テスト完了（実際の移動は行いません）');
    
  } catch (error) {
    console.error('テスト実行でエラー:', error);
  }
}

/**
 * カレンダーイベントのメモ欄テスト
 */
function testCalendarEvents() {
  console.log('=== カレンダーイベント検索テスト ===');
  
  const now = new Date();
  const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24時間前
  const endTime = now;
  
  const calendar = CalendarApp.getDefaultCalendar();
  const events = calendar.getEvents(startTime, endTime);
  
  console.log(`イベント数: ${events.length}`);
  
  for (const event of events) {
    const title = event.getTitle();
    const description = event.getDescription();
    const matches = description ? description.match(STUDENT_ID_PATTERN) : null;
    
    console.log(`\nイベント: ${title}`);
    console.log(`説明: ${description ? description.substring(0, 100) : '(なし)'}`);
    console.log(`学籍番号: ${matches ? matches.join(', ') : '(なし)'}`);
  }
}
