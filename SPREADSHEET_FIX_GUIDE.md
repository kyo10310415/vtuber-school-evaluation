# スプレッドシート書き込みが動作しない - 解決ガイド

## 📊 現状

✅ **データ取得は成功している**
- 8人の生徒のデータ取得完了
- エラー: 0件

❌ **スプレッドシートに書き込まれていない**

## 🎯 原因

**環境変数 `WEEKLY_ANALYTICS_SPREADSHEET_ID` が未設定**の可能性が高いです。

## 🔍 診断手順

以下のコマンドで環境変数の状態を確認してください：

```bash
curl https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test
```

**期待される結果：**
```json
{
  "success": true,
  "config": {
    "hasServiceAccount": true,
    "hasWeeklySpreadsheetId": true,
    "weeklySpreadsheetId": "1ABC...XYZ",  // ← NOT SET でないこと
    "oauthTokensCount": 8
  }
}
```

**❌ もし `hasWeeklySpreadsheetId: false` または `weeklySpreadsheetId: "NOT SET"` の場合：**

→ **環境変数が未設定です。以下の手順で設定してください。**

## ✅ 解決手順

### Step 1: Google Sheetsでスプレッドシートを作成

1. **Google Sheetsを開く**
   - https://sheets.google.com

2. **新規スプレッドシートを作成**
   - 名前: 「週次アナリティクスデータ」など

3. **スプレッドシートIDをコピー**
   - URLから取得：
   ```
   https://docs.google.com/spreadsheets/d/【これがID】/edit
   ```
   
   例：
   ```
   https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit
   ```
   → ID: `1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M`

### Step 2: サービスアカウントに共有

1. **スプレッドシートの右上「共有」をクリック**

2. **サービスアカウントのメールアドレスを追加**
   - `GOOGLE_SERVICE_ACCOUNT` のJSONから `client_email` を取得
   - 例: `vtuber-school-123456@project.iam.gserviceaccount.com`

3. **権限を「編集者」に設定**

4. **完了をクリック**

### Step 3: Renderに環境変数を追加

1. **Renderダッシュボードを開く**
   - https://dashboard.render.com/

2. **サービス「vtuber-school-evaluation」を選択**

3. **Environment タブをクリック**

4. **Add Environment Variable をクリック**
   - **Key**: `WEEKLY_ANALYTICS_SPREADSHEET_ID`
   - **Value**: `<Step 1でコピーしたスプレッドシートID>`

5. **Save Changes をクリック**

6. **自動デプロイを待つ**（約3-5分）

### Step 4: 再度実行

デプロイ完了後、再度curlを実行：

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json" \
  --max-time 300
```

### Step 5: スプレッドシートを確認

実行成功後、スプレッドシートに以下のシートが自動作成されます：

#### 1. **所属生一覧** シート
```
A列: 名前
B列: 学籍番号
C列以降: 週次データ（2026-02-02〜2026-02-08など）
```

#### 2. **個人データシート**（生徒ごと）
```
シート名: チャンネル名
A列: データ項目（総合視聴回数、総合視聴時間など33項目）
B列以降: 週次データ
```

## 🔧 トラブルシューティング

### エラー: "Permission denied"

**原因**: サービスアカウントに編集権限がない

**解決策**:
1. スプレッドシートの共有設定を確認
2. サービスアカウントのメールアドレスが正しいか確認
3. 権限が「編集者」になっているか確認

### エラー: "Spreadsheet not found"

**原因**: スプレッドシートIDが間違っている

**解決策**:
1. Google SheetsのURLから正しいIDをコピー
2. Renderの環境変数が正しく設定されているか確認
3. デプロイが完了しているか確認

### Renderログの確認方法

1. Renderダッシュボード → Logs
2. 以下のログを探す：

**✅ 成功:**
```
[Auto Fetch] Spreadsheet updated: 8 students
```

**❌ 環境変数未設定:**
```
[Auto Fetch] WEEKLY_ANALYTICS_SPREADSHEET_ID not set
```

**❌ エラー:**
```
[Auto Fetch] Spreadsheet update error: <エラー内容>
```

## 📝 設定後の動作

環境変数設定後は：

1. **手動実行**: 上記のcurlコマンドで実行
2. **自動実行**: 毎週水曜 19:00 JST に自動実行（Cron設定済み）

## 🎯 次のステップ

1. **診断エンドポイントを実行**
   ```bash
   curl https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test
   ```

2. **結果を確認**
   - `hasWeeklySpreadsheetId` が `false` の場合 → 上記手順で設定
   - `hasWeeklySpreadsheetId` が `true` の場合 → Renderログを確認

3. **結果を共有してください** 🙏
   - テストエンドポイントの出力
   - または Renderログのスクリーンショット
