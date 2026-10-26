import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import app from './dist/_worker.js'

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Starting server on port ${port}...`)
// 新しいHonoアプリを作成して静的ファイル配信を追加
const wrappedApp = new Hono()

// 静的ファイル配信を追加（dist/staticから配信）
wrappedApp.use('/static/*', serveStatic({ root: './dist' }))

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
      DATABASE_URL: process.env.DATABASE_URL,
      YOUTUBE_ANALYTICS_CLIENT_ID: process.env.YOUTUBE_ANALYTICS_CLIENT_ID,
      YOUTUBE_ANALYTICS_CLIENT_SECRET: process.env.YOUTUBE_ANALYTICS_CLIENT_SECRET,
      YOUTUBE_ANALYTICS_REDIRECT_URI: process.env.YOUTUBE_ANALYTICS_REDIRECT_URI,
      ANALYTICS_TARGET_SPREADSHEET_ID: process.env.ANALYTICS_TARGET_SPREADSHEET_ID,
    })
  },
  port
})

console.log(`Server is running on http://0.0.0.0:${port}`)
