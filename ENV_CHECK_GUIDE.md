# 環境変数確認 - クイックガイド

## 🚀 新しいエンドポイントを追加しました

GitHubにプッシュ完了しました。Renderが自動デプロイします（約3-5分）。

## 📋 デプロイ完了後の確認手順

### Step 1: 環境変数を確認

```bash
curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env
```

**期待される結果：**

#### ✅ 正常な場合（環境変数が設定されている）
```json
{
  "success": true,
  "env": {
    "WEEKLY_ANALYTICS_SPREADSHEET_ID": "1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M",
    "hasServiceAccount": true,
    "serviceAccountLength": 2358,
    "ANALYTICS_TARGET_SPREADSHEET_ID": "1ABC..."
  },
  "message": "WEEKLY_ANALYTICS_SPREADSHEET_ID is configured"
}
```

#### ❌ 環境変数が未設定の場合
```json
{
  "success": true,
  "env": {
    "WEEKLY_ANALYTICS_SPREADSHEET_ID": "NOT SET",
    "hasServiceAccount": true,
    "serviceAccountLength": 2358,
    "ANALYTICS_TARGET_SPREADSHEET_ID": "1ABC..."
  },
  "message": "⚠️ WEEKLY_ANALYTICS_SPREADSHEET_ID is NOT SET - spreadsheet updates will be skipped"
}
```

### Step 2: 結果に基づいた対応

#### ケース A: `WEEKLY_ANALYTICS_SPREADSHEET_ID: "NOT SET"` の場合

→ **環境変数を設定する必要があります**

**手順：**

1. **Google Sheetsで新規スプレッドシートを作成**
   - https://sheets.google.com
   - 名前: 「週次アナリティクスデータ」

2. **スプレッドシートIDをコピー**
   ```
   https://docs.google.com/spreadsheets/d/【このID】/edit
   ```

3. **サービスアカウントに共有**
   - スプレッドシートの「共有」をクリック
   - サービスアカウントのメールアドレスを追加
   - 権限: **編集者**

4. **Renderに環境変数を追加**
   - https://dashboard.render.com/
   - サービス「vtuber-school-evaluation」を選択
   - Environment → Add Environment Variable
   - Key: `WEEKLY_ANALYTICS_SPREADSHEET_ID`
   - Value: `<コピーしたスプレッドシートID>`
   - Save Changes

5. **デプロイ完了を待つ**（約3-5分）

6. **再度データ取得を実行**
   ```bash
   curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
     -H "Content-Type: application/json" \
     --max-time 300
   ```

7. **スプレッドシートを確認**
   - 「所属生一覧」シートが作成されているはず
   - 各生徒の個人データシートが作成されているはず

#### ケース B: `WEEKLY_ANALYTICS_SPREADSHEET_ID` が設定されている場合

→ **Renderのログを確認してください**

**ログの確認方法：**
1. https://dashboard.render.com/
2. サービス「vtuber-school-evaluation」を選択
3. Logs タブをクリック
4. 最近の `/api/analytics/auto-fetch` 実行時のログを探す

**探すべきログメッセージ：**

✅ **成功の場合：**
```
[Auto Fetch] Spreadsheet updated: 8 students
```

❌ **エラーの場合：**
```
[Auto Fetch] Failed to update spreadsheet: <エラー内容>
```

**よくあるエラー：**

1. **"Permission denied"**
   - サービスアカウントに編集権限がない
   - → スプレッドシートの共有設定を確認

2. **"Spreadsheet not found"**
   - スプレッドシートIDが間違っている
   - → 環境変数のIDを確認

3. **"Invalid credentials"**
   - サービスアカウントの設定が間違っている
   - → `GOOGLE_SERVICE_ACCOUNT` を確認

## 🔄 現在の状況まとめ

1. ✅ **コードは正しく実装されている**
2. ✅ **データ取得は成功している**（8人成功）
3. ❓ **環境変数の状態が不明**（未確認）
4. ❓ **スプレッドシート書き込みがスキップされている可能性**

## 📝 次のアクション

**Renderのデプロイ完了後（約3-5分）、以下を実行してください：**

```bash
curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env
```

**その結果を共有してください！**

結果に基づいて、次のステップをご案内します 🎯

---

## 🐛 トラブルシューティング

### デプロイが完了しない場合

Renderダッシュボードで以下を確認：
- Events タブでデプロイ状況を確認
- Logs タブでエラーがないか確認

### エンドポイントが404を返す場合

デプロイがまだ完了していない可能性があります。
3-5分待ってから再度試してください。

### 古いレスポンスが返る場合

ブラウザキャッシュまたはCDNキャッシュの可能性があります。
`-H "Cache-Control: no-cache"` を追加してください：

```bash
curl -H "Cache-Control: no-cache" https://vtuber-school-evaluation.onrender.com/api/analytics/check-env
```
