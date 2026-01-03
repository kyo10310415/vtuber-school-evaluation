# 自動評価スケジュール設定ガイド

## 概要
毎月月初（1日）の午前3時（JST）に、前月分の評価を自動実行するシステムを実装しました。

## 実装内容

### 1. 評価月のデフォルト変更
**全エンドポイントで、月パラメータが指定されない場合、前月がデフォルトになります。**

#### バックエンド（src/index.tsx）
```typescript
// 前月を YYYY-MM 形式で取得
function getPreviousMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-11
  
  if (month === 0) {
    // 1月の場合、前年の12月
    return `${year - 1}-12`
  } else {
    const prevMonth = month // 前月 (0-indexed なので month が既に前月)
    return `${year}-${String(prevMonth).padStart(2, '0')}`
  }
}

// 全エンドポイントで使用
const month = c.req.query('month') || getPreviousMonth()
```

#### フロントエンド（public/static/*.js）
- `evaluation-detail.js`: デフォルト月を前月に変更
- `monthly-report.js`: 直近3ヶ月を前月から数える
- `app.js`: 評価詳細への遷移時に前月を指定

### 2. 自動評価エンドポイント
**全生徒の評価を一括で実行するエンドポイント**

#### エンドポイント
```
POST /api/auto-evaluate?month=YYYY-MM
```

#### 機能
1. 全生徒情報を取得（生徒マスタースプレッドシートから）
2. 各生徒について：
   - YouTube評価を実行（YouTubeチャンネルIDがある場合）
   - X評価を実行（Xアカウントがある場合）
3. 結果を集計して返す

#### レスポンス例
```json
{
  "success": true,
  "month": "2025-12",
  "totalStudents": 30,
  "successCount": 28,
  "errorCount": 2,
  "results": [
    {
      "studentId": "OLTS240488-AR",
      "studentName": "石山光司",
      "month": "2025-12",
      "evaluations": {
        "youtube": { "overallGrade": "B", ... },
        "x": { "overallGrade": "D", ... }
      }
    },
    ...
  ]
}
```

### 3. GitHub Actions ワークフロー
**毎月1日の午前3時（JST）に自動実行**

#### ファイル
`.github/workflows/monthly-evaluation.yml`

#### スケジュール
```yaml
on:
  schedule:
    - cron: '0 18 * * 0-6'  # 毎日 UTC 18:00 = JST 03:00
  workflow_dispatch:  # 手動実行も可能
```

#### 実行フロー
1. 今日が1日かチェック（1日でなければスキップ）
2. 前月を計算（YYYY-MM形式）
3. `/api/auto-evaluate` エンドポイントを呼び出す
4. レスポンスをログに出力
5. エラーがあればワークフローを失敗させる

## 動作確認

### 手動テスト
1. **GitHub Actions からテスト実行**
   - リポジトリ → Actions タブ
   - "Monthly Auto Evaluation" ワークフローを選択
   - "Run workflow" ボタンをクリック
   - 実行結果を確認

2. **APIエンドポイントを直接テスト**
   ```bash
   # 前月の評価を実行
   curl -X POST "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate"
   
   # 特定の月を指定
   curl -X POST "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate?month=2025-12"
   ```

### デフォルト月の確認
1. トップページで学籍番号を検索 → 前月が表示される
2. 評価詳細ページを開く → 前月がデフォルトで選択されている
3. 月次レポートページを開く → 直近3ヶ月が前月から表示される

## スケジュール管理

### 実行タイミング
- **自動実行**: 毎月1日 午前3時（JST）
- **手動実行**: GitHub Actions から任意のタイミングで実行可能

### ログ確認
- GitHub Actions の実行ログで確認
- Cloudflare Pages のログでAPI呼び出しを確認

### エラー時の対応
1. GitHub Actions の実行ログを確認
2. エラーメッセージから原因を特定
3. 必要に応じて手動で評価を実行

## 注意事項

### API制限
- **YouTube API**: 1日10,000クォータ（動画取得1回 = 約1クォータ）
- **X API**: Basic tier = 10,000 tweets/月（1生徒あたり約100 tweets取得）

生徒数が多い場合、API制限に注意してください。

### 環境変数
以下の環境変数が設定されている必要があります：
- `GOOGLE_SERVICE_ACCOUNT`: Google Service Account JSON
- `STUDENT_MASTER_SPREADSHEET_ID`: 生徒マスタースプレッドシートID
- `RESULT_SPREADSHEET_ID`: 結果出力先スプレッドシートID
- `YOUTUBE_API_KEY`: YouTube Data API Key
- `X_BEARER_TOKEN`: X (Twitter) Bearer Token

### Render.com のスリープ対策
Render.com の無料プランでは、15分間アクセスがないとサービスがスリープします。
- GitHub Actions が定期的にアクセスすることで、スリープを防げます
- または、別途 cron-job.org などで health check を設定

## トラブルシューティング

### GitHub Actions が実行されない
1. リポジトリの Actions タブで有効化されているか確認
2. ワークフローファイルが正しくコミットされているか確認
3. スケジュール構文が正しいか確認

### API エラーが発生する
1. 環境変数が正しく設定されているか確認
2. API キーの有効期限を確認
3. API 制限に達していないか確認

### 評価結果が表示されない
1. プロレベルセクションのデータが存在するか確認
2. YouTube/X の API 接続が正常か確認
3. エンドポイントのレスポンスを確認

## 今後の拡張

### 考慮事項
- **通知機能**: 評価完了時にSlack/メールで通知
- **エラーリトライ**: API エラー時の自動リトライ
- **並列処理**: 複数生徒の評価を並列実行（API制限に注意）
- **結果保存**: 評価結果をスプレッドシートに自動保存

## 関連ファイル
- `.github/workflows/monthly-evaluation.yml`: GitHub Actions ワークフロー
- `src/index.tsx`: バックエンドAPI（/api/auto-evaluate）
- `public/static/evaluation-detail.js`: 評価詳細画面
- `public/static/monthly-report.js`: 月次レポート画面
- `public/static/app.js`: トップページ
