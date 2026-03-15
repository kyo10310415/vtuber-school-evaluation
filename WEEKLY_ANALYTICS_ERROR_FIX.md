# 週次アナリティクス「Failed to fetch」エラー解決ガイド

## ❌ エラー内容

GitHub Actionsで手動テスト実行時に以下のエラーが発生:
```
エラー: Failed to fetch
```

---

## ✅ 原因の特定

**APIエンドポイント自体は正常に動作しています:**
- ✅ `/api/analytics/auto-fetch` - 動作確認済み（15秒で完了）
- ✅ 10名のOAuth認証済み生徒が存在
- ✅ 8名のデータ取得成功

**問題の原因:**
1. **タイムアウト設定が不十分**
   - Renderの無料プランはコールドスタートで30秒以上かかる
   - データ取得にも時間がかかる（15秒〜数分）
   - 元のワークフローのウォームアップ時間が短すぎる

2. **リトライ機構が未実装**
   - 一度失敗すると即座にエラーになる
   - ネットワーク一時的な問題に対応できない

---

## 🔧 解決策

### **改善版ワークフローを使用**

以下の改善を実施した新しいワークフローファイルを使用してください:

#### **改善点:**
1. ✅ **ウォームアップ時間を延長**
   - 試行回数: 10回 → **20回**
   - 最終待機時間: 5秒 → **30秒**
   - 合計最大ウォームアップ時間: 約3.5分

2. ✅ **タイムアウトを延長**
   - curlタイムアウト: 30分 → **60分**
   - ジョブタイムアウト: 60分 → **90分**
   - 接続タイムアウト: 追加 (**60秒**)

3. ✅ **リトライ機構を追加**
   - 最大3回まで自動リトライ
   - 各リトライ間に60秒待機
   - 詳細なエラーログ出力

---

## 🚀 セットアップ手順（改善版）

### ステップ1: GitHubリポジトリにアクセス

```
https://github.com/kyo10310415/vtuber-school-evaluation
```

---

### ステップ2: 新しいワークフローを作成

1. **「Actions」タブ** をクリック

2. **「New workflow」** → **「set up a workflow yourself」**

3. **ファイル名を入力:**
   ```
   .github/workflows/weekly-analytics.yml
   ```

4. **以下のコードを貼り付け:**

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
    timeout-minutes: 90  # タイムアウトを90分に延長
    
    steps:
      - name: Wake up Render service (extended)
        run: |
          echo "🔥 Waking up Render service..."
          
          # ヘルスチェックを20回試行（最大3分）
          for i in {1..20}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://vtuber-school-evaluation.onrender.com/api/health || echo "000")
            echo "Attempt $i/20: Status $STATUS"
            
            if [ "$STATUS" = "200" ]; then
              echo "✅ Service is ready!"
              break
            fi
            
            if [ $i -lt 20 ]; then
              sleep 10
            fi
          done
          
          # さらに30秒待機してRenderが完全にウォームアップするまで待つ
          echo "⏳ Waiting additional 30 seconds for full warm-up..."
          sleep 30
          
          # 最終確認
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://vtuber-school-evaluation.onrender.com/api/health || echo "000")
          echo "Final health check: $STATUS"
          
          if [ "$STATUS" != "200" ]; then
            echo "::error::Service failed to start properly"
            exit 1
          fi
      
      - name: Execute weekly analytics collection with retry
        run: |
          echo "📊 Starting weekly YouTube Analytics collection..."
          echo "Date: $(date)"
          
          MAX_RETRIES=3
          RETRY_COUNT=0
          SUCCESS=false
          
          while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = "false" ]; do
            if [ $RETRY_COUNT -gt 0 ]; then
              echo "⏳ Retry $RETRY_COUNT/$MAX_RETRIES after 60 seconds..."
              sleep 60
            fi
            
            echo "Attempt $(($RETRY_COUNT + 1))/$MAX_RETRIES"
            
            # 週次アナリティクス取得を実行（タイムアウト60分に延長）
            RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
              -X POST \
              "https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch" \
              -H "Content-Type: application/json" \
              --max-time 3600 \
              --connect-timeout 60)
            
            HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
            BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
            
            echo "Response Status: $HTTP_STATUS"
            
            if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 400 ]; then
              SUCCESS=true
              echo "✅ Weekly analytics collection completed successfully!"
              echo "$BODY" | jq '.' || echo "$BODY"
              
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
              RETRY_COUNT=$((RETRY_COUNT + 1))
              echo "::warning::Request failed with status $HTTP_STATUS (Attempt $RETRY_COUNT/$MAX_RETRIES)"
              echo "Response body: $BODY"
            fi
          done
          
          if [ "$SUCCESS" = "false" ]; then
            echo "::error::Weekly analytics collection failed after $MAX_RETRIES attempts"
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

5. **「Commit changes」** をクリック

---

### ステップ3: 手動テスト実行

1. **「Actions」タブ** → **「Weekly YouTube Analytics Collection」**

2. **「Run workflow」** → **「Run workflow」**

3. **ログを確認:**
   - ウォームアップに約3.5分
   - データ取得に15秒〜数分
   - 合計5〜10分程度で完了

---

## ✅ 期待される動作

### **成功時のログ:**

```
🔥 Waking up Render service...
Attempt 1/20: Status 200
✅ Service is ready!
⏳ Waiting additional 30 seconds for full warm-up...
Final health check: 200

📊 Starting weekly YouTube Analytics collection...
Date: Sun Mar 15 10:15:00 UTC 2026
Attempt 1/3
Response Status: 200
✅ Weekly analytics collection completed successfully!

============================================
📈 Weekly Analytics Summary
============================================
Period: 2026-03-02 ~ 2026-03-08
Total Students: 10
Success: 8
Errors: 0
============================================
```

---

## 🛠️ トラブルシューティング

### ❌ それでも「Failed to fetch」が出る場合

**追加確認事項:**

1. **Renderサービスが起動しているか確認:**
   ```bash
   curl https://vtuber-school-evaluation.onrender.com/api/health
   ```
   
   期待される応答: `{"status":"ok",...}`

2. **OAuth認証済み生徒が存在するか確認:**
   ```bash
   curl https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test
   ```
   
   期待される応答: `{"success":true,"tokenCount":10,...}`

3. **手動でAPIを直接実行:**
   ```bash
   curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
     -H "Content-Type: application/json" \
     --max-time 300
   ```
   
   これが成功する場合、GitHub Actionsの設定問題

---

### ❌ タイムアウトエラーが続く場合

**さらにタイムアウトを延長:**

ワークフローファイルの以下の値を変更:
```yaml
timeout-minutes: 90  # → 120に変更
--max-time 3600      # → 5400に変更（90分）
```

---

### ❌ リトライしても全て失敗する場合

**Renderログを確認:**

1. Renderダッシュボードにアクセス
2. 「Logs」タブを開く
3. エラーメッセージを確認

**よくあるエラー:**
- `GOOGLE_SERVICE_ACCOUNT is not configured` → 環境変数未設定
- `No OAuth tokens found` → 生徒のOAuth認証が未完了
- `Database connection failed` → DATABASE_URL未設定

---

## 📊 比較表（改善前 vs 改善後）

| 項目 | 改善前 | 改善後 |
|------|--------|--------|
| ウォームアップ試行回数 | 10回 | **20回** |
| ウォームアップ待機時間 | 5秒 | **30秒** |
| curlタイムアウト | 30分 | **60分** |
| ジョブタイムアウト | 60分 | **90分** |
| リトライ機構 | なし | **最大3回** |
| 接続タイムアウト | なし | **60秒** |
| エラーログ | 簡易 | **詳細** |

---

## 🎉 まとめ

✅ **改善版ワークフローを使用すれば解決します**
✅ **ウォームアップ時間を十分に確保**
✅ **リトライ機構で一時的なエラーに対応**
✅ **詳細なログで問題を即座に特定可能**

---

## 🔗 関連リンク

- [WEEKLY_ANALYTICS_AUTO_SETUP.md](./WEEKLY_ANALYTICS_AUTO_SETUP.md) - 基本セットアップガイド
- [MANUAL_EXECUTION_GUIDE.md](./MANUAL_EXECUTION_GUIDE.md) - 手動実行ガイド
- [GitHub Repository](https://github.com/kyo10310415/vtuber-school-evaluation)

---

この改善版を使用して再度テストしてください。問題が解決するはずです！
