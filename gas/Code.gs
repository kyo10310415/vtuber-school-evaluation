/**
 * VTuber School 評価システム - Google Apps Script
 * 
 * このスクリプトをスプレッドシートに追加して、
 * カスタムメニューから評価を実行できるようにします。
 */

// === 設定 ===
const API_URL = 'https://vtuber-school-evaluation.onrender.com/api/evaluate';

// スプレッドシートを開いた時に実行される
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 評価実行')
    .addItem('🚀 評価を実行', 'showEvaluationDialog')
    .addSeparator()
    .addItem('⚙️ 設定', 'showSettingsDialog')
    .addToUi();
}

/**
 * 評価実行ダイアログを表示
 */
function showEvaluationDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            font-family: 'Google Sans', Arial, sans-serif;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
          }
          h2 {
            color: #1a73e8;
            margin-top: 0;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            font-weight: 500;
            margin-bottom: 8px;
            color: #5f6368;
          }
          input, textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #dadce0;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
          }
          textarea {
            min-height: 100px;
            font-family: monospace;
          }
          .help-text {
            font-size: 12px;
            color: #5f6368;
            margin-top: 4px;
          }
          button {
            background-color: #1a73e8;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            width: 100%;
          }
          button:hover {
            background-color: #1765cc;
          }
          button:disabled {
            background-color: #dadce0;
            cursor: not-allowed;
          }
          .spinner {
            display: none;
            text-align: center;
            padding: 20px;
          }
          .spinner.active {
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>📊 評価実行</h2>
          
          <div id="form">
            <div class="form-group">
              <label for="month">評価対象月 *</label>
              <input type="month" id="month" required>
              <div class="help-text">例: 2024-12</div>
            </div>
            
            <div class="form-group">
              <label for="studentIds">生徒ID（オプション）</label>
              <textarea id="studentIds" placeholder="OLTS240488-AR&#10;OLST230057-TQ&#10;OLST230058-KW"></textarea>
              <div class="help-text">
                • 1行に1つのIDを入力<br>
                • 空欄の場合は全生徒を評価
              </div>
            </div>
            
            <button onclick="runEvaluation()">🚀 評価を実行</button>
          </div>
          
          <div id="spinner" class="spinner">
            <p>評価を実行中...</p>
            <p style="font-size: 12px; color: #5f6368;">
              これには数分かかる場合があります
            </p>
          </div>
        </div>
        
        <script>
          function runEvaluation() {
            const month = document.getElementById('month').value;
            const studentIdsText = document.getElementById('studentIds').value;
            
            if (!month) {
              alert('評価対象月を入力してください');
              return;
            }
            
            // 生徒IDを配列に変換
            const studentIds = studentIdsText
              .split('\\n')
              .map(id => id.trim())
              .filter(id => id.length > 0);
            
            // UIを更新
            document.getElementById('form').style.display = 'none';
            document.getElementById('spinner').classList.add('active');
            
            // Apps Script関数を呼び出し
            google.script.run
              .withSuccessHandler(onSuccess)
              .withFailureHandler(onFailure)
              .executeEvaluation(month, studentIds);
          }
          
          function onSuccess(result) {
            if (result.success) {
              alert('✅ 評価が完了しました！\\n\\n' + 
                    result.message + '\\n\\n' +
                    '結果スプレッドシートを確認してください。');
            } else {
              alert('❌ エラーが発生しました\\n\\n' + result.message);
            }
            google.script.host.close();
          }
          
          function onFailure(error) {
            alert('❌ エラーが発生しました\\n\\n' + error.message);
            document.getElementById('form').style.display = 'block';
            document.getElementById('spinner').classList.remove('active');
          }
          
          // 現在の年月を設定
          window.onload = function() {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            document.getElementById('month').value = year + '-' + month;
          };
        </script>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(450);
  
  SpreadsheetApp.getUi().showModalDialog(html, '評価実行');
}

/**
 * 評価を実行（バックエンドAPIを呼び出し）
 */
function executeEvaluation(month, studentIds) {
  try {
    // リクエストボディを作成
    const payload = {
      month: month,
      studentIds: studentIds.length > 0 ? studentIds : undefined
    };
    
    Logger.log('Sending request:', payload);
    
    // APIを呼び出し
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(API_URL, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('Response status:', statusCode);
    Logger.log('Response body:', responseText);
    
    if (statusCode !== 200) {
      throw new Error('API returned status ' + statusCode + ': ' + responseText);
    }
    
    const result = JSON.parse(responseText);
    
    if (!result.success) {
      throw new Error(result.message || '評価の実行に失敗しました');
    }
    
    return {
      success: true,
      message: result.message,
      results: result.results
    };
    
  } catch (error) {
    Logger.log('Error:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 設定ダイアログを表示
 */
function showSettingsDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            font-family: 'Google Sans', Arial, sans-serif;
            padding: 20px;
          }
          h2 {
            color: #1a73e8;
          }
          .info {
            background: #e8f0fe;
            padding: 16px;
            border-radius: 8px;
            margin: 16px 0;
          }
          .info-item {
            margin: 8px 0;
          }
          .label {
            font-weight: 500;
            color: #5f6368;
          }
          .value {
            font-family: monospace;
            color: #202124;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <h2>⚙️ 設定情報</h2>
        
        <div class="info">
          <div class="info-item">
            <div class="label">API URL</div>
            <div class="value">${API_URL}</div>
          </div>
          
          <div class="info-item">
            <div class="label">評価結果</div>
            <div class="value">結果スプレッドシートに自動書き込み</div>
          </div>
        </div>
        
        <p style="color: #5f6368; font-size: 14px;">
          API URLを変更する場合は、スクリプトエディタで<br>
          <code>API_URL</code>定数を編集してください。
        </p>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(300);
  
  SpreadsheetApp.getUi().showModalDialog(html, '設定');
}
