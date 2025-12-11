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

✅ **バックエンドAPI**
- `/api/evaluate` - 採点実行エンドポイント
- `/api/students` - 生徒一覧取得
- `/api/health` - ヘルスチェック

✅ **フロントエンド**
- 生徒一覧表示
- 採点実行インターフェース
- 結果表示画面（グレード可視化）

✅ **Google Apps Script連携**
- 月次自動採点スクリプト（`gas-script.js`）

### 未実装機能

⏳ **Xセクション（今後実装予定）**
- 1日10人のフォロー
- 2回の日常ポスト
- 週2回の企画
- フォロワー・エンゲージメント・インプレッション伸び率

⏳ **YouTubeセクション（今後実装予定）**
- 週4回の配信
- 1回1.5時間の配信
- タイトル・サムネ評価
- フォロワー・エンゲージメント・再生数

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
- **フロントエンド**: Tailwind CSS, Vanilla JavaScript
- **デプロイ**: Cloudflare Pages
- **自動実行**: Google Apps Script

## 📝 ライセンス

© 2024 VTuberスクール. All rights reserved.
