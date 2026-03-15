# スプレッドシート書き込みエラー修正 (コード修正後)

## 問題の原因

コミット `74431b3` でのスプレッドシート更新ロジック修正時に、**列インデックスの計算エラー**が発生していました。

### バグ箇所

**src/lib/weekly-analytics-spreadsheet.ts 行131:**
```typescript
// ❌ 間違い
getColumnLetter(weekStartColumn + dataValues.length)

// weekStartColumn = 3 (変数値)
// dataValues.length = 33
// 3 + 33 = 36列目 = 列J（本来はAJ列 = 36列目のはず）

// ✅ 正しい
getColumnLetter(3 + dataValues.length)

// 3 (A,B,C列) + 33 = 36列目 = 列AJ
```

この計算エラーにより、スプレッドシートへの書き込み範囲が間違い、Google Sheets API がエラーを返していた可能性があります。

## 修正内容

### 1. 列インデックス計算の修正

**修正前:**
```typescript
await fetch(
  `...!D${actualRowIndex}:${getColumnLetter(weekStartColumn + dataValues.length)}${actualRowIndex}?valueInputOption=RAW`,
  ...
);
```

**修正後:**
```typescript
await fetch(
  `...!D${actualRowIndex}:${getColumnLetter(3 + dataValues.length)}${actualRowIndex}?valueInputOption=RAW`,
  ...
);
```

**理由**: `weekStartColumn` は変数として定義されていますが、実際の値は常に `3` です。しかし、列の終了位置は「A,B,C の3列 + データ列数」なので、直接 `3 + dataValues.length` を計算すべきです。

### 2. 詳細ログの追加

**追加ログ:**
```typescript
// 所属生一覧シート更新開始
console.log(`[WeeklySpreadsheet] Updating student list sheet for ${students.length} students`);

// 個人シート処理開始
console.log(`[WeeklySpreadsheet] Processing individual sheet: ${sheetName}`);
```

**目的**: スプレッドシート更新処理がどこまで進んでいるかを追跡し、エラー発生箇所を特定しやすくする。

## 修正履歴

- **2026-03-15**: コミット `aaf9784`
- GitHub: https://github.com/kyo10310415/vtuber-school-evaluation/commit/aaf9784

## 次のステップ（必須）

### 1. Render で再デプロイ

1. Render ダッシュボードにアクセス: https://dashboard.render.com/
2. `vtuber-school-evaluation` サービスを選択
3. **Manual Deploy** → **Deploy latest commit** をクリック
4. デプロイ完了まで 3-5 分待機

### 2. 動作確認

```bash
# 週次データ取得テスト
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json" \
  --max-time 300
```

**期待される出力:**
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
  }
}
```

### 3. Render ログで確認

デプロイ後、Render のログに以下が表示されるはずです:

```
[Auto Fetch] Starting spreadsheet update...
[Auto Fetch] Spreadsheet ID: 1abc123xyz456
[Auto Fetch] Students to update: 8
[WeeklySpreadsheet] Updating student list sheet for 8 students
[WeeklySpreadsheet] Updated 所属生一覧 with 8 students, 33 data items
[WeeklySpreadsheet] Processing individual sheet: 岡本恵里奈_OLST230013_OS
[WeeklySpreadsheet] Updated 岡本恵里奈_OLST230013_OS for 岡本恵里奈
[WeeklySpreadsheet] Processing individual sheet: 橋本結奈_OLST240115_WY
[WeeklySpreadsheet] Updated 橋本結奈_OLST240115_WY for 橋本結奈
...
[Auto Fetch] Spreadsheet updated: 8 students
```

**❌ エラーが出る場合:**
```
[Auto Fetch] Failed to update spreadsheet: ...
[Auto Fetch] Error stack: ...
```

エラーメッセージの内容を確認してください。

### 4. スプレッドシート確認

#### 所属生一覧シート
- ✅ A列: 名前
- ✅ B列: 学籍番号
- ✅ C列: キャラクター名
- ✅ D列 (1行目): 週ラベル `2026-03-09~2026-03-15`
- ✅ D列以降 (2行目): データ項目名
- ✅ 3行目以降: データ

**データ項目数**: 33項目（現在のチャンネル登録者数、総視聴回数、...、ライブ: 登録者減少）

**終了列**: D列 + 33項目 = AJ列（36列目）

#### 個人シート（例: 岡本恵里奈_OLST230013_OS）
- ✅ A列: データ項目名（初回のみ書き込み、以降保持）
- ✅ B列: 前回のデータ（保持）
- ✅ C列: 最新データ（新規追加）
- ✅ C列 (1行目): 週ラベル `2026-03-09~2026-03-15`

## トラブルシューティング

### 1. まだスプレッドシートに書き込まれない

**確認項目:**
1. Render で最新コミット (`aaf9784`) がデプロイされているか
2. `WEEKLY_ANALYTICS_SPREADSHEET_ID` 環境変数が設定されているか
3. サービスアカウントに編集権限が付与されているか

**確認方法:**
```bash
# 環境変数確認
curl https://vtuber-school-evaluation.onrender.com/api/analytics/check-env | jq .

# 期待される出力:
# {
#   "WEEKLY_ANALYTICS_SPREADSHEET_ID": "1abc123xyz456",
#   "hasServiceAccount": true,
#   ...
# }
```

### 2. エラー: "Invalid range"

**原因**: 列インデックス計算がまだ間違っている可能性

**解決策**:
1. Render ログでエラーメッセージの詳細を確認
2. エラーメッセージに表示されている範囲（例: `D3:J3`）を確認
3. 正しい範囲は `D3:AJ3`（33データ項目）のはず

### 3. エラー: "The caller does not have permission"

**原因**: サービスアカウントに編集権限が無い

**解決策**:
1. スプレッドシートの共有設定を確認
2. サービスアカウント（`client_email`）を「編集者」として追加
3. 再度データ取得を実行

### 4. 部分的に書き込まれる（所属生一覧のみ成功、個人シートは失敗）

**原因**: 個人シート名にエラーがある可能性

**解決策**:
1. Render ログで `[WeeklySpreadsheet] Processing individual sheet:` の後のシート名を確認
2. シート名が100文字を超えていないか確認
3. 特殊文字（`/ \ ? * [ ]`）が含まれていないか確認（自動で `_` に置換されるはず）

## データ構造イメージ

### 所属生一覧シート

```
      A          B           C         D       E      F    ...   AJ
1                                    2026-03-09~2026-03-15
2    名前      学籍番号   キャラ名  登録者数  視聴回数  ...  登録者減少
3   岡本恵里奈  OLST230013  えりな    12500    52000   ...      5
4   橋本結奈   OLST240115   ゆな      8500    35000   ...      3
```

- **列数**: A,B,C (3列) + 33データ項目 = 36列（A〜AJ）
- **データ範囲**: D3:AJ3, D4:AJ4, ...

### 個人シート（岡本恵里奈_OLST230013_OS）

```
                    A                      B                 C
1                                   2026-03-02~03-08  2026-03-09~03-15
2   現在のチャンネル登録者数              12000            12500
3          総視聴回数                    50000            52000
...
```

- **A列**: ラベル（初回のみ、以降保持）
- **B列以降**: 週ごとのデータ（追加のみ、上書きなし）

## まとめ

✅ **修正内容**: 列インデックス計算エラーの修正 + 詳細ログ追加  
✅ **コミット**: `aaf9784`  
✅ **次のステップ**: Render で再デプロイ → ログ確認 → スプレッドシート確認

再デプロイ後、スプレッドシートに正しくデータが書き込まれることを確認してください。問題が続く場合は、Render のログ全文を確認してエラーの詳細を特定してください。
