# GitHub Actions ワークフロー設定手順

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
   - ファイル名: `.github/workflows/monthly-evaluation.yml`
   - 以下の内容をコピー＆ペースト:

\`\`\`yaml
name: Monthly Auto Evaluation

# 毎月1日の午前3時（JST = UTC+9）= UTC 18:00 (前日) に実行
on:
  schedule:
    - cron: '0 18 * * *'  # 毎日 UTC 18:00 = JST 03:00 に実行（月初判定はスクリプト内で行う）
  workflow_dispatch:  # 手動実行も可能

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
          # 前月を YYYY-MM 形式で取得
          PREVIOUS_MONTH=$(date -u -d "1 month ago" +%Y-%m)
          echo "month=$PREVIOUS_MONTH" >> $GITHUB_OUTPUT
          echo "Evaluating for month: $PREVIOUS_MONTH"
      
      - name: Trigger auto evaluation
        if: steps.check_date.outputs.should_run == 'true'
        run: |
          MONTH="${{ steps.get_month.outputs.month }}"
          echo "Triggering evaluation for $MONTH"
          
          # 自動評価エンドポイントを呼び出す
          RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
            -X POST \
            "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate?month=$MONTH")
          
          HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
          BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
          
          echo "Response Status: $HTTP_STATUS"
          echo "Response Body: $BODY"
          
          if [ "$HTTP_STATUS" -ge 400 ]; then
            echo "::error::Evaluation failed with status $HTTP_STATUS"
            exit 1
          fi
          
          echo "Evaluation completed successfully"
\`\`\`

5. **コミット**
   - 「Commit new file」ボタンをクリック
   - コミットメッセージ: `Add monthly auto evaluation workflow`
   - `main` ブランチに直接コミット

### 確認

1. **Actions タブで確認**
   - "Monthly Auto Evaluation" ワークフローが表示されていることを確認

2. **手動テスト実行**
   - ワークフロー名をクリック
   - 「Run workflow」ボタンをクリック
   - `main` ブランチを選択して実行
   - 実行結果を確認

### 実行スケジュール

- **自動実行**: 毎日 午前3時（JST）に実行（1日のみ評価を実行）
- **手動実行**: いつでも GitHub Actions から手動実行可能

### トラブルシューティング

#### ワークフローが実行されない
- Actions が有効になっているか確認
- ワークフローファイルの構文エラーがないか確認
- スケジュール設定が正しいか確認

#### API エラーが発生する
- Render のサービスが起動しているか確認
- 環境変数が正しく設定されているか確認
- エンドポイントのURLが正しいか確認

## 関連ドキュメント

- [自動評価スケジュール設定ガイド](./docs/AUTO_EVALUATION_SCHEDULE.md)
- [GitHub Actions ドキュメント](https://docs.github.com/ja/actions)
