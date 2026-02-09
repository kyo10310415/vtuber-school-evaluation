# 週次アナリティクス 手動実行ガイド

## 前提条件チェック

### 1. OAuth認証が完了しているか確認

週次アナリティクス取得には、各生徒のYouTube Analytics OAuth認証が必要です。

**確認方法:**
```bash
curl https://your-app.onrender.com/api/analytics/auto-fetch/test
```

**期待される応答:**
```json
{
  "success": true,
  "message": "Configuration check complete",
  "config": {
    "hasServiceAccount": true,
    "hasWeeklySpreadsheetId": true,
    "oauthTokensCount": 5,  // ← 0の場合はOAuth認証が必要
    "students": [
      {
        "studentId": "OLST230013-OS",
        "hasValidToken": true
      }
    ]
  }
}
```

**oauthTokensCount が 0 の場合:**
- 生徒のOAuth認証が未完了です
- 各生徒に `/oauth/authorize?studentId=XXXX` でYouTube Analytics認証を完了してもらう必要があります

---

## 手動実行手順

### ステップ1: 設定確認

```bash
# RenderのURLを確認（例: https://vtuber-school-evaluation.onrender.com）
RENDER_URL="https://your-app.onrender.com"

# テストエンドポイントで設定を確認
curl "${RENDER_URL}/api/analytics/auto-fetch/test"
```

**確認ポイント:**
- ✅ `hasServiceAccount: true`
- ✅ `hasWeeklySpreadsheetId: true`
- ✅ `oauthTokensCount > 0`

### ステップ2: 手動実行

```bash
# 週次アナリティクスを実行（時間がかかる場合があります）
curl -X POST "${RENDER_URL}/api/analytics/auto-fetch" \
  -H "Content-Type: application/json" \
  --max-time 300 \
  -v
```

**オプション説明:**
- `--max-time 300`: タイムアウトを300秒（5分）に設定
- `-v`: 詳細なログを表示

### ステップ3: 結果確認

**成功時のレスポンス例:**
```json
{
  "success": true,
  "period": {
    "startDate": "2026-02-03",
    "endDate": "2026-02-09"
  },
  "summary": {
    "total": 5,
    "success": 5,
    "errors": 0
  },
  "results": [
    {
      "studentId": "OLST230013-OS",
      "name": "岡本恵里奈",
      "success": true
    }
  ]
}
```

---

## トラブルシューティング

### ❌ "No OAuth tokens found"

**原因:** 生徒のOAuth認証が未完了

**解決策:**
1. 各生徒に以下のURLでYouTube Analytics認証を完了してもらう
   ```
   https://your-app.onrender.com/oauth/authorize?studentId=OLST230013-OS
   ```
2. 認証完了後、再度手動実行

---

### ❌ "GOOGLE_SERVICE_ACCOUNT is not configured"

**原因:** サービスアカウントの環境変数が未設定

**解決策:**
1. Renderの環境変数で `GOOGLE_SERVICE_ACCOUNT` を確認
2. 値が設定されているか確認

---

### ❌ "WEEKLY_ANALYTICS_SPREADSHEET_ID not set"

**原因:** 書き込み先スプレッドシートIDが未設定

**解決策:**
1. Google Sheetsで新規スプレッドシートを作成
2. Renderの環境変数に追加:
   ```
   WEEKLY_ANALYTICS_SPREADSHEET_ID=<スプレッドシートID>
   ```
3. Renderを再起動

---

### ⏱️ タイムアウトエラー

**原因:** 処理に時間がかかりすぎている

**解決策:**
1. `--max-time` の値を増やす（例: 600秒）
   ```bash
   curl -X POST "${RENDER_URL}/api/analytics/auto-fetch" \
     -H "Content-Type: application/json" \
     --max-time 600 \
     -v
   ```
2. Renderのログで処理状況を確認
3. 正常に動作していれば、レスポンスが返らなくてもスプレッドシートに書き込まれている可能性あり

---

### 🔍 Renderログの確認

Renderのダッシュボードで以下のログを確認：

**正常動作時のログ例:**
```
[Auto Fetch] Starting weekly analytics collection...
[Auto Fetch] Found 5 students with OAuth tokens
[Auto Fetch] Period: 2026-02-03 ~ 2026-02-09
[Auto Fetch] Success: 岡本恵里奈 (OLST230013-OS)
[Auto Fetch] Complete: 5 success, 0 errors
[WeeklySpreadsheet] Updated 所属生一覧 with 5 students
[WeeklySpreadsheet] Updated チャンネル名 for 岡本恵里奈
[Auto Fetch] Spreadsheet updated: 5 students
```

---

## 自動実行（Cron）

週次Cronは既に設定されています：

```
WEEKLY_ANALYTICS_CRON_SCHEDULE=0 10 * * 3
```

- **実行タイミング:** 毎週水曜日 10:00 (UTC) = 日本時間 19:00
- **対象期間:** 前週の月曜日～日曜日

手動実行で正常に動作することを確認してから、Cronの動作を待ちます。

---

## よくある質問

### Q1. 実行に時間がかかるのは正常ですか？

**A.** はい、正常です。各生徒のYouTube Analyticsデータを取得するため、生徒数に応じて時間がかかります。
- 1生徒あたり約10-30秒
- 5生徒の場合、約1-2分

### Q2. スプレッドシートが更新されているか確認するには？

**A.** 以下を確認してください：
1. 「所属生一覧」シートが作成されているか
2. 各チャンネル名のシートが作成されているか
3. 週のラベル（例: `2026-02-03~2026-02-09`）が列ヘッダーに追加されているか
4. データが書き込まれているか

### Q3. エラーが発生した場合、部分的にデータは保存されますか？

**A.** はい、成功した生徒のデータは保存されます。
- データベースへの保存とスプレッドシートへの書き込みは個別に実行されます
- 一部の生徒でエラーが発生しても、他の生徒のデータは正常に保存されます

---

## まとめ

✅ **実行前にテストエンドポイントで設定確認**
✅ **OAuth認証が完了していることを確認**
✅ **タイムアウトを長めに設定（--max-time 300）**
✅ **Renderログで詳細な動作を確認**
✅ **スプレッドシートで結果を確認**

問題が解決しない場合は、Renderログの全文を確認してください。
