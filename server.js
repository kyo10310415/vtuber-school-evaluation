import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import app from './dist/_worker.js'

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Starting server on port ${port}...`)
console.log('Environment variables loaded:')
console.log('- GOOGLE_SERVICE_ACCOUNT:', process.env.GOOGLE_SERVICE_ACCOUNT ? 'Defined ✓' : 'Missing ✗')
console.log('- GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Defined ✓' : 'Missing ✗')
console.log('- STUDENT_MASTER_SPREADSHEET_ID:', process.env.STUDENT_MASTER_SPREADSHEET_ID || 'Missing ✗')
console.log('- ABSENCE_SPREADSHEET_ID:', process.env.ABSENCE_SPREADSHEET_ID || 'Missing ✗')
console.log('- PAYMENT_SPREADSHEET_ID:', process.env.PAYMENT_SPREADSHEET_ID || 'Missing ✗')
console.log('- RESULT_SPREADSHEET_ID:', process.env.RESULT_SPREADSHEET_ID || 'Missing ✗')
console.log('- YOUTUBE_API_KEY:', process.env.YOUTUBE_API_KEY ? 'Defined ✓' : 'Missing ✗')
console.log('- X_BEARER_TOKEN:', process.env.X_BEARER_TOKEN ? 'Defined ✓' : 'Missing ✗')

// 新しいHonoアプリを作成して静的ファイル配信を追加
const wrappedApp = new Hono()

// 静的ファイル配信を追加（public/staticから配信）
wrappedApp.use('/static/*', serveStatic({ root: './public' }))

// メインアプリのすべてのルートを追加
wrappedApp.route('/', app)

serve({
  fetch: (req) => {
    // Pass environment variables directly to the app
    return wrappedApp.fetch(req, {
      GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      STUDENT_MASTER_SPREADSHEET_ID: process.env.STUDENT_MASTER_SPREADSHEET_ID,
      ABSENCE_SPREADSHEET_ID: process.env.ABSENCE_SPREADSHEET_ID,
      PAYMENT_SPREADSHEET_ID: process.env.PAYMENT_SPREADSHEET_ID,
      RESULT_SPREADSHEET_ID: process.env.RESULT_SPREADSHEET_ID,
      YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
      X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
    })
  },
  port
})

console.log(`Server is running on http://0.0.0.0:${port}`)
