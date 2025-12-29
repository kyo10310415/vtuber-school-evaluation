/**
 * 生徒データを同期 + SNSアカウント情報を自動更新
 * A~D列を更新し、E列（URL）を保持、F列・G列（SNSアカウント）を自動更新
 */
function syncDataWithStudentID() {
  Logger.log('=== データ同期開始 ===');
  
  // 取得元のスプレッドシート
  var sourceSpreadsheet = SpreadsheetApp.openById('1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM');
  var sourceSheet = sourceSpreadsheet.getSheetByName('❶RAW_生徒様情報');
  
  // 目的のスプレッドシート
  var targetSpreadsheet = SpreadsheetApp.openById('1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M');
  var targetSheet = targetSpreadsheet.getSheets()[0]; // 最初のシートを使用
  
  // 取得元のデータを取得(A~D列)
  var sourceData = sourceSheet.getDataRange().getValues();
  
  // 目的のシートの現在のデータを取得
  var targetData = targetSheet.getDataRange().getValues();
  
  // E列（URL）を学籍番号をキーにして保存
  var urlMap = {};
  for (var i = 1; i < targetData.length; i++) { // 1行目はヘッダーなのでスキップ
    var studentId = targetData[i][0]; // A列の学籍番号
    var url = targetData[i][4]; // E列のURL
    if (studentId && url) {
      urlMap[studentId] = url;
    }
  }
  
  // 新しいデータを作成（A~E列）
  var newData = [];
  for (var i = 0; i < sourceData.length; i++) {
    var row = sourceData[i].slice(0, 4); // A~D列をコピー
    
    if (i === 0) {
      // ヘッダー行
      row.push(targetData[0] && targetData[0][4] ? targetData[0][4] : 'トークメモフォルダURL'); // E列のヘッダー
    } else {
      // データ行
      var studentId = sourceData[i][0];
      var existingUrl = urlMap[studentId] || ''; // 学籍番号に紐付いたURLを取得
      row.push(existingUrl);
    }
    
    newData.push(row);
  }
  
  // シートをクリアして新しいデータを書き込み
  targetSheet.clear();
  if (newData.length > 0) {
    targetSheet.getRange(1, 1, newData.length, 5).setValues(newData);
  }
  
  Logger.log('✓ 生徒データ同期完了: ' + new Date());
  Logger.log('✓ 同期した行数: ' + (newData.length - 1));
  
  // === ここからSNSアカウント情報の更新 ===
  Logger.log('=== SNSアカウント情報更新開始 ===');
  
  try {
    // NotionからSNSデータを取得（ここでは簡易版として、既存のTSVデータを使用）
    // 実際のNotion連携が必要な場合は、NotionAutoSync.gs を参照
    updateSNSAccountsFromNotion(targetSheet);
    Logger.log('✓ SNSアカウント情報更新完了');
  } catch (error) {
    Logger.log('⚠️ SNSアカウント情報の更新でエラー: ' + error.message);
  }
  
  Logger.log('=== すべての処理完了 ===');
}

/**
 * NotionからSNSアカウント情報を取得してスプレッドシートを更新
 * ※この関数は簡易版です。実際のNotion API連携が必要な場合は NotionAutoSync.gs を参照
 */
function updateSNSAccountsFromNotion(sheet) {
  // TSVデータ（Notionから事前にエクスポートしたデータ）
  // 実際の運用では、Notion APIを使って動的に取得することを推奨
  var DATA = `
学籍番号\tYouTubeチャンネルID\tXアカウント
OLPR230012-CX\tUCUNlc1_FNlpJTX-TyyA6LAA\tHisuiSui_v
OLST240099-TE\tUCYwluF88NmqAU5qNF6qM8xQ\tMegane_tennenn
OLST240098-RY\tUCDaKUcwNqUdAZN9qUHqweXw\tNeon_Aoiro
OLTS240488-AR\tUCXuqSBlHAE6Xw-yeJA0Tunw\tlinda_gaming
`.trim();
  
  // TSVをパースしてマップを作成
  var lines = DATA.split('\n');
  var snsMap = {};
  
  for (var i = 1; i < lines.length; i++) { // ヘッダーをスキップ
    var cols = lines[i].split('\t');
    if (cols.length >= 3) {
      var studentId = cols[0].trim();
      var youtubeId = cols[1].trim();
      var xAccount = cols[2].trim();
      
      if (studentId) {
        snsMap[studentId] = {
          youtube: youtubeId,
          x: xAccount
        };
      }
    }
  }
  
  // 現在のシートデータを取得
  var range = sheet.getDataRange();
  var values = range.getValues();
  
  // F列・G列が存在しない場合はヘッダーを追加
  if (!values[0][5]) {
    values[0][5] = 'YouTubeチャンネルID';
  }
  if (!values[0][6]) {
    values[0][6] = 'Xアカウント';
  }
  
  // 各行のSNSアカウント情報を更新
  var updateCount = 0;
  for (var i = 1; i < values.length; i++) {
    var studentId = values[i][0]; // A列の学籍番号
    
    if (studentId && snsMap[studentId]) {
      values[i][5] = snsMap[studentId].youtube || ''; // F列
      values[i][6] = snsMap[studentId].x || ''; // G列
      updateCount++;
    } else {
      // SNSデータが見つからない場合は空欄を保持
      if (!values[i][5]) values[i][5] = '';
      if (!values[i][6]) values[i][6] = '';
    }
  }
  
  // 更新されたデータを書き込み
  sheet.getRange(1, 1, values.length, 7).setValues(values);
  
  Logger.log('✓ SNSアカウント情報を更新: ' + updateCount + '件');
}

/**
 * テスト実行用
 */
function testSyncWithSNS() {
  syncDataWithStudentID();
}
