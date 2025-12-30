/**
 * トークメモフォルダURLを自動入力するスクリプト
 * 
 * 機能:
 * 1. 親フォルダ内のすべてのサブフォルダを取得
 * 2. フォルダ名（学籍番号）でマッピング
 * 3. スプレッドシートのE列に対応するフォルダURLを自動入力
 */

// 設定
const CONFIG = {
  // 生徒マスタースプレッドシートID
  SPREADSHEET_ID: '1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M',
  
  // 生徒マスターシート名
  SHEET_NAME: '生徒マスター',
  
  // トークメモ親フォルダID（URLから抽出）
  PARENT_FOLDER_ID: '18YfaP1CrW5Lq_sAeVAR56tIRZR3GwMDS',
  
  // 列の位置
  STUDENT_ID_COLUMN: 1,  // A列: 学籍番号
  TALK_MEMO_URL_COLUMN: 5  // E列: トークメモフォルダURL
};

/**
 * メインメニューに「トークメモURL自動入力」を追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔧 自動化ツール')
    .addItem('📁 トークメモフォルダURL自動入力', 'autoFillTalkMemoUrls')
    .addItem('✅ 全URLを検証', 'validateAllUrls')
    .addToUi();
}

/**
 * トークメモフォルダURLを自動入力
 */
function autoFillTalkMemoUrls() {
  const ui = SpreadsheetApp.getUi();
  
  // 確認ダイアログ
  const response = ui.alert(
    'トークメモフォルダURL自動入力',
    'スプレッドシートのE列にトークメモフォルダのURLを自動入力します。\n既存のURLは上書きされます。\n\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }
  
  try {
    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`シート "${CONFIG.SHEET_NAME}" が見つかりません`);
    }
    
    // 親フォルダを取得
    const parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    
    // フォルダマッピングを作成（学籍番号 → フォルダURL）
    const folderMap = {};
    const folders = parentFolder.getFolders();
    
    while (folders.hasNext()) {
      const folder = folders.next();
      const folderName = folder.getName();
      const folderUrl = folder.getUrl();
      
      // フォルダ名をキーにしてURLを保存
      folderMap[folderName] = folderUrl;
    }
    
    Logger.log(`取得したフォルダ数: ${Object.keys(folderMap).length}`);
    Logger.log('フォルダマッピング:', folderMap);
    
    // スプレッドシートのデータを取得
    const lastRow = sheet.getLastRow();
    const dataRange = sheet.getRange(2, 1, lastRow - 1, CONFIG.TALK_MEMO_URL_COLUMN);
    const data = dataRange.getValues();
    
    // 更新カウンター
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundStudents = [];
    
    // 各行を処理
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const studentId = row[CONFIG.STUDENT_ID_COLUMN - 1];
      
      // 学籍番号が空の場合はスキップ
      if (!studentId) {
        continue;
      }
      
      // 対応するフォルダURLを検索
      if (folderMap[studentId]) {
        // URLを更新
        sheet.getRange(i + 2, CONFIG.TALK_MEMO_URL_COLUMN).setValue(folderMap[studentId]);
        updatedCount++;
        Logger.log(`✓ ${studentId}: ${folderMap[studentId]}`);
      } else {
        notFoundCount++;
        notFoundStudents.push(studentId);
        Logger.log(`✗ ${studentId}: フォルダが見つかりません`);
      }
    }
    
    // 結果を表示
    let message = `完了しました！\n\n`;
    message += `更新: ${updatedCount}件\n`;
    message += `未検出: ${notFoundCount}件\n`;
    
    if (notFoundStudents.length > 0) {
      message += `\n未検出の学籍番号:\n${notFoundStudents.join(', ')}`;
    }
    
    ui.alert('トークメモフォルダURL自動入力', message, ui.ButtonSet.OK);
    
  } catch (error) {
    Logger.log('エラー:', error);
    ui.alert('エラー', `処理中にエラーが発生しました:\n${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * すべてのURLを検証
 */
function validateAllUrls() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`シート "${CONFIG.SHEET_NAME}" が見つかりません`);
    }
    
    // データを取得
    const lastRow = sheet.getLastRow();
    const dataRange = sheet.getRange(2, 1, lastRow - 1, CONFIG.TALK_MEMO_URL_COLUMN);
    const data = dataRange.getValues();
    
    let validCount = 0;
    let invalidCount = 0;
    let emptyCount = 0;
    const invalidUrls = [];
    
    // 各行を検証
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const studentId = row[CONFIG.STUDENT_ID_COLUMN - 1];
      const talkMemoUrl = row[CONFIG.TALK_MEMO_URL_COLUMN - 1];
      
      // 学籍番号が空の場合はスキップ
      if (!studentId) {
        continue;
      }
      
      // URLが空の場合
      if (!talkMemoUrl) {
        emptyCount++;
        continue;
      }
      
      // URLを検証
      try {
        // URLからフォルダIDを抽出
        const folderId = extractFolderId(talkMemoUrl);
        
        if (!folderId) {
          throw new Error('無効なURL形式');
        }
        
        // フォルダにアクセスできるか確認
        const folder = DriveApp.getFolderById(folderId);
        const folderName = folder.getName();
        
        // フォルダ名と学籍番号が一致するか確認
        if (folderName === studentId) {
          validCount++;
        } else {
          invalidCount++;
          invalidUrls.push(`${studentId}: フォルダ名不一致 (${folderName})`);
        }
        
      } catch (error) {
        invalidCount++;
        invalidUrls.push(`${studentId}: ${error.message}`);
      }
    }
    
    // 結果を表示
    let message = `検証結果:\n\n`;
    message += `✓ 正常: ${validCount}件\n`;
    message += `✗ 異常: ${invalidCount}件\n`;
    message += `− 空欄: ${emptyCount}件\n`;
    
    if (invalidUrls.length > 0) {
      message += `\n異常なURL:\n${invalidUrls.slice(0, 10).join('\n')}`;
      if (invalidUrls.length > 10) {
        message += `\n...他 ${invalidUrls.length - 10}件`;
      }
    }
    
    ui.alert('URL検証結果', message, ui.ButtonSet.OK);
    
  } catch (error) {
    Logger.log('エラー:', error);
    ui.alert('エラー', `検証中にエラーが発生しました:\n${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * URLからフォルダIDを抽出
 */
function extractFolderId(url) {
  if (!url) return null;
  
  // パターン1: https://drive.google.com/drive/folders/FOLDER_ID
  let match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  
  // パターン2: https://drive.google.com/drive/u/0/folders/FOLDER_ID
  match = url.match(/\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  
  return null;
}

/**
 * テスト実行（手動実行用）
 */
function testAutoFill() {
  Logger.log('=== テスト開始 ===');
  
  // 親フォルダのサブフォルダを一覧表示
  const parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  const folders = parentFolder.getFolders();
  
  Logger.log(`親フォルダ: ${parentFolder.getName()}`);
  Logger.log(`親フォルダURL: ${parentFolder.getUrl()}`);
  Logger.log('---');
  
  let count = 0;
  while (folders.hasNext()) {
    const folder = folders.next();
    count++;
    Logger.log(`${count}. ${folder.getName()}`);
    Logger.log(`   URL: ${folder.getUrl()}`);
  }
  
  Logger.log('---');
  Logger.log(`合計: ${count}個のフォルダ`);
  Logger.log('=== テスト完了 ===');
}
