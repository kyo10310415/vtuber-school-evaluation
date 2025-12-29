# 環境変数設定ガイド

## ローカル開発環境（`.dev.vars`）

`.dev.vars` ファイルに以下の環境変数を設定してください：

### 必須環境変数

```bash
# Google Service Account（JSON形式）
# ※ Google Cloud Consoleから取得したJSONをそのまま貼り付け
GOOGLE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'

# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Google Sheets IDs
STUDENT_MASTER_SPREADSHEET_ID=1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M
ABSENCE_SPREADSHEET_ID=19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k
PAYMENT_SPREADSHEET_ID=your_payment_spreadsheet_id_here
RESULT_SPREADSHEET_ID=1t571fqZJtUjNL7_gH6G2dSNBCmS98LTnDrWEtt7J92k

# Notion API（オプショナル - 自動同期を使用する場合）
NOTION_API_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=88e474e5400f44998fa04d982b1c8ef7

# YouTube Data API v3
YOUTUBE_API_KEY=取得したYouTube APIキーをここに貼り付け

# X API (Twitter API v2)
X_API_KEY=取得したX API Keyをここに貼り付け
X_API_SECRET=取得したX API Secretをここに貼り付け
X_BEARER_TOKEN=取得したX Bearer Tokenをここに貼り付け
X_CLIENT_ID=取得したX Client IDをここに貼り付け
X_CLIENT_SECRET=取得したX Client Secretをここに貼り付け
```

---

## 本番環境（Render）

Renderダッシュボードで環境変数を設定してください：

1. **Renderダッシュボードにアクセス**
   ```
   https://dashboard.render.com/
   ```

2. **`vtuber-school-evaluation` サービスを選択**

3. **左メニューの「Environment」をクリック**

4. **「Add Environment Variable」で以下を追加:**

| Key | Value |
|-----|-------|
| `GOOGLE_SERVICE_ACCOUNT` | Google Service Account JSON（1行） |
| `GEMINI_API_KEY` | Gemini APIキー |
| `STUDENT_MASTER_SPREADSHEET_ID` | 生徒マスタースプレッドシートID |
| `ABSENCE_SPREADSHEET_ID` | 欠席データスプレッドシートID |
| `PAYMENT_SPREADSHEET_ID` | 支払いデータスプレッドシートID |
| `RESULT_SPREADSHEET_ID` | 結果出力先スプレッドシートID |
| `YOUTUBE_API_KEY` | YouTube APIキー |
| `X_BEARER_TOKEN` | X Bearer Token |
| `X_API_KEY` | X API Key |
| `X_API_SECRET` | X API Secret |
| `X_CLIENT_ID` | X Client ID |
| `X_CLIENT_SECRET` | X Client Secret |

5. **「Save Changes」をクリック**

6. **サービスが自動的に再起動されます**

---

## 環境変数の確認方法

### ローカル開発環境

```bash
# .dev.varsファイルが正しく設定されているか確認
cat .dev.vars
```

### API経由で確認

```bash
# 環境変数チェックエンドポイント
curl http://localhost:3000/api/debug/env-check
```

---

## テスト方法

### 1. YouTube評価テスト

```bash
# 学籍番号を指定してYouTube評価を取得
curl "http://localhost:3000/api/youtube/evaluate/OLTS240488-AR?month=2024-12"
```

### 2. X評価テスト

```bash
# 学籍番号を指定してX評価を取得
curl "http://localhost:3000/api/x/evaluate/OLTS240488-AR?month=2024-12"
```

---

## トラブルシューティング

### エラー: "YOUTUBE_API_KEY が設定されていません"
- `.dev.vars` に `YOUTUBE_API_KEY` が設定されているか確認
- Renderの環境変数に追加されているか確認

### エラー: "X_BEARER_TOKEN が設定されていません"
- `.dev.vars` に `X_BEARER_TOKEN` が設定されているか確認
- Renderの環境変数に追加されているか確認

### エラー: "YouTubeチャンネルIDが設定されていません"
- 生徒マスタシートの F列（YouTubeチャンネルID）が入力されているか確認
- Google Apps Scriptで `UpdateSNSAccounts.gs` を実行したか確認

### エラー: "Xアカウントが設定されていません"
- 生徒マスタシートの G列（Xアカウント）が入力されているか確認
- Google Apps Scriptで `UpdateSNSAccounts.gs` を実行したか確認

---

## 次のステップ

1. **`.dev.vars` に実際のAPIキーを設定**
2. **ローカルでテスト実行**
3. **Renderに環境変数を設定**
4. **本番環境でテスト実行**

