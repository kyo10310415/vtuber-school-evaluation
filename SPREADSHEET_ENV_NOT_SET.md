# スプレッドシート書き込みエラー: 環境変数未設定

## 問題の症状

- ✅ UI上でデータ取得は成功している
- ❌ スプレッドシートに何も書き込まれない
- API レスポンスは `success: true` を返している

## 原因

**`WEEKLY_ANALYTICS_SPREADSHEET_ID` 環境変数が Render で設定されていない**

### コードの動作

```typescript
// src/index.tsx 行5396付近
const weeklySpreadsheetId = getEnv(c, 'WEEKLY_ANALYTICS_SPREADSHEET_ID');
if (weeklySpreadsheetId) {
  // スプレッドシート更新処理
  console.log('[Auto Fetch] Starting spreadsheet update...');
  // ...
} else {
  // weeklySpreadsheetId が無いとスキップされる（ログも出ない）
}
```

この条件分岐により、環境変数が設定されていない場合はスプレッドシートへの書き込みが**完全にスキップ**されます。

## 解決手順

### 1. スプレッドシートIDを確認

週次アナリティクス用のスプレッドシートを開き、URLからIDをコピー:

```
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
                                        ^^^^^^^^^^^^^^^^^^^^
                                        この部分をコピー
```

**例**:
- URL: `https://docs.google.com/spreadsheets/d/1abc123xyz456/edit`
- ID: `1abc123xyz456`

### 2. サービスアカウントに共有権限を付与

1. スプレッドシートの右上「共有」ボタンをクリック
2. サービスアカウントのメールアドレスを追加:
   - `GOOGLE_SERVICE_ACCOUNT` の `client_email` フィールド
   - 例: `vtuber-evaluation@project-id.iam.gserviceaccount.com`
3. 権限を「編集者」に設定
4. 「送信」をクリック

### 3. Render で環境変数を設定

#### 手順

1. **Render ダッシュボードにアクセス**
   - https://dashboard.render.com/

2. **サービスを選択**
   - `vtuber-school-evaluation` をクリック

3. **Environment タブを開く**
   - 左メニューから「Environment」を選択

4. **環境変数を追加**
   - 「Add Environment Variable」をクリック
   - **Key**: `WEEKLY_ANALYTICS_SPREADSHEET_ID`
   - **Value**: `{スプレッドシートID}` （例: `1abc123xyz456`）
   - 「Save Changes」をクリック

5. **サービスを再デプロイ**
   - 環境変数を追加すると自動的に再デプロイされます
   - または、「Manual Deploy」→「Deploy latest commit」で手動デプロイ

### 4. 動作確認

#### 4.1 環境変数の確認

```bash
curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env | jq .
```

**期待される出力**:
```json
{
  "success": true,
  "env": {
    "WEEKLY_ANALYTICS_SPREADSHEET_ID": "1abc123xyz456",
    "hasServiceAccount": true,
    "serviceAccountLength": 2358,
    "ANALYTICS_TARGET_SPREADSHEET_ID": "1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M"
  },
  "message": "WEEKLY_ANALYTICS_SPREADSHEET_ID is configured"
}
```

**❌ 環境変数が未設定の場合**:
```json
{
  "success": true,
  "env": {
    "WEEKLY_ANALYTICS_SPREADSHEET_ID": "NOT SET",
    ...
  },
  "message": "⚠️ WEEKLY_ANALYTICS_SPREADSHEET_ID is NOT SET - spreadsheet updates will be skipped"
}
```

#### 4.2 週次データ取得テスト

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json" \
  --max-time 300
```

**期待される出力**:
```json
{
  "success": true,
  "period": {
    "startDate": "2026-03-09",
    "endDate": "2026-03-15"
  },
  "summary": {
    "total": 10,
    "success": 8,
    "errors": 0
  },
  "results": [...]
}
```

#### 4.3 スプレッドシートを確認

1. **所属生一覧シート**
   - 自動作成されているはず
   - A列: 名前
   - B列: 学籍番号
   - C列: キャラクター名
   - D列: 週ラベル（1行目）、データ項目名（2行目）、データ（3行目以降）

2. **個人シート（例: 岡本恵里奈_OLST230013_OS）**
   - 生徒ごとに自動作成
   - A列: データ項目名
   - B列以降: 週ごとのデータ（ヘッダーに週ラベル）

## Render ログで確認すべき内容

環境変数が正しく設定されている場合、以下のログが出力されるはずです:

```
[Auto Fetch] Starting spreadsheet update...
[Auto Fetch] Spreadsheet ID: 1abc123xyz456
[Auto Fetch] Students to update: 8
[Auto Fetch] Importing google-client...
[Auto Fetch] Getting access token...
[Auto Fetch] Access token obtained
[Auto Fetch] Importing weekly-analytics-spreadsheet...
[Auto Fetch] Functions imported successfully
[Auto Fetch] Updating student list sheet...
[WeeklySpreadsheet] Updated 所属生一覧 with 8 students, 33 data items
[Auto Fetch] Student list sheet updated
[Auto Fetch] Updating individual sheets...
[Auto Fetch] Updating sheet for: 岡本恵里奈 (えりな)
[WeeklySpreadsheet] Updated 岡本恵里奈_OLST230013_OS for 岡本恵里奈
...
```

環境変数が未設定の場合、これらのログは**一切出力されません**。

## トラブルシューティング

### 1. 環境変数が設定できない

**原因**: Render の無料プランでは環境変数の数に制限がある可能性

**解決策**:
1. 既存の不要な環境変数を削除
2. 有料プランへのアップグレードを検討

### 2. スプレッドシートへのアクセス権限エラー

**エラーメッセージ**: `403 Forbidden` または `The caller does not have permission`

**原因**: サービスアカウントに共有権限が付与されていない

**解決策**:
1. スプレッドシートの共有設定を確認
2. サービスアカウントのメールアドレスが正しいか確認
3. 権限を「編集者」に設定（閲覧者では書き込めない）

### 3. スプレッドシートが見つからない

**エラーメッセージ**: `404 Not Found` または `Requested entity was not found`

**原因**: スプレッドシートIDが間違っている

**解決策**:
1. スプレッドシートのURLを再確認
2. IDをコピー＆ペーストし直す
3. 余分なスペースや改行が入っていないか確認

### 4. データは書き込まれるが構造が違う

**原因**: 以前のバグで間違った構造が作成された可能性

**解決策**:
1. スプレッドシートの問題のシートを削除
2. 再度データ取得を実行（シートは自動作成される）
3. または、[SPREADSHEET_UPDATE_FIX.md](./SPREADSHEET_UPDATE_FIX.md) を参照して手動修正

## 完全なセットアップチェックリスト

- [ ] 週次アナリティクス用のスプレッドシートを作成
- [ ] スプレッドシートIDをコピー
- [ ] サービスアカウントに編集権限を付与
- [ ] Render で `WEEKLY_ANALYTICS_SPREADSHEET_ID` 環境変数を設定
- [ ] Render サービスを再デプロイ
- [ ] `/api/analytics/check-env` で環境変数を確認
- [ ] `/api/analytics/auto-fetch` でデータ取得テスト
- [ ] スプレッドシートに「所属生一覧」シートが作成されている
- [ ] 個人シート（チャンネル名）が作成されている
- [ ] データが正しく書き込まれている

## 関連ドキュメント

- [週次アナリティクス セットアップ](./WEEKLY_ANALYTICS_SETUP.md)
- [スプレッドシート更新ロジック修正](./SPREADSHEET_UPDATE_FIX.md)
- [週次アナリティクス自動実行セットアップ](./WEEKLY_ANALYTICS_AUTO_SETUP.md)
- [環境変数チェックガイド](./ENV_CHECK_GUIDE.md)

## まとめ

**根本原因**: `WEEKLY_ANALYTICS_SPREADSHEET_ID` 環境変数が Render で設定されていない

**解決策**: Render の Environment タブで環境変数を追加し、再デプロイする

この環境変数が設定されていない限り、スプレッドシートへの書き込みは行われません（コードでスキップされる）。
