import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'
import type { EvaluationRequest, EvaluationResponse, EvaluationResult } from './types'
import { fetchStudents, fetchAbsenceData, fetchDocumentsInFolder, fetchDocumentContent, writeResultsToSheet } from './lib/google-client'
// fetchPaymentData は一旦使用しない
import { GeminiAnalyzer } from './lib/gemini-client'
import { evaluateStudent, convertResultToArray } from './lib/evaluation'
import { ssoAuthMiddleware } from './middleware/sso-auth.js'

type Bindings = {
  GOOGLE_SERVICE_ACCOUNT: string;
  GEMINI_API_KEY: string;
  STUDENT_MASTER_SPREADSHEET_ID: string;
  ABSENCE_SPREADSHEET_ID: string;
  PAYMENT_SPREADSHEET_ID: string;
  RESULT_SPREADSHEET_ID: string;
  NOTION_API_TOKEN: string;
  NOTION_DATABASE_ID: string;
  YOUTUBE_API_KEY: string;
  X_BEARER_TOKEN: string;
  YOUTUBE_ANALYTICS_CLIENT_ID: string;
  YOUTUBE_ANALYTICS_CLIENT_SECRET: string;
  YOUTUBE_ANALYTICS_REDIRECT_URI: string;
  ANALYTICS_TARGET_SPREADSHEET_ID: string;
  DATABASE_URL: string; // PostgreSQL connection string
}

const app = new Hono<{ Bindings: Bindings }>()

// 環境変数ヘルパー（Cloudflare WorkersとNode.js両対応）
function getEnv(c: any, key: keyof Bindings): string {
  // 1. Cloudflare Workers環境（c.envから値を取得）
  const envValue = c.env?.[key];
  if (envValue && typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }
  
  // 2. Node.js環境（server.jsから渡されたenv）- Render等
  // server.jsがfetch(req, env)の第2引数で渡している
  if (envValue !== undefined && envValue !== null) {
    // envValueがオブジェクトや他の型の場合、文字列に変換
    if (typeof envValue === 'object') {
      console.warn(`[getEnv] ${key} is an object, attempting to stringify`);
      try {
        return JSON.stringify(envValue);
      } catch (e) {
        console.error(`[getEnv] Failed to stringify ${key}`);
      }
    }
    return String(envValue);
  }
  
  // 3. フォールバック: process.env（直接アクセス）
  const processEnvValue = typeof process !== 'undefined' ? process.env[key] : undefined;
  if (processEnvValue && typeof processEnvValue === 'string') {
    return processEnvValue;
  }
  
  // デバッグログ（値が取得できない場合）
  console.warn(`[getEnv] ${key} not found in any source`);
  return '';
}

// CORS設定
app.use('/api/*', cors())

// SSO Authentication (protects UI routes, but excludes API routes for automation)
// 自動化エンドポイント（Cron等）はSSO認証を除外
const publicApiRoutes = [
  '/api/analytics/auto-fetch',
  '/api/admin/run-migrations',
  '/api/analytics/auto-fetch/test',
  '/health',
  '/api/debug/env',
];

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  
  // 公開APIルートはSSO認証をスキップ
  if (publicApiRoutes.some(route => path === route)) {
    return next();
  }
  
  // その他のルートはSSO認証を適用
  return ssoAuthMiddleware(c, next);
});

// 静的ファイルの配信
app.use('/static/*', serveStatic({ root: './public' }))

// メインレンダラー
app.use(renderer)

// アナリティクス履歴表示ページ
app.get('/analytics-history/:studentId', (c) => {
  const studentId = c.req.param('studentId');
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>アナリティクス履歴 - ${studentId}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    </head>
    <body class="bg-gray-100">
      <div class="container mx-auto px-4 py-8">
        <!-- ヘッダー -->
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold text-gray-800">
              <i class="fas fa-chart-line text-purple-600 mr-2"></i>
              アナリティクス履歴
            </h1>
            <p class="text-gray-600 mt-2">生徒ID: <span id="student-id" class="font-semibold">${studentId}</span></p>
            <p class="text-gray-600">生徒名: <span id="student-name" class="font-semibold">読み込み中...</span></p>
          </div>
          <a href="/analytics-data" class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition">
            <i class="fas fa-arrow-left mr-2"></i>戻る
          </a>
        </div>

        <!-- ローディング -->
        <div id="loading" class="bg-white rounded-lg shadow-lg p-8 text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p class="text-gray-600">履歴を読み込み中...</p>
        </div>

        <!-- エラー表示 -->
        <div id="error" class="hidden bg-red-50 border border-red-300 text-red-800 px-6 py-4 rounded-lg">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          <span id="error-message"></span>
        </div>

        <!-- グラフエリア -->
        <div id="charts-container" class="hidden space-y-6">
          <!-- グラフ2列2行グリッド -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 再生回数グラフ -->
            <div class="bg-white rounded-lg shadow-lg p-6">
              <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-play text-green-600 mr-2"></i>再生回数の推移
              </h3>
              <div style="height: 300px;">
                <canvas id="views-chart"></canvas>
              </div>
            </div>

            <!-- 登録者増減グラフ -->
            <div class="bg-white rounded-lg shadow-lg p-6">
              <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-user-plus text-blue-600 mr-2"></i>登録者増減の推移
              </h3>
              <div style="height: 300px;">
                <canvas id="subscribers-chart"></canvas>
              </div>
            </div>

            <!-- 視聴時間グラフ -->
            <div class="bg-white rounded-lg shadow-lg p-6">
              <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-clock text-purple-600 mr-2"></i>視聴時間の推移
              </h3>
              <div style="height: 300px;">
                <canvas id="watchtime-chart"></canvas>
              </div>
            </div>

            <!-- 平均視聴率グラフ -->
            <div class="bg-white rounded-lg shadow-lg p-6">
              <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-percentage text-indigo-600 mr-2"></i>平均視聴率の推移
              </h3>
              <div style="height: 300px;">
                <canvas id="retention-chart"></canvas>
              </div>
            </div>
          </div>

          <!-- データテーブル -->
          <div class="bg-white rounded-lg shadow-lg p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
              <i class="fas fa-table text-gray-600 mr-2"></i>詳細データ
            </h3>
            <div class="overflow-x-auto">
              <table id="history-table" class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">期間</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ショート再生</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">通常再生</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ライブ再生</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ショート視聴時間</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">通常視聴時間</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ライブ視聴時間</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ショート視聴率</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">通常視聴率</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ライブ視聴率</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">登録者増減</th>
                  </tr>
                </thead>
                <tbody id="history-tbody" class="bg-white divide-y divide-gray-200">
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <script>
        const studentId = '${studentId}';
        let charts = {};

        document.addEventListener('DOMContentLoaded', () => {
          loadHistory();
        });

        async function loadHistory() {
          try {
            // 履歴データを取得
            const response = await fetch('/api/analytics/history/' + studentId + '?limit=12');
            const data = await response.json();

            if (!data.success) {
              throw new Error(data.error);
            }

            if (data.history.length === 0) {
              throw new Error('履歴データがありません');
            }

            // 生徒情報を取得
            const studentsResponse = await fetch('/api/analytics/students');
            const studentsData = await studentsResponse.json();
            const student = studentsData.students.find(s => s.studentId === studentId);
            
            if (student) {
              document.getElementById('student-name').textContent = student.name;
            }

            // グラフを描画
            renderCharts(data.history);

            // テーブルを描画
            renderTable(data.history);

            // ローディングを非表示、グラフを表示
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('charts-container').classList.remove('hidden');

          } catch (error) {
            console.error('履歴読み込みエラー:', error);
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
            document.getElementById('error-message').textContent = error.message;
          }
        }

        function renderCharts(history) {
          // データを逆順にして古い順に並べる（グラフ用）
          const sortedHistory = [...history].reverse();
          
          const labels = sortedHistory.map(h => {
            const start = new Date(h.periodStart);
            const end = new Date(h.periodEnd);
            return \`\${start.getMonth()+1}/\${start.getDate()}~\${end.getMonth()+1}/\${end.getDate()}\`;
          });

          // 再生回数グラフ
          const viewsCtx = document.getElementById('views-chart').getContext('2d');
          charts.views = new Chart(viewsCtx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'ショート',
                  data: sortedHistory.map(h => h.shortsViews),
                  borderColor: 'rgb(236, 72, 153)',
                  backgroundColor: 'rgba(236, 72, 153, 0.1)',
                  tension: 0.4
                },
                {
                  label: '通常動画',
                  data: sortedHistory.map(h => h.regularViews),
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.4
                },
                {
                  label: 'ライブ',
                  data: sortedHistory.map(h => h.liveViews),
                  borderColor: 'rgb(239, 68, 68)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  tension: 0.4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' },
                title: { display: false }
              },
              scales: {
                y: { beginAtZero: true }
              }
            }
          });

          // 登録者増減グラフ
          const subsCtx = document.getElementById('subscribers-chart').getContext('2d');
          charts.subscribers = new Chart(subsCtx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [
                {
                  label: '登録者増減',
                  data: sortedHistory.map(h => {
                    const gained = (h.shortsSubscribersGained || 0) + (h.regularSubscribersGained || 0) + (h.liveSubscribersGained || 0);
                    const lost = (h.shortsSubscribersLost || 0) + (h.regularSubscribersLost || 0) + (h.liveSubscribersLost || 0);
                    return gained - lost;
                  }),
                  backgroundColor: sortedHistory.map(h => {
                    const net = ((h.shortsSubscribersGained || 0) + (h.regularSubscribersGained || 0) + (h.liveSubscribersGained || 0)) - 
                               ((h.shortsSubscribersLost || 0) + (h.regularSubscribersLost || 0) + (h.liveSubscribersLost || 0));
                    return net >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                  })
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                title: { display: false }
              },
              scales: {
                y: { beginAtZero: false }
              }
            }
          });

          // 視聴時間グラフ（2軸）
          const watchCtx = document.getElementById('watchtime-chart').getContext('2d');
          charts.watchtime = new Chart(watchCtx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'ショート',
                  data: sortedHistory.map(h => h.shortsWatchTimeMinutes),
                  borderColor: 'rgb(236, 72, 153)',
                  backgroundColor: 'rgba(236, 72, 153, 0.1)',
                  tension: 0.4,
                  yAxisID: 'y'
                },
                {
                  label: '通常動画',
                  data: sortedHistory.map(h => h.regularWatchTimeMinutes),
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.4,
                  yAxisID: 'y'
                },
                {
                  label: 'ライブ',
                  data: sortedHistory.map(h => h.liveWatchTimeMinutes),
                  borderColor: 'rgb(239, 68, 68)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  tension: 0.4,
                  yAxisID: 'y1'
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' },
                title: { display: false }
              },
              scales: {
                y: {
                  type: 'linear',
                  position: 'left',
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'ショート/通常 (分)'
                  },
                  ticks: {
                    callback: value => value.toLocaleString() + ' 分'
                  }
                },
                y1: {
                  type: 'linear',
                  position: 'right',
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'ライブ (分)'
                  },
                  ticks: {
                    callback: value => value.toLocaleString() + ' 分'
                  },
                  grid: {
                    drawOnChartArea: false
                  }
                }
              }
            }
          });

          // 平均視聴率グラフ
          const retentionCtx = document.getElementById('retention-chart').getContext('2d');
          charts.retention = new Chart(retentionCtx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'ショート',
                  data: sortedHistory.map(h => h.shortsAvgViewPercentage),
                  borderColor: 'rgb(236, 72, 153)',
                  backgroundColor: 'rgba(236, 72, 153, 0.1)',
                  tension: 0.4
                },
                {
                  label: '通常動画',
                  data: sortedHistory.map(h => h.regularAvgViewPercentage),
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.4
                },
                {
                  label: 'ライブ',
                  data: sortedHistory.map(h => h.liveAvgViewPercentage),
                  borderColor: 'rgb(239, 68, 68)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  tension: 0.4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' },
                title: { display: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: value => value + '%'
                  }
                }
              }
            }
          });
        }

        function renderTable(history) {
          const tbody = document.getElementById('history-tbody');
          tbody.innerHTML = '';

          history.forEach(h => {
            const totalSubs = ((h.shortsSubscribersGained || 0) + (h.regularSubscribersGained || 0) + (h.liveSubscribersGained || 0)) - 
                             ((h.shortsSubscribersLost || 0) + (h.regularSubscribersLost || 0) + (h.liveSubscribersLost || 0));

            // 期間から時刻を除去（YYYY-MM-DDのみ表示）
            const periodStartDate = h.periodStart.split(' ')[0];
            const periodEndDate = h.periodEnd.split(' ')[0];

            const row = document.createElement('tr');
            row.innerHTML = \`
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${periodStartDate} ~ \${periodEndDate}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.shortsViews || 0).toLocaleString()}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.regularViews || 0).toLocaleString()}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.liveViews || 0).toLocaleString()}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.shortsWatchTimeMinutes || 0).toLocaleString()} 分</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.regularWatchTimeMinutes || 0).toLocaleString()} 分</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.liveWatchTimeMinutes || 0).toLocaleString()} 分</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.shortsAvgViewPercentage || 0).toFixed(1)}%</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.regularAvgViewPercentage || 0).toFixed(1)}%</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">\${(h.liveAvgViewPercentage || 0).toFixed(1)}%</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm \${totalSubs >= 0 ? 'text-green-600' : 'text-red-600'}">\${totalSubs >= 0 ? '+' : ''}\${totalSubs}</td>
            \`;
            tbody.appendChild(row);
          });
        }
      </script>
    </body>
    </html>
  `);
});

// 所属生データページ（YouTube Analytics詳細データ）
app.get('/analytics-data', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>所属生データ - YouTube Analytics</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    </head>
    <body class="bg-gray-100">
      <div class="container mx-auto px-4 py-8">
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-gray-800">
            <i class="fab fa-youtube text-red-600 mr-2"></i>
            所属生データ（YouTube Analytics）
          </h1>
          <p class="text-gray-600 mt-2">各生徒のYouTubeチャンネルの詳細アナリティクスデータ</p>
        </div>

        <!-- 期間選択 -->
        <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label for="start-date" class="block text-sm font-medium text-gray-700 mb-2">開始日</label>
              <input type="date" id="start-date" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent">
            </div>
            <div>
              <label for="end-date" class="block text-sm font-medium text-gray-700 mb-2">終了日</label>
              <input type="date" id="end-date" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent">
            </div>
            <div class="flex items-end">
              <button id="load-btn" class="w-full bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition">
                <i class="fas fa-sync-alt mr-2"></i>データ読み込み
              </button>
            </div>
          </div>
        </div>

        <!-- 生徒一覧 -->
        <div id="students-list" class="space-y-4">
          <!-- ローディング -->
          <div id="loading" class="bg-white rounded-lg shadow-lg p-8 text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-4 border-purple-600 mx-auto mb-4"></div>
            <p class="text-gray-600">読み込み中...</p>
          </div>
        </div>
      </div>

      <script>
        let studentsData = [];
        let analyticsCache = {};

        // 初期化
        document.addEventListener('DOMContentLoaded', () => {
          // デフォルト期間：過去7日間
          const now = new Date();
          const endDate = new Date(now);
          const startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          
          document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
          document.getElementById('end-date').value = endDate.toISOString().split('T')[0];

          // 生徒リスト読み込み
          loadStudents();

          // ボタンイベント
          document.getElementById('load-btn').addEventListener('click', loadAnalyticsData);
        });

        // 生徒リストを読み込み
        async function loadStudents() {
          try {
            const response = await fetch('/api/analytics/students');
            const data = await response.json();

            if (!data.success) {
              throw new Error(data.error);
            }

            studentsData = data.students;
            
            // 各生徒のトークン状態を確認
            await checkTokensForAllStudents();
            
            renderStudentsList();
          } catch (error) {
            console.error('生徒リスト読み込みエラー:', error);
            showError('生徒リストの読み込みに失敗しました: ' + error.message);
          }
        }

        // 全生徒のトークン状態を確認
        async function checkTokensForAllStudents() {
          for (const student of studentsData) {
            try {
              const response = await fetch('/api/analytics/token/' + student.studentId);
              const data = await response.json();
              
              if (data.success) {
                // トークンが存在し有効
                analyticsCache[student.studentId] = {
                  accessToken: data.accessToken,
                  expiresAt: data.expiresAt,
                  hasRefreshToken: data.hasRefreshToken,
                  authenticated: true,
                };
                console.log('Token found for:', student.studentId);
              }
            } catch (error) {
              // トークンなし or エラー
              console.log('No token for:', student.studentId);
            }
          }
        }

        // 生徒リストを表示
        function renderStudentsList() {
          const container = document.getElementById('students-list');
          
          if (studentsData.length === 0) {
            container.innerHTML = \`
              <div class="bg-white rounded-lg shadow-lg p-8 text-center">
                <i class="fas fa-info-circle text-gray-400 text-6xl mb-4"></i>
                <p class="text-gray-600">アナリティクス対象の生徒が見つかりません</p>
              </div>
            \`;
            return;
          }

          container.innerHTML = studentsData.map(student => {
            const hasToken = analyticsCache[student.studentId]?.authenticated;
            const buttonClass = hasToken ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
            const buttonText = hasToken ? '<i class="fas fa-check-circle mr-2"></i>認証済み' : '<i class="fab fa-youtube mr-2"></i>OAuth認証';
            const statusText = hasToken ? '認証済み。「データ読み込み」ボタンでデータを取得してください。' : 'OAuth認証を完了してください';
            
            return \`
              <div class="bg-white rounded-lg shadow-lg p-6" id="student-\${student.studentId}">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-3">
                      <h2 class="text-3xl font-bold text-gray-900">\${student.name}</h2>
                      <a 
                        href="/analytics-history/\${student.studentId}"
                        class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm flex items-center gap-2"
                        title="過去のアナリティクス履歴を表示"
                      >
                        <i class="fas fa-chart-line"></i>
                        履歴を見る
                      </a>
                    </div>
                    <div class="space-y-1">
                      <p class="text-base text-gray-700">学籍番号: <span class="font-medium">\${student.studentId}</span></p>
                      <p class="text-base text-gray-700">チャンネルID: <span class="font-mono text-sm">\${student.youtubeChannelId || 'なし'}</span></p>
                    </div>
                  </div>
                  <div class="flex gap-2 ml-4">
                    <button 
                      class="\${buttonClass} text-white px-4 py-2 rounded-lg transition whitespace-nowrap"
                      onclick="startOAuth('\${student.studentId}')"
                    >
                      \${buttonText}
                    </button>
                    \${hasToken ? \`
                      <button 
                        class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
                        onclick="deleteToken('\${student.studentId}')"
                        title="認証を削除"
                      >
                        <i class="fas fa-trash"></i>
                      </button>
                    \` : ''}
                  </div>
                </div>
                
                <div id="analytics-\${student.studentId}" class="mt-4">
                  <p class="text-gray-500 text-sm">\${statusText}</p>
                </div>
              </div>
            \`;
          }).join('');
        }

        // トークンを削除
        async function deleteToken(studentId) {
          if (!confirm('この生徒の認証情報を削除しますか？再度OAuth認証が必要になります。')) {
            return;
          }
          
          try {
            const response = await fetch('/api/analytics/token/' + studentId, {
              method: 'DELETE',
            });
            const data = await response.json();
            
            if (!data.success) {
              throw new Error(data.error);
            }
            
            // キャッシュから削除
            delete analyticsCache[studentId];
            
            // UI更新
            renderStudentsList();
            
            alert('認証情報を削除しました');
          } catch (error) {
            console.error('トークン削除エラー:', error);
            alert('認証情報の削除に失敗しました: ' + error.message);
          }
        }

        // OAuth認証を開始
        async function startOAuth(studentId) {
          try {
            const response = await fetch(\`/api/analytics/auth/url?studentId=\${studentId}\`);
            const data = await response.json();

            if (!data.success) {
              throw new Error(data.error);
            }

            // 新しいウィンドウでOAuth認証を開く
            const authWindow = window.open(data.authUrl, 'youtube-oauth', 'width=600,height=800');

            // 認証完了を待つ
            window.addEventListener('message', (event) => {
              if (event.data.type === 'youtube-analytics-auth-success') {
                authWindow.close();
                alert('認証が完了しました！ページをリロードしてデータを取得します。');
                
                // ページをリロード（KVから最新のトークンを取得）
                window.location.reload();
              }
            });
          } catch (error) {
            console.error('OAuth認証エラー:', error);
            alert('OAuth認証の開始に失敗しました: ' + error.message);
          }
        }

        // 特定生徒のアナリティクスを読み込み
        async function loadAnalyticsForStudent(studentId, accessToken) {
          const student = studentsData.find(s => s.studentId === studentId);
          if (!student || !student.youtubeChannelId) {
            return;
          }

          const startDate = document.getElementById('start-date').value;
          const endDate = document.getElementById('end-date').value;
          const container = document.getElementById(\`analytics-\${studentId}\`);

          container.innerHTML = '<p class="text-gray-500">読み込み中...</p>';

          try {
            // 動画タイプ別のアナリティクスを取得
            const response = await fetch('/api/analytics/by-type', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentId,
                channelId: student.youtubeChannelId,
                accessToken,
                startDate,
                endDate,
              }),
            });

            const result = await response.json();

            if (!result.success) {
              throw new Error(result.error);
            }

            renderAnalyticsByType(studentId, result.data);
          } catch (error) {
            console.error('アナリティクス読み込みエラー:', error);
            container.innerHTML = \`<p class="text-red-500 text-sm">エラー: \${error.message}</p>\`;
          }
        }

        // 動画タイプ別アナリティクスデータを表示
        function renderAnalyticsByType(studentId, data) {
          const container = document.getElementById(\`analytics-\${studentId}\`);
          const { shorts, regular, live, overall } = data;
          
          // 全体の登録者増減を計算
          const totalSubsGained = (shorts.metrics.subscribersGained || 0) + 
                                   (regular.metrics.subscribersGained || 0) + 
                                   (live.metrics.subscribersGained || 0);
          const totalSubsLost = (shorts.metrics.subscribersLost || 0) + 
                                (regular.metrics.subscribersLost || 0) + 
                                (live.metrics.subscribersLost || 0);
          const netSubsChange = totalSubsGained - totalSubsLost;

          container.innerHTML = \`
            <!-- 全体の概要 -->
            <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 mb-6">
              <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-chart-line mr-2"></i>過去1週間の概要
              </h3>
              <div class="grid grid-cols-3 gap-4">
                <div class="bg-white rounded-lg p-4 shadow">
                  <p class="text-sm text-gray-600 mb-1">
                    <i class="fas fa-play mr-1"></i>総再生回数
                  </p>
                  <p class="text-3xl font-bold text-green-600">\${((shorts.metrics.views || 0) + (regular.metrics.views || 0) + (live.metrics.views || 0)).toLocaleString()}</p>
                  <p class="text-xs text-gray-500 mt-1">全動画の再生回数</p>
                </div>
                <div class="bg-white rounded-lg p-4 shadow">
                  <p class="text-sm text-gray-600 mb-1">
                    <i class="fas fa-clock mr-1"></i>総視聴時間
                  </p>
                  <p class="text-3xl font-bold text-purple-600">\${((shorts.metrics.estimatedMinutesWatched || 0) + (regular.metrics.estimatedMinutesWatched || 0) + (live.metrics.estimatedMinutesWatched || 0)).toLocaleString()}</p>
                  <p class="text-xs text-gray-500 mt-1">分</p>
                </div>
                <div class="bg-white rounded-lg p-4 shadow">
                  <p class="text-sm text-gray-600 mb-1">
                    <i class="fas fa-user-plus mr-1"></i>登録者増減
                  </p>
                  <p class="text-3xl font-bold \${netSubsChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                    \${netSubsChange >= 0 ? '+' : ''}\${netSubsChange.toLocaleString()}
                  </p>
                  <p class="text-xs text-gray-500 mt-1">+\${totalSubsGained.toLocaleString()} / -\${totalSubsLost.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <!-- ショート動画 -->
            <div class="mb-6">
              <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center">
                <i class="fas fa-mobile-alt text-pink-500 mr-2"></i>
                ショート動画
              </h4>
              \${renderMetricsGrid(shorts.metrics, 'pink')}
            </div>

            <!-- 通常動画 -->
            <div class="mb-6">
              <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center">
                <i class="fas fa-video text-blue-500 mr-2"></i>
                通常動画
              </h4>
              \${renderMetricsGrid(regular.metrics, 'blue')}
            </div>

            <!-- ライブ配信アーカイブ -->
            <div class="mb-6">
              <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center">
                <i class="fas fa-broadcast-tower text-red-500 mr-2"></i>
                ライブ配信アーカイブ
              </h4>
              \${renderMetricsGrid(live.metrics, 'red')}
            </div>
          \`;
        }

        // メトリクスグリッドを生成
        function renderMetricsGrid(metrics, color) {
          return \`
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-\${color}-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">再生回数</p>
                <p class="text-2xl font-bold text-\${color}-600">\${metrics.views?.toLocaleString() || 0}</p>
              </div>
              <div class="bg-green-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">高評価</p>
                <p class="text-2xl font-bold text-green-600">\${metrics.likes?.toLocaleString() || 0}</p>
              </div>
              <div class="bg-yellow-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">コメント</p>
                <p class="text-2xl font-bold text-yellow-600">\${metrics.comments?.toLocaleString() || 0}</p>
              </div>
              <div class="bg-indigo-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">平均視聴率</p>
                <p class="text-2xl font-bold text-indigo-600">\${metrics.averageViewPercentage?.toFixed(1) || 0}%</p>
              </div>
            </div>

            <div class="mt-4">
              <h5 class="font-semibold text-gray-800 mb-2">詳細データ</h5>
              <div class="bg-gray-50 rounded p-4 text-sm space-y-1">
                <p>視聴時間: \${(metrics.estimatedMinutesWatched || 0).toLocaleString()} 分</p>
                <p>平均視聴時間: \${((metrics.averageViewDuration || 0) / 60).toFixed(1)} 分</p>
                <p>登録者増加: +\${metrics.subscribersGained || 0}</p>
                <p>登録者減少: -\${metrics.subscribersLost || 0}</p>
              </div>
            </div>
          \`;
        }

        // アナリティクスデータを表示（旧バージョン - 互換性のため残す）
        function renderAnalytics(studentId, analytics) {
          const container = document.getElementById(\`analytics-\${studentId}\`);
          const metrics = analytics.metrics;

          container.innerHTML = \`
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-purple-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">再生回数</p>
                <p class="text-2xl font-bold text-purple-600">\${metrics.views?.toLocaleString() || 0}</p>
              </div>
              <div class="bg-blue-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">高評価</p>
                <p class="text-2xl font-bold text-blue-600">\${metrics.likes?.toLocaleString() || 0}</p>
              </div>
              <div class="bg-green-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">コメント</p>
                <p class="text-2xl font-bold text-green-600">\${metrics.comments?.toLocaleString() || 0}</p>
              </div>
              <div class="bg-yellow-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">平均視聴率</p>
                <p class="text-2xl font-bold text-yellow-600">\${metrics.averageViewPercentage?.toFixed(1) || 0}%</p>
              </div>
            </div>

            <div class="mt-4">
              <h4 class="font-semibold text-gray-800 mb-2">詳細データ</h4>
              <div class="bg-gray-50 rounded p-4 text-sm space-y-1">
                <p>視聴時間: \${(metrics.estimatedMinutesWatched || 0).toLocaleString()} 分</p>
                <p>平均視聴時間: \${((metrics.averageViewDuration || 0) / 60).toFixed(1)} 分</p>
                <p>登録者増加: +\${metrics.subscribersGained || 0}</p>
                <p>登録者減少: -\${metrics.subscribersLost || 0}</p>
              </div>
            </div>

            \${analytics.trafficSources ? \`
              <div class="mt-4">
                <h4 class="font-semibold text-gray-800 mb-2">トラフィックソース</h4>
                <div class="space-y-2">
                  \${analytics.trafficSources.map(source => \`
                    <div class="flex justify-between items-center bg-gray-50 rounded p-2">
                      <span class="text-sm">\${source.sourceType}</span>
                      <span class="text-sm font-semibold">\${source.views.toLocaleString()} (\${source.percentage.toFixed(1)}%)</span>
                    </div>
                  \`).join('')}
                </div>
              </div>
            \` : ''}
          \`;
        }

        // 全生徒のアナリティクスを読み込み
        async function loadAnalyticsData() {
          for (const student of studentsData) {
            // 認証済みの生徒のみ処理
            if (!analyticsCache[student.studentId]?.authenticated) {
              console.log('Skipping unauthenticated student:', student.studentId);
              continue;
            }
            
            try {
              // KVから最新のトークンを取得（自動リフレッシュ付き）
              const tokenResponse = await fetch('/api/analytics/token/' + student.studentId);
              const tokenData = await tokenResponse.json();
              
              if (!tokenData.success) {
                console.error('Token fetch failed:', student.studentId, tokenData.error);
                const container = document.getElementById(\`analytics-\${student.studentId}\`);
                
                // needsAuthフラグがある場合は再認証を促す
                if (tokenData.needsAuth) {
                  container.innerHTML = \`
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p class="text-yellow-800 text-sm mb-2">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        認証の有効期限が切れました。再認証が必要です。
                      </p>
                      <button 
                        onclick="window.location.href='https://youtube-oauth-auth.onrender.com/?studentId=\${student.studentId}'" 
                        class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
                      >
                        <i class="fab fa-youtube mr-2"></i>再認証する
                      </button>
                    </div>
                  \`;
                  
                  // キャッシュから認証状態を削除
                  analyticsCache[student.studentId].authenticated = false;
                  
                  // ボタンの表示を更新
                  renderStudentsList();
                } else {
                  container.innerHTML = \`<p class="text-red-500 text-sm">トークンの取得に失敗: \${tokenData.error}</p>\`;
                }
                continue;
              }
              
              // アナリティクスデータを取得
              await loadAnalyticsForStudent(student.studentId, tokenData.accessToken);
            } catch (error) {
              console.error('Failed to load analytics for:', student.studentId, error);
              const container = document.getElementById(\`analytics-\${student.studentId}\`);
              container.innerHTML = \`<p class="text-red-500 text-sm">エラー: \${error.message}</p>\`;
            }
          }
        }

        function showError(message) {
          const container = document.getElementById('students-list');
          container.innerHTML = \`
            <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-2"></i>
              <p class="text-red-700">\${message}</p>
            </div>
          \`;
        }
      </script>
    </body>
    </html>
  `)
})

// 月次レポートページ
app.get('/monthly-report', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>月次レポート - WannaV成長度リザルトシステム</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    </head>
    <body class="bg-gray-100">
      <!-- ローディングオーバーレイ -->
      <div id="loading-overlay" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 max-w-sm w-full mx-4">
          <div class="flex flex-col items-center">
            <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mb-4"></div>
            <p id="loading-text" class="text-gray-700 text-center font-semibold">読み込み中...</p>
          </div>
        </div>
      </div>
      
      <div class="container mx-auto px-4 py-8">
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-gray-800">
            <i class="fas fa-chart-area text-purple-600 mr-2"></i>
            月次レポート（複数月比較）
          </h1>
        </div>
        
        <!-- 検索セクション -->
        <div id="loading-section" class="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div class="flex items-end gap-4">
            <div class="flex-1">
              <label for="student-id-input" class="block text-sm font-medium text-gray-700 mb-2">
                学籍番号
              </label>
              <input 
                type="text" 
                id="student-id-input" 
                placeholder="例: OLTS240488-AR"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div class="flex-1">
              <label for="months-select" class="block text-sm font-medium text-gray-700 mb-2">
                比較期間
              </label>
              <select 
                id="months-select"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="3">直近3ヶ月</option>
                <option value="6">直近6ヶ月</option>
                <option value="12">直近12ヶ月</option>
                <option value="custom">カスタム期間</option>
              </select>
            </div>
            <div class="flex-1 hidden" id="custom-months-input-container">
              <label for="months-input" class="block text-sm font-medium text-gray-700 mb-2">
                評価月（カンマ区切り）
              </label>
              <input 
                type="text" 
                id="months-input"
                placeholder="例: 2024-11,2024-12,2025-01"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button 
              id="load-btn"
              class="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-pink-700 transition shadow-md">
              <i class="fas fa-search mr-2"></i>
              読み込み
            </button>
            <button 
              id="back-btn"
              class="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition shadow-md">
              <i class="fas fa-arrow-left mr-2"></i>
              戻る
            </button>
          </div>
          <p class="text-sm text-gray-600 mt-3">
            <i class="fas fa-info-circle mr-1"></i>
            例: 2024-11,2024-12,2025-01 のようにカンマ区切りで入力してください
          </p>
        </div>
        
        <!-- レポートセクション -->
        <div id="report-section" class="hidden">
          <!-- ナビゲーションボタン -->
          <div class="flex gap-3 mb-6">
            <button 
              id="back-to-home-from-report-btn"
              class="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition shadow-md">
              <i class="fas fa-home mr-2"></i>
              トップページへ戻る
            </button>
            <button 
              id="go-to-detail-from-report-btn"
              class="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-pink-700 transition shadow-md">
              <i class="fas fa-chart-bar mr-2"></i>
              評価詳細を見る
            </button>
          </div>
          
          <!-- ヘッダー -->
          <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg shadow-lg p-6 mb-6 border border-purple-200">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-2xl font-bold text-gray-800" id="student-name">生徒名</h2>
                <p class="text-gray-600">学籍番号: <span id="display-student-id">-</span></p>
              </div>
            </div>
          </div>
          
          <!-- YouTube比較 -->
          <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
              <i class="fab fa-youtube text-red-600 mr-2"></i>
              YouTube成長推移
            </h3>
            <div id="youtube-comparison-section"></div>
          </div>
          
          <!-- X比較 -->
          <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
              <i class="fab fa-x-twitter text-blue-600 mr-2"></i>
              X (Twitter) 成長推移
            </h3>
            <div id="x-comparison-section"></div>
          </div>
          
          <!-- 詳細テーブル -->
          <div class="bg-white rounded-lg shadow-lg p-6">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
              <i class="fas fa-table text-purple-600 mr-2"></i>
              詳細データ
            </h3>
            <div id="detail-table-section"></div>
          </div>
        </div>
      </div>
      
      <script src="/static/monthly-report.js?v=${Date.now()}"></script>
    </body>
    </html>
  `)
})

// 評価詳細ページ
app.get('/evaluation-detail', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>評価結果詳細 - WannaV成長度リザルトシステム</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    </head>
    <body class="bg-gray-100">
      <!-- ローディングオーバーレイ -->
      <div id="loading-overlay" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 max-w-sm w-full mx-4">
          <div class="flex flex-col items-center">
            <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mb-4"></div>
            <p id="loading-text" class="text-gray-700 text-center font-semibold">読み込み中...</p>
          </div>
        </div>
      </div>
      
      <div class="container mx-auto px-4 py-8">
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-gray-800">
            <i class="fas fa-chart-line text-purple-600 mr-2"></i>
            評価結果詳細
          </h1>
        </div>
        
        <!-- 検索セクション -->
        <div id="loading-section" class="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div class="flex items-end gap-4">
            <div class="flex-1">
              <label for="student-id-input" class="block text-sm font-medium text-gray-700 mb-2">
                学籍番号
              </label>
              <input 
                type="text" 
                id="student-id-input" 
                placeholder="例: OLTS240488-AR"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div class="flex-1">
              <label for="month-input" class="block text-sm font-medium text-gray-700 mb-2">
                評価月
              </label>
              <input 
                type="month" 
                id="month-input"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button 
              id="load-btn"
              class="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-pink-700 transition shadow-md">
              <i class="fas fa-search mr-2"></i>
              読み込み
            </button>
            <button 
              id="back-btn"
              class="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition shadow-md">
              <i class="fas fa-arrow-left mr-2"></i>
              戻る
            </button>
          </div>
        </div>
        
        <!-- 評価結果セクション -->
        <div id="evaluation-section" class="hidden">
          <!-- ナビゲーションボタン -->
          <div class="flex gap-3 mb-6 flex-wrap">
            <button 
              id="back-to-home-btn"
              class="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition shadow-md">
              <i class="fas fa-home mr-2"></i>
              トップページへ戻る
            </button>
            <button 
              id="go-to-monthly-report-btn"
              class="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition shadow-md">
              <i class="fas fa-chart-line mr-2"></i>
              月次レポートを見る
            </button>
            
            <!-- 個別評価実行ボタン -->
            <div class="ml-auto flex gap-3">
              <button 
                id="re-eval-prolevel-btn"
                class="px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg hover:from-yellow-600 hover:to-orange-600 transition shadow-md">
                <i class="fas fa-star mr-2"></i>
                プロレベル再評価
              </button>
              <button 
                id="re-eval-youtube-btn"
                class="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold rounded-lg hover:from-red-600 hover:to-pink-600 transition shadow-md">
                <i class="fab fa-youtube mr-2"></i>
                YouTube再評価
              </button>
              <button 
                id="re-eval-x-btn"
                class="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-lg hover:from-blue-600 hover:to-cyan-600 transition shadow-md">
                <i class="fab fa-x-twitter mr-2"></i>
                X再評価
              </button>
            </div>
          </div>
          
          <!-- ヘッダー -->
          <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg shadow-lg p-6 mb-6 border border-purple-200">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-2xl font-bold text-gray-800" id="student-name">生徒名</h2>
                <p class="text-gray-600">学籍番号: <span id="display-student-id">-</span></p>
              </div>
              <div class="text-right">
                <p class="text-sm text-gray-600">評価月</p>
                <p class="text-xl font-bold text-purple-600" id="display-month">-</p>
              </div>
            </div>
          </div>
          
          <!-- プロレベルセクション評価 -->
          <div id="prolevel-section" class="bg-white rounded-lg shadow-lg p-6 mb-6 hidden">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
              <i class="fas fa-star text-yellow-500 mr-2"></i>
              プロレベルセクション評価
            </h3>
            <div id="prolevel-content"></div>
          </div>
          
          <!-- YouTube評価 -->
          <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
              <i class="fab fa-youtube text-red-600 mr-2"></i>
              YouTube評価
            </h3>
            <div id="youtube-section"></div>
          </div>
          
          <!-- X評価 -->
          <div class="bg-white rounded-lg shadow-lg p-6">
            <h3 class="text-2xl font-bold text-gray-800 mb-6">
              <i class="fab fa-x-twitter text-blue-600 mr-2"></i>
              X (Twitter) 評価
            </h3>
            <div id="x-section"></div>
          </div>
        </div>
      </div>
      
      <script src="/static/evaluation-detail.js?v=${Date.now()}"></script>
    </body>
    </html>
  `)
})

// トップページ
app.get('/', (c) => {
  // デフォルトを前月に設定
  const currentMonth = getPreviousMonth();
  
  return c.render(
    <div class="space-y-8">
      {/* ナビゲーションメニュー */}
      <div class="bg-white rounded-lg shadow-lg p-4">
        <div class="flex gap-4 items-center justify-center">
          <a 
            href="/" 
            class="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition shadow-md">
            <i class="fas fa-home mr-2"></i>
            ホーム
          </a>
          <a 
            href="/analytics-data" 
            class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition shadow-md">
            <i class="fab fa-youtube mr-2"></i>
            所属生データ
          </a>
          <a 
            href="/monthly-report" 
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md">
            <i class="fas fa-chart-area mr-2"></i>
            月次レポート
          </a>
        </div>
      </div>

      {/* 学籍番号検索セクション */}
      <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg shadow-lg p-6 border border-blue-200">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fas fa-search text-blue-600 mr-2"></i>
          評価結果を検索
        </h2>
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label for="search-student-id" class="block text-sm font-medium text-gray-700 mb-2">
              学籍番号
            </label>
            <input 
              type="text" 
              id="search-student-id" 
              placeholder="例: OLTS240488-AR"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button 
            id="search-results-btn"
            class="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition shadow-md">
            <i class="fas fa-search mr-2"></i>
            検索
          </button>
        </div>
        <p class="text-sm text-gray-600 mt-3">
          <i class="fas fa-info-circle mr-1"></i>
          学籍番号を入力して過去の評価結果を検索できます
        </p>
      </div>

      {/* 検索結果表示セクション */}
      <div id="search-results-section" class="hidden bg-white rounded-lg shadow-lg p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fas fa-list text-green-600 mr-2"></i>
          <span id="search-results-title">検索結果</span>
        </h2>
        <div id="search-results-list" class="space-y-4">
        </div>
      </div>

      {/* 採点実行セクション */}
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fas fa-clipboard-check text-purple-600 mr-2"></i>
          採点実行
        </h2>
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label for="evaluation-month" class="block text-sm font-medium text-gray-700 mb-2">
              評価対象月
            </label>
            <input 
              type="month" 
              id="evaluation-month" 
              value={currentMonth}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div class="flex-1">
            <label for="student-ids-input" class="block text-sm font-medium text-gray-700 mb-2">
              学籍番号（オプション）
            </label>
            <input 
              type="text" 
              id="student-ids-input" 
              placeholder="例: OLTS240488-AR,OLST230057-TQ（カンマ区切り、空欄で全生徒）"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <button 
            id="run-evaluation-btn"
            class="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-pink-700 transition shadow-md">
            <i class="fas fa-play mr-2"></i>
            採点を実行
          </button>
        </div>
        <p class="text-sm text-gray-600 mt-3">
          <i class="fas fa-info-circle mr-1"></i>
          選択した月のトークメモと直近3ヶ月の欠席データを元に採点を実行します
        </p>
      </div>

      {/* YouTube評価実行セクション */}
      <div class="bg-gradient-to-r from-red-50 to-pink-50 rounded-lg shadow-lg p-6 border border-red-200">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fab fa-youtube text-red-600 mr-2"></i>
          YouTube評価実行
        </h2>
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label for="youtube-evaluation-month" class="block text-sm font-medium text-gray-700 mb-2">
              評価対象月
            </label>
            <input 
              type="month" 
              id="youtube-evaluation-month" 
              value={currentMonth}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <div class="flex-1">
            <label for="youtube-student-ids-input" class="block text-sm font-medium text-gray-700 mb-2">
              学籍番号（オプション）
            </label>
            <input 
              type="text" 
              id="youtube-student-ids-input" 
              placeholder="例: OLTS240488-AR,OLST230057-TQ（カンマ区切り、空欄で全生徒）"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <button 
            id="run-youtube-evaluation-btn"
            class="px-6 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold rounded-lg hover:from-red-600 hover:to-pink-600 transition shadow-md">
            <i class="fab fa-youtube mr-2"></i>
            YouTube評価実行
          </button>
        </div>
        <p class="text-sm text-gray-600 mt-3">
          <i class="fas fa-info-circle mr-1"></i>
          選択した月のYouTube統計データ（登録者数、動画数、エンゲージメント等）を取得・評価します
        </p>
      </div>

      {/* X評価実行セクション */}
      <div class="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg shadow-lg p-6 border border-blue-200">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fab fa-x-twitter text-blue-600 mr-2"></i>
          X (Twitter) 評価実行
        </h2>
        <div class="flex items-end gap-4">
          <div class="flex-1">
            <label for="x-evaluation-month" class="block text-sm font-medium text-gray-700 mb-2">
              評価対象月
            </label>
            <input 
              type="month" 
              id="x-evaluation-month" 
              value={currentMonth}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div class="flex-1">
            <label for="x-student-ids-input" class="block text-sm font-medium text-gray-700 mb-2">
              学籍番号（オプション）
            </label>
            <input 
              type="text" 
              id="x-student-ids-input" 
              placeholder="例: OLTS240488-AR,OLST230057-TQ（カンマ区切り、空欄で全生徒）"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div class="flex gap-2">
            <button 
              id="run-x-evaluation-btn"
              class="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold rounded-lg hover:from-blue-600 hover:to-cyan-600 transition shadow-md">
              <i class="fab fa-x-twitter mr-2"></i>
              X評価実行
            </button>
            <button 
              id="run-x-evaluation-auto-btn"
              class="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-lg hover:from-indigo-600 hover:to-purple-600 transition shadow-md">
              <i class="fas fa-magic mr-2"></i>
              自動分割実行
            </button>
          </div>
        </div>
        <p class="text-sm text-gray-600 mt-3">
          <i class="fas fa-info-circle mr-1"></i>
          選択した月のX統計データ（フォロワー数、投稿数、エンゲージメント等）を取得・評価します
        </p>
        <p class="text-sm text-purple-600 mt-2 font-medium">
          <i class="fas fa-star mr-1"></i>
          「自動分割実行」: 50名ずつ自動分割し、各バッチ間に15分待機します（全生徒対象時に推奨）
        </p>
      </div>

      {/* 採点結果セクション */}
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fas fa-chart-bar text-purple-600 mr-2"></i>
          採点結果
        </h2>
        <div id="evaluation-results" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <p class="text-gray-500">採点を実行すると結果が表示されます</p>
        </div>
      </div>

      {/* 生徒一覧セクション */}
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">
          <i class="fas fa-users text-purple-600 mr-2"></i>
          生徒一覧
        </h2>
        
        {/* ステータスタブ */}
        <div class="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-2">
          <button 
            class="status-tab px-4 py-2 font-medium transition border-b-2 border-purple-600 text-purple-600 text-sm"
            data-status="アクティブ">
            <i class="fas fa-user-check mr-1"></i>
            アクティブ
          </button>
          <button 
            class="status-tab px-4 py-2 font-medium text-gray-600 hover:text-purple-600 transition border-b-2 border-transparent text-sm"
            data-status="レッスン準備中">
            <i class="fas fa-clock mr-1"></i>
            レッスン準備中
          </button>
          <button 
            class="status-tab px-4 py-2 font-medium text-gray-600 hover:text-purple-600 transition border-b-2 border-transparent text-sm"
            data-status="休会">
            <i class="fas fa-pause-circle mr-1"></i>
            休会
          </button>
          <button 
            class="status-tab px-4 py-2 font-medium text-gray-600 hover:text-purple-600 transition border-b-2 border-transparent text-sm"
            data-status="正規退会">
            <i class="fas fa-user-times mr-1"></i>
            正規退会
          </button>
          <button 
            class="status-tab px-4 py-2 font-medium text-gray-600 hover:text-purple-600 transition border-b-2 border-transparent text-sm"
            data-status="無断キャンセル">
            <i class="fas fa-ban mr-1"></i>
            無断キャンセル
          </button>
          <button 
            class="status-tab px-4 py-2 font-medium text-gray-600 hover:text-purple-600 transition border-b-2 border-transparent text-sm"
            data-status="クーリングオフ">
            <i class="fas fa-undo mr-1"></i>
            クーリングオフ
          </button>
          <button 
            class="status-tab px-4 py-2 font-medium text-gray-600 hover:text-purple-600 transition border-b-2 border-transparent text-sm"
            data-status="在籍中">
            <i class="fas fa-user mr-1"></i>
            在籍中
          </button>
        </div>
        
        <div id="student-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <p class="text-gray-500">読み込み中...</p>
        </div>
      </div>

      {/* API情報セクション */}
      <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <h2 class="text-xl font-bold text-gray-800 mb-3">
          <i class="fas fa-code text-blue-600 mr-2"></i>
          API エンドポイント & ページ
        </h2>
        
        <div class="mb-4">
          <h3 class="text-sm font-bold text-gray-700 mb-2">
            <i class="fas fa-desktop mr-1"></i> Webページ
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <a href="/evaluation-detail" class="text-blue-600 hover:text-blue-800 font-semibold">
                <i class="fas fa-chart-line mr-1"></i> 評価結果詳細（グラフ・チャート）
              </a>
            </div>
            <div class="flex items-center gap-2">
              <a href="/monthly-report" class="text-blue-600 hover:text-blue-800 font-semibold">
                <i class="fas fa-chart-area mr-1"></i> 月次レポート（複数月比較）
              </a>
            </div>
          </div>
        </div>
        
        <div>
          <h3 class="text-sm font-bold text-gray-700 mb-2">
            <i class="fas fa-code mr-1"></i> APIエンドポイント
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded font-mono text-xs">POST</span>
              <code class="text-gray-700">/api/evaluate</code>
              <span class="text-gray-600">- 採点を実行</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">GET</span>
              <code class="text-gray-700">/api/results/:studentId</code>
              <span class="text-gray-600">- 評価結果を検索</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">GET</span>
              <code class="text-gray-700">/api/youtube/evaluate/:studentId</code>
              <span class="text-gray-600">- YouTube評価</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">GET</span>
              <code class="text-gray-700">/api/x/evaluate/:studentId</code>
              <span class="text-gray-600">- X評価</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">GET</span>
              <code class="text-gray-700">/api/monthly-report/:studentId</code>
              <span class="text-gray-600">- 月次レポート</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">GET</span>
              <code class="text-gray-700">/api/students</code>
              <span class="text-gray-600">- 生徒一覧を取得</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs">GET</span>
              <code class="text-gray-700">/api/health</code>
              <span class="text-gray-600">- ヘルスチェック</span>
            </div>
          </div>
        </div>
        
        <div class="mt-4 p-4 bg-white rounded border border-gray-200">
          <h3 class="font-bold text-sm text-gray-800 mb-2">Google Apps Scriptサンプル</h3>
          <pre class="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
{`function runMonthlyEvaluation() {
  const url = 'https://your-app.pages.dev/api/evaluate';
  const payload = { month: '2025-12' };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  
  const response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
}`}
          </pre>
        </div>
      </div>
    </div>
  )
})

// ヘルスチェック
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 診断エンドポイント（環境変数の確認）
app.get('/api/debug/env', (c) => {
  const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
  const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
  const GEMINI_API_KEY = getEnv(c, 'GEMINI_API_KEY')
  
  return c.json({
    youtube: {
      exists: !!YOUTUBE_API_KEY,
      length: YOUTUBE_API_KEY?.length || 0,
      firstChars: YOUTUBE_API_KEY?.substring(0, 10) || 'N/A'
    },
    x: {
      exists: !!X_BEARER_TOKEN,
      length: X_BEARER_TOKEN?.length || 0,
      firstChars: X_BEARER_TOKEN?.substring(0, 20) || 'N/A'
    },
    gemini: {
      exists: !!GEMINI_API_KEY,
      length: GEMINI_API_KEY?.length || 0,
      firstChars: GEMINI_API_KEY?.substring(0, 10) || 'N/A'
    },
    envKeys: c.env ? Object.keys(c.env) : []
  })
})

// 診断エンドポイント（YouTube APIテスト）
app.get('/api/debug/youtube/:channelId', async (c) => {
  try {
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const channelId = c.req.param('channelId')
    
    if (!YOUTUBE_API_KEY) {
      return c.json({ error: 'YOUTUBE_API_KEY not set' }, 400)
    }
    
    // 直接YouTube APIを呼び出す
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`
    
    console.log(`[Debug] Calling YouTube API: ${url.replace(YOUTUBE_API_KEY, 'API_KEY_HIDDEN')}`)
    
    const response = await fetch(url)
    const status = response.status
    const statusText = response.statusText
    
    let data
    try {
      data = await response.json()
    } catch (e) {
      data = await response.text()
    }
    
    return c.json({
      status,
      statusText,
      ok: response.ok,
      data
    })
  } catch (error: any) {
    return c.json({ error: error.message, stack: error.stack }, 500)
  }
})

// 診断エンドポイント（X APIテスト）
app.get('/api/debug/x/:username', async (c) => {
  try {
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    const username = c.req.param('username')
    
    if (!X_BEARER_TOKEN) {
      return c.json({ error: 'X_BEARER_TOKEN not set' }, 400)
    }
    
    // 直接X APIを呼び出す
    const url = `https://api.twitter.com/2/users/by/username/${username}`
    
    console.log(`[Debug] Calling X API: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${X_BEARER_TOKEN}`
      }
    })
    
    const status = response.status
    const statusText = response.statusText
    
    // レート制限情報を取得
    const rateLimitLimit = response.headers.get('x-rate-limit-limit')
    const rateLimitRemaining = response.headers.get('x-rate-limit-remaining')
    const rateLimitReset = response.headers.get('x-rate-limit-reset')
    
    let data
    try {
      data = await response.json()
    } catch (e) {
      data = await response.text()
    }
    
    return c.json({
      status,
      statusText,
      ok: response.ok,
      rateLimit: {
        limit: rateLimitLimit ? parseInt(rateLimitLimit) : null,
        remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : null,
        reset: rateLimitReset ? parseInt(rateLimitReset) : null,
        resetDate: rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toISOString() : null
      },
      data
    })
  } catch (error: any) {
    return c.json({ error: error.message, stack: error.stack }, 500)
  }
})

// X API詳細デバッグエンドポイント（ツイート取得まで）
app.get('/api/debug/x-full/:username', async (c) => {
  try {
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    const username = c.req.param('username')
    const month = c.req.query('month') || getPreviousMonth()
    
    if (!X_BEARER_TOKEN) {
      return c.json({ error: 'X_BEARER_TOKEN not set' }, 400)
    }
    
    const { fetchXUserByUsername, fetchRecentTweets } = await import('./lib/x-client')
    
    // ステップ1: ユーザー情報取得
    console.log(`[Debug X Full] Step 1: Fetching user ${username}`)
    const user = await fetchXUserByUsername(X_BEARER_TOKEN, username)
    
    if (!user) {
      return c.json({ 
        step: 1, 
        status: 'failed',
        error: 'Failed to fetch user',
        username 
      })
    }
    
    // ステップ2: ツイート取得
    console.log(`[Debug X Full] Step 2: Fetching tweets for user ID ${user.userId}`)
    const { tweets, rateLimited } = await fetchRecentTweets(X_BEARER_TOKEN, user.userId, 10)
    
    return c.json({
      step: 2,
      status: 'success',
      rateLimited,
      user: {
        userId: user.userId,
        username: user.username,
        followersCount: user.followersCount,
        followingCount: user.followingCount
      },
      tweets: {
        count: tweets.length,
        sample: tweets.slice(0, 3).map(t => ({
          id: t.tweetId,
          text: t.text.substring(0, 100),
          createdAt: t.createdAt
        }))
      },
      month
    })
  } catch (error: any) {
    return c.json({ error: error.message, stack: error.stack }, 500)
  }
})

// キャッシュシート初期化エンドポイント
app.post('/api/debug/init-cache', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    const { initializeCacheSheet } = await import('./lib/evaluation-cache')
    
    const youtubeResult = await initializeCacheSheet(accessToken, RESULT_SPREADSHEET_ID, 'youtube')
    const xResult = await initializeCacheSheet(accessToken, RESULT_SPREADSHEET_ID, 'x')
    
    return c.json({
      success: true,
      youtube: youtubeResult,
      x: xResult
    })
  } catch (error: any) {
    return c.json({ error: error.message, stack: error.stack }, 500)
  }
})

// キャッシュクリアエンドポイント
app.post('/api/debug/clear-cache', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const { studentId, evaluationType } = await c.req.json()
    
    if (!studentId) {
      return c.json({ error: 'studentId is required' }, 400)
    }
    
    if (!evaluationType || !['youtube', 'x'].includes(evaluationType)) {
      return c.json({ error: 'evaluationType must be "youtube" or "x"' }, 400)
    }
    
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    const sheetName = evaluationType === 'youtube' ? 'youtube_cache' : 'x_cache'
    
    // シートのデータを取得
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    
    if (!response.ok) {
      return c.json({ error: 'Failed to fetch cache sheet', status: response.status }, 500)
    }
    
    const data = await response.json()
    const rows = data.values || []
    
    if (rows.length < 2) {
      return c.json({ success: true, message: 'No cache data found', deleted: false })
    }
    
    const header = rows[0]
    const dataRows = rows.slice(1)
    
    const studentIdIndex = header.findIndex((h: string) => h === '学籍番号')
    
    if (studentIdIndex === -1) {
      return c.json({ error: 'Invalid cache sheet format' }, 500)
    }
    
    // 該当する学籍番号の行を探す
    let targetRowIndex = -1
    for (let i = 0; i < dataRows.length; i++) {
      if (dataRows[i][studentIdIndex] === studentId) {
        targetRowIndex = i + 2 // +2 because: +1 for header, +1 for 1-based index
        break
      }
    }
    
    if (targetRowIndex === -1) {
      return c.json({ success: true, message: 'Cache not found for this student', deleted: false })
    }
    
    // 行を削除
    const deleteResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: await getSheetId(accessToken, RESULT_SPREADSHEET_ID, sheetName),
                  dimension: 'ROWS',
                  startIndex: targetRowIndex - 1,
                  endIndex: targetRowIndex
                }
              }
            }
          ]
        })
      }
    )
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      return c.json({ error: 'Failed to delete cache', details: errorText }, 500)
    }
    
    return c.json({
      success: true,
      message: `Cache cleared for ${studentId} in ${evaluationType}`,
      deleted: true,
      rowIndex: targetRowIndex
    })
  } catch (error: any) {
    return c.json({ error: error.message, stack: error.stack }, 500)
  }
})

// シートIDを取得するヘルパー関数
async function getSheetId(accessToken: string, spreadsheetId: string, sheetName: string): Promise<number> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  )
  
  const data = await response.json()
  const sheet = data.sheets?.find((s: any) => s.properties.title === sheetName)
  
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`)
  }
  
  return sheet.properties.sheetId
}

// NotionからSNSアカウント情報を同期
app.post('/api/sync-notion', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const NOTION_API_TOKEN = getEnv(c, 'NOTION_API_TOKEN')
    const NOTION_DATABASE_ID = getEnv(c, 'NOTION_DATABASE_ID')

    if (!NOTION_API_TOKEN || !NOTION_DATABASE_ID) {
      return c.json({ 
        success: false, 
        error: 'Notion API環境変数が設定されていません (NOTION_API_TOKEN, NOTION_DATABASE_ID)' 
      }, 400)
    }

    const { fetchNotionStudentData, updateStudentMasterWithSNS } = await import('./lib/notion-client')

    // Notionからデータ取得
    console.log('[Notion Sync] Notionデータ取得開始...')
    const notionData = await fetchNotionStudentData(NOTION_API_TOKEN, NOTION_DATABASE_ID)
    console.log(`[Notion Sync] Notion取得完了: ${notionData.length}件`)

    // Google Sheetsに書き込み
    console.log('[Notion Sync] 生徒マスタ更新開始...')
    const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT)
    await updateStudentMasterWithSNS(serviceAccount, STUDENT_MASTER_SPREADSHEET_ID, notionData)
    console.log('[Notion Sync] 生徒マスタ更新完了')

    return c.json({
      success: true,
      message: `${notionData.length}件の生徒データを同期しました`,
      count: notionData.length
    })
  } catch (error: any) {
    console.error('[Notion Sync] エラー:', error.message, error.stack)
    return c.json({ 
      success: false, 
      error: error.message, 
      stack: error.stack 
    }, 500)
  }
})

// 環境変数チェック（デバッグ用）
app.get('/api/debug/env-check', (c) => {
  const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
  const GEMINI_API_KEY = getEnv(c, 'GEMINI_API_KEY')
  const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
  const ABSENCE_SPREADSHEET_ID = getEnv(c, 'ABSENCE_SPREADSHEET_ID')
  const PAYMENT_SPREADSHEET_ID = getEnv(c, 'PAYMENT_SPREADSHEET_ID')
  const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
  const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
  const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
  
  return c.json({
    env_status: {
      GOOGLE_SERVICE_ACCOUNT: {
        defined: !!GOOGLE_SERVICE_ACCOUNT,
        type: typeof GOOGLE_SERVICE_ACCOUNT,
        length: GOOGLE_SERVICE_ACCOUNT?.length || 0,
        first50: GOOGLE_SERVICE_ACCOUNT?.substring(0, 50) || '',
        isJSON: (() => {
          try {
            if (GOOGLE_SERVICE_ACCOUNT) {
              JSON.parse(GOOGLE_SERVICE_ACCOUNT);
              return true;
            }
            return false;
          } catch {
            return false;
          }
        })(),
        hasNewlines: GOOGLE_SERVICE_ACCOUNT?.includes('\n') || false,
      },
      GEMINI_API_KEY: {
        defined: !!GEMINI_API_KEY,
        length: GEMINI_API_KEY?.length || 0,
      },
      STUDENT_MASTER_SPREADSHEET_ID: {
        defined: !!STUDENT_MASTER_SPREADSHEET_ID,
        value: STUDENT_MASTER_SPREADSHEET_ID || '',
      },
      ABSENCE_SPREADSHEET_ID: {
        defined: !!ABSENCE_SPREADSHEET_ID,
        value: ABSENCE_SPREADSHEET_ID || '',
      },
      PAYMENT_SPREADSHEET_ID: {
        defined: !!PAYMENT_SPREADSHEET_ID,
        value: PAYMENT_SPREADSHEET_ID || '',
      },
      RESULT_SPREADSHEET_ID: {
        defined: !!RESULT_SPREADSHEET_ID,
        value: RESULT_SPREADSHEET_ID || '',
      },
      YOUTUBE_API_KEY: {
        defined: !!YOUTUBE_API_KEY,
        length: YOUTUBE_API_KEY?.length || 0,
        first20: YOUTUBE_API_KEY?.substring(0, 20) || '',
      },
      X_BEARER_TOKEN: {
        defined: !!X_BEARER_TOKEN,
        length: X_BEARER_TOKEN?.length || 0,
        first20: X_BEARER_TOKEN?.substring(0, 20) || '',
      },
    }
  })
})

// 生徒一覧取得
app.get('/api/students', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    
    console.log('[/api/students] Fetching students from:', STUDENT_MASTER_SPREADSHEET_ID)
    
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    console.log('[/api/students] Fetched students count:', students.length)
    
    return c.json({ success: true, students, count: students.length })
  } catch (error: any) {
    console.error('[/api/students] Error:', error.message)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// YouTube評価取得
app.get('/api/youtube/evaluate/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const studentId = c.req.param('studentId')
    const month = c.req.query('month') || getPreviousMonth() // YYYY-MM

    if (!YOUTUBE_API_KEY) {
      return c.json({ success: false, error: 'YOUTUBE_API_KEY が設定されていません' }, 400)
    }

    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)

    if (!student) {
      return c.json({ success: false, error: '生徒が見つかりません' }, 404)
    }

    if (!student.youtubeChannelId) {
      return c.json({ success: false, error: 'YouTubeチャンネルIDが設定されていません' }, 400)
    }

    // YouTube評価を実行
    const { evaluateYouTubeChannel } = await import('./lib/youtube-client')
    
    console.log(`[/api/youtube/evaluate] Starting evaluation for ${studentId}, channel: ${student.youtubeChannelId}, month: ${month}`)
    
    const evaluation = await evaluateYouTubeChannel(
      YOUTUBE_API_KEY,
      student.youtubeChannelId,
      month
    )

    if (!evaluation || evaluation.error) {
      console.error(`[/api/youtube/evaluate] Evaluation failed for ${studentId}:`, evaluation?.error)
      return c.json({ 
        success: false, 
        error: evaluation?.error || 'YouTube評価の取得に失敗しました',
        details: {
          studentId,
          channelId: student.youtubeChannelId,
          month,
          apiKeyExists: !!YOUTUBE_API_KEY
        }
      }, 500)
    }

    return c.json({
      success: true,
      studentId,
      studentName: student.name,
      month,
      evaluation
    })
  } catch (error: any) {
    console.error('[/api/youtube/evaluate] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// 月次レポート - 複数月の比較
app.get('/api/monthly-report/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    const studentId = c.req.param('studentId')
    const monthsParam = c.req.query('months') // カンマ区切りの月リスト (例: 2024-11,2024-12,2025-01)
    
    if (!monthsParam) {
      return c.json({ success: false, error: '評価月のリスト (months) が必要です' }, 400)
    }
    
    const months = monthsParam.split(',').map(m => m.trim())
    
    if (months.length === 0) {
      return c.json({ success: false, error: '少なくとも1つの月を指定してください' }, 400)
    }
    
    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)
    
    if (!student) {
      return c.json({ success: false, error: '生徒が見つかりません' }, 404)
    }
    
    const { evaluateYouTubeChannel } = await import('./lib/youtube-client')
    const { evaluateXAccount } = await import('./lib/x-client')
    
    const report = []
    
    // 各月のデータを取得
    for (const month of months) {
      const monthData: any = { month }
      
      // YouTube評価
      if (YOUTUBE_API_KEY && student.youtubeChannelId) {
        try {
          const youtubeEval = await evaluateYouTubeChannel(
            YOUTUBE_API_KEY,
            student.youtubeChannelId,
            month
          )
          monthData.youtube = youtubeEval
        } catch (error: any) {
          monthData.youtube = { error: error.message }
        }
      }
      
      // X評価
      if (X_BEARER_TOKEN && student.xAccount) {
        try {
          const xEval = await evaluateXAccount(
            X_BEARER_TOKEN,
            student.xAccount,
            month
          )
          monthData.x = xEval
        } catch (error: any) {
          monthData.x = { error: error.message }
        }
      }
      
      report.push(monthData)
    }
    
    return c.json({
      success: true,
      studentId,
      studentName: student.name,
      report
    })
  } catch (error: any) {
    console.error('[/api/monthly-report] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// 統合評価取得（プロレベルセクション + YouTube + X）
app.get('/api/evaluation/complete/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    const studentId = c.req.param('studentId')
    const month = c.req.query('month') || getPreviousMonth()
    const useCache = c.req.query('cache') !== 'false' // デフォルトでキャッシュを使用
    
    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)
    
    if (!student) {
      return c.json({ success: false, error: '生徒が見つかりません' }, 404)
    }
    
    const result: any = {
      studentId,
      studentName: student.name,
      month
    }
    
    // アクセストークンを取得（キャッシュとプロレベル評価で使用）
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    // プロレベルセクション評価を取得
    try {
      const sheetsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      
      if (sheetsResponse.ok) {
        const sheetsData = await sheetsResponse.json()
        const resultSheets = sheetsData.sheets
          ?.map((s: any) => s.properties.title)
          .filter((title: string) => title.startsWith('評価結果_'))
          .sort()
          .reverse() || []
        
        for (const sheetName of resultSheets) {
          const valuesResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          
          if (valuesResponse.ok) {
            const valuesData = await valuesResponse.json()
            const rows = valuesData.values || []
            
            if (rows.length >= 2) {
              const header = rows[0]
              const studentIdIndex = header.findIndex((h: string) => h === '学籍番号')
              const monthIndex = header.findIndex((h: string) => h === '評価月')
              const dateTimeIndex = header.findIndex((h: string) => h === '評価日時')
              
              // 🔴 改善: 同じ学籍番号・月の場合、評価日時が最新のものを選択
              let latestRow: any = null
              let latestDateTime: Date | null = null
              
              for (const row of rows.slice(1)) {
                if (row[studentIdIndex] === studentId && row[monthIndex] === month) {
                  const rowDateTime = row[dateTimeIndex] ? new Date(row[dateTimeIndex]) : null
                  
                  if (!latestRow || (rowDateTime && (!latestDateTime || rowDateTime > latestDateTime))) {
                    latestRow = row
                    latestDateTime = rowDateTime
                  }
                }
              }
              
              if (latestRow) {
                result.proLevel = {}
                header.forEach((h: string, i: number) => {
                  result.proLevel[h] = latestRow[i] || ''
                })
                console.log(`[プロレベル評価] 取得成功: ${studentId} (評価日時: ${latestDateTime?.toISOString()})`)
              }
            }
          }
          
          if (result.proLevel) break
        }
      }
    } catch (error: any) {
      console.log('[プロレベルセクション取得エラー]', error.message)
    }
    
    // YouTube評価（キャッシュ対応）
    if (student.youtubeChannelId) {
      if (YOUTUBE_API_KEY) {
        try {
          // キャッシュを確認
          let cachedData = null
          if (useCache) {
            const { getCachedEvaluation } = await import('./lib/evaluation-cache')
            cachedData = await getCachedEvaluation(
              accessToken,
              RESULT_SPREADSHEET_ID,
              studentId,
              month,
              'youtube'
            )
          }
          
          if (cachedData) {
            result.youtube = { ...cachedData, cached: true }
            console.log(`[YouTube評価] キャッシュ使用: ${studentId}`)
          } else {
            // APIから取得
            const { evaluateYouTubeChannel } = await import('./lib/youtube-client')
            const evaluation = await evaluateYouTubeChannel(
              YOUTUBE_API_KEY,
              student.youtubeChannelId,
              month
            )
            
            if (evaluation) {
              result.youtube = evaluation
              
              // ✅ 動画が1件以上ある場合のみキャッシュに保存
              if (useCache && evaluation.videosInMonth > 0) {
                const { saveCachedEvaluation } = await import('./lib/evaluation-cache')
                await saveCachedEvaluation(
                  accessToken,
                  RESULT_SPREADSHEET_ID,
                  studentId,
                  student.name,
                  month,
                  'youtube',
                  evaluation
                )
                console.log(`[YouTube評価] API使用（キャッシュ保存）: ${studentId}`)
              } else {
                console.log(`[YouTube評価] API使用（キャッシュスキップ：動画0件）: ${studentId}`)
              }
            } else {
              result.youtube = { error: 'YouTube評価の取得に失敗しました（APIクォータ超過の可能性）' }
            }
          }
        } catch (error: any) {
          console.error('[YouTube評価エラー]', error.message)
          result.youtube = { error: error.message }
        }
      } else {
        result.youtube = { error: 'YOUTUBE_API_KEY が設定されていません' }
      }
    } else {
      result.youtube = { error: 'YouTubeチャンネルIDが設定されていません' }
    }
    
    // X評価（キャッシュ対応）
    if (student.xAccount) {
      if (X_BEARER_TOKEN) {
        try {
          // キャッシュを確認
          let cachedData = null
          if (useCache) {
            const { getCachedEvaluation } = await import('./lib/evaluation-cache')
            cachedData = await getCachedEvaluation(
              accessToken,
              RESULT_SPREADSHEET_ID,
              studentId,
              month,
              'x'
            )
          }
          
          if (cachedData) {
            result.x = { ...cachedData, cached: true }
            console.log(`[X評価] キャッシュ使用: ${studentId}`)
          } else {
            // APIから取得
            const { evaluateXAccount } = await import('./lib/x-client')
            const evaluation = await evaluateXAccount(
              X_BEARER_TOKEN,
              student.xAccount,
              month
            )
            
            if (evaluation) {
              result.x = evaluation
              
              // ✅ ツイートが1件以上ある、またはユーザー情報が取得できた場合のみキャッシュに保存
              if (useCache && (evaluation.tweetsInMonth > 0 || evaluation.followersCount > 0)) {
                const { saveCachedEvaluation } = await import('./lib/evaluation-cache')
                await saveCachedEvaluation(
                  accessToken,
                  RESULT_SPREADSHEET_ID,
                  studentId,
                  student.name,
                  month,
                  'x',
                  evaluation
                )
                console.log(`[X評価] API使用（キャッシュ保存）: ${studentId}`)
              } else {
                console.log(`[X評価] API使用（キャッシュスキップ：データ不足）: ${studentId}`)
              }
            } else {
              result.x = { error: 'X評価の取得に失敗しました' }
            }
          }
        } catch (error: any) {
          console.error('[X評価エラー]', error.message)
          result.x = { error: error.message }
        }
      } else {
        result.x = { error: 'X_BEARER_TOKEN が設定されていません' }
      }
    } else {
      result.x = { error: 'Xアカウントが設定されていません' }
    }
    
    return c.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[/api/evaluation/complete] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// X評価取得
app.get('/api/x/evaluate/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    const studentId = c.req.param('studentId')
    const month = c.req.query('month') || getPreviousMonth() // YYYY-MM

    if (!X_BEARER_TOKEN) {
      return c.json({ success: false, error: 'X_BEARER_TOKEN が設定されていません' }, 400)
    }

    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)

    if (!student) {
      return c.json({ success: false, error: '生徒が見つかりません' }, 404)
    }

    if (!student.xAccount) {
      return c.json({ success: false, error: 'Xアカウントが設定されていません' }, 400)
    }

    // X評価を実行
    console.log(`[X Evaluate] Starting evaluation for ${studentId}, account: ${student.xAccount}, month: ${month}`)
    const { evaluateXAccount } = await import('./lib/x-client')
    const evaluation = await evaluateXAccount(
      X_BEARER_TOKEN,
      student.xAccount,
      month
    )

    console.log(`[X Evaluate] Evaluation result for ${studentId}:`, evaluation ? 'SUCCESS' : 'NULL/ERROR')
    
    if (!evaluation || evaluation.error) {
      console.error(`[X Evaluate] Failed to get evaluation for ${studentId}:`, evaluation?.error)
      return c.json({ 
        success: false, 
        error: evaluation?.error || 'X評価の取得に失敗しました',
        details: {
          studentId,
          xAccount: student.xAccount,
          month
        }
      }, 500)
    }

    return c.json({
      success: true,
      studentId,
      studentName: student.name,
      month,
      evaluation
    })
  } catch (error: any) {
    console.error('[/api/x/evaluate] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// YouTube評価一括実行
app.post('/api/youtube/evaluate-batch', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    
    const request = await c.req.json()
    const month = request.month || getPreviousMonth()
    const studentIds = request.studentIds || [] // 空の場合は全生徒
    
    if (!YOUTUBE_API_KEY) {
      return c.json({ success: false, error: 'YOUTUBE_API_KEY が設定されていません' }, 400)
    }
    
    console.log(`[YouTube Batch] Starting batch evaluation for ${month}, studentIds:`, studentIds)
    
    // 生徒情報を取得
    const allStudents = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    // フィルタリング: 指定された学籍番号 or 全生徒（YouTubeチャンネルIDがある生徒のみ）
    let targetStudents = allStudents.filter(s => s.youtubeChannelId)
    
    if (studentIds.length > 0) {
      targetStudents = targetStudents.filter(s => studentIds.includes(s.studentId))
    }
    
    console.log(`[YouTube Batch] Target students: ${targetStudents.length}`)
    
    const { evaluateYouTubeChannel } = await import('./lib/youtube-client')
    const { saveCachedEvaluation } = await import('./lib/evaluation-cache')
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    const results = []
    const errors = []
    let successCount = 0
    let errorCount = 0
    
    for (const student of targetStudents) {
      try {
        console.log(`[YouTube Batch] Evaluating ${student.studentId} (${student.name})`)
        
        const evaluation = await evaluateYouTubeChannel(
          YOUTUBE_API_KEY,
          student.youtubeChannelId!,
          month
        )
        
        if (evaluation && !evaluation.error) {
          // キャッシュに保存
          await saveCachedEvaluation(
            accessToken,
            RESULT_SPREADSHEET_ID,
            student.studentId,
            student.name,
            month,
            'youtube',
            evaluation
          )
          
          results.push({
            studentId: student.studentId,
            studentName: student.name,
            grade: evaluation.overallGrade,
            success: true
          })
          successCount++
          console.log(`[YouTube Batch] Success: ${student.studentId} - Grade ${evaluation.overallGrade}`)
        } else {
          results.push({
            studentId: student.studentId,
            studentName: student.name,
            error: evaluation?.error || 'YouTube評価に失敗しました',
            success: false
          })
          errorCount++
          errors.push(`${student.name}(${student.studentId}): ${evaluation?.error || 'エラー'}`)
          console.log(`[YouTube Batch] Error: ${student.studentId} - ${evaluation?.error}`)
        }
      } catch (error: any) {
        results.push({
          studentId: student.studentId,
          studentName: student.name,
          error: error.message,
          success: false
        })
        errorCount++
        errors.push(`${student.name}(${student.studentId}): ${error.message}`)
        console.error(`[YouTube Batch] Exception for ${student.studentId}:`, error.message)
      }
    }
    
    return c.json({
      success: true,
      month,
      totalStudents: targetStudents.length,
      successCount,
      errorCount,
      results,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('[/api/youtube/evaluate-batch] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// X評価一括実行
app.post('/api/x/evaluate-batch', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    
    const request = await c.req.json()
    const month = request.month || getPreviousMonth()
    const studentIds = request.studentIds || [] // 空の場合は全生徒
    
    if (!X_BEARER_TOKEN) {
      return c.json({ success: false, error: 'X_BEARER_TOKEN が設定されていません' }, 400)
    }
    
    console.log(`[X Batch] Starting batch evaluation for ${month}, studentIds:`, studentIds)
    
    // 生徒情報を取得
    const allStudents = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    // フィルタリング: 指定された学籍番号 or 全生徒（XアカウントIDがある生徒のみ）
    let targetStudents = allStudents.filter(s => s.xAccount)
    
    if (studentIds.length > 0) {
      targetStudents = targetStudents.filter(s => studentIds.includes(s.studentId))
    }
    
    console.log(`[X Batch] Target students: ${targetStudents.length}`)
    
    const { evaluateXAccount } = await import('./lib/x-client')
    const { saveCachedEvaluation } = await import('./lib/evaluation-cache')
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    const results = []
    const errors = []
    let successCount = 0
    let errorCount = 0
    
    for (const student of targetStudents) {
      try {
        console.log(`[X Batch] Evaluating ${student.studentId} (${student.name})`)
        
        const evaluation = await evaluateXAccount(
          X_BEARER_TOKEN,
          student.xAccount!,
          month
        )
        
        if (evaluation && !evaluation.error) {
          // キャッシュに保存
          await saveCachedEvaluation(
            accessToken,
            RESULT_SPREADSHEET_ID,
            student.studentId,
            student.name,
            month,
            'x',
            evaluation
          )
          
          results.push({
            studentId: student.studentId,
            studentName: student.name,
            grade: evaluation.overallGrade,
            success: true
          })
          successCount++
          console.log(`[X Batch] Success: ${student.studentId} - Grade ${evaluation.overallGrade}`)
        } else {
          results.push({
            studentId: student.studentId,
            studentName: student.name,
            error: evaluation?.error || 'X評価に失敗しました',
            success: false
          })
          errorCount++
          errors.push(`${student.name}(${student.studentId}): ${evaluation?.error || 'エラー'}`)
          console.log(`[X Batch] Error: ${student.studentId} - ${evaluation?.error}`)
        }
      } catch (error: any) {
        results.push({
          studentId: student.studentId,
          studentName: student.name,
          error: error.message,
          success: false
        })
        errorCount++
        errors.push(`${student.name}(${student.studentId}): ${error.message}`)
        console.error(`[X Batch] Exception for ${student.studentId}:`, error.message)
      }
    }
    
    return c.json({
      success: true,
      month,
      totalStudents: targetStudents.length,
      successCount,
      errorCount,
      results,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('[/api/x/evaluate-batch] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// X評価一括実行（50名ずつ自動分割、15分待機）
app.post('/api/x/evaluate-batch-auto', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    
    const request = await c.req.json()
    const month = request.month || getPreviousMonth()
    const studentIds = request.studentIds || [] // 空の場合は全生徒
    
    if (!X_BEARER_TOKEN) {
      return c.json({ success: false, error: 'X_BEARER_TOKEN が設定されていません' }, 400)
    }
    
    console.log(`[X Batch Auto] Starting auto batch evaluation for ${month}`)
    
    // 生徒情報を取得
    const allStudents = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    // フィルタリング: 指定された学籍番号 or 全生徒（XアカウントIDがある生徒のみ）
    let targetStudents = allStudents.filter(s => s.xAccount)
    
    if (studentIds.length > 0) {
      targetStudents = targetStudents.filter(s => studentIds.includes(s.studentId))
    }
    
    console.log(`[X Batch Auto] Target students: ${targetStudents.length}`)
    
    const { evaluateXAccount } = await import('./lib/x-client')
    const { saveCachedEvaluation } = await import('./lib/evaluation-cache')
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    const allResults = []
    const allErrors = []
    let totalSuccessCount = 0
    let totalErrorCount = 0
    
    // 50名ずつに分割
    const batchSize = 50
    const totalBatches = Math.ceil(targetStudents.length / batchSize)
    
    console.log(`[X Batch Auto] Splitting into ${totalBatches} batches of ${batchSize} students each`)
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * batchSize
      const endIndex = Math.min(startIndex + batchSize, targetStudents.length)
      const batchStudents = targetStudents.slice(startIndex, endIndex)
      
      console.log(`[X Batch Auto] Processing batch ${batchIndex + 1}/${totalBatches} (${startIndex}-${endIndex - 1})`)
      
      // バッチ処理
      for (const student of batchStudents) {
        try {
          console.log(`[X Batch Auto] Evaluating ${student.studentId} (${student.name})`)
          
          const evaluation = await evaluateXAccount(
            X_BEARER_TOKEN,
            student.xAccount!,
            month
          )
          
          if (evaluation && !evaluation.error) {
            // キャッシュに保存
            await saveCachedEvaluation(
              accessToken,
              RESULT_SPREADSHEET_ID,
              student.studentId,
              student.name,
              month,
              'x',
              evaluation
            )
            
            allResults.push({
              studentId: student.studentId,
              studentName: student.name,
              grade: evaluation.overallGrade,
              success: true
            })
            totalSuccessCount++
            console.log(`[X Batch Auto] Success: ${student.studentId} - Grade ${evaluation.overallGrade}`)
          } else {
            allResults.push({
              studentId: student.studentId,
              studentName: student.name,
              error: evaluation?.error || 'X評価に失敗しました',
              success: false
            })
            totalErrorCount++
            allErrors.push(`${student.name}(${student.studentId}): ${evaluation?.error || 'エラー'}`)
            console.log(`[X Batch Auto] Error: ${student.studentId} - ${evaluation?.error}`)
          }
        } catch (error: any) {
          allResults.push({
            studentId: student.studentId,
            studentName: student.name,
            error: error.message,
            success: false
          })
          totalErrorCount++
          allErrors.push(`${student.name}(${student.studentId}): ${error.message}`)
          console.error(`[X Batch Auto] Exception for ${student.studentId}:`, error.message)
        }
      }
      
      // 次のバッチがある場合は15分（900秒）待機
      if (batchIndex < totalBatches - 1) {
        console.log(`[X Batch Auto] Batch ${batchIndex + 1} completed. Waiting 15 minutes before next batch...`)
        await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000)) // 15分待機
        console.log(`[X Batch Auto] Wait completed. Starting batch ${batchIndex + 2}/${totalBatches}`)
      }
    }
    
    console.log(`[X Batch Auto] All batches completed: Success=${totalSuccessCount}, Error=${totalErrorCount}`)
    
    return c.json({
      success: true,
      month,
      totalStudents: targetStudents.length,
      totalBatches,
      batchSize,
      successCount: totalSuccessCount,
      errorCount: totalErrorCount,
      results: allResults,
      errors: allErrors.length > 0 ? allErrors : undefined
    })
  } catch (error: any) {
    console.error('[/api/x/evaluate-batch-auto] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// プロレベルセクション評価を取得
app.get('/api/prolevel/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const studentId = c.req.param('studentId')
    const month = c.req.query('month') || getPreviousMonth() // YYYY-MM
    
    if (!studentId) {
      return c.json({ success: false, message: '学籍番号が指定されていません' }, 400)
    }

    // Google Sheets APIで評価結果を検索
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    // 評価結果シートからデータを取得（月次シート: 評価結果_YYYY-MM）
    const sheetName = `評価結果_${month}`
    
    try {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )

      if (!response.ok) {
        return c.json({ success: false, error: `シート ${sheetName} が見つかりません` }, 404)
      }

      const data = await response.json()
      const rows = data.values || []
      
      if (rows.length < 2) {
        return c.json({ success: false, error: '評価データがありません' }, 404)
      }

      // ヘッダー行から列インデックスを取得
      const headers = rows[0]
      const studentIdIndex = headers.indexOf('学籍番号')
      const nameIndex = headers.indexOf('氏名')
      const overallGradeIndex = headers.indexOf('総合評価')
      const absenceIndex = headers.indexOf('欠席・遅刻評価')
      const missionIndex = headers.indexOf('ミッション評価')
      const paymentIndex = headers.indexOf('支払い評価')
      const listeningIndex = headers.indexOf('傾聴力評価')
      const comprehensionIndex = headers.indexOf('理解度評価')
      const commentIndex = headers.indexOf('評価コメント')
      
      // 生徒データを検索
      const studentRow = rows.slice(1).find(row => row[studentIdIndex] === studentId)
      
      if (!studentRow) {
        return c.json({ success: false, error: '該当する評価データが見つかりません' }, 404)
      }

      // 評価データを返す
      return c.json({
        success: true,
        studentId,
        studentName: studentRow[nameIndex] || '',
        month,
        evaluation: {
          '総合評価': studentRow[overallGradeIndex] || '-',
          '欠席・遅刻評価': studentRow[absenceIndex] || '-',
          'ミッション評価': studentRow[missionIndex] || '-',
          '支払い評価': studentRow[paymentIndex] || '-',
          '傾聴力評価': studentRow[listeningIndex] || '-',
          '理解度評価': studentRow[comprehensionIndex] || '-',
          '評価コメント': studentRow[commentIndex] || ''
        }
      })
    } catch (error: any) {
      console.error('[/api/prolevel] Sheet read error:', error.message)
      return c.json({ success: false, error: error.message }, 500)
    }
  } catch (error: any) {
    console.error('[/api/prolevel] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// トークメモフォルダのドキュメント一覧をテスト（デバッグ用）
app.get('/api/debug/check-folder/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const studentId = c.req.param('studentId')
    
    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)
    
    if (!student) {
      return c.json({ success: false, error: '生徒が見つかりません' }, 404)
    }
    
    if (!student.talkMemoFolderUrl) {
      return c.json({ success: false, error: 'トークメモフォルダURLが設定されていません', student }, 400)
    }
    
    // フォルダ内のドキュメントを取得
    const documentIds = await fetchDocumentsInFolder(GOOGLE_SERVICE_ACCOUNT, student.talkMemoFolderUrl)
    
    return c.json({
      success: true,
      student: {
        studentId: student.studentId,
        name: student.name,
        talkMemoFolderUrl: student.talkMemoFolderUrl,
      },
      documentCount: documentIds.length,
      documentIds,
    })
  } catch (error: any) {
    console.error('[/api/debug/check-folder] Error:', error.message)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// ドキュメントの内容を取得（デバッグ用）
app.get('/api/debug/check-document/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const studentId = c.req.param('studentId')
    
    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)
    
    if (!student) {
      return c.json({ success: false, error: '生徒が見つかりません' }, 404)
    }
    
    if (!student.talkMemoFolderUrl) {
      return c.json({ success: false, error: 'トークメモフォルダURLが設定されていません' }, 400)
    }
    
    // フォルダ内のドキュメントを取得
    const documentIds = await fetchDocumentsInFolder(GOOGLE_SERVICE_ACCOUNT, student.talkMemoFolderUrl)
    
    if (documentIds.length === 0) {
      return c.json({ success: false, error: 'ドキュメントが見つかりません' }, 404)
    }
    
    // 最初のドキュメントの内容を取得
    const document = await fetchDocumentContent(GOOGLE_SERVICE_ACCOUNT, documentIds[0])
    
    return c.json({
      success: true,
      student: {
        studentId: student.studentId,
        name: student.name,
      },
      document: {
        id: document.documentId,
        title: document.title,
        contentLength: document.content.length,
        contentPreview: document.content.substring(0, 1000), // 最初の1000文字
        fullContent: document.content, // 全文
        messagesCount: document.messages.length,
        messagesPreview: document.messages.slice(0, 5), // 最初の5メッセージ
      }
    })
  } catch (error: any) {
    console.error('[/api/debug/check-document] Error:', error.message)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// Google Docs APIの生のレスポンスを取得（デバッグ用）
app.get('/api/debug/raw-document/:studentId', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const studentId = c.req.param('studentId')
    
    // 生徒情報を取得
    const students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    const student = students.find(s => s.studentId === studentId)
    
    if (!student || !student.talkMemoFolderUrl) {
      return c.json({ success: false, error: '生徒またはフォルダURLが見つかりません' }, 404)
    }
    
    // フォルダ内のドキュメントを取得
    const documentIds = await fetchDocumentsInFolder(GOOGLE_SERVICE_ACCOUNT, student.talkMemoFolderUrl)
    
    if (documentIds.length === 0) {
      return c.json({ success: false, error: 'ドキュメントが見つかりません' }, 404)
    }
    
    // Google Docs APIを直接呼び出して生のレスポンスを取得
    const accessToken = await (async () => {
      const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
      const header = { alg: 'RS256', typ: 'JWT' };
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/documents.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      };
      
      const base64UrlEncode = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const headerEncoded = base64UrlEncode(JSON.stringify(header));
      const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
      const signatureInput = `${headerEncoded}.${payloadEncoded}`;
      
      const pemToArrayBuffer = (pem: string) => {
        const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      };
      
      const privateKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(credentials.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signatureInput));
      const signatureEncoded = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
      const jwt = `${signatureInput}.${signatureEncoded}`;
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
      });
      const data = await response.json();
      return data.access_token;
    })();
    
    const docResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentIds[0]}?fields=*`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const doc = await docResponse.json();
    
    // body.contentの詳細構造を解析（見出しやテーブルを含む）
    // 全要素を取得（最大100要素）
    const bodyElements = (doc.body?.content || []).slice(0, 100).map((element: any, index: number) => {
      if (element.paragraph) {
        let text = '';
        for (const elem of element.paragraph.elements || []) {
          if (elem.textRun?.content) {
            text += elem.textRun.content;
          }
        }
        return {
          type: 'paragraph',
          index,
          style: element.paragraph.paragraphStyle?.namedStyleType || 'NORMAL_TEXT',
          textPreview: text.substring(0, 100).replace(/\n/g, ' '),
        };
      } else if (element.table) {
        return {
          type: 'table',
          index,
          rows: element.table.tableRows?.length || 0,
        };
      } else if (element.sectionBreak) {
        return {
          type: 'sectionBreak',
          index,
        };
      } else {
        return {
          type: 'unknown',
          index,
          keys: Object.keys(element),
        };
      }
    });
    
    // 構造情報のみを返す（全データは大きすぎるため）
    return c.json({
      success: true,
      documentId: documentIds[0],
      structure: {
        hasBody: !!doc.body,
        hasTabs: !!doc.tabs,
        tabsCount: doc.tabs?.length || 0,
        tabs: doc.tabs?.map((tab: any, index: number) => ({
          index,
          title: tab.tabProperties?.title || 'untitled',
          hasDocumentTab: !!tab.documentTab,
          hasBody: !!tab.documentTab?.body,
          contentElementsCount: tab.documentTab?.body?.content?.length || 0,
        })) || [],
        bodyContentElementsCount: doc.body?.content?.length || 0,
        bodyElements, // 最初の30要素の詳細構造
      }
    })
  } catch (error: any) {
    console.error('[/api/debug/raw-document] Error:', error.message)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// 採点実行エンドポイント
app.post('/api/evaluate', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const GEMINI_API_KEY = getEnv(c, 'GEMINI_API_KEY')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const ABSENCE_SPREADSHEET_ID = getEnv(c, 'ABSENCE_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    
    const request: EvaluationRequest = await c.req.json()
    
    // 必須パラメータチェック
    if (!request.month) {
      return c.json<EvaluationResponse>({
        success: false,
        message: '評価対象月（month）は必須です（例: 2024-12）',
      }, 400)
    }

    console.log(`[/api/evaluate] Starting evaluation for ${request.month}`)

    // Gemini初期化
    const gemini = new GeminiAnalyzer(GEMINI_API_KEY)

    // 生徒情報を取得
    let students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    // 特定の生徒のみ評価する場合
    if (request.studentIds && request.studentIds.length > 0) {
      students = students.filter(s => request.studentIds!.includes(s.studentId))
    }

    console.log(`[/api/evaluate] Evaluating ${students.length} students`)

    // 欠席データを取得（直近3ヶ月以内から集計）
    const absenceDataList = await fetchAbsenceData(GOOGLE_SERVICE_ACCOUNT, ABSENCE_SPREADSHEET_ID, request.month)

    const results: EvaluationResult[] = []
    const errors: string[] = []
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)

    // YouTube/X評価用のモジュールをインポート
    const { evaluateYouTubeChannel } = await import('./lib/youtube-client')
    const { evaluateXAccount } = await import('./lib/x-client')
    const { saveCachedEvaluation } = await import('./lib/evaluation-cache')

    // 各生徒を評価
    for (const student of students) {
      try {
        console.log(`[/api/evaluate] Processing student: ${student.studentId} (${student.name})`)
        
        // トークメモフォルダからドキュメントを取得
        const documentIds = await fetchDocumentsInFolder(GOOGLE_SERVICE_ACCOUNT, student.talkMemoFolderUrl)
        
        if (documentIds.length === 0) {
          errors.push(`${student.name}(${student.studentId}): トークメモが見つかりません`)
          continue
        }

        // 最新のドキュメントを取得（複数ある場合は統合も検討）
        const talkMemo = await fetchDocumentContent(GOOGLE_SERVICE_ACCOUNT, documentIds[0])

        // Geminiで分析
        const geminiAnalysis = await gemini.analyzeTrainingSession(talkMemo)

        // 欠席データを取得
        const absenceData = absenceDataList.find(a => a.studentId === student.studentId)

        // プロレベル評価を実施
        const result = evaluateStudent(
          student,
          absenceData,
          undefined, // 支払いデータは一旦なし
          geminiAnalysis,
          request.month
        )

        results.push(result)

        // YouTube評価（YouTubeチャンネルIDがある場合のみ）
        if (student.youtubeChannelId && YOUTUBE_API_KEY) {
          try {
            console.log(`[/api/evaluate] Evaluating YouTube for ${student.studentId}`)
            const youtubeEval = await evaluateYouTubeChannel(
              YOUTUBE_API_KEY,
              student.youtubeChannelId,
              request.month
            )
            
            // ✅ 成功時のみキャッシュに保存（動画が1件以上ある場合）
            if (youtubeEval && youtubeEval.videosInMonth > 0) {
              await saveCachedEvaluation(
                accessToken,
                RESULT_SPREADSHEET_ID,
                student.studentId,
                student.name,
                request.month,
                'youtube',
                youtubeEval
              )
              console.log(`[/api/evaluate] YouTube evaluation saved for ${student.studentId}`)
            } else {
              console.log(`[/api/evaluate] YouTube evaluation skipped cache (0 videos or API error) for ${student.studentId}`)
            }
          } catch (error: any) {
            console.error(`[/api/evaluate] YouTube evaluation failed for ${student.studentId}:`, error.message)
            errors.push(`${student.name}(${student.studentId}): YouTube評価エラー - ${error.message}`)
          }
        }

        // X評価（Xアカウントがある場合のみ）
        if (student.xAccount && X_BEARER_TOKEN) {
          try {
            console.log(`[/api/evaluate] Evaluating X for ${student.studentId}`)
            const xEval = await evaluateXAccount(
              X_BEARER_TOKEN,
              student.xAccount,
              request.month
            )
            
            // ✅ 評価が成功した場合のみキャッシュに保存（ツイート1件以上またはユーザー情報取得成功）
            if (xEval && (xEval.tweetsInMonth > 0 || xEval.followersCount > 0)) {
              await saveCachedEvaluation(
                accessToken,
                RESULT_SPREADSHEET_ID,
                student.studentId,
                student.name,
                request.month,
                'x',
                xEval
              )
              console.log(`[/api/evaluate] X evaluation saved for ${student.studentId}`)
            } else {
              console.log(`[/api/evaluate] X evaluation skipped cache (no data or API error) for ${student.studentId}`)
            }
          } catch (error: any) {
            console.error(`[/api/evaluate] X evaluation failed for ${student.studentId}:`, error.message)
            errors.push(`${student.name}(${student.studentId}): X評価エラー - ${error.message}`)
          }
        }

      } catch (error: any) {
        errors.push(`${student.name}(${student.studentId}): ${error.message}`)
      }
    }

    // プロレベル評価結果をスプレッドシートに書き込み
    if (results.length > 0) {
      const resultArrays = results.map(convertResultToArray)
      await writeResultsToSheet(
        GOOGLE_SERVICE_ACCOUNT,
        RESULT_SPREADSHEET_ID,
        `評価結果_${request.month}`,
        resultArrays
      )
      console.log(`[/api/evaluate] Results written to sheet: 評価結果_${request.month}`)
    }

    return c.json<EvaluationResponse>({
      success: true,
      message: `${results.length}件の評価が完了しました（YouTube/X評価を含む）`,
      results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[/api/evaluate] Error:', error)
    return c.json<EvaluationResponse>({
      success: false,
      message: error.message,
    }, 500)
  }
})

// 評価結果検索エンドポイント
app.get('/api/results/:studentId', async (c) => {
  try {
    const studentId = c.req.param('studentId')
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    
    if (!studentId) {
      return c.json({ success: false, message: '学籍番号が指定されていません' }, 400)
    }

    // Google Sheets APIで評価結果を検索
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    // スプレッドシートのすべてのシート名を取得
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    
    if (!sheetsResponse.ok) {
      throw new Error('スプレッドシートの取得に失敗しました')
    }
    
    const sheetsData = await sheetsResponse.json()
    const sheets = sheetsData.sheets || []
    
    // 評価結果シートのみをフィルタ（評価結果_で始まるシート名）
    const resultSheets = sheets
      .map((s: any) => s.properties.title)
      .filter((title: string) => title.startsWith('評価結果_'))
      .sort()
      .reverse() // 新しい順にソート
    
    const results = []
    
    // 各シートから学籍番号に一致する行を検索
    for (const sheetName of resultSheets) {
      const valuesResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${RESULT_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      )
      
      if (!valuesResponse.ok) continue
      
      const valuesData = await valuesResponse.json()
      const rows = valuesData.values || []
      
      if (rows.length < 2) continue
      
      const header = rows[0]
      const dataRows = rows.slice(1)
      
      // 学籍番号列のインデックスを取得
      const studentIdIndex = header.findIndex((h: string) => h === '学籍番号')
      
      if (studentIdIndex === -1) continue
      
      // 該当する学籍番号の行を検索
      for (const row of dataRows) {
        if (row[studentIdIndex] === studentId) {
          const result: any = {}
          header.forEach((h: string, i: number) => {
            result[h] = row[i] || ''
          })
          results.push(result)
        }
      }
    }
    
    return c.json({
      success: true,
      studentId,
      count: results.length,
      results
    })
  } catch (error: any) {
    console.error('Results search error:', error)
    return c.json({ success: false, message: error.message }, 500)
  }
})

// 自動評価エンドポイント（GitHub Actions Cronから呼び出される）
app.post('/api/auto-evaluate', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const GEMINI_API_KEY = getEnv(c, 'GEMINI_API_KEY')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const ABSENCE_SPREADSHEET_ID = getEnv(c, 'ABSENCE_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    
    // 評価月（クエリパラメータまたは前月）
    const month = c.req.query('month') || getPreviousMonth()
    
    // バッチ処理のパラメータ
    const batchSize = parseInt(c.req.query('batchSize') || '300') // デフォルト300名
    const batchIndex = parseInt(c.req.query('batchIndex') || '0') // デフォルト0（最初のバッチ）
    const skipProLevel = c.req.query('skipProLevel') === 'true' // プロレベル評価をスキップするか
    
    console.log(`[Auto Evaluate] Starting evaluation for ${month}`)
    console.log(`[Auto Evaluate] Batch size: ${batchSize}, Batch index: ${batchIndex}, Skip pro-level: ${skipProLevel}`)
    
    // Gemini初期化（プロレベル評価が必要な場合のみ）
    const gemini = skipProLevel ? null : new GeminiAnalyzer(GEMINI_API_KEY)
    
    // 全生徒を取得
    const allStudents = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    console.log(`[Auto Evaluate] Found ${allStudents.length} total students`)
    
    // フィルタリング: アクティブのみ、永久会員を除外
    const filteredStudents = allStudents.filter(student => {
      const status = student.status || ''
      const isActive = status === 'アクティブ'
      const isPermanent = status === '永久会員'
      return isActive && !isPermanent
    })
    console.log(`[Auto Evaluate] Filtered to ${filteredStudents.length} active students (excluding 永久会員)`)
    
    // バッチ処理: 指定されたバッチのみ処理
    const startIndex = batchIndex * batchSize
    const endIndex = Math.min(startIndex + batchSize, filteredStudents.length)
    const students = filteredStudents.slice(startIndex, endIndex)
    
    console.log(`[Auto Evaluate] Processing batch ${batchIndex}: students ${startIndex + 1}-${endIndex} (${students.length} students)`)
    
    const results = []
    const proLevelResults: EvaluationResult[] = []
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0
    const errors: string[] = []
    
    // アクセストークンを取得（キャッシュ用）
    let accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    let tokenRefreshedAt = Date.now()
    
    // 欠席データを取得（プロレベル評価が必要な場合のみ）
    const absenceDataList = skipProLevel ? [] : await fetchAbsenceData(GOOGLE_SERVICE_ACCOUNT, ABSENCE_SPREADSHEET_ID, month)
    if (!skipProLevel) {
      console.log(`[Auto Evaluate] Fetched absence data for ${absenceDataList.length} students`)
    }
    
    // 各生徒の評価を実行
    for (const student of students) {
      try {
        // アクセストークンを30分ごとに更新（トークンの有効期限は1時間）
        const now = Date.now()
        if (now - tokenRefreshedAt > 30 * 60 * 1000) { // 30分経過
          console.log(`[Auto Evaluate] Refreshing access token...`)
          accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
          tokenRefreshedAt = now
          console.log(`[Auto Evaluate] Access token refreshed`)
        }
        
        console.log(`[Auto Evaluate] Processing student: ${student.studentId} (${student.name})`)
        
        const result: any = {
          studentId: student.studentId,
          studentName: student.name,
          month,
          evaluations: {}
        }
        
        let hasAnyAccount = false
        let proLevelEvaluated = false
        
        // プロレベル評価（スキップされていない場合のみ）
        if (!skipProLevel && student.talkMemoFolderUrl) {
          try {
            console.log(`[Auto Evaluate] Fetching talk memo for ${student.studentId}`)
            const documentIds = await fetchDocumentsInFolder(GOOGLE_SERVICE_ACCOUNT, student.talkMemoFolderUrl)
            
            if (documentIds.length > 0) {
              // 最新のドキュメントを取得
              const talkMemo = await fetchDocumentContent(GOOGLE_SERVICE_ACCOUNT, documentIds[0])
              console.log(`[Auto Evaluate] Analyzing talk memo with Gemini for ${student.studentId}`)
              
              // Geminiで分析（geminiがnullでないことを確認）
              if (!gemini) {
                throw new Error('Gemini analyzer not initialized')
              }
              const geminiAnalysis = await gemini.analyzeTrainingSession(talkMemo)
              
              // 欠席データを取得
              const absenceData = absenceDataList.find(a => a.studentId === student.studentId)
              
              // プロレベル評価を実施
              const proLevelResult = evaluateStudent(
                student,
                absenceData,
                undefined, // 支払いデータは一旦なし
                geminiAnalysis,
                month
              )
              
              proLevelResults.push(proLevelResult)
              result.evaluations.proLevel = {
                overallGrade: proLevelResult.overallGrade,
                attendanceGrade: proLevelResult.attendanceGrade,
                punctualityGrade: proLevelResult.punctualityGrade,
                missionGrade: proLevelResult.missionGrade
              }
              proLevelEvaluated = true
              console.log(`[Auto Evaluate] Pro-level evaluation completed for ${student.studentId}`)
            } else {
              console.log(`[Auto Evaluate] No talk memo found for ${student.studentId}`)
              result.evaluations.proLevel = { info: 'トークメモが見つかりません' }
            }
          } catch (error: any) {
            console.error(`[Auto Evaluate] Pro-level evaluation error for ${student.studentId}:`, error.message)
            result.evaluations.proLevel = { error: error.message }
            errors.push(`${student.name}(${student.studentId}): プロレベル評価エラー - ${error.message}`)
          }
        } else if (skipProLevel) {
          result.evaluations.proLevel = { info: 'プロレベル評価スキップ（skipProLevel=true）' }
        } else {
          result.evaluations.proLevel = { info: 'トークメモフォルダURLなし' }
        }
        
        // YouTube評価
        if (student.youtubeChannelId) {
          hasAnyAccount = true
          if (YOUTUBE_API_KEY) {
            try {
              // キャッシュを確認
              const { getCachedEvaluation, saveCachedEvaluation } = await import('./lib/evaluation-cache')
              let cachedData = await getCachedEvaluation(
                accessToken,
                RESULT_SPREADSHEET_ID,
                student.studentId,
                month,
                'youtube'
              )
              
              if (cachedData) {
                result.evaluations.youtube = { ...cachedData, cached: true }
                console.log(`[Auto Evaluate] YouTube評価（キャッシュ使用）: ${student.studentId}`)
              } else {
                const { evaluateYouTubeChannel } = await import('./lib/youtube-client')
                const evaluation = await evaluateYouTubeChannel(
                  YOUTUBE_API_KEY,
                  student.youtubeChannelId,
                  month
                )
                
                if (evaluation && !evaluation.error) {
                  result.evaluations.youtube = evaluation
                  // 成功時のみキャッシュに保存
                  await saveCachedEvaluation(
                    accessToken,
                    RESULT_SPREADSHEET_ID,
                    student.studentId,
                    student.name,
                    month,
                    'youtube',
                    evaluation
                  )
                  console.log(`[Auto Evaluate] YouTube評価完了（キャッシュ保存）: ${student.studentId}`)
                } else {
                  result.evaluations.youtube = { error: 'YouTube評価の取得に失敗しました' }
                  console.log(`[Auto Evaluate] YouTube評価失敗（キャッシュなし）: ${student.studentId}`)
                }
              }
            } catch (error: any) {
              result.evaluations.youtube = { error: error.message }
              console.error(`[Auto Evaluate] YouTube評価エラー: ${student.studentId}`, error.message)
            }
          } else {
            result.evaluations.youtube = { error: 'YOUTUBE_API_KEY が設定されていません' }
          }
        } else {
          result.evaluations.youtube = { info: 'YouTubeチャンネル情報なし' }
        }
        
        // X評価
        if (student.xAccount) {
          hasAnyAccount = true
          if (X_BEARER_TOKEN) {
            try {
              // キャッシュを確認
              const { getCachedEvaluation, saveCachedEvaluation } = await import('./lib/evaluation-cache')
              let cachedData = await getCachedEvaluation(
                accessToken,
                RESULT_SPREADSHEET_ID,
                student.studentId,
                month,
                'x'
              )
              
              if (cachedData) {
                result.evaluations.x = { ...cachedData, cached: true }
                console.log(`[Auto Evaluate] X評価（キャッシュ使用）: ${student.studentId}`)
              } else {
                const { evaluateXAccount } = await import('./lib/x-client')
                const evaluation = await evaluateXAccount(
                  X_BEARER_TOKEN,
                  student.xAccount,
                  month
                )
                
                if (evaluation && !evaluation.error) {
                  result.evaluations.x = evaluation
                  // 成功時のみキャッシュに保存
                  await saveCachedEvaluation(
                    accessToken,
                    RESULT_SPREADSHEET_ID,
                    student.studentId,
                    student.name,
                    month,
                    'x',
                    evaluation
                  )
                  console.log(`[Auto Evaluate] X評価完了（キャッシュ保存）: ${student.studentId}`)
                } else {
                  result.evaluations.x = { error: 'X評価の取得に失敗しました' }
                  console.log(`[Auto Evaluate] X評価失敗（キャッシュなし）: ${student.studentId}`)
                }
              }
            } catch (error: any) {
              result.evaluations.x = { error: error.message }
              console.error(`[Auto Evaluate] X評価エラー: ${student.studentId}`, error.message)
            }
          } else {
            result.evaluations.x = { error: 'X_BEARER_TOKEN が設定されていません' }
          }
        } else {
          result.evaluations.x = { info: 'Xアカウント情報なし' }
        }
        
        // アカウント情報が一つもない、かつプロレベル評価もない場合はスキップ
        if (!hasAnyAccount && !proLevelEvaluated) {
          console.log(`[Auto Evaluate] スキップ（評価対象情報なし）: ${student.studentId}`)
          skippedCount++
          continue
        }
        
        results.push(result)
        successCount++
        console.log(`[Auto Evaluate] Student evaluation completed: ${student.studentId}`)
      } catch (error: any) {
        console.error(`[Auto Evaluate] 生徒評価エラー: ${student.studentId}`, error.message)
        results.push({
          studentId: student.studentId,
          studentName: student.name,
          error: error.message
        })
        errorCount++
      }
    }
    
    console.log(`[Auto Evaluate] バッチ完了 - 成功: ${successCount}, エラー: ${errorCount}, スキップ: ${skippedCount}`)
    
    // プロレベル評価結果をスプレッドシートに書き込み
    if (proLevelResults.length > 0) {
      try {
        console.log(`[Auto Evaluate] Writing ${proLevelResults.length} pro-level results to sheet`)
        const resultArrays = proLevelResults.map(convertResultToArray)
        await writeResultsToSheet(
          GOOGLE_SERVICE_ACCOUNT,
          RESULT_SPREADSHEET_ID,
          `評価結果_${month}`,
          resultArrays
        )
        console.log(`[Auto Evaluate] Pro-level results written to sheet: 評価結果_${month}`)
      } catch (error: any) {
        console.error(`[Auto Evaluate] Failed to write pro-level results to sheet:`, error.message)
        errors.push(`スプレッドシート書き込みエラー: ${error.message}`)
      }
    }
    
    // 次のバッチがあるか確認
    const hasNextBatch = endIndex < filteredStudents.length
    const nextBatchIndex = hasNextBatch ? batchIndex + 1 : null
    const totalBatches = Math.ceil(filteredStudents.length / batchSize)
    
    return c.json({
      success: true,
      month,
      batchInfo: {
        batchIndex,
        batchSize,
        totalBatches,
        processedStudents: students.length,
        totalActiveStudents: filteredStudents.length,
        hasNextBatch,
        nextBatchIndex
      },
      successCount,
      errorCount,
      skippedCount,
      proLevelResultsCount: proLevelResults.length,
      errors: errors.length > 0 ? errors : undefined,
      results
    })
  } catch (error: any) {
    console.error('[/api/auto-evaluate] Error:', error.message, error.stack)
    return c.json({ success: false, error: error.message, stack: error.stack }, 500)
  }
})

// バッチ評価の進行状況を確認
app.get('/api/auto-evaluate/status', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    
    // 全生徒を取得
    const allStudents = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    // フィルタリング: アクティブのみ、永久会員を除外
    const filteredStudents = allStudents.filter(student => {
      const status = student.status || ''
      const isActive = status === 'アクティブ'
      const isPermanent = status === '永久会員'
      return isActive && !isPermanent
    })
    
    // アカウント情報がある生徒のみカウント
    const studentsWithAccounts = filteredStudents.filter(student => 
      student.youtubeChannelId || student.xAccount
    )
    
    const batchSize = 100  // X APIレート制限対策: 100名/バッチ（300リクエスト/15分以内）
    const totalBatches = Math.ceil(studentsWithAccounts.length / batchSize)
    
    return c.json({
      success: true,
      totalStudents: allStudents.length,
      activeStudents: filteredStudents.length,
      studentsWithAccounts: studentsWithAccounts.length,
      batchSize,
      totalBatches,
      estimatedTime: `${totalBatches * 15}分（15分間隔で${totalBatches}バッチ）`
    })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// 前月を YYYY-MM 形式で取得
function getPreviousMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-11
  
  if (month === 0) {
    // 1月の場合、前年の12月
    return `${year - 1}-12`
  } else {
    const prevMonth = month // 前月 (0-indexed なので month が既に前月)
    return `${year}-${String(prevMonth).padStart(2, '0')}`
  }
}

// アクセストークン取得ヘルパー
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson)
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }
  
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  
  // JWT生成（簡易実装 - 本番環境では適切なライブラリを使用）
  const base64Header = btoa(JSON.stringify(header))
  const base64Payload = btoa(JSON.stringify(payload))
  const signatureInput = `${base64Header}.${base64Payload}`
  
  // RS256署名（Node.js環境）
  const crypto = await import('crypto')
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signatureInput)
  const signature = sign.sign(serviceAccount.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  
  const jwt = `${base64Header}.${base64Payload}.${signature}`
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  
  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// ====================================
// YouTube Analytics OAuth認証エンドポイント
// ====================================

// アナリティクス対象生徒一覧を取得
app.get('/api/analytics/students', async (c) => {
  const { env } = c;
  
  try {
    const serviceAccount = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT');
    const spreadsheetId = getEnv(c, 'ANALYTICS_TARGET_SPREADSHEET_ID') || '1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M';
    
    console.log('[Analytics Students] Fetching:', { spreadsheetId });
    
    // fetchAnalyticsTargetStudentsを動的インポート
    const { fetchAnalyticsTargetStudents } = await import('./lib/google-client');
    const students = await fetchAnalyticsTargetStudents(serviceAccount, spreadsheetId);
    
    return c.json({
      success: true,
      students,
      count: students.length,
    });
  } catch (error: any) {
    console.error('[Analytics Students] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// OAuth認証URL生成
app.get('/api/analytics/auth/url', async (c) => {
  const { env } = c;
  const studentId = c.req.query('studentId');
  
  if (!studentId) {
    return c.json({
      success: false,
      error: 'studentId is required',
    }, 400);
  }
  
  try {
    const clientId = getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_ID');
    const redirectUri = getEnv(c, 'YOUTUBE_ANALYTICS_REDIRECT_URI');
    
    console.log('[Analytics Auth URL] Environment check:', {
      hasClientId: !!clientId,
      clientIdLength: clientId?.length || 0,
      hasRedirectUri: !!redirectUri,
      redirectUri: redirectUri || 'not set',
    });
    
    if (!clientId || !redirectUri) {
      const missingVars = [];
      if (!clientId) missingVars.push('YOUTUBE_ANALYTICS_CLIENT_ID');
      if (!redirectUri) missingVars.push('YOUTUBE_ANALYTICS_REDIRECT_URI');
      
      return c.json({
        success: false,
        error: `YouTube Analytics OAuth設定が不足しています: ${missingVars.join(', ')}`,
      }, 500);
    }
    
    // CSRFトークンとしてstudentIdを使用（実際にはランダムトークンを生成すべき）
    const state = `${studentId}:${Date.now()}`;
    
    // 動的インポート
    const { generateAuthUrl } = await import('./lib/youtube-analytics-client');
    const authUrl = generateAuthUrl(clientId, redirectUri, state);
    
    return c.json({
      success: true,
      authUrl,
      state,
    });
  } catch (error: any) {
    console.error('[Analytics Auth URL] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// OAuth認証コールバック
app.get('/api/analytics/auth/callback', async (c) => {
  const { env } = c;
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  
  if (error) {
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <title>認証エラー</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div class="text-center">
            <i class="fas fa-times-circle text-red-500 text-6xl mb-4"></i>
            <h1 class="text-2xl font-bold text-gray-800 mb-4">認証エラー</h1>
            <p class="text-gray-600 mb-6">認証が拒否されました: ${error}</p>
            <button onclick="window.close()" class="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700">
              閉じる
            </button>
          </div>
        </div>
      </body>
      </html>
    `);
  }
  
  if (!code || !state) {
    return c.json({
      success: false,
      error: 'Invalid callback parameters',
    }, 400);
  }
  
  try {
    const clientId = getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_ID');
    const clientSecret = getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_SECRET');
    const redirectUri = getEnv(c, 'YOUTUBE_ANALYTICS_REDIRECT_URI');
    
    // stateからstudentIdを抽出
    const [studentId] = state.split(':');
    
    // 認証コードをトークンに交換
    const { exchangeCodeForToken } = await import('./lib/youtube-analytics-client');
    const tokenInfo = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);
    tokenInfo.studentId = studentId;
    
    console.log('[Analytics Callback] Token obtained for:', studentId);
    
    // トークンをPostgreSQLに保存
    const { saveToken } = await import('./lib/oauth-token-manager');
    await saveToken(getEnv(c, 'DATABASE_URL'), studentId, tokenInfo);
    console.log('[Analytics Callback] Token saved to PostgreSQL:', studentId);
    
    // 成功ページを表示
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <title>認証成功</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div class="text-center">
            <i class="fas fa-check-circle text-green-500 text-6xl mb-4"></i>
            <h1 class="text-2xl font-bold text-gray-800 mb-4">認証成功！</h1>
            <p class="text-gray-600 mb-4">学籍番号: <strong>${studentId}</strong></p>
            <p class="text-gray-600 mb-6">YouTube Analyticsデータへのアクセスが許可されました。</p>
            <div class="bg-gray-100 rounded p-4 mb-6 text-left text-sm">
              <p class="font-semibold mb-2">トークン情報:</p>
              <p class="text-xs break-all text-gray-600">
                Access Token: ${tokenInfo.accessToken.substring(0, 20)}...<br>
                Expires: ${new Date(tokenInfo.expiresAt).toLocaleString('ja-JP')}<br>
                Refresh Token: ${tokenInfo.refreshToken ? 'あり' : 'なし'}
              </p>
            </div>
            <button onclick="window.close()" class="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700">
              閉じる
            </button>
          </div>
        </div>
        <script>
          // 親ウィンドウに成功を通知
          if (window.opener) {
            window.opener.postMessage({
              type: 'youtube-analytics-auth-success',
              studentId: '${studentId}',
              tokenInfo: ${JSON.stringify({
                accessToken: tokenInfo.accessToken,
                expiresAt: tokenInfo.expiresAt,
                hasRefreshToken: !!tokenInfo.refreshToken
              })}
            }, '*');
          }
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error('[Analytics Callback] Error:', error);
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <title>認証エラー</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div class="text-center">
            <i class="fas fa-times-circle text-red-500 text-6xl mb-4"></i>
            <h1 class="text-2xl font-bold text-gray-800 mb-4">認証エラー</h1>
            <p class="text-gray-600 mb-6">${error.message}</p>
            <button onclick="window.close()" class="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700">
              閉じる
            </button>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// 保存されたトークンを取得（自動リフレッシュ付き）
app.get('/api/analytics/token/:studentId', async (c) => {
  const { env } = c;
  const studentId = c.req.param('studentId');
  
  if (!studentId) {
    return c.json({
      success: false,
      error: 'studentId is required',
    }, 400);
  }
  
  try {
    const clientId = getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_ID');
    const clientSecret = getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_SECRET');
    
    // トークンを取得（期限切れの場合は自動的にリフレッシュ）
    const { getValidToken } = await import('./lib/oauth-token-manager');
    const tokenInfo = await getValidToken(
      getEnv(c, 'DATABASE_URL'),
      studentId,
      clientId,
      clientSecret
    );
    
    if (!tokenInfo) {
      return c.json({
        success: false,
        error: 'Token not found or expired. Please re-authenticate.',
        needsAuth: true,
      }, 404);
    }
    
    return c.json({
      success: true,
      studentId,
      accessToken: tokenInfo.accessToken,
      expiresAt: tokenInfo.expiresAt,
      hasRefreshToken: !!tokenInfo.refreshToken,
    });
  } catch (error: any) {
    console.error('[Analytics Token] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// トークンを削除（再認証用）
app.delete('/api/analytics/token/:studentId', async (c) => {
  const { env } = c;
  const studentId = c.req.param('studentId');
  
  if (!studentId) {
    return c.json({
      success: false,
      error: 'studentId is required',
    }, 400);
  }
  
  try {
    const { deleteToken } = await import('./lib/oauth-token-manager');
    await deleteToken(getEnv(c, 'DATABASE_URL'), studentId);
    
    return c.json({
      success: true,
      message: 'Token deleted successfully',
    });
  } catch (error: any) {
    console.error('[Analytics Token Delete] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// 全トークンの一覧を取得（管理用）
app.get('/api/analytics/tokens', async (c) => {
  const { env } = c;
  
  try {
    const { listAllTokens } = await import('./lib/oauth-token-manager');
    const tokens = await listAllTokens(getEnv(c, 'DATABASE_URL'));
    
    return c.json({
      success: true,
      tokens,
      count: tokens.length,
    });
  } catch (error: any) {
    console.error('[Analytics Tokens List] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// チャンネルアナリティクスを取得（OAuth認証済み）
app.post('/api/analytics/channel', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { studentId, channelId, accessToken, startDate, endDate } = body;
    
    if (!studentId || !channelId || !accessToken) {
      return c.json({
        success: false,
        error: 'studentId, channelId, accessToken are required',
      }, 400);
    }
    
    console.log('[Analytics Channel] Fetching:', { studentId, channelId, startDate, endDate });
    
    // 動的インポート
    const { getChannelAnalytics, getTrafficSources, getDemographics } = await import('./lib/youtube-analytics-client');
    
    // チャンネルアナリティクスを取得
    const analytics = await getChannelAnalytics(accessToken, channelId, startDate, endDate);
    
    // トラフィックソースを取得
    const trafficSources = await getTrafficSources(accessToken, channelId, startDate, endDate);
    analytics.trafficSources = trafficSources;
    
    // デモグラフィックを取得
    const demographics = await getDemographics(accessToken, channelId, startDate, endDate);
    analytics.demographics = demographics;
    
    return c.json({
      success: true,
      studentId,
      analytics,
    });
  } catch (error: any) {
    console.error('[Analytics Channel] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// 動画タイプ別アナリティクスを取得（OAuth認証済み）
app.post('/api/analytics/by-type', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { studentId, channelId, accessToken, startDate, endDate, saveHistory } = body;
    
    if (!studentId || !channelId || !accessToken) {
      return c.json({
        success: false,
        error: 'studentId, channelId, accessToken are required',
      }, 400);
    }
    
    console.log('[Analytics By Type] Fetching:', { studentId, channelId, startDate, endDate, saveHistory });
    
    // 動的インポート
    const { getVideosByType } = await import('./lib/youtube-analytics-client');
    
    // 動画タイプ別のアナリティクスを取得
    const data = await getVideosByType(accessToken, channelId, startDate, endDate);
    
    // 履歴保存が要求された場合（自動取得など）
    if (saveHistory && startDate && endDate) {
      try {
        const { saveAnalyticsHistory } = await import('./lib/analytics-history-manager');
        await saveAnalyticsHistory(
          getEnv(c, 'DATABASE_URL'),
          studentId,
          channelId,
          startDate,
          endDate,
          data.shorts,
          data.regular,
          data.live
        );
        console.log('[Analytics By Type] History saved:', { studentId, startDate, endDate });
      } catch (historyError: any) {
        console.error('[Analytics By Type] Failed to save history:', historyError);
        // 履歴保存失敗してもデータは返す
      }
    }
    
    return c.json({
      success: true,
      studentId,
      data,
    });
  } catch (error: any) {
    console.error('[Analytics By Type] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// 動画の視聴維持率を取得（OAuth認証済み）
app.post('/api/analytics/retention', async (c) => {
  const { env } = c;
  
  try {
    const body = await c.req.json();
    const { videoId, accessToken } = body;
    
    if (!videoId || !accessToken) {
      return c.json({
        success: false,
        error: 'videoId and accessToken are required',
      }, 400);
    }
    
    console.log('[Analytics Retention] Fetching:', { videoId });
    
    // 動的インポート
    const { getVideoRetention } = await import('./lib/youtube-analytics-client');
    const retentionData = await getVideoRetention(accessToken, videoId);
    
    return c.json({
      success: true,
      videoId,
      retentionData,
    });
  } catch (error: any) {
    console.error('[Analytics Retention] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// 環境変数確認用エンドポイント（デバッグ用）
app.get('/api/debug/env', (c) => {
  const databaseUrl = getEnv(c, 'DATABASE_URL');
  return c.json({
    DATABASE_URL: databaseUrl ? `${databaseUrl.substring(0, 30)}... (${databaseUrl.length} chars)` : 'MISSING',
    YOUTUBE_ANALYTICS_CLIENT_ID: getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_ID') ? 'Defined ✓' : 'Missing ✗',
    YOUTUBE_ANALYTICS_CLIENT_SECRET: getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_SECRET') ? 'Defined ✓' : 'Missing ✗',
    YOUTUBE_ANALYTICS_REDIRECT_URI: getEnv(c, 'YOUTUBE_ANALYTICS_REDIRECT_URI') || 'Missing ✗',
  });
});

// アナリティクス履歴を取得
app.get('/api/analytics/history/:studentId', async (c) => {
  try {
    const studentId = c.req.param('studentId');
    const limit = parseInt(c.req.query('limit') || '12');
    
    if (!studentId) {
      return c.json({
        success: false,
        error: 'studentId is required',
      }, 400);
    }
    
    console.log('[Analytics History] Fetching:', { studentId, limit });
    
    const { getAnalyticsHistory } = await import('./lib/analytics-history-manager');
    const history = await getAnalyticsHistory(
      getEnv(c, 'DATABASE_URL'),
      studentId,
      limit
    );
    
    return c.json({
      success: true,
      studentId,
      history,
    });
  } catch (error: any) {
    console.error('[Analytics History] Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// 自動アナリティクス取得（テスト用・軽量版）
app.get('/api/analytics/auto-fetch/test', async (c) => {
  try {
    const { listAllTokens } = await import('./lib/oauth-token-manager');
    const tokens = await listAllTokens(getEnv(c, 'DATABASE_URL'));
    
    // 環境変数の状態を確認
    const serviceAccountRaw = c.env?.GOOGLE_SERVICE_ACCOUNT;
    
    // 生徒データを取得してみる
    const { fetchStudents } = await import('./lib/google-client');
    const serviceAccountStr = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT');
    const spreadsheetId = getEnv(c, 'ANALYTICS_TARGET_SPREADSHEET_ID');
    
    let students = [];
    let studentsError = null;
    try {
      students = await fetchStudents(serviceAccountStr, spreadsheetId, 'アナリティクス取得');
    } catch (error: any) {
      studentsError = error.message;
    }
    
    // OLTS240246-QQ の生徒を検索
    const targetStudent = students.find(s => s.studentId === 'OLTS240246-QQ');
    
    return c.json({
      success: true,
      message: 'Test endpoint is working',
      tokenCount: tokens.length,
      studentsCount: students.length,
      studentsError,
      targetStudent: targetStudent ? {
        studentId: targetStudent.studentId,
        name: targetStudent.name,
        youtubeChannelId: targetStudent.youtubeChannelId || 'NOT SET',
      } : 'NOT FOUND',
      timestamp: new Date().toISOString(),
      debug: {
        'c.env exists': !!c.env,
        'c.env.GOOGLE_SERVICE_ACCOUNT type': typeof serviceAccountRaw,
        'c.env.GOOGLE_SERVICE_ACCOUNT length': typeof serviceAccountRaw === 'string' ? serviceAccountRaw?.length : 'N/A',
        'c.env.GOOGLE_SERVICE_ACCOUNT first50': typeof serviceAccountRaw === 'string' ? serviceAccountRaw?.substring(0, 50) : String(serviceAccountRaw).substring(0, 50),
      },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, 500);
  }
});

// 自動アナリティクス取得（週次Cron用）
app.post('/api/analytics/auto-fetch', async (c) => {
  try {
    console.log('[Auto Fetch] Starting weekly analytics collection...');
    
    // 全生徒のトークン一覧を取得
    const { listAllTokens } = await import('./lib/oauth-token-manager');
    const { getVideosByType } = await import('./lib/youtube-analytics-client');
    const { saveAnalyticsHistory } = await import('./lib/analytics-history-manager');
    const { fetchStudents } = await import('./lib/google-client');
    
    const tokens = await listAllTokens(getEnv(c, 'DATABASE_URL'));
    console.log(`[Auto Fetch] Found ${tokens.length} students with OAuth tokens`);
    
    // 即座に処理開始メッセージを返す
    if (tokens.length === 0) {
      return c.json({
        success: true,
        message: 'No OAuth tokens found. Please authenticate students first.',
        summary: { total: 0, success: 0, errors: 0 },
        results: [],
      });
    }
    
    // スプレッドシートから生徒情報を取得
    const serviceAccountStr = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT');
    console.log('[Auto Fetch] Service account type:', typeof serviceAccountStr);
    console.log('[Auto Fetch] Service account length:', serviceAccountStr?.length || 0);
    
    if (!serviceAccountStr || serviceAccountStr.length === 0) {
      return c.json({
        success: false,
        error: 'GOOGLE_SERVICE_ACCOUNT is not configured',
      }, 500);
    }
    
    const spreadsheetId = getEnv(c, 'ANALYTICS_TARGET_SPREADSHEET_ID');
    
    // fetchStudents は文字列（JSON文字列）を期待している
    // シート名は「アナリティクス取得」を指定
    const students = await fetchStudents(serviceAccountStr, spreadsheetId, 'アナリティクス取得');
    
    // 前週のデータを取得（月曜日〜日曜日）
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = 日曜日, 3 = 水曜日
    const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - daysToLastSunday);
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    
    const startDate = lastMonday.toISOString().split('T')[0];
    const endDate = lastSunday.toISOString().split('T')[0];
    
    console.log(`[Auto Fetch] Period: ${startDate} ~ ${endDate}`);
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const token of tokens) {
      try {
        const student = students.find(s => s.studentId === token.studentId);
        if (!student) {
          console.warn(`[Auto Fetch] Student not found: ${token.studentId}`);
          continue;
        }
        
        if (!student.youtubeChannelId) {
          console.warn(`[Auto Fetch] No YouTube channel: ${token.studentId}`);
          continue;
        }
        
        // トークンを取得（自動リフレッシュ）
        const { getValidToken } = await import('./lib/oauth-token-manager');
        const validToken = await getValidToken(
          getEnv(c, 'DATABASE_URL'),
          token.studentId,
          getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_ID'),
          getEnv(c, 'YOUTUBE_ANALYTICS_CLIENT_SECRET')
        );
        
        if (!validToken) {
          console.warn(`[Auto Fetch] Invalid token: ${token.studentId}`);
          errorCount++;
          results.push({
            studentId: token.studentId,
            success: false,
            error: 'Invalid or expired token',
          });
          continue;
        }
        
        // アナリティクスデータを取得
        const data = await getVideosByType(
          validToken.accessToken,
          student.youtubeChannelId,
          startDate,
          endDate
        );
        
        // データベースに保存
        await saveAnalyticsHistory(
          getEnv(c, 'DATABASE_URL'),
          token.studentId,
          student.youtubeChannelId,
          startDate,
          endDate,
          data.shorts,
          data.regular,
          data.live
        );
        
        successCount++;
        results.push({
          studentId: token.studentId,
          name: student.name,
          success: true,
        });
        
        console.log(`[Auto Fetch] Success: ${student.name} (${token.studentId})`);
      } catch (error: any) {
        errorCount++;
        results.push({
          studentId: token.studentId,
          success: false,
          error: error.message,
        });
        console.error(`[Auto Fetch] Error for ${token.studentId}:`, error);
      }
    }
    
    console.log(`[Auto Fetch] Complete: ${successCount} success, ${errorCount} errors`);
    
    return c.json({
      success: true,
      period: { startDate, endDate },
      summary: {
        total: tokens.length,
        success: successCount,
        errors: errorCount,
      },
      results,
    });
  } catch (error: any) {
    console.error('[Auto Fetch] Fatal error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// データベースマイグレーション実行エンドポイント
app.post('/api/admin/run-migrations', async (c) => {
  try {
    console.log('[Admin] Running database migrations...');
    
    const { runMigrations } = await import('./lib/migrations');
    await runMigrations(getEnv(c, 'DATABASE_URL'));
    
    return c.json({
      success: true,
      message: 'Migrations completed successfully',
    });
  } catch (error: any) {
    console.error('[Admin] Migration error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

export default app
