# VTuberスクール 成長度リザルトシステム

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
- **自動週次データ取得**（毎週水曜日）
- **履歴データ保存**（PostgreSQLに自動保存）
- **グラフ表示**（Chart.jsで推移を可視化）

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

✅ **自動評価スケジュール（バッチ処理版）**
- GitHub Actions による月次自動評価（毎月1日 午前3時 JST）
- **バッチ処理**: 300名ずつに分割して評価（15分間隔）
- **ステータスフィルタリング**: 「アクティブ」のみ評価、「永久会員」は除外
- **アカウント情報チェック**: YouTubeチャンネルID/Xアカウントが設定されている生徒のみ
- 前月分の評価を自動実行
- デフォルト評価月を前月に変更

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

**方法1: 外部Cronサービスを使用（推奨）**

[cron-job.org](https://cron-job.org/) や [EasyCron](https://www.easycron.com/) などで設定：

- **URL**: `https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch`
- **Method**: POST
- **スケジュール**: 毎週水曜日 午前10:00（日本時間）
- **Cron式**: `0 10 * * 3`

**方法2: Render.comのCron Jobs（将来的に移行可能）**

Render.comのダッシュボードでCron Jobを設定：

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch
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
