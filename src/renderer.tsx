import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>WannaV成長度リザルトシステム</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body class="bg-gray-100">
        <div class="min-h-screen">
          <header class="bg-gradient-to-r from-purple-600 to-pink-600 text-white py-6 shadow-lg">
            <div class="container mx-auto px-4">
              <h1 class="text-3xl font-bold">
                <i class="fas fa-graduation-cap mr-2"></i>
                WannaV成長度リザルトシステム
              </h1>
              <p class="text-purple-100 mt-2">プロレベルセクション評価システム</p>
            </div>
          </header>

          <main class="container mx-auto px-4 py-8">
            {children}
          </main>

          <footer class="bg-gray-800 text-white py-6 mt-12">
            <div class="container mx-auto px-4 text-center">
              <p>&copy; 2024 WannaV. All rights reserved.</p>
            </div>
          </footer>
        </div>

        {/* ローディングオーバーレイ */}
        <div id="loading-overlay" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg p-8 max-w-md">
            <div class="flex items-center justify-center mb-4">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
            <p id="loading-text" class="text-center text-gray-700 font-medium">処理中...</p>
          </div>
        </div>

        <script src="/static/app.js"></script>
      </body>
    </html>
  )
})
