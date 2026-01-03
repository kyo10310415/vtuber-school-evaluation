# 生徒情報自動更新エラー修正ガイド

## 🔴 エラー内容

### エラーメッセージ
```
Exception: Cannot call SpreadsheetApp.getUi() from this context.
```

### エラー発生箇所
- 関数: `updateSNSAccounts`
- トリガー: 時間ベース（自動実行）
- 発生日時: 2026/1/2 15:12, 2026/1/3 15:12

---

## 🔍 原因

`SpreadsheetApp.getUi()` メソッドは、**ユーザーがスプレッドシートを開いている時のみ使用可能**です。

時間ベースのトリガー（自動実行）では、以下のUIメソッドが使用できません：
- `SpreadsheetApp.getUi()`
- `ui.alert()`
- `ui.prompt()`
- `ui.toast()`

### 問題のコード（90行目）

```javascript
SpreadsheetApp.getUi().alert(`更新完了\n\n${updateCount}件の生徒のSNSアカウント情報を更新しました。\n${notFoundCount}件の生徒はNotionデータに見つかりませんでした。`);
```

---

## ✅ 修正内容

### 修正1: 自動実行用関数からUI依存コードを削除

**修正前**:
```javascript
function updateSNSAccounts() {
  // ... 処理 ...
  
  SpreadsheetApp.getUi().alert('更新完了');  // ❌ トリガーでエラー
}
```

**修正後**:
```javascript
function updateSNSAccounts() {
  console.log('=== SNSアカウント情報更新開始 ===');
  
  // ... 処理 ...
  
  console.log(`✅ 更新完了: ${updateCount}件更新, ${notFoundCount}件見つからず`);
  console.log(`更新サマリー: ${updateCount}件の生徒のSNSアカウント情報を更新しました。`);
  
  console.log('=== SNSアカウント情報更新完了 ===');
}
```

### 修正2: 手動実行用関数を追加（UI付き）

スプレッドシートから手動で実行する場合は、UI付きの関数を使用：

```javascript
function updateSNSAccountsManual() {
  const ui = SpreadsheetApp.getUi();
  
  // 確認ダイアログ
  const response = ui.alert(
    'SNSアカウント情報更新',
    'NotionデータからSNSアカウント情報を更新しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    ui.alert('キャンセルしました');
    return;
  }
  
  try {
    // ... 処理 ...
    
    // 結果をダイアログで表示
    ui.alert(
      '更新完了',
      `${updateCount}件の生徒のSNSアカウント情報を更新しました。`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    ui.alert('エラー', `更新中にエラーが発生しました:\n${error.message}`, ui.ButtonSet.OK);
  }
}
```

---

## 🔧 適用手順

### ステップ1: Google Apps Scriptエディタを開く

1. スプレッドシートを開く
2. メニューバー: `拡張機能` → `Apps Script`

### ステップ2: 修正版スクリプトを適用

1. **既存のスクリプトをバックアップ**
   - `UpdateSNSAccounts.gs` の内容をコピーして保存

2. **修正版をコピー＆ペースト**
   - 既存のコードを全て削除
   - `/home/user/webapp/gas/UpdateSNSAccounts.gs` の内容をコピー
   - ペースト

3. **保存**
   - `Ctrl + S` (Mac: `Cmd + S`)

### ステップ3: テスト実行

1. Apps Scriptエディタで関数を選択
2. 「実行」ボタンをクリック
3. エラーが発生しないか確認

**テスト関数**:
- `updateSNSAccounts` - 自動実行用（UI非依存）
- `updateSNSAccountsManual` - 手動実行用（UI付き）

### ステップ4: トリガーの確認

1. Apps Scriptエディタで「トリガー」（時計アイコン）をクリック
2. `updateSNSAccounts` のトリガーが設定されているか確認
3. 必要に応じてトリガーを再設定

---

## 📊 2つの実行方法

### 方法1: 自動実行（トリガー）

**関数**: `updateSNSAccounts`

**特徴**:
- ✅ 時間ベーストリガーで自動実行
- ✅ UI非依存（ダイアログなし）
- ✅ ログに結果を出力

**実行ログ例**:
```
=== SNSアカウント情報更新開始 ===
TSVデータ読み込み: 3件
F列に「YouTubeチャンネルID」を追加
G列に「Xアカウント」を追加
✅ 更新完了: 3件更新, 0件見つからず
更新サマリー: 3件の生徒のSNSアカウント情報を更新しました。0件の生徒はNotionデータに見つかりませんでした。
=== SNSアカウント情報更新完了 ===
```

---

### 方法2: 手動実行（スプレッドシートから）

**関数**: `updateSNSAccountsManual`

**特徴**:
- ✅ スプレッドシートから手動実行
- ✅ 確認ダイアログ付き
- ✅ 結果をダイアログで表示

**実行手順**:
1. Apps Scriptエディタを開く
2. 関数選択: `updateSNSAccountsManual`
3. 「実行」ボタンをクリック
4. 確認ダイアログで「はい」をクリック
5. 結果がダイアログで表示される

---

## 🔍 トラブルシューティング

### Q1: トリガーでまだエラーが発生する

**原因**: 古いコードが実行されている

**解決策**:
1. Apps Scriptエディタで「デプロイ」→「デプロイを管理」
2. すべてのデプロイを削除
3. スクリプトを保存
4. トリガーを再設定

### Q2: 手動実行でもエラーが発生する

**原因**: 権限の問題

**解決策**:
1. Apps Scriptエディタで「実行」をクリック
2. 「権限を確認」
3. Googleアカウントを選択
4. 「許可」をクリック

### Q3: ログが表示されない

**解決策**:
1. Apps Scriptエディタで「実行ログ」を開く
2. または「ログ」タブを選択
3. 最新の実行ログを確認

---

## 📝 チェックリスト

修正完了後の確認:
- [ ] 修正版スクリプトを適用
- [ ] スクリプトを保存
- [ ] `updateSNSAccounts` を手動実行してテスト
- [ ] エラーが発生しないか確認
- [ ] トリガーが設定されているか確認
- [ ] 次回の自動実行を待つ（または時刻を変更して早めにテスト）

---

## 📞 サポート

- 修正版スクリプト: `/home/user/webapp/gas/UpdateSNSAccounts.gs`
- GitHub: https://github.com/kyo10310415/vtuber-school-evaluation/tree/main/gas

---

**修正日**: 2026-01-03  
**バージョン**: 1.1.0（トリガー対応版）
