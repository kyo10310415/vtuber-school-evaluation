/**
 * WannaV成長度リザルトシステム - 月次自動評価スクリプト
 * 
 * 機能:
 * 1. 毎月月末に自動実行
 * 2. 全生徒のYouTube & X評価を実行
 * 3. 評価結果をスプレッドシートに自動書き込み
 * 
 * セットアップ手順:
 * 1. Google Sheetsで「拡張機能」→「Apps Script」を開く
 * 2. このコードを貼り付け
 * 3. CONFIG セクションの設定を変更
 * 4. setupMonthlyTrigger() を実行してトリガーを設定
 */

// ================== 設定セクション ==================
const CONFIG = {
  // デプロイURL（Render等のURL）
  API_BASE_URL: 'https://vtuber-school-evaluation.onrender.com',
  
  // 結果書き込み先スプレッドシートID
  RESULT_SPREADSHEET_ID: '1t571fqZJtUjNL7_gH6G2dSNBCmS98LTnDrWEtt7J92k',
  
  // 生徒マスタースプレッドシートID
  STUDENT_MASTER_SPREADSHEET_ID: '1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M',
};

// ================== メイン処理 ==================

/**
 * 月次評価を自動実行（月末トリガーから呼ばれる）
 */
function runMonthlyEvaluation() {
  try {
    Logger.log('=== 月次評価開始 ===');
    
    // 対象月を取得（前月）
    const targetMonth = getPreviousMonth();
    Logger.log(`対象月: ${targetMonth}`);
    
    // 生徒一覧を取得
    const students = fetchStudents();
    Logger.log(`生徒数: ${students.length}名`);
    
    // YouTube & X評価を実行
    const youtubeResults = [];
    const xResults = [];
    
    for (const student of students) {
      Logger.log(`評価中: ${student.name} (${student.studentId})`);
      
      // YouTube評価
      if (student.youtubeChannelId) {
        try {
          const youtubeEval = evaluateYouTube(student.studentId, targetMonth);
          if (youtubeEval) {
            youtubeResults.push({
              studentId: student.studentId,
              studentName: student.name,
              month: targetMonth,
              ...youtubeEval
            });
          }
        } catch (error) {
          Logger.log(`YouTube評価エラー (${student.studentId}): ${error.message}`);
        }
      }
      
      // X評価
      if (student.xAccount) {
        try {
          const xEval = evaluateX(student.studentId, targetMonth);
          if (xEval) {
            xResults.push({
              studentId: student.studentId,
              studentName: student.name,
              month: targetMonth,
              ...xEval
            });
          }
        } catch (error) {
          Logger.log(`X評価エラー (${student.studentId}): ${error.message}`);
        }
      }
      
      // レート制限対策（APIの負荷を下げる）
      Utilities.sleep(1000); // 1秒待機
    }
    
    // 結果をスプレッドシートに書き込み
    if (youtubeResults.length > 0) {
      writeYouTubeResultsToSheet(youtubeResults, targetMonth);
      Logger.log(`YouTube評価結果を書き込み: ${youtubeResults.length}件`);
    }
    
    if (xResults.length > 0) {
      writeXResultsToSheet(xResults, targetMonth);
      Logger.log(`X評価結果を書き込み: ${xResults.length}件`);
    }
    
    Logger.log('=== 月次評価完了 ===');
    
    // 完了通知（オプション）
    sendCompletionNotification(targetMonth, youtubeResults.length, xResults.length);
    
  } catch (error) {
    Logger.log(`エラー: ${error.message}`);
    Logger.log(error.stack);
    
    // エラー通知（オプション）
    sendErrorNotification(error);
  }
}

/**
 * 手動実行用（テスト用）
 * 実行前に日付を確認してください
 */
function runMonthlyEvaluationManual() {
  // 対象月を指定（例: 2025-01）
  const targetMonth = '2025-01';
  
  Logger.log(`手動実行: ${targetMonth}`);
  
  // 以下は runMonthlyEvaluation() と同じ処理
  // ...（省略）
}

// ================== API呼び出し ==================

/**
 * 生徒一覧を取得
 */
function fetchStudents() {
  const url = `${CONFIG.API_BASE_URL}/api/students`;
  const options = {
    method: 'get',
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  
  if (!data.success) {
    throw new Error('生徒一覧の取得に失敗しました: ' + data.error);
  }
  
  return data.students;
}

/**
 * YouTube評価を実行
 */
function evaluateYouTube(studentId, month) {
  const url = `${CONFIG.API_BASE_URL}/api/youtube/evaluate/${encodeURIComponent(studentId)}?month=${month}`;
  const options = {
    method: 'get',
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  
  if (!data.success) {
    Logger.log(`YouTube評価失敗 (${studentId}): ${data.error}`);
    return null;
  }
  
  return data.evaluation;
}

/**
 * X評価を実行
 */
function evaluateX(studentId, month) {
  const url = `${CONFIG.API_BASE_URL}/api/x/evaluate/${encodeURIComponent(studentId)}?month=${month}`;
  const options = {
    method: 'get',
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  
  if (!data.success) {
    Logger.log(`X評価失敗 (${studentId}): ${data.error}`);
    return null;
  }
  
  return data.evaluation;
}

// ================== スプレッドシート書き込み ==================

/**
 * YouTube評価結果をスプレッドシートに書き込み
 */
function writeYouTubeResultsToSheet(results, month) {
  const ss = SpreadsheetApp.openById(CONFIG.RESULT_SPREADSHEET_ID);
  const sheetName = `YouTube_${month}`;
  
  // シートを作成または取得
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear(); // 既存データをクリア
  }
  
  // ヘッダー行
  const headers = [
    '学籍番号', '氏名', '評価月',
    '登録者数', '登録者伸び率', '総再生回数',
    '月間動画数', '週間配信回数', '週4回配信目標達成',
    '平均配信時間', '1.5時間配信目標達成',
    '総いいね数', '総コメント数', 'エンゲージメント率',
    'タイトル品質', 'サムネイル品質'
  ];
  
  sheet.appendRow(headers);
  
  // データ行
  results.forEach(result => {
    const row = [
      result.studentId,
      result.studentName,
      result.month,
      result.subscriberCount || 0,
      result.subscriberGrowthRate || 0,
      result.totalViews || 0,
      result.videosInMonth || 0,
      result.weeklyStreamCount || 0,
      result.meetsWeekly4StreamsGoal ? '達成' : '未達成',
      result.averageStreamDuration || 0,
      result.meetsMinimum90MinutesGoal ? '達成' : '未達成',
      result.totalLikes || 0,
      result.totalComments || 0,
      result.engagementRate || 0,
      result.titleQuality || '-',
      result.thumbnailQuality || '-'
    ];
    
    sheet.appendRow(row);
  });
  
  // フォーマット設定
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4A5568').setFontColor('white');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * X評価結果をスプレッドシートに書き込み
 */
function writeXResultsToSheet(results, month) {
  const ss = SpreadsheetApp.openById(CONFIG.RESULT_SPREADSHEET_ID);
  const sheetName = `X_${month}`;
  
  // シートを作成または取得
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear(); // 既存データをクリア
  }
  
  // ヘッダー行
  const headers = [
    '学籍番号', '氏名', '評価月',
    'フォロワー数', 'フォロー数', 'フォロワー伸び率',
    '1日あたりのフォロー数', '1日10フォロー目標達成',
    '月間投稿数', '1日あたりの投稿数', '1日2回投稿目標達成',
    '週間企画投稿数', '週2回企画目標達成',
    '総いいね数', '総リツイート数', '総リプライ数',
    '総インプレッション数', 'エンゲージメント率',
    'エンゲージメント伸び率', 'インプレッション伸び率'
  ];
  
  sheet.appendRow(headers);
  
  // データ行
  results.forEach(result => {
    const row = [
      result.studentId,
      result.studentName,
      result.month,
      result.followersCount || 0,
      result.followingCount || 0,
      result.followerGrowthRate || 0,
      result.dailyFollows || 0,
      result.meetsDailyFollowGoal ? '達成' : '未達成',
      result.tweetsInMonth || 0,
      result.dailyTweetCount || 0,
      result.meetsDailyTweetGoal ? '達成' : '未達成',
      result.weeklyPlanningTweets || 0,
      result.meetsWeeklyPlanningGoal ? '達成' : '未達成',
      result.totalLikes || 0,
      result.totalRetweets || 0,
      result.totalReplies || 0,
      result.totalImpressions || 0,
      result.engagementRate || 0,
      result.engagementGrowthRate || 0,
      result.impressionGrowthRate || 0
    ];
    
    sheet.appendRow(row);
  });
  
  // フォーマット設定
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4A5568').setFontColor('white');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

// ================== ユーティリティ ==================

/**
 * 前月を取得（YYYY-MM形式）
 */
function getPreviousMonth() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * 完了通知を送信（オプション）
 */
function sendCompletionNotification(month, youtubeCount, xCount) {
  // メール通知やSlack通知などを実装
  // 例: GmailApp.sendEmail(...);
  Logger.log(`完了通知: ${month} - YouTube: ${youtubeCount}件, X: ${xCount}件`);
}

/**
 * エラー通知を送信（オプション）
 */
function sendErrorNotification(error) {
  // エラー通知を実装
  Logger.log(`エラー通知: ${error.message}`);
}

// ================== トリガー設定 ==================

/**
 * 月次評価トリガーを設定
 * 
 * 実行方法:
 * 1. Apps Scriptエディタで「setupMonthlyTrigger」を選択
 * 2. 実行ボタンをクリック
 * 3. 権限を承認
 * 4. ログで「月次評価トリガーを設定しました」と表示されれば成功
 */
function setupMonthlyTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'runMonthlyEvaluation') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // 新しいトリガーを作成
  // 毎月28日〜31日の間の午前3時に実行（月末に近い日付で実行）
  ScriptApp.newTrigger('runMonthlyEvaluation')
    .timeBased()
    .onMonthDay(28) // 毎月28日
    .atHour(3) // 午前3時
    .create();
  
  Logger.log('月次評価トリガーを設定しました（毎月28日 午前3時実行）');
}

/**
 * トリガーを削除
 */
function deleteMonthlyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'runMonthlyEvaluation') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('月次評価トリガーを削除しました');
    }
  });
}

/**
 * トリガー一覧を表示
 */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    Logger.log(`関数: ${trigger.getHandlerFunction()}`);
    Logger.log(`イベントタイプ: ${trigger.getEventType()}`);
    Logger.log(`トリガーソース: ${trigger.getTriggerSource()}`);
    Logger.log('---');
  });
}
