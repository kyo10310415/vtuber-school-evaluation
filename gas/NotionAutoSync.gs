/**
 * Notion自動同期スクリプト
 * 
 * 機能:
 * - NotionのWannaV Tutors Databaseから生徒データを取得
 * - 生徒マスタシート（Google Sheets）のF列・G列を自動更新
 * - 毎日午前3時に自動実行（トリガー設定）
 * 
 * セットアップ:
 * 1. スクリプトプロパティに NOTION_API_TOKEN を設定
 * 2. setupDailyTrigger() を実行してトリガーを作成
 */

// 設定
const STUDENT_MASTER_SPREADSHEET_ID = '1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M';
const SHEET_NAME = 'リスト';
const NOTION_DATABASE_ID = '88e474e5400f44998fa04d982b1c8ef7';

/**
 * メイン関数: Notionから生徒マスタシートを自動更新
 */
function syncNotionToSheet() {
  try {
    console.log('=== Notion自動同期開始 ===');
    
    // Notion APIトークンを取得
    const notionToken = PropertiesService.getScriptProperties().getProperty('NOTION_API_TOKEN');
    
    if (!notionToken) {
      throw new Error('NOTION_API_TOKEN が設定されていません。setupNotionToken() を実行してください。');
    }
    
    // Notionからデータ取得
    console.log('Notionデータ取得中...');
    const notionData = fetchNotionData(notionToken);
    console.log(`Notion取得完了: ${notionData.length}件`);
    
    // 生徒マスタシートを更新
    console.log('生徒マスタシート更新中...');
    updateStudentMasterSheet(notionData);
    console.log('生徒マスタシート更新完了');
    
    console.log('=== Notion自動同期完了 ===');
    
    // 成功通知（オプション）
    sendNotification('success', `Notion自動同期完了: ${notionData.length}件の生徒データを更新しました`);
    
  } catch (error) {
    console.error('エラー:', error);
    
    // エラー通知（オプション）
    sendNotification('error', `Notion自動同期エラー: ${error.message}`);
    
    throw error;
  }
}

/**
 * Notionデータベースからデータをすべて取得
 * @param {string} notionToken - Notion APIトークン
 * @returns {Array<{studentId: string, youtubeChannelId: string, xAccount: string}>}
 */
function fetchNotionData(notionToken) {
  const allData = [];
  let hasMore = true;
  let startCursor = null;
  
  while (hasMore) {
    const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
    const payload = {
      page_size: 100
    };
    
    if (startCursor) {
      payload.start_cursor = startCursor;
    }
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      throw new Error(`Notion API Error: ${statusCode} - ${response.getContentText()}`);
    }
    
    const data = JSON.parse(response.getContentText());
    
    // データを抽出
    for (const page of data.results) {
      const properties = page.properties;
      
      // 学籍番号（Title型）
      const studentIdProp = properties['学籍番号'];
      const studentId = studentIdProp?.title?.[0]?.text?.content || '';
      
      // YouTubeチャンネルID（Text型）
      const youtubeProp = properties['YTチャンネルID'];
      const youtubeChannelId = youtubeProp?.rich_text?.[0]?.text?.content || '';
      
      // Xアカウント（Text型）
      const xProp = properties['X ID（＠は無し）'];
      const xAccount = xProp?.rich_text?.[0]?.text?.content || '';
      
      if (studentId) {
        allData.push({
          studentId: studentId,
          youtubeChannelId: youtubeChannelId,
          xAccount: xAccount
        });
      }
    }
    
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }
  
  return allData;
}

/**
 * 生徒マスタシートを更新
 * @param {Array} notionData - Notionから取得したデータ
 */
function updateStudentMasterSheet(notionData) {
  const ss = SpreadsheetApp.openById(STUDENT_MASTER_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    throw new Error(`シート「${SHEET_NAME}」が見つかりません`);
  }
  
  // NotionデータをMapに変換
  const notionMap = new Map();
  for (const data of notionData) {
    notionMap.set(data.studentId, data);
  }
  
  // 既存データを取得
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];
  
  // 列インデックスを特定
  const studentIdColIdx = 1; // B列: 学籍番号
  let youtubeColIdx = headers.indexOf('YouTubeチャンネルID');
  let xAccountColIdx = headers.indexOf('Xアカウント');
  
  // 列が存在しない場合は追加
  if (youtubeColIdx === -1) {
    youtubeColIdx = headers.length;
    sheet.getRange(1, youtubeColIdx + 1).setValue('YouTubeチャンネルID');
    console.log('F列に「YouTubeチャンネルID」を追加');
  }
  
  if (xAccountColIdx === -1) {
    xAccountColIdx = headers.length + (youtubeColIdx === headers.length ? 1 : 0);
    sheet.getRange(1, xAccountColIdx + 1).setValue('Xアカウント');
    console.log('G列に「Xアカウント」を追加');
  }
  
  // 各行を更新
  let updateCount = 0;
  const updateData = [];
  
  for (let i = 1; i < data.length; i++) {
    const studentId = data[i][studentIdColIdx];
    
    if (studentId && notionMap.has(studentId)) {
      const notionStudent = notionMap.get(studentId);
      
      // 更新データを準備
      updateData.push({
        row: i + 1,
        youtube: notionStudent.youtubeChannelId,
        x: notionStudent.xAccount
      });
      
      updateCount++;
    }
  }
  
  // 一括更新（パフォーマンス向上）
  for (const update of updateData) {
    if (update.youtube) {
      sheet.getRange(update.row, youtubeColIdx + 1).setValue(update.youtube);
    }
    if (update.x) {
      sheet.getRange(update.row, xAccountColIdx + 1).setValue(update.x);
    }
  }
  
  console.log(`✅ ${updateCount}件の生徒データを更新しました`);
}

/**
 * 通知を送信（オプション）
 * @param {string} type - 'success' または 'error'
 * @param {string} message - 通知メッセージ
 */
function sendNotification(type, message) {
  // Slackやメール通知を追加する場合はここに実装
  // 例: Slack Webhook、GmailApp.sendEmail など
  console.log(`[通知] ${type}: ${message}`);
}

// ========================================
// セットアップ関数
// ========================================

/**
 * Notion APIトークンを設定
 * 
 * 使い方:
 * 1. この関数を実行
 * 2. プロンプトにNotionトークンを入力
 */
function setupNotionToken() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Notion APIトークンを設定',
    'Notion Integration Token (secret_xxx...) を入力してください:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (result.getSelectedButton() === ui.Button.OK) {
    const token = result.getResponseText().trim();
    
    if (!token.startsWith('secret_')) {
      ui.alert('エラー', '無効なトークン形式です。secret_ で始まるトークンを入力してください。', ui.ButtonSet.OK);
      return;
    }
    
    PropertiesService.getScriptProperties().setProperty('NOTION_API_TOKEN', token);
    ui.alert('成功', 'Notion APIトークンを設定しました。', ui.ButtonSet.OK);
    
    console.log('Notion APIトークン設定完了');
  }
}

/**
 * 毎日午前3時に自動実行するトリガーを設定
 */
function setupDailyTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'syncNotionToSheet') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // 新しいトリガーを作成
  ScriptApp.newTrigger('syncNotionToSheet')
    .timeBased()
    .atHour(3) // 午前3時
    .everyDays(1) // 毎日
    .create();
  
  console.log('✅ 毎日午前3時の自動実行トリガーを設定しました');
  SpreadsheetApp.getUi().alert('トリガー設定完了', '毎日午前3時にNotionと自動同期します。', SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * トリガーを削除
 */
function removeDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'syncNotionToSheet') {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  }
  
  console.log(`✅ ${count}件のトリガーを削除しました`);
  SpreadsheetApp.getUi().alert('トリガー削除完了', `${count}件のトリガーを削除しました。`, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * 手動テスト実行
 */
function testSync() {
  console.log('=== 手動テスト実行 ===');
  syncNotionToSheet();
  SpreadsheetApp.getUi().alert('テスト完了', 'Notion同期が正常に完了しました。', SpreadsheetApp.getUi().ButtonSet.OK);
}
