/**
 * VTuberスクール 成長度リザルトシステム
 * Google Apps Script - 月次自動採点スクリプト
 * 
 * 【セットアップ手順】
 * 1. Google スプレッドシートを開く
 * 2. 「拡張機能」→「Apps Script」をクリック
 * 3. このコードを貼り付ける
 * 4. API_BASE_URLを実際のデプロイURLに変更
 * 5. トリガーを設定：「時計アイコン」→「トリガーを追加」
 *    - 実行する関数: runMonthlyEvaluation
 *    - イベントのソース: 時間主導型
 *    - 時間ベースのトリガーのタイプ: 月タイマー
 *    - 日: 1日
 *    - 時刻: 午前9時～10時
 */

// APIのベースURL（デプロイ後に変更してください）
const API_BASE_URL = 'https://your-app.pages.dev';

/**
 * 月次採点を実行（メイン関数）
 */
function runMonthlyEvaluation() {
  // 前月を取得（例: 2024-11）
  const lastMonth = getLastMonth();
  
  Logger.log(`=== 採点開始: ${lastMonth} ===`);
  
  try {
    const result = executeEvaluation(lastMonth);
    
    if (result.success) {
      Logger.log(`✅ 採点成功: ${result.message}`);
      Logger.log(`評価件数: ${result.results ? result.results.length : 0}件`);
      
      // 結果をスプレッドシートに記録（オプション）
      logEvaluationToSheet(lastMonth, result);
      
      // 成功通知を送信（オプション）
      sendSuccessNotification(lastMonth, result);
    } else {
      Logger.log(`❌ 採点失敗: ${result.message}`);
      
      // エラー通知を送信
      sendErrorNotification(lastMonth, result.message);
    }
  } catch (error) {
    Logger.log(`❌ エラー発生: ${error.message}`);
    sendErrorNotification(lastMonth, error.message);
  }
  
  Logger.log('=== 採点終了 ===');
}

/**
 * 特定の月の採点を実行
 * @param {string} month - 評価対象月（YYYY-MM形式）
 */
function executeEvaluation(month) {
  const url = `${API_BASE_URL}/api/evaluate`;
  
  const payload = {
    month: month
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // エラー時もレスポンスを取得
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const result = JSON.parse(response.getContentText());
  
  Logger.log(`ステータスコード: ${statusCode}`);
  
  return result;
}

/**
 * 前月を取得（YYYY-MM形式）
 */
function getLastMonth() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  const year = lastMonth.getFullYear();
  const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
  
  return `${year}-${month}`;
}

/**
 * 評価結果をスプレッドシートに記録（オプション）
 */
function logEvaluationToSheet(month, result) {
  // このスクリプトが紐づいているスプレッドシート
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 「実行ログ」シートを取得（なければ作成）
  let logSheet = ss.getSheetByName('実行ログ');
  if (!logSheet) {
    logSheet = ss.insertSheet('実行ログ');
    logSheet.appendRow(['実行日時', '評価月', '状態', '評価件数', 'メッセージ']);
  }
  
  // ログを追加
  const now = new Date();
  const status = result.success ? '成功' : '失敗';
  const count = result.results ? result.results.length : 0;
  
  logSheet.appendRow([
    Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    month,
    status,
    count,
    result.message
  ]);
}

/**
 * 成功通知を送信（オプション）
 * Gmailで通知を送る場合
 */
function sendSuccessNotification(month, result) {
  // 通知先メールアドレス（必要に応じて変更）
  const recipient = Session.getActiveUser().getEmail();
  
  const subject = `[成功] ${month}の採点が完了しました`;
  
  const body = `
VTuberスクール成長度リザルトシステム

評価月: ${month}
状態: 成功
評価件数: ${result.results ? result.results.length : 0}件
メッセージ: ${result.message}

結果の詳細は以下のURLで確認できます：
${API_BASE_URL}

---
このメールは自動送信されています
  `.trim();
  
  // GmailApp.sendEmail(recipient, subject, body);
  Logger.log(`通知メール準備完了: ${recipient}`);
}

/**
 * エラー通知を送信
 */
function sendErrorNotification(month, errorMessage) {
  const recipient = Session.getActiveUser().getEmail();
  
  const subject = `[エラー] ${month}の採点に失敗しました`;
  
  const body = `
VTuberスクール成長度リザルトシステム

評価月: ${month}
状態: エラー
エラー内容: ${errorMessage}

以下を確認してください：
1. APIが正常に動作しているか
2. 環境変数が正しく設定されているか
3. スプレッドシートのアクセス権限

システムURL: ${API_BASE_URL}

---
このメールは自動送信されています
  `.trim();
  
  // GmailApp.sendEmail(recipient, subject, body);
  Logger.log(`エラー通知メール準備完了: ${recipient}`);
}

/**
 * 手動テスト用: 今月のデータで採点
 */
function testThisMonth() {
  const thisMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  Logger.log(`テスト実行: ${thisMonth}`);
  
  const result = executeEvaluation(thisMonth);
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * 生徒一覧を取得してログに表示（デバッグ用）
 */
function testGetStudents() {
  const url = `${API_BASE_URL}/api/students`;
  
  const options = {
    method: 'GET',
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  
  Logger.log('生徒一覧:');
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * APIヘルスチェック（デバッグ用）
 */
function testHealthCheck() {
  const url = `${API_BASE_URL}/api/health`;
  
  const response = UrlFetchApp.fetch(url);
  const result = JSON.parse(response.getContentText());
  
  Logger.log('ヘルスチェック:');
  Logger.log(JSON.stringify(result, null, 2));
}
