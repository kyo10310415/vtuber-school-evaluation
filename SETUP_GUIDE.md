# VTuberスクール成長度リザルトシステム - セットアップガイド

## 📋 目次

1. [必要なもの](#必要なもの)
2. [Google Cloud Projectの設定](#google-cloud-projectの設定)
3. [スプレッドシートの準備](#スプレッドシートの準備)
4. [Gemini APIの取得](#gemini-apiの取得)
5. [ローカル開発環境の構築](#ローカル開発環境の構築)
6. [Cloudflare Pagesへのデプロイ](#cloudflare-pagesへのデプロイ)
7. [Google Apps Scriptの設定](#google-apps-scriptの設定)
8. [トラブルシューティング](#トラブルシューティング)

---

## 必要なもの

- [ ] Googleアカウント
- [ ] Google Cloud Platform アカウント
- [ ] Cloudflareアカウント
- [ ] Gemini APIキー
- [ ] Node.js (v18以上)
- [ ] Git

---

## Google Cloud Projectの設定

### 1. プロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（例: `vtuber-school-evaluation`）

### 2. 必要なAPIを有効化

以下のAPIを有効化してください：

- **Google Sheets API**
  - https://console.cloud.google.com/apis/library/sheets.googleapis.com
- **Google Drive API**
  - https://console.cloud.google.com/apis/library/drive.googleapis.com
- **Google Docs API**
  - https://console.cloud.google.com/apis/library/docs.googleapis.com

### 3. サービスアカウントを作成

1. [サービスアカウント](https://console.cloud.google.com/iam-admin/serviceaccounts) ページへ
2. 「サービスアカウントを作成」をクリック
3. 名前を入力（例: `vtuber-eval-service`）
4. 「作成して続行」をクリック
5. ロールは特に設定不要（スキップ可）
6. 「完了」をクリック

### 4. サービスアカウントキーをダウンロード

1. 作成したサービスアカウントをクリック
2. 「キー」タブを選択
3. 「鍵を追加」→「新しい鍵を作成」
4. **JSON形式**を選択してダウンロード
5. **このJSONファイルは安全に保管してください**

### 5. サービスアカウントのメールアドレスを確認

- サービスアカウントページに表示されているメールアドレスをコピー
- 例: `vtuber-eval-service@your-project.iam.gserviceaccount.com`

---

## スプレッドシートの準備

### 1. 生徒マスタースプレッドシート作成

新規スプレッドシートを作成し、以下の構造で入力：

#### シート名: `生徒マスター`

| A列: 学籍番号 | B列: 氏名 | C列: トークメモフォルダURL | D列: 入学年月 | E列: ステータス |
|--------------|----------|------------------------|-------------|-------------|
| 2024001 | 山田太郎 | https://drive.google.com/drive/folders/... | 2024-04 | 在籍中 |
| 2024002 | 佐藤花子 | https://drive.google.com/drive/folders/... | 2024-04 | 在籍中 |

**重要**: サービスアカウントのメールアドレスに**編集権限**を付与してください。

#### トークメモフォルダの準備

1. Google Driveで各生徒用のフォルダを作成
2. フォルダ名は学籍番号（例: `2024001`）
3. フォルダのURLを生徒マスターに記入
4. サービスアカウントに**編集権限**を付与

### 2. 既存のスプレッドシートを確認

#### 欠席データ
- URL: https://docs.google.com/spreadsheets/d/19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k/edit
- サービスアカウントに**閲覧権限**を付与

**想定構造:**
| A列: 学籍番号 | B列: 欠席回数 | C列: 対象月 |
|--------------|-------------|----------|
| 2024001 | 0 | 2024-12 |

#### 支払いデータ
- URL: https://docs.google.com/spreadsheets/d/1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo/edit
- シート名: `RAW_支払い状況`
- サービスアカウントに**閲覧権限**を付与

**想定構造:**
| A列: 学籍番号 | B列: 支払い状況 | C列: 対象月 |
|--------------|---------------|----------|
| 2024001 | 支払い済み | 2024-12 |

### 3. 結果スプレッドシート作成

新規スプレッドシートを作成（自動で結果が書き込まれます）：
- サービスアカウントに**編集権限**を付与
- シート名は自動で `評価結果_YYYY-MM` 形式で作成されます

---

## Gemini APIの取得

1. [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
2. 「Create API Key」をクリック
3. APIキーをコピーして安全に保管

---

## ローカル開発環境の構築

### 1. 環境変数ファイルを作成

`.dev.vars`ファイルを作成（プロジェクトルートに配置）：

```bash
# サービスアカウントJSON（改行を削除して1行に）
GOOGLE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# Gemini API Key
GEMINI_API_KEY=your-gemini-api-key-here

# 生徒マスタースプレッドシートID
STUDENT_MASTER_SPREADSHEET_ID=your-spreadsheet-id

# 欠席データスプレッドシートID
ABSENCE_SPREADSHEET_ID=19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k

# 支払いデータスプレッドシートID
PAYMENT_SPREADSHEET_ID=1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo

# 結果出力先スプレッドシートID
RESULT_SPREADSHEET_ID=your-result-spreadsheet-id
```

**スプレッドシートIDの取得方法:**
スプレッドシートのURLから抽出
```
https://docs.google.com/spreadsheets/d/【ここがID】/edit
```

**サービスアカウントJSONを1行にする方法:**
```bash
# macOS/Linux
cat service-account.json | jq -c

# または手動でオンラインツールを使用
# https://jsonformatter.org/json-minify
```

### 2. 開発サーバーを起動

```bash
npm install
npm run build
npm run dev:sandbox

# または PM2を使用
pm2 start ecosystem.config.cjs
```

### 3. 動作確認

```bash
# ヘルスチェック
curl http://localhost:3000/api/health

# 生徒一覧取得
curl http://localhost:3000/api/students
```

ブラウザで http://localhost:3000 にアクセスしてUIを確認

---

## Cloudflare Pagesへのデプロイ

### 1. Cloudflare認証設定

```bash
# Cloudflare APIトークンを設定（sandboxで実行する場合）
setup_cloudflare_api_key

# 認証確認
npx wrangler whoami
```

### 2. プロジェクト作成

```bash
npx wrangler pages project create webapp \
  --production-branch main \
  --compatibility-date 2024-01-01
```

### 3. 環境変数を設定

```bash
# 各環境変数を設定（プロンプトが表示されるので値を入力）
npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT --project-name webapp
npx wrangler pages secret put GEMINI_API_KEY --project-name webapp
npx wrangler pages secret put STUDENT_MASTER_SPREADSHEET_ID --project-name webapp
npx wrangler pages secret put ABSENCE_SPREADSHEET_ID --project-name webapp
npx wrangler pages secret put PAYMENT_SPREADSHEET_ID --project-name webapp
npx wrangler pages secret put RESULT_SPREADSHEET_ID --project-name webapp

# 設定済み環境変数の確認
npx wrangler pages secret list --project-name webapp
```

### 4. デプロイ実行

```bash
npm run build
npx wrangler pages deploy dist --project-name webapp
```

デプロイ完了後、以下のようなURLが表示されます：
```
https://webapp-abc123.pages.dev
```

---

## Google Apps Scriptの設定

### 1. スクリプトエディタを開く

1. 任意のGoogle スプレッドシートを開く
2. メニューから「拡張機能」→「Apps Script」を選択

### 2. コードを貼り付け

`gas-script.js` の内容をコピーしてエディタに貼り付け

### 3. API_BASE_URLを変更

```javascript
// デプロイしたCloudflare PagesのURLに変更
const API_BASE_URL = 'https://webapp-abc123.pages.dev';
```

### 4. テスト実行

```javascript
// 関数選択ドロップダウンから testHealthCheck を選択して実行
// ログに {"status":"ok",...} が表示されればOK
```

### 5. 月次トリガーを設定

1. 左メニューから「トリガー」（時計アイコン）をクリック
2. 「トリガーを追加」をクリック
3. 以下のように設定：
   - 実行する関数: `runMonthlyEvaluation`
   - イベントのソース: `時間主導型`
   - 時間ベースのトリガーのタイプ: `月タイマー`
   - 日: `1日`
   - 時刻: `午前9時～10時`
4. 「保存」をクリック

これで毎月1日の午前9〜10時に自動で前月の採点が実行されます。

---

## トラブルシューティング

### エラー: "Authentication failed"

**原因**: サービスアカウントの認証情報が正しくない

**解決策**:
1. `.dev.vars` のGOOGLE_SERVICE_ACCOUNTが正しいJSONか確認
2. JSONが1行になっているか確認（改行が含まれていないか）
3. JSONの文字列が正しくエスケープされているか確認

### エラー: "The caller does not have permission"

**原因**: サービスアカウントがスプレッドシートにアクセスできない

**解決策**:
1. スプレッドシートの共有設定を確認
2. サービスアカウントのメールアドレスを共有ユーザーに追加
3. 適切な権限（閲覧 or 編集）を付与

### エラー: "Document not found"

**原因**: トークメモフォルダ内にドキュメントが存在しない

**解決策**:
1. Google Driveのフォルダを確認
2. Googleドキュメントが存在するか確認
3. サービスアカウントにフォルダの閲覧権限があるか確認

### エラー: "Gemini API quota exceeded"

**原因**: Gemini APIの利用制限に到達

**解決策**:
1. [Google AI Studio](https://makersuite.google.com/) でクォータを確認
2. 有料プランへのアップグレードを検討
3. リクエスト頻度を調整

### デプロイエラー: "Invalid environment variable"

**原因**: 環境変数の設定が不完全

**解決策**:
1. `npx wrangler pages secret list --project-name webapp` で確認
2. 不足している環境変数を追加
3. 再デプロイ

---

## 次のステップ

✅ **現在実装済み**: プロレベルセクション（6項目評価）

⏳ **今後の実装予定**:
- Xセクション（フォロー、ポスト、エンゲージメント評価）
- YouTubeセクション（配信頻度、視聴者評価）

---

## サポート

問題が解決しない場合は、以下を確認してください：

1. **PM2ログ確認**
   ```bash
   pm2 logs webapp --nostream
   ```

2. **Cloudflare Pagesログ確認**
   - Cloudflare Dashboardから「Pages」→プロジェクト→「Logs」

3. **Google Apps Scriptログ確認**
   - Apps Script エディタ→「実行数」タブ

---

**構築日**: 2024-12-11  
**バージョン**: 1.0.0  
**システム**: VTuberスクール成長度リザルトシステム
