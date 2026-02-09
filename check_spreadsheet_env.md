# スプレッドシート書き込みが動作しない原因

## 🔍 問題の診断

curlの実行結果から：
```json
{
  "success": true,
  "summary": {
    "total": 10,
    "success": 8,
    "errors": 0
  }
}
```

**データ取得は成功しているが、スプレッドシートに書き込まれていない。**

## 🎯 考えられる原因

### 1. **環境変数が未設定**（最も可能性が高い）

`WEEKLY_ANALYTICS_SPREADSHEET_ID` が設定されていない場合、以下のコードブロックがスキップされます：

```typescript
if (weeklySpreadsheetId) {
  // スプレッドシート書き込み処理
  await updateStudentListSheet(...);
  await updateIndividualSheet(...);
} else {
  // ← ここが実行されてログも出ていない
}
```

### 2. エラーが発生しているが握りつぶされている

```typescript
try {
  // スプレッドシート書き込み
} catch (error) {
  console.error('[Auto Fetch] Spreadsheet update error:', error);
  // ← エラーは無視して処理は続行
}
```

## ✅ 確認方法

### Step 1: Renderのログを確認

Renderダッシュボード → Logs で以下のログを探してください：

**✅ 正常な場合:**
```
[Auto Fetch] Spreadsheet updated: 8 students
```

**❌ 環境変数が未設定の場合:**
```
[Auto Fetch] WEEKLY_ANALYTICS_SPREADSHEET_ID not set
```

**❌ エラーが発生している場合:**
```
[Auto Fetch] Spreadsheet update error: ...
```

### Step 2: 環境変数の確認

Renderダッシュボード → Environment → Environment Variables で以下を確認：

```
WEEKLY_ANALYTICS_SPREADSHEET_ID = <スプレッドシートID>
```

**スプレッドシートIDの取得方法：**

Google Sheetsを開いて、URLから取得：
```
https://docs.google.com/spreadsheets/d/【これがスプレッドシートID】/edit
```

例：
```
https://docs.google.com/spreadsheets/d/1ABC123def456GHI789jkl/edit
                                        ↑ この部分
```

## 🚀 解決手順

### 1. スプレッドシートの作成

1. **Google Sheetsで新規スプレッドシートを作成**
   - 名前: 「週次アナリティクスデータ」など

2. **サービスアカウントに共有**
   - スプレッドシートの「共有」をクリック
   - サービスアカウントのメールアドレスを追加（`GOOGLE_SERVICE_ACCOUNT` のJSONから取得）
   - 権限: **編集者**

3. **スプレッドシートIDをコピー**
   - URLから `1ABC...` の部分をコピー

### 2. Renderに環境変数を追加

1. **Renderダッシュボード**を開く
   - https://dashboard.render.com/

2. **対象サービス（vtuber-school-evaluation）を選択**

3. **Environment → Add Environment Variable**
   - Key: `WEEKLY_ANALYTICS_SPREADSHEET_ID`
   - Value: `<コピーしたスプレッドシートID>`

4. **Save Changes** をクリック

5. **自動デプロイを待つ**（約3-5分）

### 3. 再実行

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json" \
  --max-time 300
```

### 4. スプレッドシートを確認

以下の2つのシートが自動作成されているはずです：

1. **所属生一覧**
   - A列: 名前
   - B列: 学籍番号
   - C列以降: 週次データ

2. **個人データシート**（生徒ごと）
   - シート名: チャンネル名
   - A列: データ項目
   - B列以降: 週次データ

## 🐛 トラブルシューティング

### エラー: "Permission denied"

→ サービスアカウントに編集権限がない
- スプレッドシートの共有設定を確認
- サービスアカウントのメールアドレスが正しいか確認

### エラー: "Spreadsheet not found"

→ スプレッドシートIDが間違っている
- URLから正しいIDをコピー
- 環境変数に正しく設定されているか確認

### ログに何も出ない

→ 環境変数が未設定
- Renderの環境変数設定を確認
- デプロイが完了しているか確認

## 📝 次回以降の実行

環境変数を設定後は、以下のコマンドで実行するだけでOK：

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json"
```

週次Cronも自動で実行されます（毎週水曜 19:00 JST）。
