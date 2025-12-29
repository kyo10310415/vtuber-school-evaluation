import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ],
  publicDir: 'public',
  build: {
    minify: false, // ビルド時のメモリ使用量を削減
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined // チャンク分割を無効化
      }
    }
  }
})
