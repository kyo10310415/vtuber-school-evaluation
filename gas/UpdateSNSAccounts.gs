/**
 * 生徒マスタシートにYouTubeチャンネルIDとXアカウントを追加するスクリプト
 * 
 * 使い方:
 * 1. NotionからエクスポートしたCSVの内容を、このスクリプトのDATA変数に貼り付ける
 * 2. updateSNSAccounts() 関数を実行
 */

// 生徒マスタスプレッドシートID
const STUDENT_MASTER_SPREADSHEET_ID = '1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M';
const SHEET_NAME = 'リスト';

// NotionからエクスポートしたTSVデータをここに貼り付け
// フォーマット: 学籍番号 [TAB] YouTubeチャンネルID [TAB] Xアカウント
const DATA = `
OLPR230012-CX	UCUNlc1_FNlpJTX-TyyA6LAA	HisuiSui_v
OLST240099-TE	UCYwluF88NmqAU5qNF6qM8xQ	Megane_tennenn
OLST240098-RY	UCDaKUcwNqUdAZN9qUHqweXw	Neon_Aoiro
`.trim();

/**
 * メイン関数: 生徒マスタシートを更新（自動実行用）
 * トリガーから実行される場合はUI非依存
 */
function updateSNSAccounts() {
  console.log('=== SNSアカウント情報更新開始 ===');
  
  const ss = SpreadsheetApp.openById(STUDENT_MASTER_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    throw new Error(`シート「${SHEET_NAME}」が見つかりません`);
  }
  
  // TSVデータをパース
  const snsData = parseData(DATA);
  console.log(`TSVデータ読み込み: ${snsData.size}件`);
  
  // 既存データを取得
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  
  const headers = data[0];
  
  // 学籍番号の列を特定（B列 = index 1）
  const studentIdColIdx = 1; // B列
  
  // YouTubeチャンネルIDとXアカウントの列を確認・追加
  let youtubeColIdx = headers.indexOf('YouTubeチャンネルID');
  let xAccountColIdx = headers.indexOf('Xアカウント');
  
  // 列が存在しない場合は追加
  if (youtubeColIdx === -1) {
    youtubeColIdx = headers.length;
    sheet.getRange(1, youtubeColIdx + 1).setValue('YouTubeチャンネルID');
    console.log(`F列に「YouTubeチャンネルID」を追加`);
  }
  
  if (xAccountColIdx === -1) {
    xAccountColIdx = headers.length + (youtubeColIdx === headers.length ? 1 : 0);
    sheet.getRange(1, xAccountColIdx + 1).setValue('Xアカウント');
    console.log(`G列に「Xアカウント」を追加`);
  }
  
  // 各行を更新
  let updateCount = 0;
  let notFoundCount = 0;
  
  for (let i = 1; i < data.length; i++) {
    const studentId = data[i][studentIdColIdx];
    
    if (studentId && snsData.has(studentId)) {
      const sns = snsData.get(studentId);
      
      // YouTubeチャンネルIDを更新
      if (sns.youtube) {
        sheet.getRange(i + 1, youtubeColIdx + 1).setValue(sns.youtube);
      }
      
      // Xアカウントを更新
      if (sns.x) {
        sheet.getRange(i + 1, xAccountColIdx + 1).setValue(sns.x);
      }
      
      updateCount++;
    } else if (studentId) {
      notFoundCount++;
    }
  }
  
  console.log(`✅ 更新完了: ${updateCount}件更新, ${notFoundCount}件見つからず`);
  
  // トリガー実行時はUIが使えないため、ログのみ出力
  console.log(`更新サマリー: ${updateCount}件の生徒のSNSアカウント情報を更新しました。${notFoundCount}件の生徒はNotionデータに見つかりませんでした。`);
  
  console.log('=== SNSアカウント情報更新完了 ===');
}

/**
 * 手動実行用: 生徒マスタシートを更新（UI付き）
 * スプレッドシートから手動で実行する場合に使用
 */
function updateSNSAccountsManual() {
  const ui = SpreadsheetApp.getUi();
  
  // 確認ダイアログ
  const response = ui.alert(
    'SNSアカウント情報更新',
    'NotionデータからSNSアカウント情報を更新しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    ui.alert('キャンセルしました');
    return;
  }
  
  try {
    console.log('=== SNSアカウント情報更新開始（手動実行） ===');
    
    const ss = SpreadsheetApp.openById(STUDENT_MASTER_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`シート「${SHEET_NAME}」が見つかりません`);
    }
    
    // TSVデータをパース
    const snsData = parseData(DATA);
    console.log(`TSVデータ読み込み: ${snsData.size}件`);
    
    // 既存データを取得
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    
    const headers = data[0];
    
    // 学籍番号の列を特定（B列 = index 1）
    const studentIdColIdx = 1; // B列
    
    // YouTubeチャンネルIDとXアカウントの列を確認・追加
    let youtubeColIdx = headers.indexOf('YouTubeチャンネルID');
    let xAccountColIdx = headers.indexOf('Xアカウント');
    
    // 列が存在しない場合は追加
    if (youtubeColIdx === -1) {
      youtubeColIdx = headers.length;
      sheet.getRange(1, youtubeColIdx + 1).setValue('YouTubeチャンネルID');
      console.log(`F列に「YouTubeチャンネルID」を追加`);
    }
    
    if (xAccountColIdx === -1) {
      xAccountColIdx = headers.length + (youtubeColIdx === headers.length ? 1 : 0);
      sheet.getRange(1, xAccountColIdx + 1).setValue('Xアカウント');
      console.log(`G列に「Xアカウント」を追加`);
    }
    
    // 各行を更新
    let updateCount = 0;
    let notFoundCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const studentId = data[i][studentIdColIdx];
      
      if (studentId && snsData.has(studentId)) {
        const sns = snsData.get(studentId);
        
        // YouTubeチャンネルIDを更新
        if (sns.youtube) {
          sheet.getRange(i + 1, youtubeColIdx + 1).setValue(sns.youtube);
        }
        
        // Xアカウントを更新
        if (sns.x) {
          sheet.getRange(i + 1, xAccountColIdx + 1).setValue(sns.x);
        }
        
        updateCount++;
      } else if (studentId) {
        notFoundCount++;
      }
    }
    
    console.log(`✅ 更新完了: ${updateCount}件更新, ${notFoundCount}件見つからず`);
    
    // 手動実行時は結果をダイアログで表示
    ui.alert(
      '更新完了',
      `${updateCount}件の生徒のSNSアカウント情報を更新しました。\n${notFoundCount}件の生徒はNotionデータに見つかりませんでした。`,
      ui.ButtonSet.OK
    );
    
    console.log('=== SNSアカウント情報更新完了（手動実行） ===');
    
  } catch (error) {
    console.error('エラー:', error);
    ui.alert('エラー', `更新中にエラーが発生しました:\n${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * TSVデータをパース
 * @param {string} tsvData - TSV形式のデータ
 * @returns {Map<string, {youtube: string, x: string}>}
 */
function parseData(tsvData) {
  const map = new Map();
  const lines = tsvData.trim().split('\n');
  
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const studentId = parts[0].trim();
      const youtube = parts[1].trim();
      const x = parts[2].trim();
      
      if (studentId) {
        map.set(studentId, { youtube, x });
      }
    }
  }
  
  return map;
}

/**
 * テスト関数: TSVパースのテスト
 */
function testParseData() {
  const testData = `
OLPR230012-CX	UCUNlc1_FNlpJTX-TyyA6LAA	HisuiSui_v
OLST240099-TE	UCYwluF88NmqAU5qNF6qM8xQ	Megane_tennenn
OLST240098-RY	UCDaKUcwNqUdAZN9qUHqweXw	Neon_Aoiro
  `.trim();
  
  const result = parseData(testData);
  console.log(`パース結果: ${result.size}件`);
  
  result.forEach((value, key) => {
    console.log(`${key}: YouTube=${value.youtube}, X=${value.x}`);
  });
}
