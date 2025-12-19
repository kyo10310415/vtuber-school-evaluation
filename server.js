import { serve } from '@hono/node-server'
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

serve({
  fetch: (req, env) => {
    // Pass environment variables to the app through the env parameter
    return app.fetch(req, {
      env: {
        GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        STUDENT_MASTER_SPREADSHEET_ID: process.env.STUDENT_MASTER_SPREADSHEET_ID,
        ABSENCE_SPREADSHEET_ID: process.env.ABSENCE_SPREADSHEET_ID,
        PAYMENT_SPREADSHEET_ID: process.env.PAYMENT_SPREADSHEET_ID,
        RESULT_SPREADSHEET_ID: process.env.RESULT_SPREADSHEET_ID,
      }
    })
  },
  port
})

console.log(`Server is running on http://0.0.0.0:${port}`)
