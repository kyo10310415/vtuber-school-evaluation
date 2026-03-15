# 週次アナリティクス スプレッドシート更新ロジック修正

## 問題

週次アナリティクスのスプレッドシート更新で以下の不具合が発生:

### 【想定動作】
1. **所属生一覧シート**: 最新の値のみ表示（A-C列は保持、D列以降を最新データで上書き）
2. **個人シート（各生徒）**: 新しい列に最新データを追加、既存列のデータは保持
   - 例: B列にデータがある時 → C列に最新データ追加、B列は保持

### 【実際の動作（バグ）】
1. ❌ 所属生一覧シートが更新されない
2. ❌ 個人シートでC列に最新データが書き込まれるが、B列のデータが消える

## 原因

### 1. 所属生一覧シートのロジックエラー

**元のコード（src/lib/weekly-analytics-spreadsheet.ts 行48-56）:**
```typescript
// 既存の週データがあるかチェック（最初のデータ項目で判定）
weekStartColumn = headers.indexOf(dataItemLabels[0]);

// 新しい週のデータを追加
if (weekStartColumn === -1) {
  weekStartColumn = headers.length;
  headers.push(...dataItemLabels);
  // ...
}
```

**問題点**: 
- 既存データの有無を `indexOf()` で判定していた
- 毎回条件が false になり、ヘッダーが更新されなかった
- データ書き込み位置が不正確だった

### 2. 個人シートで既存データを削除

**元のコード（行233）:**
```typescript
const rows = dataItems.map(item => [item.label, ...Array(weekHeaders.length - 1).fill(''), item.value]);
```

**問題点**:
- `Array(...).fill('')` で既存列を空文字で上書きしていた
- A列〜最終列まで一括で書き込んでいたため、既存データが消えた

## 解決策

### 修正1: 所属生一覧シートの更新ロジック

```typescript
// 所属生一覧シートは常に最新の値のみ表示するため、既存データをクリア
const weekStartColumn = 3; // D列から開始（A:名前, B:学籍番号, C:キャラクター名）

// ヘッダーを更新（既存のA-C列は保持、D列以降をデータ項目で上書き）
const newHeaders = ['名前', '学籍番号', 'キャラクター名', ...dataItemLabels];

// 1行目に週ラベルを追加（D列）
await fetch(
  `...!D1?valueInputOption=RAW`,
  { ... body: { values: [[weekLabel]] } }
);

// 2行目のヘッダー行を更新
await fetch(
  `...!A2:${getColumnLetter(newHeaders.length)}2?valueInputOption=RAW`,
  { ... body: { values: [newHeaders] } }
);
```

**改善点**:
- D列（4列目）から固定でデータ開始
- A-C列（名前・学籍番号・キャラクター名）は保持
- D列以降を最新データで上書き

### 修正2: 個人シートのデータ保持

```typescript
// 既存のデータ項目ラベル（A列）を取得
const existingLabelsResponse = await fetch(
  `...!A2:A${dataItems.length + 1}`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);

let hasExistingLabels = false;
if (existingLabelsResponse.ok) {
  const labelsData = await existingLabelsResponse.json();
  hasExistingLabels = labelsData.values && labelsData.values.length > 0;
}

// A列のラベルが無い場合のみ書き込み
if (!hasExistingLabels) {
  const labelRows = dataItems.map(item => [item.label]);
  await fetch(
    `...!A2:A${dataItems.length + 1}?valueInputOption=RAW`,
    { ... body: { values: labelRows } } }
  );
}

// 新しい列（newColumnIndex列）にのみデータを書き込み
const valueRows = dataItems.map(item => [item.value]);
await fetch(
  `...!${getColumnLetter(newColumnIndex)}2:${getColumnLetter(newColumnIndex)}${dataItems.length + 1}?valueInputOption=RAW`,
  { ... body: { values: valueRows } } }
);
```

**改善点**:
- A列のラベルは初回のみ書き込み
- 新しい列にのみデータを書き込む（既存列は触らない）
- `Array().fill('')` を使わず、既存データを保持

## データ構造

### 所属生一覧シート構造

```
         A          B           C              D              E       ...
1                                        2026-03-02~03-08
2      名前      学籍番号   キャラクター名   現在のチャンネル  総視聴回数  ...
3     岡本恵里奈  OLST230013   えりな          12000          50000
4     橋本結奈   OLST240115    ゆな           8500           35000
```

**更新時の動作**:
- A-C列: 保持（生徒情報は変わらない）
- D列以降: 最新データで上書き（前回のデータは削除）

### 個人シート（チャンネル別）構造

```
                    A                      B                 C          ...
1                                   2026-02-23~03-01  2026-03-02~03-08
2   現在のチャンネル登録者数              11500            12000
3          総視聴回数                    48000            50000
4        総視聴時間（分）                 8500             9200
5         総高評価数                     1200             1280
6     純登録者数（増減）                   +45              +50
```

**更新時の動作**:
- A列: ラベル（初回のみ書き込み、以降は保持）
- B列: 前回のデータ（保持）
- C列: 新しいデータ（追加）
- D列以降: さらに新しいデータ（追加）

## 修正履歴

- **2026-03-15**: 初回修正
- コミット: `74431b3 - fix: Correct weekly analytics spreadsheet update logic`
- GitHub: https://github.com/kyo10310415/vtuber-school-evaluation/commit/74431b3

## 次のステップ（必須）

### 1. Render で再デプロイ

1. Render ダッシュボードにアクセス: https://dashboard.render.com/
2. `vtuber-school-evaluation` サービスを選択
3. **Manual Deploy** → **Deploy latest commit** をクリック
4. デプロイ完了まで 3-5 分待機

### 2. 動作確認（手動テスト）

```bash
# テストエンドポイント確認
curl https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test

# 期待される出力:
# {
#   "tokenCount": 10,
#   "studentsCount": 8,
#   ...
# }

# 週次データ取得実行（バックアップとして既存データを保存しておく）
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch \
  -H "Content-Type: application/json" \
  --max-time 300

# 期待される出力:
# {
#   "success": true,
#   "period": {
#     "startDate": "2026-03-09",
#     "endDate": "2026-03-15"
#   },
#   "summary": {
#     "total": 10,
#     "success": 8,
#     "errors": 0
#   }
# }
```

### 3. スプレッドシート確認

#### 所属生一覧シート
- ✅ A-C列（名前・学籍番号・キャラクター名）が保持されている
- ✅ D列のヘッダー（1行目）に週ラベル `2026-03-09~2026-03-15` がある
- ✅ D列以降（2行目）にデータ項目名がある
- ✅ 3行目以降に最新データがある
- ✅ 前回のデータ（D列以降）は最新データで上書きされている

#### 個人シート（例: 岡本恵里奈_OLST230013_OS）
- ✅ A列のラベルが保持されている
- ✅ B列の前回データが保持されている
- ✅ C列に最新データが追加されている
- ✅ C列のヘッダー（1行目）に週ラベル `2026-03-09~2026-03-15` がある

## トラブルシューティング

### 1. 所属生一覧シートが更新されない

**原因**: API エンドポイントエラーまたはタイムアウト

**解決策**:
```bash
# Render ログを確認
# ログに "[WeeklySpreadsheet] Updated 所属生一覧 with X students" があるか確認

# なければ、GitHub Actions の weekly-analytics ワークフローを手動実行
# https://github.com/kyo10310415/vtuber-school-evaluation/actions
```

### 2. 個人シートで既存データが消えている

**原因**: 旧バージョンのコードで実行された可能性

**解決策**:
1. Render で最新コミットをデプロイ（上記ステップ1参照）
2. スプレッドシートの履歴から復元:
   - File → Version history → See version history
   - エラー発生前の版を探して復元
3. 再度データ取得を実行

### 3. エラー: "Failed to update individual sheet"

**原因**: シート名が100文字を超えている、または特殊文字を含む

**解決策**:
```typescript
// src/lib/weekly-analytics-spreadsheet.ts の sanitizeSheetName() が自動で処理
// 手動対応が必要な場合:
// 1. スプレッドシートで該当シート名を手動リネーム
// 2. 特殊文字 / \ ? * [ ] を削除
// 3. 100文字以内に短縮
```

### 4. データが重複して書き込まれる

**原因**: 複数回実行された可能性

**確認方法**:
```bash
# analytics_history テーブルで重複チェック
# PostgreSQL の UNIQUE 制約により、同一 student_id + date range の重複は防止される
```

## 関連ドキュメント

- [週次アナリティクス自動実行セットアップ](./WEEKLY_ANALYTICS_AUTO_SETUP.md)
- [週次アナリティクスエラー修正](./WEEKLY_ANALYTICS_ERROR_FIX.md)
- [UIボタンエラー修正](./UI_BUTTON_ERROR_FIX.md)
- [手動実行ガイド](./MANUAL_EXECUTION_GUIDE.md)
- [README](./README.md)

## テスト結果（予想）

修正後の動作:

```
# 1回目実行（2026-03-02~03-08）
所属生一覧:
  A    B           C          D           E        ...
  名前 学籍番号  キャラ名  登録者数  視聴回数
  岡本 OLST230013  えりな    12000     50000

個人シート（岡本恵里奈）:
  A              B
  ラベル      2026-03-02~03-08
  登録者数       12000
  視聴回数       50000

# 2回目実行（2026-03-09~03-15）
所属生一覧:
  A    B           C          D           E        ...
  名前 学籍番号  キャラ名  登録者数  視聴回数
  岡本 OLST230013  えりな    12500     52000    ← D列以降が上書き

個人シート（岡本恵里奈）:
  A              B                C
  ラベル      2026-03-02~03-08  2026-03-09~03-15
  登録者数       12000            12500           ← C列に追加、B列保持
  視聴回数       50000            52000
```

## まとめ

✅ **所属生一覧シート**: 常に最新データのみ表示（A-C列保持、D列以降上書き）
✅ **個人シート**: 時系列データを横に追加（既存列保持、新列追加）
✅ **データ保持**: 既存データを削除せず、履歴として保存

これで週次アナリティクスのスプレッドシート更新が正しく動作するようになります。
