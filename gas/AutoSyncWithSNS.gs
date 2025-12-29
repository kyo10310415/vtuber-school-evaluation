/**
 * メイン同期関数（トリガーから実行）
 * 1. 生徒データを同期
 * 2. SNSアカウント情報を更新
 */
function syncDataAndUpdateSNS() {
  Logger.log('=== データ同期開始 ===');
  
  // 1. 生徒データを同期（既存の関数）
  syncDataWithStudentID();
  Logger.log('✓ 生徒データ同期完了');
  
  // 2. SNSアカウント情報を更新
  updateSNSAccounts();
  Logger.log('✓ SNSアカウント情報更新完了');
  
  Logger.log('=== すべての処理完了 ===');
}

/**
 * 時間ベーストリガーをセットアップ
 * 実行方法: Apps Scriptエディタでこの関数を実行
 */
function setupAutoSyncTrigger() {
  // 既存のトリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncDataAndUpdateSNS') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 新しいトリガーを作成（例: 毎日午前2時に実行）
  ScriptApp.newTrigger('syncDataAndUpdateSNS')
    .timeBased()
    .atHour(2) // 午前2時
    .everyDays(1) // 毎日
    .create();
  
  Logger.log('✓ 自動同期トリガーを設定しました（毎日午前2時）');
}

/**
 * トリガーを削除
 */
function deleteAutoSyncTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncDataAndUpdateSNS') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('✓ トリガーを削除しました');
    }
  }
}
