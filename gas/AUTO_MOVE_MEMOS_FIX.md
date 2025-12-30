# トークメモ自動移動システム - 修正版

## 🔴 修正内容

### 問題点
学籍番号がGoogleカレンダーにないトークメモが、誤って別のフォルダに移動されてしまう。

### 原因
`findStudentIdFromCalendar`関数が`null`を返した場合でも、そのまま処理が継続され、`null`の学籍番号でフォルダ移動が実行されていた。

### 修正内容

#### 1. 学籍番号がない場合の処理を追加

**修正前**:
```javascript
const studentId = findStudentIdFromCalendar(accountEmail, createdDate);

if (!studentId) {
  console.log(`  → 学籍番号が見つかりません (スキップ)`);
  continue;  // ❌ ただスキップするだけ（元のフォルダに残る）
}
```

**修正後**:
```javascript
const studentId = findStudentIdFromCalendar(accountEmail, createdDate);

if (!studentId) {
  console.log(`  ❌ 学籍番号が見つかりません`);
  console.log(`  → 処理対象外フォルダに移動します`);
  
  // 🔴 処理対象外フォルダに移動
  const unprocessableFolder = getUnprocessableFolder();
  file.moveTo(unprocessableFolder);
  unprocessable++;
  
  console.log(`  ✓ 移動完了: ${unprocessableFolder.getName()}`);
  continue;
}
```

#### 2. 処理対象外フォルダの追加

学籍番号がないメモを「処理対象外（学籍番号なし）」フォルダに移動します。

```javascript
/**
 * 処理対象外フォルダを取得または作成
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getUnprocessableFolder() {
  // 設定でフォルダIDが指定されている場合
  if (UNPROCESSABLE_FOLDER_ID) {
    return DriveApp.getFolderById(UNPROCESSABLE_FOLDER_ID);
  }
  
  // 親フォルダ内に「処理対象外」フォルダを検索または作成
  const parentFolder = DriveApp.getFolderById(STUDENT_FOLDERS_PARENT_ID);
  const folderName = '処理対象外（学籍番号なし）';
  
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  
  console.log(`📁 処理対象外フォルダを作成: ${folderName}`);
  return parentFolder.createFolder(folderName);
}
```

#### 3. ログ出力の改善

処理状況を詳細に記録：
- 処理対象外の件数を追加
- 各ファイルの処理ステップを明確化
- 学籍番号の検索プロセスを可視化

#### 4. 統計情報の拡充

**修正前**:
```
総処理数: 25件
総移動数: 20件
総エラー数: 0件
```

**修正後**:
```
総処理数: 25件
総移動数: 20件
処理対象外: 3件  ← 追加
スキップ: 2件
総エラー数: 0件
```

---

## 📂 フォルダ構造

```
学籍番号フォルダ親 (18YfaP1CrW5Lq_sAeVAR56tIRZR3GwMDS)
├── OLTS240488-AR/          ← 学籍番号あり（正常）
│   ├── メモ1.gdoc
│   └── メモ2.gdoc
├── OLTS240489-XX/
│   └── メモ3.gdoc
└── 処理対象外（学籍番号なし）/  ← 新規追加（学籍番号なし）
    ├── メモ4.gdoc
    └── メモ5.gdoc
```

---

## 🔧 セットアップ

### 1. 修正版スクリプトを適用

1. **Apps Scriptエディタを開く**
   - スプレッドシートまたはGoogle Driveから `拡張機能` → `Apps Script`

2. **既存のスクリプトをバックアップ**
   - 現在のコードをコピーして別の場所に保存

3. **修正版スクリプトをコピー＆ペースト**
   - `/home/user/webapp/gas/AutoMoveMemos_Fixed.gs` の内容をコピー
   - 既存のコードを全て削除
   - 修正版コードをペースト

4. **保存**
   - `Ctrl + S` (Mac: `Cmd + S`)

### 2. 設定の確認

```javascript
// アカウントマッピングスプレッドシートID
const ACCOUNT_MAPPING_SPREADSHEET_ID = '1gFrIbkRxNcpKuT0vRNfaUdSrJWynlCdfqhGQz9vWwWo';

// 学籍番号フォルダの親フォルダID
const STUDENT_FOLDERS_PARENT_ID = '18YfaP1CrW5Lq_sAeVAR56tIRZR3GwMDS';

// 処理対象外フォルダのID（オプション）
const UNPROCESSABLE_FOLDER_ID = null; // 自動作成の場合はnull
```

### 3. テスト実行

**テスト1: 処理対象外フォルダの作成確認**
```javascript
testUnprocessableFolder()
```

**テスト2: メモ1件の処理テスト**
```javascript
testAutoMoveMemos()
```

**テスト3: カレンダーイベントの検索テスト**
```javascript
testCalendarEvents()
```

### 4. 本番実行

```javascript
autoMoveMemos()
```

---

## 🧪 テスト方法

### テスト1: 処理対象外フォルダの作成

1. Apps Scriptエディタで `testUnprocessableFolder` を実行
2. 「実行ログ」を確認
3. Google Driveで親フォルダを確認
4. 「処理対象外（学籍番号なし）」フォルダが作成されているか確認

**期待される出力**:
```
=== 処理対象外フォルダのテスト ===
フォルダ名: 処理対象外（学籍番号なし）
フォルダURL: https://drive.google.com/...
フォルダID: ...
✓ 処理対象外フォルダの取得に成功しました
```

### テスト2: メモ1件の処理

1. Apps Scriptエディタで `testAutoMoveMemos` を実行
2. 「実行ログ」を確認
3. 学籍番号が見つかるか確認

**期待される出力（学籍番号あり）**:
```
=== テスト実行: トークメモ自動移動 ===
テスト対象: example@example.com

テストファイル: Gemini Generated Summary for...
作成日時: 2025/12/29 15:30:00
  カレンダー検索: 15:00:00 ～ 16:00:00
  イベント数: 2件
    - イベント: トークメモ
      ✓ 学籍番号発見: OLTS240488-AR

✓ 学籍番号: OLTS240488-AR
移動先フォルダ: OLTS240488-AR

テスト完了（実際の移動は行いません）
```

**期待される出力（学籍番号なし）**:
```
=== テスト実行: トークメモ自動移動 ===
...
  カレンダー検索: 15:00:00 ～ 16:00:00
  イベント数: 1件
    - イベント: 会議
      学籍番号なし
  学籍番号が見つかりませんでした

❌ 学籍番号が見つかりません
→ 処理対象外フォルダに移動されます
移動先: 処理対象外（学籍番号なし）

テスト完了（実際の移動は行いません）
```

### テスト3: 本番実行（少量）

1. Meet Recordingsフォルダに2～3件のメモを残す
2. `autoMoveMemos` を実行
3. 結果を確認

**期待される出力**:
```
=== トークメモ自動移動開始 ===
実行日時: 2025/12/29 15:00:00
処理対象アカウント数: 3

--- 処理中: example1@example.com ---
Meet Recordingsフォルダ: Meet Recordings

[1] 処理中: Gemini Generated Summary for...
  作成日時: 2025/12/29 15:30:00
  カレンダー検索: 15:00:00 ～ 16:00:00
  イベント数: 1件
    - イベント: トークメモ
      ✓ 学籍番号発見: OLTS240488-AR
  ✓ 学籍番号: OLTS240488-AR
  ✓ 移動完了: OLTS240488-AR

[2] 処理中: Gemini Generated Summary for...
  作成日時: 2025/12/29 16:00:00
  カレンダー検索: 15:30:00 ～ 16:30:00
  イベント数: 0件
  学籍番号が見つかりませんでした
  ❌ 学籍番号が見つかりません
  → 処理対象外フォルダに移動します
  ✓ 移動完了: 処理対象外（学籍番号なし）

処理完了: 処理2件 / 移動1件 / 処理対象外1件 / スキップ0件 / エラー0件

=== トークメモ自動移動完了 ===
総処理数: 2件
総移動数: 1件
処理対象外: 1件
スキップ: 0件
総エラー数: 0件
```

---

## 📊 動作フロー

```
[メモファイルを取得]
    ↓
[Googleドキュメントか確認]
    ├─ Yes → 処理継続
    └─ No  → スキップ
    ↓
[カレンダーから学籍番号を検索]
    ↓
[学籍番号が見つかったか？]
    ├─ Yes → 学籍番号フォルダに移動
    │         ├─ フォルダ存在？
    │         │   ├─ Yes → そのまま移動
    │         │   └─ No  → フォルダ作成 → 移動
    │         └─ 完了
    │
    └─ No  → 処理対象外フォルダに移動
              ├─ フォルダ存在？
              │   ├─ Yes → そのまま移動
              │   └─ No  → フォルダ作成 → 移動
              └─ 完了
```

---

## 🔍 トラブルシューティング

### Q1: 処理対象外フォルダが作成されない

**原因**: 親フォルダへのアクセス権限がない

**解決策**:
1. `STUDENT_FOLDERS_PARENT_ID` が正しいか確認
2. Google Driveで親フォルダへのアクセス権限を確認
3. Apps Scriptの権限を再承認

### Q2: 学籍番号があるメモも処理対象外に移動される

**原因**: カレンダーイベントの検索範囲が狭い

**解決策**:
1. `CALENDAR_SEARCH_RANGE_MINUTES` を増やす（デフォルト: 30分）
2. カレンダーの説明欄に学籍番号が正しく入力されているか確認
3. `testCalendarEvents` でカレンダーイベントを確認

### Q3: メモがMeet Recordingsフォルダに残る

**原因**: スクリプトが実行されていない

**解決策**:
1. トリガーが設定されているか確認
2. 手動で `autoMoveMemos` を実行してテスト
3. 実行ログを確認

---

## 📝 チェックリスト

実装前の確認:
- [ ] 既存スクリプトをバックアップ
- [ ] 修正版スクリプトをコピー＆ペースト
- [ ] 設定値を確認（スプレッドシートID、フォルダID）
- [ ] `testUnprocessableFolder` を実行して処理対象外フォルダを作成
- [ ] `testAutoMoveMemos` を実行してテスト
- [ ] `testCalendarEvents` を実行してカレンダーイベントを確認
- [ ] 少量のメモで本番実行テスト
- [ ] 結果を確認（移動先フォルダ、処理対象外フォルダ）
- [ ] トリガーを設定（2時間おき）

---

## 📞 サポート

- スクリプトファイル: `/home/user/webapp/gas/AutoMoveMemos_Fixed.gs`
- GitHub: https://github.com/kyo10310415/vtuber-school-evaluation/tree/main/gas

---

**最終更新**: 2025-12-29  
**バージョン**: 2.0.0 (修正版)
