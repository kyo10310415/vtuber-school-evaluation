/**
 * WannaV トークメモ自動移動システム（修正版）
 * 
 * 修正内容:
 * - 学籍番号がない場合のファイル移動を防止
 * - 処理対象外フォルダに移動する機能を追加
 * - ログ出力の改善
 * 
 * 機能:
 * - Meet RecordingsフォルダからGeminiメモを取得
 * - Googleカレンダーのメモ欄から学籍番号を抽出
 * - 学籍番号フォルダにメモを自動移動
 * - 学籍番号がない場合は「処理対象外」フォルダに移動
 * 
 * セットアップ:
 * 1. スクリプトプロパティに以下を設定:
 *    - ACCOUNT_MAPPING_SPREADSHEET_ID: アカウントマッピングシートのID
 *    - STUDENT_FOLDERS_PARENT_ID: 学籍番号フォルダの親フォルダID
 *    - UNPROCESSABLE_FOLDER_ID: 処理対象外フォルダのID（オプション）
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

// 処理対象外フォルダのID（学籍番号がないメモの移動先）
// 未設定の場合は親フォルダ内に「処理対象外」フォルダを自動作成
const UNPROCESSABLE_FOLDER_ID = null; // または具体的なフォルダID

// 学籍番号の正規表現パターン
const STUDENT_ID_PATTERN = /[A-Z]{4}\d{6}-[A-Z]{2}/g;

// カレンダー検索の時間範囲（分）
const CALENDAR_SEARCH_RANGE_MINUTES = 30;

// ========================================
// メイン処理
// ========================================

/**
 * メイン関数: トークメモの自動移動を実行
 * トリガーで2時間おきに実行される
 */
function autoMoveMemos() {
  console.log('=== トークメモ自動移動開始 ===');
  console.log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);
  
  try {
    // アカウントマッピングを取得
    const accountMappings = getAccountMappings();
    console.log(`処理対象アカウント数: ${accountMappings.length}`);
    
    let totalProcessed = 0;
    let totalMoved = 0;
    let totalUnprocessable = 0;
    let totalSkipped = 0;
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
        totalUnprocessable += result.unprocessable;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        console.log(`処理完了: 処理${result.processed}件 / 移動${result.moved}件 / 処理対象外${result.unprocessable}件 / スキップ${result.skipped}件 / エラー${result.errors}件`);
        
      } catch (error) {
        console.error(`アカウント ${mapping.email} の処理でエラー:`, error);
        totalErrors++;
      }
    }
    
    console.log('\n=== トークメモ自動移動完了 ===');
    console.log(`総処理数: ${totalProcessed}件`);
    console.log(`総移動数: ${totalMoved}件`);
    console.log(`処理対象外: ${totalUnprocessable}件`);
    console.log(`スキップ: ${totalSkipped}件`);
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
 * @returns {{processed: number, moved: number, unprocessable: number, skipped: number, errors: number}}
 */
function processMeetRecordingsFolder(meetRecordingsFolderId, accountEmail) {
  let processed = 0;
  let moved = 0;
  let unprocessable = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    const meetRecordingsFolder = DriveApp.getFolderById(meetRecordingsFolderId);
    const files = meetRecordingsFolder.getFiles();
    
    console.log(`Meet Recordingsフォルダ: ${meetRecordingsFolder.getName()}`);
    
    while (files.hasNext()) {
      const file = files.next();
      
      try {
        // Geminiメモ（Googleドキュメント）のみを対象
        if (file.getMimeType() !== MimeType.GOOGLE_DOCS) {
          console.log(`スキップ (非ドキュメント): ${file.getName()}`);
          skipped++;
          continue;
        }
        
        processed++;
        console.log(`\n[${processed}] 処理中: ${file.getName()}`);
        console.log(`  作成日時: ${file.getDateCreated().toLocaleString('ja-JP')}`);
        
        // ファイルの作成日時からカレンダーイベントを検索
        const createdDate = file.getDateCreated();
        const studentId = findStudentIdFromCalendar(accountEmail, createdDate);
        
        // 🔴 重要: 学籍番号がない場合の処理
        if (!studentId) {
          console.log(`  ❌ 学籍番号が見つかりません`);
          console.log(`  → 処理対象外フォルダに移動します`);
          
          // 処理対象外フォルダに移動
          const unprocessableFolder = getUnprocessableFolder();
          file.moveTo(unprocessableFolder);
          unprocessable++;
          
          console.log(`  ✓ 移動完了: ${unprocessableFolder.getName()}`);
          continue;
        }
        
        console.log(`  ✓ 学籍番号: ${studentId}`);
        
        // 学籍番号フォルダを取得または作成
        const studentFolder = getOrCreateStudentFolder(studentId);
        
        // ファイルを移動
        file.moveTo(studentFolder);
        moved++;
        
        console.log(`  ✓ 移動完了: ${studentFolder.getName()}`);
        
      } catch (error) {
        console.error(`  ❌ ファイル処理エラー: ${file.getName()}`, error);
        errors++;
      }
    }
    
  } catch (error) {
    console.error('Meet Recordingsフォルダの処理でエラー:', error);
    errors++;
  }
  
  return { processed, moved, unprocessable, skipped, errors };
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
    // 対象日時の前後の時間範囲でイベントを検索
    const startTime = new Date(targetDate.getTime() - CALENDAR_SEARCH_RANGE_MINUTES * 60 * 1000);
    const endTime = new Date(targetDate.getTime() + CALENDAR_SEARCH_RANGE_MINUTES * 60 * 1000);
    
    console.log(`  カレンダー検索: ${startTime.toLocaleTimeString('ja-JP')} ～ ${endTime.toLocaleTimeString('ja-JP')}`);
    
    // アカウントのメールアドレスを使用してカレンダーを取得
    let calendar;
    try {
      calendar = CalendarApp.getCalendarById(accountEmail);
      if (!calendar) {
        console.warn(`  ⚠ カレンダーが見つかりません: ${accountEmail} (デフォルトカレンダーを使用)`);
        calendar = CalendarApp.getDefaultCalendar();
      }
    } catch (error) {
      console.warn(`  ⚠ カレンダーへのアクセスエラー: ${accountEmail} (デフォルトカレンダーを使用)`, error.message);
      calendar = CalendarApp.getDefaultCalendar();
    }
    
    const events = calendar.getEvents(startTime, endTime);
    console.log(`  イベント数: ${events.length}件`);
    
    for (const event of events) {
      const title = event.getTitle();
      const description = event.getDescription();
      
      console.log(`    - イベント: ${title}`);
      
      if (!description) {
        console.log(`      説明なし`);
        continue;
      }
      
      // メモ欄から学籍番号を抽出
      const matches = description.match(STUDENT_ID_PATTERN);
      if (matches && matches.length > 0) {
        const foundStudentId = matches[0];
        console.log(`      ✓ 学籍番号発見: ${foundStudentId}`);
        return foundStudentId; // 最初に見つかった学籍番号を返す
      } else {
        console.log(`      学籍番号なし`);
      }
    }
    
    console.log(`  学籍番号が見つかりませんでした`);
    return null;
    
  } catch (error) {
    console.error('  ❌ カレンダーイベントの検索でエラー:', error);
    return null;
  }
}

// ========================================
// フォルダ管理
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
    console.log(`  📁 フォルダ作成: ${studentId}`);
    return parentFolder.createFolder(studentId);
    
  } catch (error) {
    console.error(`❌ 学籍番号フォルダの取得/作成でエラー: ${studentId}`, error);
    throw error;
  }
}

/**
 * 処理対象外フォルダを取得または作成
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getUnprocessableFolder() {
  try {
    // 設定でフォルダIDが指定されている場合
    if (UNPROCESSABLE_FOLDER_ID) {
      return DriveApp.getFolderById(UNPROCESSABLE_FOLDER_ID);
    }
    
    // 親フォルダ内に「処理対象外」フォルダを検索または作成
    const parentFolder = DriveApp.getFolderById(STUDENT_FOLDERS_PARENT_ID);
    const folderName = '処理対象外（学籍番号なし）';
    
    const folders = parentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      return folders.next();
    }
    
    console.log(`📁 処理対象外フォルダを作成: ${folderName}`);
    return parentFolder.createFolder(folderName);
    
  } catch (error) {
    console.error('❌ 処理対象外フォルダの取得/作成でエラー:', error);
    throw error;
  }
}

// ========================================
// テスト用関数
// ========================================

/**
 * テスト実行: 1件のメモファイルのみ処理（実際の移動は行わない）
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
    console.log(`\nテストファイル: ${file.getName()}`);
    console.log(`作成日時: ${file.getDateCreated().toLocaleString('ja-JP')}`);
    
    const createdDate = file.getDateCreated();
    const studentId = findStudentIdFromCalendar(firstAccount.email, createdDate);
    
    if (!studentId) {
      console.log('\n❌ 学籍番号が見つかりません');
      console.log('→ 処理対象外フォルダに移動されます');
      
      const unprocessableFolder = getUnprocessableFolder();
      console.log(`移動先: ${unprocessableFolder.getName()}`);
    } else {
      console.log(`\n✓ 学籍番号: ${studentId}`);
      
      const studentFolder = getOrCreateStudentFolder(studentId);
      console.log(`移動先フォルダ: ${studentFolder.getName()}`);
    }
    
    console.log('\nテスト完了（実際の移動は行いません）');
    
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
  
  // デフォルトカレンダーのテスト
  console.log('\n【デフォルトカレンダー】');
  const defaultCalendar = CalendarApp.getDefaultCalendar();
  const defaultEvents = defaultCalendar.getEvents(startTime, endTime);
  console.log(`イベント数: ${defaultEvents.length}`);
  
  for (const event of defaultEvents) {
    const title = event.getTitle();
    const description = event.getDescription();
    const matches = description ? description.match(STUDENT_ID_PATTERN) : null;
    
    console.log(`\nイベント: ${title}`);
    console.log(`日時: ${event.getStartTime().toLocaleString('ja-JP')}`);
    console.log(`説明: ${description ? description.substring(0, 100) + '...' : '(なし)'}`);
    console.log(`学籍番号: ${matches ? matches.join(', ') : '❌ なし'}`);
  }
  
  // アカウントマッピングからカレンダーをテスト
  console.log('\n\n【各アカウントのカレンダー】');
  try {
    const accountMappings = getAccountMappings();
    
    for (const mapping of accountMappings) {
      console.log(`\n--- ${mapping.email} ---`);
      
      try {
        const calendar = CalendarApp.getCalendarById(mapping.email);
        
        if (!calendar) {
          console.log(`カレンダーが見つかりません`);
          continue;
        }
        
        const events = calendar.getEvents(startTime, endTime);
        console.log(`イベント数: ${events.length}`);
        
        let foundCount = 0;
        let notFoundCount = 0;
        
        for (const event of events) {
          const title = event.getTitle();
          const description = event.getDescription();
          const matches = description ? description.match(STUDENT_ID_PATTERN) : null;
          
          if (matches) {
            foundCount++;
            console.log(`\n✓ イベント: ${title}`);
            console.log(`  学籍番号: ${matches.join(', ')}`);
          } else {
            notFoundCount++;
          }
        }
        
        console.log(`\n学籍番号あり: ${foundCount}件 / なし: ${notFoundCount}件`);
        
      } catch (error) {
        console.error(`カレンダーへのアクセスエラー:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('テスト実行エラー:', error);
  }
}

/**
 * 処理対象外フォルダのテスト
 */
function testUnprocessableFolder() {
  console.log('=== 処理対象外フォルダのテスト ===');
  
  try {
    const folder = getUnprocessableFolder();
    console.log(`フォルダ名: ${folder.getName()}`);
    console.log(`フォルダURL: ${folder.getUrl()}`);
    console.log(`フォルダID: ${folder.getId()}`);
    
    console.log('\n✓ 処理対象外フォルダの取得に成功しました');
    
  } catch (error) {
    console.error('処理対象外フォルダの取得エラー:', error);
  }
}
