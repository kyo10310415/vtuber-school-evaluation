# GitHub Actionsワークフローの手動セットアップガイド

## 📋 概要

このガイドでは、月次自動評価のためのGitHub Actionsワークフローを**手動で**GitHubリポジトリに追加する方法を説明します。

**なぜ手動が必要？**  
GitHub Appの権限制限により、`.github/workflows/`ディレクトリ内のファイルを直接プッシュできません。そのため、GitHubのWebインターフェースを使用してワークフローファイルを作成する必要があります。

## 🎯 実装内容

### ワークフローの機能
- **自動実行**: 毎月1日の午前3時（JST）に前月分の評価を実行
- **バッチ処理**: 300名ずつ分割、15分間隔で実行
- **手動実行**: GitHub Actionsタブから任意の月を指定して実行可能
- **エラーハンドリング**: バッチ失敗時も次のバッチを継続

### 評価対象
- **アクティブ生徒**: 669名（「永久会員」を除く）
- **評価可能**: 527名（YouTubeチャンネルID または Xアカウント設定済み）
- **バッチ数**: 2バッチ（300名/バッチ）
- **所要時間**: 約30分

## 📝 セットアップ手順

### ステップ1: GitHubリポジトリにアクセス

1. ブラウザで以下のURLを開く：
   ```
   https://github.com/kyo10310415/vtuber-school-evaluation
   ```

2. リポジトリのメインページで **Actions** タブをクリック

### ステップ2: 新しいワークフローを作成

1. **New workflow** ボタンをクリック

2. **set up a workflow yourself** リンクをクリック
   - または既存のワークフローがある場合は **New workflow** → **set up a workflow yourself**

### ステップ3: ワークフローファイルを作成

1. **ファイル名**を入力：
   ```
   .github/workflows/monthly-evaluation-batch.yml
   ```

2. **以下の内容をコピー&ペースト**：

```yaml
name: Monthly Auto Evaluation (Batch Processing)

# 毎月1日の午前3時（JST = UTC+9）= UTC 18:00 (前日) に実行
on:
  schedule:
    - cron: '0 18 * * *'  # 毎日 UTC 18:00 = JST 03:00 に実行（月初判定はスクリプト内で行う）
  workflow_dispatch:  # 手動実行も可能
    inputs:
      month:
        description: '評価対象月 (YYYY-MM)'
        required: false
        type: string

jobs:
  evaluate:
    runs-on: ubuntu-latest
    
    steps:
      - name: Check if today is the 1st of the month
        id: check_date
        run: |
          DAY=$(date -u +%d)
          echo "Today is day $DAY of the month"
          if [ "$DAY" = "01" ] || [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "should_run=true" >> $GITHUB_OUTPUT
          else
            echo "should_run=false" >> $GITHUB_OUTPUT
            echo "Skipping evaluation - not the 1st of the month"
          fi
      
      - name: Get previous month
        if: steps.check_date.outputs.should_run == 'true'
        id: get_month
        run: |
          if [ -n "${{ inputs.month }}" ]; then
            MONTH="${{ inputs.month }}"
          else
            MONTH=$(date -u -d "1 month ago" +%Y-%m)
          fi
          echo "month=$MONTH" >> $GITHUB_OUTPUT
          echo "Evaluating for month: $MONTH"
      
      - name: Get batch info
        if: steps.check_date.outputs.should_run == 'true'
        id: batch_info
        run: |
          MONTH="${{ steps.get_month.outputs.month }}"
          
          # バッチ情報を取得
          STATUS=$(curl -s "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate/status")
          echo "Status: $STATUS"
          
          TOTAL_BATCHES=$(echo "$STATUS" | jq -r '.totalBatches')
          echo "total_batches=$TOTAL_BATCHES" >> $GITHUB_OUTPUT
          echo "Total batches to process: $TOTAL_BATCHES"
      
      - name: Process batches
        if: steps.check_date.outputs.should_run == 'true'
        run: |
          MONTH="${{ steps.get_month.outputs.month }}"
          TOTAL_BATCHES="${{ steps.batch_info.outputs.total_batches }}"
          
          echo "Starting batch processing for $MONTH"
          echo "Total batches: $TOTAL_BATCHES"
          
          for ((i=0; i<$TOTAL_BATCHES; i++)); do
            echo "============================================"
            echo "Processing batch $((i+1))/$TOTAL_BATCHES"
            echo "============================================"
            
            # バッチ評価を実行
            RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
              -X POST \
              "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate?month=$MONTH&batchIndex=$i&batchSize=300")
            
            HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
            BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
            
            echo "Response Status: $HTTP_STATUS"
            echo "Response Body: $BODY"
            
            if [ "$HTTP_STATUS" -ge 400 ]; then
              echo "::warning::Batch $((i+1)) failed with status $HTTP_STATUS"
              echo "Response: $BODY"
              # エラーでも続行（次のバッチを試行）
            else
              SUCCESS_COUNT=$(echo "$BODY" | jq -r '.successCount')
              ERROR_COUNT=$(echo "$BODY" | jq -r '.errorCount')
              SKIPPED_COUNT=$(echo "$BODY" | jq -r '.skippedCount')
              echo "✅ Batch $((i+1)) completed: Success=$SUCCESS_COUNT, Error=$ERROR_COUNT, Skipped=$SKIPPED_COUNT"
            fi
            
            # 次のバッチの前に15分待機（最後のバッチを除く）
            if [ $i -lt $((TOTAL_BATCHES-1)) ]; then
              echo "Waiting 15 minutes before next batch..."
              sleep 900  # 15分 = 900秒
            fi
          done
          
          echo "============================================"
          echo "All batches completed!"
          echo "============================================"
```

### ステップ4: コミット

1. 右上の **Commit changes...** ボタンをクリック

2. コミットメッセージを入力：
   ```
   Add monthly auto evaluation workflow with batch processing
   ```

3. **Commit directly to the main branch** を選択

4. **Commit changes** ボタンをクリック

## ✅ 動作確認

### 1. ワークフローが作成されたことを確認

1. **Actions** タブを開く
2. 左サイドバーに **"Monthly Auto Evaluation (Batch Processing)"** が表示されることを確認

### 2. 手動テストを実行

1. **"Monthly Auto Evaluation (Batch Processing)"** をクリック

2. 右側の **Run workflow** ボタンをクリック

3. 評価対象月を入力（例: `2025-12`）または空欄（前月を自動計算）

4. **Run workflow** をクリック

5. ワークフロー実行が開始され、ログを確認できます

### 3. 実行ログの確認

実行中のワークフローをクリックすると、以下が表示されます：
- **Check if today is the 1st of the month**: 日付チェック
- **Get previous month**: 評価対象月の決定
- **Get batch info**: バッチ情報の取得
- **Process batches**: バッチ処理の実行（各バッチの詳細ログ）

## 📊 期待される実行結果

### 成功時のログ例
```
============================================
Processing batch 1/2
============================================
Response Status: 200
✅ Batch 1 completed: Success=299, Error=0, Skipped=1
Waiting 15 minutes before next batch...
============================================
Processing batch 2/2
============================================
Response Status: 200
✅ Batch 2 completed: Success=222, Error=0, Skipped=78
============================================
All batches completed!
============================================
```

### 統計情報
- **総処理数**: 600名（2バッチ × 300名）
- **成功**: 521名
- **スキップ**: 79名（アカウント情報なし）
- **エラー**: 0名
- **所要時間**: 約30分（15分待機 × 1回 + 処理時間）

## 🔍 トラブルシューティング

### エラー: API呼び出しが失敗する

**原因**: Renderサービスがスリープ状態の可能性

**解決策**:
1. ブラウザで https://vtuber-school-evaluation.onrender.com/ にアクセス
2. サービスが起動するまで待つ（約30秒）
3. ワークフローを再実行

### エラー: YouTube/X APIのレート制限

**原因**: 前回の評価から15分経過していない

**解決策**:
1. 15分待機してから再実行
2. キャッシュが有効な場合、API呼び出しは最小限に抑えられる

### エラー: バッチ処理が途中で停止

**原因**: GitHub Actionsの実行時間制限（6時間）

**解決策**:
- 通常30分程度で完了するため、この問題は発生しません
- もし発生した場合は、次のバッチから手動で再開

## 🎯 自動実行のスケジュール

### デフォルト設定
- **実行日**: 毎月1日
- **実行時刻**: 午前3時（JST）
- **評価対象**: 前月（例: 2月1日に1月分を評価）

### スケジュールの変更方法

実行時刻を変更したい場合：

1. ワークフローファイルの6行目を編集：
   ```yaml
   - cron: '0 18 * * *'  # UTC 18:00 = JST 03:00
   ```

2. 例：午前2時（JST）に変更したい場合：
   ```yaml
   - cron: '0 17 * * *'  # UTC 17:00 = JST 02:00
   ```

3. **注意**: cronはUTC時間で指定する必要があります
   - JST = UTC + 9時間
   - JST 02:00 = UTC 17:00
   - JST 03:00 = UTC 18:00

## 📈 次回の自動実行予定

- **2026年2月1日 午前3時（JST）**: 2026年1月分の評価
- **2026年3月1日 午前3時（JST）**: 2026年2月分の評価
- 以降、毎月1日に自動実行

## 🔗 関連ドキュメント

- [バッチ評価サマリー](../docs/BATCH_EVALUATION_SUMMARY.md)
- [X評価修正サマリー](../docs/X_EVALUATION_FIX_SUMMARY.md)
- [評価システム修正レポート](../docs/EVALUATION_SYSTEM_FIX.md)

## ℹ️ 追加情報

### APIエンドポイント

**バッチ評価**:
```
POST /api/auto-evaluate?month=YYYY-MM&batchIndex=0&batchSize=300
```

**ステータス確認**:
```
GET /api/auto-evaluate/status
```

レスポンス例：
```json
{
  "totalStudents": 1377,
  "activeStudents": 669,
  "studentsWithAccounts": 527,
  "batchSize": 300,
  "totalBatches": 2,
  "estimatedTime": "約30分（15分間隔で2バッチ）"
}
```

### GitHub Actionsの制限

- **実行時間制限**: 6時間/ジョブ
- **並列実行**: デフォルトで制限なし
- **ログ保持期間**: 90日間

現在の設定では、これらの制限に到達することはありません。

---

## ✅ チェックリスト

セットアップが完了したら、以下を確認してください：

- [ ] GitHubの **Actions** タブに **"Monthly Auto Evaluation (Batch Processing)"** が表示される
- [ ] 手動実行でテストが成功する（評価月を指定して実行）
- [ ] 実行ログで2バッチの処理が確認できる
- [ ] 評価結果がスプレッドシートに保存される
- [ ] 次回の自動実行予定を確認

すべて完了したら、月次自動評価システムの実装は完了です！🎉
