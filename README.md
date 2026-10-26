# VTuberスクール 成長度リザルトシステム

## SEC-018 / SEC-020：配備前の認証設定

全業務APIと画面はSSOのadmin/leaderを要求します。crewは許可しません。従来のAPI認証除外は撤去し、公開するのはGET/HEAD `/api/health`の固定応答のみです。匿名APIは401、認証済みでも権限不足は403です。APIのqueryにauth_tokenを指定しても認証できません。HTMLのSSO着地時のみtokenをcookieへ移し、URLから取り除きます。SSOはHS256・1時間以内・このサービスのtargetUrl.originを検証します。

配備前にRenderのEnvironmentへ以下を設定し、既存利用者のadmin/leader roleとWannaV-mainの登録URLを確認してください。秘密値はコード・ログ・チャットへ貼り付けません。

| Key | 設定 |
|---|---|
| JWT_SECRET | WannaV-mainと同じ、32文字以上の既存の強い共有鍵。公開された既定値は禁止 |
| EVALUATION_JOB_TOKEN | JWT_SECRETとは別の、32文字以上のランダムなジョブ署名鍵 |
| APP_ORIGIN | 実際のHTTPS origin。通常は https://vtuber-school-evaluation.onrender.com （パス・queryなし） |
| DASHBOARD_URL | 共通ダッシュボードURL。既定値は https://wannav-main.onrender.com |

JWT_SECRET・ジョブ鍵・APP_ORIGINが不十分なら起動を拒否します。既存の安全な共有鍵を不要に交換しません。過去に公開既定鍵を使用した場合は、所有者が全SSO連携先での鍵交換と既存セッション失効を調整してください。

daily/weekly GitHub Actionsは、同じEVALUATION_JOB_TOKENをリポジトリのSettings → Secrets and variables → Actionsへ登録してから切り替えます。任意のrepository variable EVALUATION_BASE_URLは公開originです。Actionsはscope・audience・issuer・90秒有効期限・一意のjtiを持つHS256 JWTをリクエストごとに発行します。鍵自体やtokenはログへ出さず、応答も許可した件数・状態だけに制限します。既存の匿名curlや単純なBearer共有鍵はそのまま使えません。

ジョブ認証で許可するのはPOST `/api/analytics/auto-fetch`、`/api/auto-evaluate`、`/api/auto-evaluate-x-only`、`/api/x/evaluate-batch-auto`だけです。ジョブ鍵で生徒一覧・診断・その他管理APIを操作できません。使用済みjtiは有効期限まで同一プロセス内で拒否し、再試行時は新しいJWTを発行します。再送防止の記録はプロセス内メモリであり、複数インスタンスや再起動をまたぐ厳密な一意性は保証しません。実行したバッチ自体の冪等性は別途設計が必要です。

POST等のブラウザ変更要求はAPP_ORIGINとOriginの一致を要求します。従来のGET評価APIにも副作用があるため、OAuth戻り先以外のAPIはブラウザのcross-site/same-site呼出しを拒否します。OAuthのstate等の別所見を解消したものとは扱いません。

`/api/admin/run-migrations`は全員に410を返し、公開HTTPからDB移行を実行できません。DB移行は既存の運用手順で所有者が別途実行します。この変更でDBschema・本番DB・cronを変更しません。定期処理はこのリポジトリでは外部Actionsであり、今回は実行していません。

`npm run test:security`はmockのHono appと署名clientを使い、実DB・Google・Gemini・本番へ接続しません。既存npm testはlocalhostへcurlするコマンドのため、隔離検証では使用しません。既存package-lockにプラットフォーム依存の欠落がありnpm ciは失敗します。依存版やlockを修正せず、検証環境のみnpm install --ignore-scripts --package-lock=falseで導入しました。既存buildは静的ファイルcopyのみで、dist/_worker.jsはsrc/index.tsxを再exportします。Node本番起動とWrangler本番環境の実SSO・外部APIは配備後に別途確認が必要です。

注意：SEC-019で検出した現行テストスクリプトとGit履歴のGoogleキー形式固定値は、この2所見の修正では失効できません。所有者による管理画面での失効・再発行・利用履歴確認が別途必要で、キーの値は報告しません。切戻し時も匿名APIや公開既定鍵を復活させず、必要なら上流で公開を止めてから対応してください。

VTuber育成スクールの生徒様の成長度を評価・可視化するシステムです。Google Gemini AIを活用してトークメモを自動分析し、S〜Dの5段階評価でプロレベルセクションの採点を行います。

## 📊 プロジェクト概要

### 完成済み機能

✅ **プロレベルセクション評価（6項目）**
- 欠席評価（スプレッドシートから取得）
- 遅刻評価（トークメモのAI分析：S or D）
- ミッション評価（トークメモのAI分析：S〜D）
- 支払い評価（スプレッドシートから取得）
- アクティブリスニング評価（トークメモのAI分析：S〜D）
- 理解度評価（トークメモのAI分析：質問正解数で評価）

✅ **YouTube評価（S～D の5段階評価）**
- 週4回の配信達成度
- 1回90分以上の配信達成度
- 登録者伸び率
- エンゲージメント率
- タイトル・サムネイル品質

✅ **X（Twitter）評価（S～D の5段階評価）**
- 1日2回の投稿達成度
- 週2回の企画投稿達成度
- フォロワー伸び率
- エンゲージメント率
- インプレッション伸び率

✅ **YouTube Analytics 詳細データ**
- OAuth 2.0 認証による個人データアクセス
- 動画タイプ別分析（ショート/通常動画/ライブ配信）
- 再生回数、高評価、コメント、視聴時間などの詳細メトリクス
- **自動週次データ取得**（毎週水曜日 10:00 JST）
- **履歴データ保存**（PostgreSQLに自動保存）
- **グラフ表示**（Chart.jsで推移を可視化：2軸グラフ対応）

✅ **バックエンドAPI**
- `/api/evaluate` - **統合評価実行エンドポイント**（プロレベル + YouTube + X）
  - プロレベル評価を実行
  - YouTube評価を実行（YouTubeチャンネルIDがある生徒のみ）
  - X評価を実行（Xアカウントがある生徒のみ）
  - 評価結果を自動的にキャッシュに保存
- `/api/students` - 生徒一覧取得
- `/api/evaluation/complete/:studentId` - 統合評価取得（プロレベル + YouTube + X）
  - キャッシュ優先で取得（cache=trueパラメータ）
- `/api/youtube/evaluate/:studentId` - YouTube評価
- `/api/x/evaluate/:studentId` - X評価
- `/api/prolevel/:studentId` - プロレベル評価
- `/api/monthly-report/:studentId` - 月次レポート（複数月比較）
- `/api/auto-evaluate` - バッチ処理による自動評価（全生徒一括評価）
- `/api/analytics/by-type` - 動画タイプ別アナリティクス取得（履歴保存対応）
- `/api/analytics/history/:studentId` - アナリティクス履歴取得
- `/api/analytics/auto-fetch` - 週次自動データ取得（Cron用）
- `/api/health` - ヘルスチェック

✅ **フロントエンド（グラフ・チャート可視化対応）**
- **トップページ** (`/`)
  - 生徒一覧表示
  - 採点実行ボタン
  - 学籍番号検索
  - ステータスフィルター
  
- **評価詳細ページ** (`/evaluation-detail`)
  - プロレベル評価の詳細表示
  - **YouTube評価の可視化**:
    - 登録者数・再生回数・配信頻度（Chart.js ドーナツチャート）
    - エンゲージメント率（Chart.js ドーナツチャート）
    - コンテンツ品質（Chart.js 棒グラフ）
    - 最近の動画一覧表示
  - **X評価の可視化**:
    - フォロワー数・投稿数・インプレッション（Chart.js パイチャート）
    - エンゲージメント内訳（いいね・リツイート・リプライ）（Chart.js パイチャート）
    - 投稿活動（日別・週別）（Chart.js 棒グラフ）
    - 最近のツイート一覧表示
    
- **月次レポートページ** (`/monthly-report`)
  - **複数月の成長推移比較**（Chart.js 折れ線グラフ）:
    - YouTube: 登録者数・再生回数・月間動画数・平均配信時間・エンゲージメント率
    - X: フォロワー数・月間投稿数・インプレッション数・エンゲージメント率
  - 使い方: 学籍番号と評価月をカンマ区切りで入力（例: `2024-11,2024-12,2025-01`）
  
- **ナビゲーション**
  - トップページへ戻るボタン
  - ページ間のスムーズな遷移

✅ **自動実行スケジュール**

**1. プロレベル + YouTube + X の統合評価（月次）**
- **エンドポイント**: `/api/auto-evaluate`
- **頻度**: 毎月1日 午前10時（JST）
- **Cron設定**: `0 10 1 * *`
- **対象**: 全生徒の総合評価（プロレベル + YouTube + X）
- **バッチ処理**: 300名ずつに分割して評価（15分間隔）
- **ステータスフィルタリング**: 「アクティブ」のみ評価、「永久会員」は除外

**2. YouTube Analytics データ取得（週次）**
- **エンドポイント**: `/api/analytics/auto-fetch`
- **頻度**: 毎週水曜日 午前10時（JST）
- **Cron設定**: `0 10 * * 3`
- **対象**: OAuth認証済み生徒のアナリティクス履歴
- **取得期間**: 前週月曜日〜日曜日（1週間分）
- **保存先**: PostgreSQL（`analytics_history`テーブル）
- **⚠️ セットアップ必要**: [週次アナリティクス自動セットアップガイド](./WEEKLY_ANALYTICS_AUTO_SETUP.md)

✅ **評価結果キャッシング**
- YouTube/X評価結果をスプレッドシートにキャッシュ
- APIクォータ/レート制限対策
- 24時間以内のキャッシュを再利用
- バッチ処理での重複評価を回避

✅ **Google Apps Script連携**
- 月次自動採点スクリプト（`gas-script.js`）
- トークメモ自動移動システム（学籍番号フォルダへ自動振り分け）
- SNS情報自動更新（Notion連携）
- トークメモフォルダURL自動入力

## ⚠️ 現在の状況（2026-01-04）

### YouTube OAuth認証について

✅ **YouTube Analytics OAuth認証システム**
- **認証専用アプリ**: https://youtube-oauth-auth.onrender.com/
- **データ保存**: PostgreSQL（Render Postgres）
- **自動トークンリフレッシュ**: 有効期限5分前に自動更新
- **有効期限**: アクセストークン1時間、リフレッシュトークンは無期限（取り消しまで）

⚠️ **認証が必要な場合**
- 初回利用時
- リフレッシュトークンが無効化された場合
- Googleアカウントでアプリの権限を取り消した場合

🔄 **認証情報の管理**
- **保存場所**: PostgreSQL（`youtube_oauth_tokens`テーブル）
- **自動リフレッシュ**: 有効期限切れ5分前に自動更新
- **エラーハンドリング**: リフレッシュ失敗時は自動的に再認証を促す
- **データ永続化**: デプロイ後もデータベースに保存されているため再認証不要

### 評価対象生徒
- **総生徒数**: 1,377名
- **アクティブ生徒**: 669名（「永久会員」を除く）
- **評価対象**: 527名（YouTubeチャンネルID または Xアカウント設定済み）
- **必要バッチ数**: 2バッチ（300名/バッチ）
- **推定時間**: 30分

### YouTube評価
- ❌ **YouTube API クォータ超過** (403 quotaExceeded) または **APIキー期限切れ** (400 API key expired)
- 原因: 全生徒評価でクォータ（10,000ユニット/日）を消費、またはAPIキーが期限切れ
- 対策: 
  - ✅ キャッシュシステム実装済み（24時間以内は再利用）
  - ✅ バッチ処理で段階的に評価
  - ⚠️ 新しいYouTube APIキーの設定が必要
- リセット: 毎日午前0時（PT）にクォータがリセット

### X評価
- ✅ **正常動作中** (2026-01-04修正完了)
- 修正内容: `fetchRecentTweets` 関数のスコープエラー修正
  - 問題: `data` 変数がtryブロック外でアクセスされていた
  - 解決: `return` 文をtryブロック内に移動
- 対策: 
  - ✅ キャッシュシステム実装済み（24時間以内は再利用）
  - ✅ バッチ処理（300名/15分）で制限内に収める
  - ✅ 15分間隔で段階的に評価
- レート制限: 
  - User lookup: 300 requests / 15 minutes
  - User tweets: 900 requests / 15 minutes
  - 月間制限: 1,200,000（余裕あり）
- 詳細: [X評価修正サマリー](./docs/X_EVALUATION_FIX_SUMMARY.md)

### プロレベル評価
- ✅ 正常動作中
- Gemini AI分析は問題なし（新しいAPIキー設定済み）

### 次のステップ: GitHub Actionsワークフローの追加

⚠️ **重要**: GitHub Actionsワークフローは手動で追加する必要があります

月次自動評価を有効にするには、以下の手順でワークフローを追加してください：

1. **GitHubリポジトリにアクセス**
   - https://github.com/kyo10310415/vtuber-school-evaluation

2. **Actionsタブ** → **New workflow** → **set up a workflow yourself**

3. **ワークフローファイルを作成**
   - ファイル名: `.github/workflows/monthly-evaluation-batch.yml`
   - 内容: [`.github/WORKFLOW_MANUAL_SETUP.md`](./.github/WORKFLOW_MANUAL_SETUP.md) を参照

4. **動作確認**
   - **Run workflow** ボタンで手動テストを実行
   - 評価月を指定（例: `2025-12`）または空欄で前月を自動計算

**詳細な手順**: [`.github/WORKFLOW_MANUAL_SETUP.md`](./.github/WORKFLOW_MANUAL_SETUP.md)

### 未実装機能

⏳ **今後の拡張**
- 評価結果の自動スプレッドシート保存
- 評価完了時のSlack/メール通知
- API エラー時の自動リトライ機能

## 🏗️ システムアーキテクチャ

```
┌─────────────────────┐
│ Google Spreadsheet  │ 生徒マスター、欠席データ、支払いデータ
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Google Drive/Docs   │ 学籍番号フォルダ内のトークメモ
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Cloudflare Workers  │ Hono API
│ + Google Gemini AI  │ トークメモ分析
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Result Spreadsheet  │ 評価結果書き込み
└─────────────────────┘
           ▲
           │
┌──────────┴──────────┐
│ Google Apps Script  │ 月次自動実行トリガー
└─────────────────────┘
```

## 📂 データ構造

### 生徒マスタースプレッドシート

| 学籍番号 | 氏名 | トークメモフォルダURL | 入学年月 | ステータス |
|---------|------|---------------------|----------|----------|
| 2024001 | 山田太郎 | https://drive.google.com/drive/folders/... | 2024-04 | 在籍中 |

### トークメモ（Googleドキュメント）

学籍番号フォルダ内に保存されたGeminiメモ形式：

```
先生: 今日のミッションは〇〇です
山田太郎: はい、承知しました
先生: では質問です。〇〇とは何ですか?
山田太郎: それは〇〇のことです
```

### 欠席データスプレッドシート

URL: `https://docs.google.com/spreadsheets/d/19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k/edit`

| 学籍番号 | 欠席回数 | 対象月 |
|---------|---------|--------|
| 2024001 | 0 | 2024-12 |

### 支払いデータスプレッドシート

URL: `https://docs.google.com/spreadsheets/d/1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo/edit`

シート名: `RAW_支払い状況`

| 学籍番号 | 支払い状況 | 対象月 |
|---------|----------|--------|
| 2024001 | 支払い済み | 2024-12 |

### 結果スプレッドシート（自動生成）

| 評価月 | 学籍番号 | 氏名 | 欠席 | 遅刻 | ミッション | 支払い | アクティブリスニング | 理解度 | 総合評価 | 評価日時 |
|--------|---------|------|------|------|---------|--------|-----------------|--------|---------|---------|
| 2024-12 | 2024001 | 山田太郎 | S | S | A | S | B | A | A | 2024-12-11T... |

## 🚀 セットアップ手順

### 1. 必要な環境変数

`.dev.vars`ファイルを作成（`.dev.vars.example`を参考）：

```bash
# Google Service Account JSON（改行なしの1行）
GOOGLE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Gemini API Key
GEMINI_API_KEY=your-api-key

# スプレッドシートID
STUDENT_MASTER_SPREADSHEET_ID=your-id
ABSENCE_SPREADSHEET_ID=19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k
PAYMENT_SPREADSHEET_ID=1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo
RESULT_SPREADSHEET_ID=your-result-id
```

### 2. Google Cloud Projectの設定

1. Google Cloud Consoleでプロジェクト作成
2. 以下のAPIを有効化：
   - Google Sheets API
   - Google Drive API
   - Google Docs API
3. サービスアカウントを作成してJSONキーをダウンロード
4. スプレッドシートに共有権限を付与（サービスアカウントのメールアドレスに編集権限）

### 3. Gemini APIキーの取得

1. [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
2. APIキーを作成してコピー

### 4. ローカル開発

```bash
# 依存関係インストール
npm install

# ビルド
npm run build

# 開発サーバー起動
pm2 start ecosystem.config.cjs

# テスト
npm test
```

### 5. Cloudflare Pagesへデプロイ

```bash
# Cloudflare認証設定
setup_cloudflare_api_key

# プロジェクト作成
npx wrangler pages project create webapp --production-branch main

# 環境変数を設定
npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT --project-name webapp
npx wrangler pages secret put GEMINI_API_KEY --project-name webapp
npx wrangler pages secret put STUDENT_MASTER_SPREADSHEET_ID --project-name webapp
npx wrangler pages secret put ABSENCE_SPREADSHEET_ID --project-name webapp
npx wrangler pages secret put PAYMENT_SPREADSHEET_ID --project-name webapp
npx wrangler pages secret put RESULT_SPREADSHEET_ID --project-name webapp

# デプロイ
npm run deploy:prod
```

### 6. Google Apps Scriptの設定

1. `gas-script.js`の内容をコピー
2. Google スプレッドシートで「拡張機能」→「Apps Script」
3. コードを貼り付けて`API_BASE_URL`を変更
4. トリガーを設定：
   - 実行する関数: `runMonthlyEvaluation`
   - イベントのソース: 時間主導型
   - 月タイマー、毎月1日、午前9時〜10時

## 📋 API仕様

### POST /api/evaluate

採点を実行します。

**リクエスト:**
```json
{
  "month": "2024-12",
  "studentIds": ["2024001", "2024002"]  // オプション
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "2件の評価が完了しました",
  "results": [
    {
      "evaluationMonth": "2024-12",
      "studentId": "2024001",
      "studentName": "山田太郎",
      "scores": {
        "absence": "S",
        "lateness": "S",
        "mission": "A",
        "payment": "S",
        "activeListening": "B",
        "comprehension": "A"
      },
      "overallGrade": "A",
      "comments": "【強み】皆勤、遅刻なし...",
      "evaluatedAt": "2024-12-11T..."
    }
  ],
  "errors": []
}
```

### GET /api/students

生徒一覧を取得します。

**レスポンス:**
```json
{
  "success": true,
  "students": [
    {
      "studentId": "2024001",
      "name": "山田太郎",
      "talkMemoFolderUrl": "https://...",
      "enrollmentDate": "2024-04",
      "status": "在籍中"
    }
  ]
}
```

### GET /api/health

ヘルスチェックを行います。

**レスポンス:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-11T..."
}
```

## 🎯 評価基準

### 欠席
- S: 0回
- A: 1回
- B: 2回
- C: 3回
- D: 4回以上

### 遅刻
- S: 遅刻の言及なし
- D: 遅刻の言及あり

### ミッション・アクティブリスニング
- S: 非常に優れている
- A: 良好
- B: 普通
- C: やや不十分
- D: 不十分

### 理解度（質問正解数）
- S: 5問正解
- A: 4問正解
- B: 3問正解
- C: 2問正解
- D: 1問以下

### 支払い
- S: 支払い済み
- B: 一部支払い
- D: 未払い

### 総合評価
6項目の平均点で算出（S=5点、A=4点、B=3点、C=2点、D=1点）

## 📊 次のステップ

1. **スプレッドシートの準備**
   - 生徒マスターシート作成
   - 結果出力用シート作成
   - サービスアカウントに共有権限付与

2. **トークメモの整理**
   - 各生徒の学籍番号フォルダ作成
   - トークメモドキュメントの保存

3. **初回テスト実行**
   - ローカル環境でテスト
   - 少数の生徒でAPI動作確認

4. **本番デプロイ**
   - Cloudflare Pagesへデプロイ
   - 環境変数設定
   - Google Apps Scriptトリガー設定

5. **将来の機能追加**
   - Xセクション実装
   - YouTubeセクション実装
   - ダッシュボード強化

## 🛠️ 技術スタック

- **バックエンド**: Hono (Cloudflare Workers)
- **AI分析**: Google Gemini 1.5 Flash
- **データソース**: Google Sheets API, Google Drive API, Google Docs API
- **フロントエンド**: Tailwind CSS, Vanilla JavaScript, Chart.js
- **データベース**: PostgreSQL (Render Postgres)
- **デプロイ**: Render.com
- **自動実行**: Google Apps Script

## 🔧 セットアップ手順

### 1. データベースマイグレーション

初回デプロイ時、または新機能追加時にマイグレーションを実行：

```bash
cd /home/user/webapp
./scripts/run-migration.sh
```

これにより`analytics_history`テーブルが作成されます。

### 2. 週次自動データ取得の設定

**外部Cronサービスの設定（推奨）**

[cron-job.org](https://cron-job.org/) などで以下の2つのジョブを設定：

**1. YouTube Analytics 週次データ取得**
- **Title**: VTuber Analytics Weekly Fetch
- **URL**: `https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch`
- **Method**: POST
- **スケジュール**: 毎週水曜日 午前10:00（日本時間）
- **Cron式**: `0 10 * * 3`

**2. プロレベル + YouTube + X の月次評価**
- **Title**: VTuber Monthly Evaluation
- **URL**: `https://vtuber-school-evaluation.onrender.com/api/auto-evaluate`
- **Method**: POST
- **スケジュール**: 毎月1日 午前10:00（日本時間）
- **Cron式**: `0 10 1 * *`

**Render.comのCron Jobs（将来的に移行可能）**

Render.comのダッシュボードでCron Jobを設定：

**YouTube Analytics 週次取得**:
```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch
```

**月次評価**:
```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/auto-evaluate
```

### 3. 履歴データの表示

各生徒のアナリティクス履歴は以下のURLで確認できます：

```
https://vtuber-school-evaluation.onrender.com/analytics-history/{学籍番号}
```

または `/analytics-data` ページから生徒名をクリックして「履歴を見る」ボタンをクリック。

### 4. 手動でデータ取得（テスト用）

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch
```

レスポンス例：
```json
{
  "success": true,
  "period": {
    "startDate": "2026-01-20",
    "endDate": "2026-01-26"
  },
  "summary": {
    "total": 5,
    "success": 4,
    "errors": 1
  },
  "results": [...]
}
```

## 📝 ライセンス

© 2024 VTuberスクール. All rights reserved.
# Trigger redeploy

## crewの閲覧専用アクセス

crewは生徒一覧、保存済み評価、月次レポート、アナリティクス履歴、利用回数を閲覧できます。画面・APIの両方に役割を適用します。評価実行ボタンとOAuth管理への導線は非表示にし、閲覧専用の案内を表示します。

サーバーはcrewの許可経路を明示的な一覧で制限します。全ての書込みメソッド、自動・個別評価、同期、診断、OAuth/token管理、未知の経路は拒否します。GETでも評価やtoken更新を行うAPIは許可しません。`/analytics-data`は表示時にtoken更新へ進むためcrewは閲覧不可ですが、保存済み履歴ページは閲覧できます。

`/api/evaluation/complete/:studentId`はcrewの場合に保存済みキャッシュだけを読み取ります。`cache=false`でも再評価しません。キャッシュがないときは未保存の案内を返し、評価APIや保存処理を呼びません。admin/leaderの既存の評価・保存動作は維持します。

個人別の担当生徒制限は今回追加していません。crewの閲覧は本システム内の生徒一覧・許可済み結果に対する権限です。共通ダッシュボードのシステムリンクがcrewに表示される設定かも配備前に所有者が確認してください。実DBのリンク設定や利用者roleは今回変更していません。

`npm run test:security`はcrewの閲覧成功、書込み/副作用GETの拒否、UI制御、実統合評価ハンドラーのcache miss・cache=false・正常cache hitとadmin/leaderの互換を含め20件成功。Google・AI・実DBを呼ばない検証です。配備には従来案と同じAPP_ORIGINとEVALUATION_JOB_TOKEN（Render/Actions）が必要です。

### API確認スクリプトの認証情報（SEC-019）
`test-apis.mjs`は`YOUTUBE_API_KEY`と`X_BEARER_TOKEN`の既存環境変数だけを参照します。未設定のAPIは外部通信せず失敗として終了し、ソース中の固定値へfallbackしません。実APIを呼ぶスクリプトなので、通常の回帰テストや本番配備確認として無条件に実行しないでください。
過去に公開されたGoogle APIキーは、現行版から削除しても履歴・コピーに残ります。所有者による失効・再発行と利用ログ確認が必要です。今回、キー有効性の試験・実API通信・履歴書換は実施していません。秘密値はGitやチャットへ記載しないでください。
API確認スクリプトは例外原文やAPIエラー応答オブジェクトも出力せず、固定の失敗表示だけを残します。

### 2026-10-25 第12バッチ依存更新

Hono/Node adapter、Viteと安定版で更新可能な推移依存を既存manifest範囲内でlock更新。認証・API・業務コード・DBスキーマ・環境設定は変更しません。Node22.23.4でinstall scripts無効のclean install、21テスト、差分チェック成功。HTTP adapterの保護付き静的配信・エンコードされたパス・JSON処理は架空fixtureで検証。

稼働用audit: Critical0/High6/Moderate1/Low0。全依存audit: Critical0/High6/Moderate1/Low0。警告件数と実際の攻撃成立は別に評価します。静的ファイルbuildとtsx経由worker import成功。Renderの起動はnpm run startを確認。Wrangler/Miniflare系High6は残存し、新しいalpha/betaを導入しないためツール移行を保留。実AI評価・Google通信・DB更新なし。

### 2026-10-25 Render成果物からの開発ツール除外

Cloudflare/Viteのツール4件をdevDependenciesへ移動し、ローカル/Cloudflare用の既存コマンドは維持します。テストが直接使用するesbuild0.27.2をdevDependencyとして明示しました。アプリのstartは従来どおりtsx server.jsです。

buildはNode標準APIで静的ファイルをコピーします。Render（RENDER=true）でだけ、コピー後にnpm prune --omit=dev --ignore-scriptsを実行し、Vite/Wrangler/Miniflare等を成果物から除去します。ローカルのnpm run buildでは開発ツールを削除しません。ローカル/Cloudflareの開発・試験はnpm ci --include=devで導入してください。Blueprintも既存本番と同じnpm run start、npm ci --omit=devでの構築へ揃えました。

21テスト、Renderビルドの実行、開発ツールが存在しない状態のworker importと未認証students401を隔離環境で確認。稼働用audit Critical/High0・Moderate1。全依存には開発ツールのHigh6が残り、版の脆弱性を修正したとは判定しません。実Google・AI・DB更新は試験していません。

## 開発ツールの互換更新（2026-10-25）

Wranglerを4.116.0へ固定しました。内部Miniflare4.20260730.0を使う安定版構成で、Miniflare5系のalpha/betaへは移行しません。Node本番構成と環境変数は変更しません。本番のRENDER=true buildで開発ツールを除外する方針は維持します。

21セキュリティテスト・Node build・Cloudflare worker buildが成功。試験コードのimport除去がCRLFにも対応するよう修正しました。隔離したNode構成では匿名API401と本番artifactからツール7種の除外を確認しました。全依存auditはHigh6→4/Moderate1、本番依存はHigh0/Moderate1。High4は開発用sharp/undiciと推移依存の警告で未解消です。

Cloudflare向けにViteで新規生成したworkerのローカル起動は認証設定を読み込めず失敗しました。生成物中のprocess.env参照が空オブジェクトへ置換されている点を確認していますが、Cloudflare構成の実稼働互換性は未確認です。この更新で解消したとは扱いません。Render Nodeでは既存のworkerを維持します。

## 推移依存qsの更新（2026-10-26）

Google API SDK経由のqsを6.14.0から6.16.1へ、既存の互換範囲内でlock更新しました。SDK本体、認証設定、API・DB・業務処理は変更しません。現在の本番依存auditはCritical/High/Medium/Lowすべて0件です。開発用のHigh4（Wrangler/Miniflare/sharp/undici）は未解消です。

npmが提案するWrangler4.152.0はMiniflare5のbetaに依存するため、この更新では導入しません。RenderのNode起動とRENDER=true時の開発ツール除去を維持します。Cloudflare向けの起動互換性に関する上記の制限も残ります。過去の日付のaudit件数は当時の結果です。

## 起動ログとローカル開発（2026-10-26）

Nodeサーバーは起動時にシートID・連携URLなどの環境設定一覧を表示しません。設定値は引き続きアプリへ渡します。DBマイグレーション失敗も例外本文を表示せず、固定メッセージと終了コード1を返し、接続を終了します。既存ログ・DBは変更しません。

`dev:sandbox`、`start:wrangler`、`preview`の待受先を127.0.0.1へ明示しました。同じPCから利用してください。別PCやコンテナ外からの直接アクセスはできなくなります。Renderの`npm start`と待受先は変更しません。開発依存のHigh4は未解消であり、実認証情報・未信頼入力を持ち込む用途を安全とは扱いません。
