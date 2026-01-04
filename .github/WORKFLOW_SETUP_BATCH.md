# GitHub Actions ワークフロー設定手順（バッチ処理版）

## 概要

新しいワークフローは以下の機能を持っています：

1. **ステータスフィルタリング**
   - 会員ステータスが「アクティブ」のみ評価
   - 「永久会員」は除外
   - YouTubeチャンネルID/Xアカウントが設定されている生徒のみ

2. **バッチ処理**
   - 300名ずつに分割して評価
   - 各バッチ間に15分間隔を設定（X API Rate Limit対策）
   - キャッシュを活用して重複評価を回避

3. **アカウント情報なしの処理**
   - YouTubeチャンネルIDが空欄 → 結果に「YouTubeチャンネル情報なし」と記載
   - Xアカウントが空欄 → 結果に「Xアカウント情報なし」と記載
   - 両方とも空欄の生徒はスキップ

## ワークフローファイルを手動で追加する方法

GitHub App には `workflows` 権限がないため、ワークフローファイルを直接プッシュできません。
以下の手順で、GitHub UI から手動で追加してください。

### 手順

1. **GitHub リポジトリを開く**
   - https://github.com/kyo10310415/vtuber-school-evaluation

2. **Actions タブを開く**
   - リポジトリのトップページから「Actions」タブをクリック

3. **新しいワークフローを作成**
   - 「New workflow」ボタンをクリック
   - または「set up a workflow yourself」をクリック

4. **ワークフローファイルを作成**
   - ファイル名: `.github/workflows/monthly-evaluation-batch.yml`
   - 以下のファイルの内容をコピー＆ペースト:
     - `/home/user/webapp/.github/workflows/monthly-evaluation-batch.yml`

5. **コミット**
   - 「Commit new file」ボタンをクリック
   - コミットメッセージ: `Add monthly auto evaluation workflow with batch processing`
   - `main` ブランチに直接コミット

### 確認

1. **Actions タブで確認**
   - "Monthly Auto Evaluation (Batch Processing)" ワークフローが表示されていることを確認

2. **手動テスト実行**
   - ワークフロー名をクリック
   - 「Run workflow」ボタンをクリック
   - `main` ブランチを選択
   - オプション: 評価対象月を指定（例: `2025-12`）
   - 実行結果を確認

### 実行スケジュール

- **自動実行**: 毎月1日の午前3時（JST）
- **手動実行**: いつでも可能（Actions タブから）
- **実行時間**: 約15分 × バッチ数（300名/バッチ）

### バッチ処理の仕組み

```
例: アクティブ生徒が900名の場合

バッチ1: 生徒1-300名 → 実行
  ↓ 15分待機
バッチ2: 生徒301-600名 → 実行
  ↓ 15分待機
バッチ3: 生徒601-900名 → 実行
  ↓ 完了

合計実行時間: 約30分（処理時間 + 待機時間）
```

### API エンドポイント

#### 1. バッチ評価実行
```bash
POST /api/auto-evaluate?month=YYYY-MM&batchIndex=0&batchSize=300
```

パラメータ:
- `month`: 評価対象月（例: `2025-12`）
- `batchIndex`: バッチインデックス（0から開始）
- `batchSize`: バッチサイズ（デフォルト: 300）

レスポンス:
```json
{
  "success": true,
  "month": "2025-12",
  "batchInfo": {
    "batchIndex": 0,
    "batchSize": 300,
    "totalBatches": 3,
    "processedStudents": 300,
    "totalActiveStudents": 900,
    "hasNextBatch": true,
    "nextBatchIndex": 1
  },
  "successCount": 280,
  "errorCount": 10,
  "skippedCount": 10,
  "results": [...]
}
```

#### 2. バッチ評価ステータス確認
```bash
GET /api/auto-evaluate/status
```

レスポンス:
```json
{
  "success": true,
  "totalStudents": 1377,
  "activeStudents": 950,
  "studentsWithAccounts": 900,
  "batchSize": 300,
  "totalBatches": 3,
  "estimatedTime": "45分（15分間隔で3バッチ）"
}
```

### トラブルシューティング

#### ワークフローが実行されない
- Actions が有効化されているか確認
- スケジュール設定（cron）を確認
- 手動実行で動作確認

#### バッチ処理が途中で失敗する
- Render サービスが起動しているか確認
- API キーが正しく設定されているか確認
- エラーログを確認（Actions タブ → 実行履歴 → ログ）

#### YouTube/X API エラーが発生する
- YouTube API キーの有効期限を確認
- X API の月間制限を確認
- キャッシュが正常に動作しているか確認

### 関連ドキュメント

- [自動評価スケジュール設定ガイド](../docs/AUTO_EVALUATION_SCHEDULE.md)
- [評価システム修正レポート](../docs/EVALUATION_SYSTEM_FIX.md)
- [GitHub Actions ドキュメント](https://docs.github.com/ja/actions)
