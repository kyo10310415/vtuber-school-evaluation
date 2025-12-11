# Renderデプロイガイド

このガイドでは、VTuberスクール成長度リザルトシステムをRenderにデプロイする手順を説明します。

---

## ⚠️ 重要な注意事項

**このアプリケーションはCloudflare Workers/Pages向けに設計されています。**

Renderで動かす場合、以下の制約があります：

### 動作する機能
- ✅ APIエンドポイント（`/api/*`）
- ✅ フロントエンド（静的ファイル配信）
- ✅ Google APIs連携
- ✅ Gemini AI分析

### 注意が必要な点
- ⚠️ Wranglerの開発サーバーモードで動作（本番推奨はCloudflare Pages）
- ⚠️ Renderの無料プランはスリープする（15分非アクティブで停止）
- ⚠️ 大量リクエストには不向き

**推奨**: 本番環境ではCloudflare Pagesの利用を強く推奨します。

---

## 🚀 Renderデプロイ手順

### 1. GitHubリポジトリの準備

このプロジェクトをGitHubにプッシュしてください。

### 2. Renderアカウント作成

[Render](https://render.com/) にアクセスしてアカウントを作成

### 3. 新しいWeb Serviceを作成

1. Renderダッシュボードで「New +」→「Web Service」をクリック
2. GitHubリポジトリを接続
3. リポジトリを選択

### 4. 設定

#### Basic Settings
- **Name**: `vtuber-school-evaluation`
- **Region**: `Oregon (US West)` または任意
- **Branch**: `main`
- **Root Directory**: （空欄のまま）

#### Build & Deploy
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npx wrangler pages dev dist --ip 0.0.0.0 --port $PORT`

#### Plan
- **Instance Type**: `Free`

### 5. 環境変数を設定

「Environment」タブで以下の環境変数を追加：

| Key | Value | 説明 |
|-----|-------|------|
| `NODE_ENV` | `production` | 実行環境 |
| `GOOGLE_SERVICE_ACCOUNT` | `{"type":"service_account",...}` | サービスアカウントJSON（1行） |
| `GEMINI_API_KEY` | `your-api-key` | Gemini APIキー |
| `STUDENT_MASTER_SPREADSHEET_ID` | `your-id` | 生徒マスターID |
| `ABSENCE_SPREADSHEET_ID` | `19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k` | 欠席データID |
| `PAYMENT_SPREADSHEET_ID` | `1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo` | 支払いデータID |
| `RESULT_SPREADSHEET_ID` | `your-result-id` | 結果出力先ID |

**重要**: 環境変数の値はダブルクォートで囲まないでください。

### 6. デプロイ

「Create Web Service」をクリックしてデプロイを開始

デプロイ完了後、以下のようなURLが表示されます：
```
https://vtuber-school-evaluation.onrender.com
```

---

## 🧪 動作確認

### ヘルスチェック
```bash
curl https://vtuber-school-evaluation.onrender.com/api/health
```

期待されるレスポンス：
```json
{"status":"ok","timestamp":"..."}
```

### 生徒一覧取得
```bash
curl https://vtuber-school-evaluation.onrender.com/api/students
```

---

## 🔧 トラブルシューティング

### エラー: "Build failed"

**原因**: 依存関係のインストールエラー

**解決策**:
1. `package.json`の`dependencies`を確認
2. Renderのビルドログを確認

### エラー: "Application failed to start"

**原因**: 環境変数が不足

**解決策**:
1. すべての必須環境変数が設定されているか確認
2. `GOOGLE_SERVICE_ACCOUNT`のJSON形式が正しいか確認

### エラー: "Service Unavailable after 15 minutes"

**原因**: Renderの無料プランは15分でスリープ

**解決策**:
- 初回リクエスト時に起動するまで待つ（30秒程度）
- または有料プラン（$7/月〜）にアップグレード

---

## 📱 Google Apps Scriptの設定

Renderデプロイ後、`gas-script.js`の`API_BASE_URL`を更新：

```javascript
const API_BASE_URL = 'https://vtuber-school-evaluation.onrender.com';
```

---

## 💰 料金プラン

### Render Free Plan（無料）
- ✅ 750時間/月の稼働時間
- ⚠️ 15分非アクティブでスリープ
- ⚠️ 初回リクエスト時に起動（遅延あり）
- ✅ 月次バッチ処理なら十分

### Render Starter Plan（$7/月）
- ✅ 常時稼働
- ✅ スリープなし
- ✅ より高速

---

## 🔄 更新方法

1. GitHubリポジトリにコードをプッシュ
2. Renderが自動でデプロイを開始
3. デプロイログで進捗を確認

---

## ⚡ Cloudflare Pagesとの比較

| 項目 | Cloudflare Pages | Render |
|------|-----------------|--------|
| **速度** | 🟢 非常に高速（エッジ） | 🟡 普通 |
| **スリープ** | 🟢 なし | 🔴 あり（無料プラン） |
| **料金** | 🟢 完全無料 | 🟡 $7/月〜 |
| **適用例** | 本番環境推奨 | 開発・テスト |

**結論**: 本番環境ではCloudflare Pagesを強く推奨します。

---

## 📞 サポート

問題が解決しない場合：

1. **Renderログ確認**: ダッシュボード→ Logs
2. **環境変数確認**: Environment タブ
3. **ビルドログ確認**: Deploy タブ

---

**作成日**: 2024-12-11  
**対象**: VTuberスクール成長度リザルトシステム
