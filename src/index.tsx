import { Hono } from 'hono'
import { cors } from 'hono/cors'
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

// メインレンダラー
app.use(renderer)

// トップページ
app.get('/', (c) => {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  return c.render(
    <div class="space-y-8">
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
        <div id="student-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <p class="text-gray-500">読み込み中...</p>
        </div>
      </div>

      {/* API情報セクション */}
      <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <h2 class="text-xl font-bold text-gray-800 mb-3">
          <i class="fas fa-code text-blue-600 mr-2"></i>
          API エンドポイント
        </h2>
        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 bg-green-100 text-green-800 rounded font-mono text-xs">POST</span>
            <code class="text-gray-700">/api/evaluate</code>
            <span class="text-gray-600">- 採点を実行</span>
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
        
        <div class="mt-4 p-4 bg-white rounded border border-gray-200">
          <h3 class="font-bold text-sm text-gray-800 mb-2">Google Apps Scriptサンプル</h3>
          <pre class="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
{`function runMonthlyEvaluation() {
  const url = 'https://your-app.pages.dev/api/evaluate';
  const payload = { month: '2024-12' };
  
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

// 環境変数チェック（デバッグ用）
app.get('/api/debug/env-check', (c) => {
  const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
  const GEMINI_API_KEY = getEnv(c, 'GEMINI_API_KEY')
  const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
  const ABSENCE_SPREADSHEET_ID = getEnv(c, 'ABSENCE_SPREADSHEET_ID')
  const PAYMENT_SPREADSHEET_ID = getEnv(c, 'PAYMENT_SPREADSHEET_ID')
  const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
  
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

// 採点実行エンドポイント
app.post('/api/evaluate', async (c) => {
  try {
    const GOOGLE_SERVICE_ACCOUNT = getEnv(c, 'GOOGLE_SERVICE_ACCOUNT')
    const GEMINI_API_KEY = getEnv(c, 'GEMINI_API_KEY')
    const STUDENT_MASTER_SPREADSHEET_ID = getEnv(c, 'STUDENT_MASTER_SPREADSHEET_ID')
    const ABSENCE_SPREADSHEET_ID = getEnv(c, 'ABSENCE_SPREADSHEET_ID')
    const RESULT_SPREADSHEET_ID = getEnv(c, 'RESULT_SPREADSHEET_ID')
    // PAYMENT_SPREADSHEET_ID は一旦使用しない
    
    const request: EvaluationRequest = await c.req.json()
    
    // 必須パラメータチェック
    if (!request.month) {
      return c.json<EvaluationResponse>({
        success: false,
        message: '評価対象月（month）は必須です（例: 2024-12）',
      }, 400)
    }

    // Gemini初期化
    const gemini = new GeminiAnalyzer(GEMINI_API_KEY)

    // 生徒情報を取得
    let students = await fetchStudents(GOOGLE_SERVICE_ACCOUNT, STUDENT_MASTER_SPREADSHEET_ID)
    
    // 特定の生徒のみ評価する場合
    if (request.studentIds && request.studentIds.length > 0) {
      students = students.filter(s => request.studentIds!.includes(s.studentId))
    }

    // 欠席データを取得（直近3ヶ月以内から集計）
    const absenceDataList = await fetchAbsenceData(GOOGLE_SERVICE_ACCOUNT, ABSENCE_SPREADSHEET_ID, request.month)

    const results: EvaluationResult[] = []
    const errors: string[] = []

    // 各生徒を評価
    for (const student of students) {
      try {
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

        // 評価を実施（支払いデータは一旦なし）
        const result = evaluateStudent(
          student,
          absenceData,
          undefined, // 支払いデータは一旦なし
          geminiAnalysis,
          request.month
        )

        results.push(result)
      } catch (error: any) {
        errors.push(`${student.name}(${student.studentId}): ${error.message}`)
      }
    }

    // 結果をスプレッドシートに書き込み
    if (results.length > 0) {
      const resultArrays = results.map(convertResultToArray)
      await writeResultsToSheet(
        GOOGLE_SERVICE_ACCOUNT,
        RESULT_SPREADSHEET_ID,
        `評価結果_${request.month}`,
        resultArrays
      )
    }

    return c.json<EvaluationResponse>({
      success: true,
      message: `${results.length}件の評価が完了しました`,
      results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Evaluation error:', error)
    return c.json<EvaluationResponse>({
      success: false,
      message: error.message,
    }, 500)
  }
})

export default app
