/**
 * トークメモフォルダURL自動入力スクリプト（拡張版）
 * 
 * 機能:
 * 1. 親フォルダ内のすべてのサブフォルダを取得
 * 2. フォルダ名（学籍番号）でマッピング
 * 3. スプレッドシートのE列に対応するフォルダURLを自動入力
 * 4. フォルダが存在しない場合、自動作成（オプション）
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
 * メインメニューに項目を追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔧 自動化ツール')
    .addItem('📁 トークメモフォルダURL自動入力', 'autoFillTalkMemoUrls')
    .addItem('➕ トークメモフォルダURL自動入力（不足分を作成）', 'autoFillWithCreate')
    .addItem('✅ 全URLを検証', 'validateAllUrls')
    .addSeparator()
    .addItem('📊 フォルダ一覧を表示', 'showFolderList')
    .addToUi();
}

/**
 * トークメモフォルダURLを自動入力
 */
function autoFillTalkMemoUrls() {
  fillTalkMemoUrls(false);
}

/**
 * トークメモフォルダURLを自動入力（不足分を作成）
 */
function autoFillWithCreate() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    'フォルダ自動作成',
    '存在しないフォルダを自動的に作成します。\n親フォルダ内に学籍番号のフォルダが作成されます。\n\n続行しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    ui.alert('キャンセルしました。');
    return;
  }
  
  fillTalkMemoUrls(true);
}

/**
 * トークメモフォルダURLを自動入力（メイン処理）
 * @param {boolean} createIfNotExists - フォルダが存在しない場合に作成するか
 */
function fillTalkMemoUrls(createIfNotExists = false) {
  const ui = SpreadsheetApp.getUi();
  
  try {
    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`シート "${CONFIG.SHEET_NAME}" が見つかりません`);
    }
    
    // 親フォルダを取得
    const parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    
    // フォルダマッピングを作成（学籍番号 → フォルダオブジェクト）
    const folderMap = {};
    const folders = parentFolder.getFolders();
    
    while (folders.hasNext()) {
      const folder = folders.next();
      const folderName = folder.getName();
      folderMap[folderName] = folder;
    }
    
    Logger.log(`既存フォルダ数: ${Object.keys(folderMap).length}`);
    
    // スプレッドシートのデータを取得
    const lastRow = sheet.getLastRow();
    const dataRange = sheet.getRange(2, 1, lastRow - 1, CONFIG.TALK_MEMO_URL_COLUMN);
    const data = dataRange.getValues();
    
    // 更新カウンター
    let updatedCount = 0;
    let createdCount = 0;
    let notFoundCount = 0;
    const notFoundStudents = [];
    const createdStudents = [];
    
    // 各行を処理
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const studentId = row[CONFIG.STUDENT_ID_COLUMN - 1];
      
      // 学籍番号が空の場合はスキップ
      if (!studentId) {
        continue;
      }
      
      let folder;
      
      // 対応するフォルダを検索
      if (folderMap[studentId]) {
        folder = folderMap[studentId];
      } else if (createIfNotExists) {
        // フォルダを作成
        try {
          folder = parentFolder.createFolder(studentId);
          createdCount++;
          createdStudents.push(studentId);
          Logger.log(`✓ ${studentId}: フォルダを作成しました`);
        } catch (error) {
          Logger.log(`✗ ${studentId}: フォルダ作成エラー - ${error.message}`);
          notFoundCount++;
          notFoundStudents.push(studentId);
          continue;
        }
      } else {
        notFoundCount++;
        notFoundStudents.push(studentId);
        Logger.log(`✗ ${studentId}: フォルダが見つかりません`);
        continue;
      }
      
      // URLを更新
      const folderUrl = folder.getUrl();
      sheet.getRange(i + 2, CONFIG.TALK_MEMO_URL_COLUMN).setValue(folderUrl);
      updatedCount++;
      Logger.log(`✓ ${studentId}: ${folderUrl}`);
      
      // レート制限対策（1秒あたり100リクエスト制限）
      if ((i + 1) % 50 === 0) {
        Utilities.sleep(1000);
      }
    }
    
    // 結果を表示
    let message = `完了しました！\n\n`;
    message += `更新: ${updatedCount}件\n`;
    
    if (createIfNotExists && createdCount > 0) {
      message += `作成: ${createdCount}件\n`;
      if (createdStudents.length <= 10) {
        message += `\n作成したフォルダ:\n${createdStudents.join(', ')}`;
      }
    }
    
    if (notFoundCount > 0) {
      message += `未検出: ${notFoundCount}件\n`;
      if (notFoundStudents.length <= 10) {
        message += `\n未検出の学籍番号:\n${notFoundStudents.join(', ')}`;
      }
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
 * フォルダ一覧を表示
 */
function showFolderList() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
    const folders = parentFolder.getFolders();
    
    const folderList = [];
    while (folders.hasNext()) {
      const folder = folders.next();
      folderList.push(folder.getName());
    }
    
    folderList.sort();
    
    let message = `親フォルダ内のフォルダ一覧 (${folderList.length}件):\n\n`;
    message += folderList.slice(0, 20).join('\n');
    
    if (folderList.length > 20) {
      message += `\n...他 ${folderList.length - 20}件`;
    }
    
    ui.alert('フォルダ一覧', message, ui.ButtonSet.OK);
    
  } catch (error) {
    Logger.log('エラー:', error);
    ui.alert('エラー', `フォルダ一覧の取得中にエラーが発生しました:\n${error.message}`, ui.ButtonSet.OK);
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
