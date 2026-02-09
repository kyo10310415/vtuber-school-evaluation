# スプレッドシート書き込み問題 - 解決フロー

## 📊 現状

✅ **データ取得は成功**
```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch
```
結果: 8人の生徒データ取得成功、エラー0件

❌ **スプレッドシートに書き込まれていない**

## 🔍 原因の特定

環境変数 `WEEKLY_ANALYTICS_SPREADSHEET_ID` が未設定の可能性が高い。

## ✅ 解決フロー

### 【今すぐ実行】Step 1: 環境変数を確認

Renderのデプロイ完了を待つ（約3-5分）

その後、以下のコマンドを実行：

```bash
curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env
```

### Step 2: 結果の判定

#### パターンA: `WEEKLY_ANALYTICS_SPREADSHEET_ID: "NOT SET"`

→ **環境変数が未設定です**

**対処法：**

1. **Google Sheetsで新規スプレッドシートを作成**
   - URL: https://sheets.google.com
   - 名前: 「週次アナリティクスデータ」

2. **スプレッドシートIDを取得**
   - URL形式: `https://docs.google.com/spreadsheets/d/【ID】/edit`
   - 例: `1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M`

3. **サービスアカウントに共有**
   - スプレッドシートの「共有」をクリック
   - サービスアカウントのメールアドレスを追加
     - 確認方法: `GOOGLE_SERVICE_ACCOUNT` の JSON から `client_email` を取得
   - 権限: **編集者**

4. **Renderに環境変数を設定**
   - URL: https://dashboard.render.com/
   - サービス: vtuber-school-evaluation
   - Environment → Add Environment Variable
   - Key: `WEEKLY_ANALYTICS_SPREADSHEET_ID`
   - Value: `<手順2で取得したID>`
   - Save Changes

5. **デプロイ完了を待つ**（約3-5分）

6. **再度実行**
   ```bash
   curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
     -H "Content-Type: application/json" \
     --max-time 300
   ```

7. **スプレッドシート確認**
   - 「所属生一覧」シート
   - 各生徒の個人データシート

#### パターンB: `WEEKLY_ANALYTICS_SPREADSHEET_ID` が設定されている

→ **別の原因（権限エラーなど）**

**対処法：**

1. **Renderのログを確認**
   - URL: https://dashboard.render.com/
   - サービス: vtuber-school-evaluation
   - Logs タブ

2. **探すべきログ：**
   ```
   [Auto Fetch] Spreadsheet updated: 8 students  ← 成功
   ```
   または
   ```
   [Auto Fetch] Failed to update spreadsheet: ... ← エラー
   ```

3. **エラーに応じた対処：**
   - "Permission denied" → サービスアカウントの共有設定を確認
   - "Spreadsheet not found" → スプレッドシートIDを確認
   - その他 → ログ全文を共有してください

## 📝 チェックリスト

設定完了後、以下を確認：

- [ ] 環境変数 `WEEKLY_ANALYTICS_SPREADSHEET_ID` が設定されている
- [ ] スプレッドシートにサービスアカウントが編集者として共有されている
- [ ] `/api/analytics/auto-fetch` を実行してエラーがない
- [ ] スプレッドシートに「所属生一覧」シートが作成されている
- [ ] 各生徒の個人データシートが作成されている（チャンネル名）

## 🎯 期待される結果

### 所属生一覧シート
```
| 名前        | 学籍番号         | 2026-02-02〜2026-02-08 |
|------------|-----------------|----------------------|
| 那須野聖    | OLTS240274-SD   | [データ]              |
| 井脇沙智    | OLST240123-BN   | [データ]              |
| ...        | ...             | ...                  |
```

### 個人データシート（例: 岡本恵里奈）
```
| データ項目               | 2026-02-02〜2026-02-08 |
|------------------------|----------------------|
| 総合_視聴回数            | 12345                |
| 総合_視聴時間（分）       | 6789                 |
| 総合_高評価数            | 123                  |
| ...                    | ...                  |
```

## 🔄 次のステップ

1. ⏰ **Renderデプロイ完了を待つ**（約3-5分）
2. ✅ **環境変数確認エンドポイントを実行**
   ```bash
   curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env
   ```
3. 📤 **結果を共有してください**

---

## 📚 関連ドキュメント

- `SPREADSHEET_FIX_GUIDE.md` - 詳細な設定手順
- `ENV_CHECK_GUIDE.md` - 環境変数確認ガイド
- `MANUAL_EXECUTION_GUIDE.md` - 手動実行ガイド
- `WEEKLY_ANALYTICS_SETUP.md` - 週次アナリティクス セットアップガイド

---

**📌 まとめ: Renderデプロイ後、まず環境変数確認エンドポイントを実行してください！**

```bash
curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env
```
