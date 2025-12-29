/**
 * 生徒データを同期（F列・G列を保持）
 * A~D列を更新し、E列（URL）とF列（YouTubeチャンネルID）とG列（Xアカウント）を保持
 */
function syncDataWithStudentID() {
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
  
  // E列（URL）、F列（YouTubeチャンネルID）、G列（Xアカウント）を学籍番号をキーにして保存
  var dataMap = {};
  for (var i = 1; i < targetData.length; i++) { // 1行目はヘッダーなのでスキップ
    var studentId = targetData[i][0]; // A列の学籍番号
    if (studentId) {
      dataMap[studentId] = {
        url: targetData[i][4] || '', // E列のURL
        youtubeChannelId: targetData[i][5] || '', // F列のYouTubeチャンネルID
        xAccount: targetData[i][6] || '' // G列のXアカウント
      };
    }
  }
  
  // 新しいデータを作成
  var newData = [];
  for (var i = 0; i < sourceData.length; i++) {
    var row = sourceData[i].slice(0, 4); // A~D列をコピー
    
    if (i === 0) {
      // ヘッダー行
      row.push(targetData[0] && targetData[0][4] ? targetData[0][4] : 'トークメモフォルダURL'); // E列
      row.push(targetData[0] && targetData[0][5] ? targetData[0][5] : 'YouTubeチャンネルID'); // F列
      row.push(targetData[0] && targetData[0][6] ? targetData[0][6] : 'Xアカウント'); // G列
    } else {
      // データ行
      var studentId = sourceData[i][0];
      var existingData = dataMap[studentId] || { url: '', youtubeChannelId: '', xAccount: '' };
      row.push(existingData.url); // E列
      row.push(existingData.youtubeChannelId); // F列
      row.push(existingData.xAccount); // G列
    }
    
    newData.push(row);
  }
  
  // シートをクリアして新しいデータを書き込み
  targetSheet.clear();
  if (newData.length > 0) {
    targetSheet.getRange(1, 1, newData.length, 7).setValues(newData); // 7列（A~G）
  }
  
  Logger.log('データ同期完了（F・G列保持）: ' + new Date());
  Logger.log('同期した行数: ' + (newData.length - 1));
}
