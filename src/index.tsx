import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'
import type { EvaluationRequest, EvaluationResponse, EvaluationResult } from './types'
import { fetchStudents, fetchAbsenceData, fetchDocumentsInFolder, fetchDocumentContent, writeResultsToSheet } from './lib/google-client'
// fetchPaymentData は一旦使用しない
import { GeminiAnalyzer } from './lib/gemini-client'
import { evaluateStudent, convertResultToArray } from './lib/evaluation'

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
}

const app = new Hono<{ Bindings: Bindings }>()

// 環境変数ヘルパー（Cloudflare WorkersとNode.js両対応）
function getEnv(c: any, key: keyof Bindings): string {
  // デバッグ: c.envの中身を確認
  if (key === 'GOOGLE_SERVICE_ACCOUNT') {
    console.log('[getEnv] Checking GOOGLE_SERVICE_ACCOUNT:', {
      'c.env exists': !!c.env,
      'c.env[key] exists': !!c.env?.[key],
      'c.env[key] type': typeof c.env?.[key],
      'c.env[key] length': c.env?.[key]?.length || 0,
      'c.env keys': c.env ? Object.keys(c.env) : []
    })
  }
  
  // Cloudflare Workers環境（c.envから値を取得し、空でないことを確認）
  const envValue = c.env?.[key]
  if (envValue && typeof envValue === 'string' && envValue.length > 0) {
    return envValue
  }
  // Node.js環境（Render等）- server.jsから渡されたc.envを使用
  return envValue || ''
}

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの配信
app.use('/static/*', serveStatic({ root: './public' }))

// メインレンダラー
app.use(renderer)

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
      
      <script src="/static/monthly-report.js"></script>
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
          <div class="flex gap-3 mb-6">
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
      
      <script src="/static/evaluation-detail.js"></script>
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
    const tweets = await fetchRecentTweets(X_BEARER_TOKEN, user.userId, 10)
    
    return c.json({
      step: 2,
      status: 'success',
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

    if (!evaluation) {
      console.error(`[/api/youtube/evaluate] Evaluation returned null for ${studentId}`)
      return c.json({ 
        success: false, 
        error: 'YouTube評価の取得に失敗しました。詳細はサーバーログを確認してください。',
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
              
              for (const row of rows.slice(1)) {
                if (row[studentIdIndex] === studentId && row[monthIndex] === month) {
                  result.proLevel = {}
                  header.forEach((h: string, i: number) => {
                    result.proLevel[h] = row[i] || ''
                  })
                  break
                }
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
              
              // キャッシュに保存
              if (useCache) {
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
              }
              
              console.log(`[YouTube評価] API使用: ${studentId}`)
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
              
              // キャッシュに保存
              if (useCache) {
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
              }
              
              console.log(`[X評価] API使用: ${studentId}`)
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

    console.log(`[X Evaluate] Evaluation result for ${studentId}:`, evaluation ? 'SUCCESS' : 'NULL')
    
    if (!evaluation) {
      console.error(`[X Evaluate] Failed to get evaluation for ${studentId}`)
      return c.json({ 
        success: false, 
        error: 'X評価の取得に失敗しました。詳細はサーバーログを確認してください。',
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
            
            if (youtubeEval) {
              // キャッシュに保存
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
            
            if (xEval) {
              // キャッシュに保存
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
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    const YOUTUBE_API_KEY = getEnv(c, 'YOUTUBE_API_KEY')
    const X_BEARER_TOKEN = getEnv(c, 'X_BEARER_TOKEN')
    
    // 評価月（クエリパラメータまたは前月）
    const month = c.req.query('month') || getPreviousMonth()
    
    // バッチ処理のパラメータ
    const batchSize = parseInt(c.req.query('batchSize') || '300') // デフォルト300名
    const batchIndex = parseInt(c.req.query('batchIndex') || '0') // デフォルト0（最初のバッチ）
    
    console.log(`[Auto Evaluate] Starting evaluation for ${month}`)
    console.log(`[Auto Evaluate] Batch size: ${batchSize}, Batch index: ${batchIndex}`)
    
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
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0
    
    // アクセストークンを取得（キャッシュ用）
    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT)
    
    // 各生徒の評価を実行
    for (const student of students) {
      try {
        const result: any = {
          studentId: student.studentId,
          studentName: student.name,
          month,
          evaluations: {}
        }
        
        let hasAnyAccount = false
        
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
                
                if (evaluation) {
                  result.evaluations.youtube = evaluation
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
                  console.log(`[Auto Evaluate] YouTube評価完了: ${student.studentId}`)
                } else {
                  result.evaluations.youtube = { error: 'YouTube評価の取得に失敗しました' }
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
                
                if (evaluation) {
                  result.evaluations.x = evaluation
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
                  console.log(`[Auto Evaluate] X評価完了: ${student.studentId}`)
                } else {
                  result.evaluations.x = { error: 'X評価の取得に失敗しました' }
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
        
        // アカウント情報が一つもない場合はスキップ
        if (!hasAnyAccount) {
          console.log(`[Auto Evaluate] スキップ（アカウント情報なし）: ${student.studentId}`)
          skippedCount++
          continue
        }
        
        results.push(result)
        successCount++
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
    
    console.log(`[Auto Evaluate] 完了 - 成功: ${successCount}, エラー: ${errorCount}, スキップ: ${skippedCount}`)
    
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
    
    const batchSize = 300
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

export default app
