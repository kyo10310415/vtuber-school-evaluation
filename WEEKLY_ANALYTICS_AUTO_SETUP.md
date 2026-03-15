# 週次アナリティクス 自動セットアップガイド

## 🎯 概要

このガイドでは、週次YouTube Analyticsデータ取得を自動化するためのセットアップ手順を説明します。

**自動化の目的**:
- 毎週水曜日 10:00 (JST) にYouTube Analyticsデータを自動取得
- PostgreSQLに履歴データを保存
- Googleスプレッドシートに週次データを書き込み

---

## ⚠️ 現在の状況

**週次アナリティクス自動取得が動作していません。**

**原因**: GitHub Actionsワークフローが存在しないため

**解決策**: 以下の手順でワークフローを追加してください

---

## 🚀 自動セットアップ手順（3分で完了）

### ステップ1: GitHubリポジトリにアクセス

ブラウザで以下のURLを開く:
```
https://github.com/kyo10310415/vtuber-school-evaluation
```

---

### ステップ2: 新しいワークフローを作成

1. **「Actions」タブをクリック**

2. **「New workflow」ボタンをクリック**

3. **「set up a workflow yourself」をクリック**

---

### ステップ3: ワークフローファイルを設定

1. **ファイル名を入力**:
   ```
   .github/workflows/weekly-analytics.yml
   ```
   ※ デフォルトは `main.yml` になっているので、上記に変更してください

2. **エディタに以下のコードを貼り付け**:

```yaml
name: Weekly YouTube Analytics Collection

on:
  schedule:
    # 毎週水曜日 JST 10:00 (UTC 01:00) に実行
    - cron: '0 1 * * 3'
  workflow_dispatch:
    # 手動実行も可能

jobs:
  weekly-analytics:
    runs-on: ubuntu-latest
    timeout-minutes: 60  # 1時間タイムアウト
    
    steps:
      - name: Wake up Render service
        run: |
          echo "🔥 Waking up Render service..."
          for i in {1..10}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://vtuber-school-evaluation.onrender.com/api/health || echo "000")
            echo "Attempt $i/10: Status $STATUS"
            
            if [ "$STATUS" = "200" ]; then
              echo "✅ Service is ready!"
              break
            fi
            
            if [ $i -lt 10 ]; then
              sleep 10
            fi
          done
          
          sleep 5
      
      - name: Execute weekly analytics collection
        run: |
          echo "📊 Starting weekly YouTube Analytics collection..."
          echo "Date: $(date)"
          
          # 週次アナリティクス取得を実行（タイムアウト30分）
          RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
            -X POST \
            "https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch" \
            -H "Content-Type: application/json" \
            --max-time 1800)
          
          HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
          BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
          
          echo "Response Status: $HTTP_STATUS"
          echo "$BODY" | jq '.' || echo "$BODY"
          
          if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 400 ]; then
            echo "✅ Weekly analytics collection completed successfully!"
            
            # レスポンスから結果を抽出
            SUCCESS_COUNT=$(echo "$BODY" | jq -r '.summary.success // 0')
            ERROR_COUNT=$(echo "$BODY" | jq -r '.summary.errors // 0')
            TOTAL_COUNT=$(echo "$BODY" | jq -r '.summary.total // 0')
            START_DATE=$(echo "$BODY" | jq -r '.period.startDate // "N/A"')
            END_DATE=$(echo "$BODY" | jq -r '.period.endDate // "N/A"')
            
            echo "============================================"
            echo "📈 Weekly Analytics Summary"
            echo "============================================"
            echo "Period: $START_DATE ~ $END_DATE"
            echo "Total Students: $TOTAL_COUNT"
            echo "Success: $SUCCESS_COUNT"
            echo "Errors: $ERROR_COUNT"
            echo "============================================"
          else
            echo "::error::Weekly analytics collection failed with status $HTTP_STATUS"
            exit 1
          fi
      
      - name: Summary
        if: always()
        run: |
          echo "============================================"
          echo "📊 Weekly Analytics Execution Summary"
          echo "============================================"
          echo "Date: $(date)"
          echo "Day: Wednesday"
          echo "Status: Completed"
          echo "============================================"
```

3. **「Commit changes」ボタンをクリック**
   - Commit message: `feat: Add weekly YouTube analytics collection workflow`
   - 「Commit directly to the main branch」を選択
   - 「Commit changes」をクリック

---

### ステップ4: 動作確認（手動テスト実行）

1. **「Actions」タブに戻る**

2. **左サイドバーから「Weekly YouTube Analytics Collection」をクリック**

3. **「Run workflow」ボタンをクリック**
   - Branch: `main` を選択
   - 「Run workflow」をクリック

4. **実行状況を確認**
   - ワークフローが開始されます（黄色のアイコン）
   - クリックして詳細ログを確認
   - 完了まで数分かかります

5. **結果を確認**
   - ✅ 緑のチェックマーク: 成功
   - ❌ 赤いバツマーク: 失敗（ログを確認）

---

## ✅ セットアップ完了！

これで、**毎週水曜日 10:00 (JST)** に自動でYouTube Analyticsデータが取得されます。

---

## 📊 自動実行スケジュール

| 項目 | 設定 |
|------|------|
| **実行日** | 毎週水曜日 |
| **実行時刻** | 10:00 (JST) = 01:00 (UTC) |
| **Cron式** | `0 1 * * 3` |
| **対象期間** | 前週月曜日〜日曜日（1週間分） |
| **処理内容** | ① OAuth認証済み生徒のデータ取得<br>② PostgreSQL履歴保存<br>③ スプレッドシート更新 |

---

## 🔍 動作確認方法

### 次回の自動実行を待つ

次の水曜日 10:00 (JST) に自動実行されます。

**確認方法**:
1. GitHubの「Actions」タブを開く
2. 「Weekly YouTube Analytics Collection」を確認
3. 最新の実行結果を確認

---

### すぐに確認したい場合（手動実行）

**方法1: GitHub Actionsで手動実行**
1. Actions → Weekly YouTube Analytics Collection
2. Run workflow → Run workflow

**方法2: curlコマンドで直接実行**
```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json"
```

---

## 📋 確認項目チェックリスト

セットアップ後、以下を確認してください:

- [ ] GitHub Actionsワークフローが作成されている
  - リポジトリの `.github/workflows/weekly-analytics.yml` が存在
- [ ] 手動実行でテスト成功
  - Actions → Run workflow で実行
  - ログに「✅ Weekly analytics collection completed successfully!」が表示
- [ ] PostgreSQL履歴データが保存されている
  - `/analytics-history/{学籍番号}` でグラフが表示される
- [ ] スプレッドシートが更新されている（環境変数設定済みの場合）
  - `WEEKLY_ANALYTICS_SPREADSHEET_ID` が設定済み
  - 「所属生一覧」シートが作成されている

---

## 🛠️ トラブルシューティング

### ❌ ワークフローが実行されない

**原因**: GitHub Actionsが無効化されている

**解決策**:
1. リポジトリの「Settings」タブ
2. 左サイドバーの「Actions」→「General」
3. 「Allow all actions and reusable workflows」を選択
4. 「Save」をクリック

---

### ❌ 「No OAuth tokens found」エラー

**原因**: 生徒のYouTube Analytics OAuth認証が未完了

**解決策**:
1. `/analytics-data` ページを開く
2. 赤ボタン「OAuth認証」をクリック
3. Googleアカウントでログイン・権限許可
4. 再度ワークフローを実行

---

### ❌ タイムアウトエラー

**原因**: 処理に時間がかかりすぎている（60分以上）

**解決策**:
1. `.github/workflows/weekly-analytics.yml` を編集
2. `timeout-minutes: 60` を `timeout-minutes: 120` に変更
3. または `--max-time 1800` を `--max-time 3600` に変更

---

## 📝 補足情報

### スケジュール変更方法

実行時刻を変更したい場合:

1. `.github/workflows/weekly-analytics.yml` を編集
2. `cron: '0 1 * * 3'` を変更
   - 例: 毎週金曜日 15:00 (JST) → `cron: '0 6 * * 5'`
   - UTC時間で指定（JST = UTC + 9時間）

### 手動実行の頻度

GitHub Actionsの手動実行（workflow_dispatch）には制限がありません。
必要に応じて何度でも実行可能です。

---

## 🎉 まとめ

✅ **3分でセットアップ完了**
✅ **毎週水曜日 10:00 (JST) に自動実行**
✅ **手動実行もいつでも可能**
✅ **実行履歴が GitHub Actions に残る**
✅ **無料で利用可能**

これで週次アナリティクスの自動取得が完全に動作します！

---

## 🔗 関連ドキュメント

- [MANUAL_EXECUTION_GUIDE.md](./MANUAL_EXECUTION_GUIDE.md) - 手動実行ガイド
- [WEEKLY_ANALYTICS_SETUP.md](./WEEKLY_ANALYTICS_SETUP.md) - スプレッドシート連携設定
- [README.md](./README.md) - プロジェクト全体概要
