# 生徒マスタシートにSNSアカウント情報を追加する方法

## 📋 概要

NotionからエクスポートしたデータをGoogle Apps Scriptで生徒マスタシートに自動的に追加します。

---

## 🚀 手順

### **ステップ1: TSVデータをコピー**

1. **以下のファイルを開く:**
   ```
   /home/user/uploaded_files/sns_data_for_gas.tsv
   ```

2. **ファイルの全内容をコピー**（1380行のデータ）

---

### **ステップ2: Google Apps Scriptを開く**

1. **生徒マスタスプレッドシートを開く:**
   ```
   https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit
   ```

2. **「拡張機能」→「Apps Script」をクリック**

3. **新しいスクリプトファイルを作成:**
   - 左メニューの「+」→「スクリプト」をクリック
   - ファイル名: `UpdateSNSAccounts`

4. **スクリプトコードを貼り付け:**
   - GitHubから最新のコードをコピー:
     ```
     https://github.com/kyo10310415/vtuber-school-evaluation/blob/main/gas/UpdateSNSAccounts.gs
     ```
   - または、`/home/user/webapp/gas/UpdateSNSAccounts.gs` の内容をコピー

---

### **ステップ3: TSVデータを貼り付け**

1. **スクリプト内の `DATA` 変数を探す:**
   ```javascript
   const DATA = `
   OLPR230012-CX	UCUNlc1_FNlpJTX-TyyA6LAA	HisuiSui_v
   `.trim();
   ```

2. **バッククォート内のサンプルデータを削除**

3. **ステップ1でコピーした1380行のTSVデータを貼り付け**
   ```javascript
   const DATA = `
   OLPR230012-CX	UCUNlc1_FNlpJTX-TyyA6LAA	HisuiSui_v
   OLST240099-TE	UCYwluF88NmqAU5qNF6qM8xQ	Megane_tennenn
   ... (1380行)
   `.trim();
   ```

4. **「保存」をクリック**（Ctrl+S / Cmd+S）

---

### **ステップ4: スクリプトを実行**

1. **関数ドロップダウンから `updateSNSAccounts` を選択**

2. **「実行」ボタン（▶）をクリック**

3. **初回実行時: 権限を承認**
   - 「承認が必要です」→「権限を確認」
   - Googleアカウントを選択
   - 「このアプリは確認されていません」→「詳細」→「安全ではないページに移動」
   - 権限を承認

4. **実行ログを確認:**
   ```
   TSVデータ読み込み: 1380件
   F列に「YouTubeチャンネルID」を追加
   G列に「Xアカウント」を追加
   ✅ 更新完了: 1350件更新, 30件見つからず
   ```

5. **完了ダイアログが表示されます**

---

### **ステップ5: 結果を確認**

1. **生徒マスタシートを確認:**
   - F列: YouTubeチャンネルID
   - G列: Xアカウント

2. **データが正しく追加されているか確認**
   ```
   | 学籍番号        | YouTubeチャンネルID          | Xアカウント     |
   |----------------|------------------------------|----------------|
   | OLTS240488-AR  | UCXuqSBlHAE6Xw-yeJA0Tunw    | linda_gaming   |
   | OLST230057-TQ  | UC1234567890abcdefghijk      | tanaka_vtuber  |
   ```

---

## 🔍 トラブルシューティング

### エラー: 「シート「リスト」が見つかりません」

- 生徒マスタシートのシート名が「リスト」でない場合、スクリプト内の `SHEET_NAME` を変更してください

### エラー: 「権限が不足しています」

- Apps Scriptの権限承認を再度実行してください

### データが更新されない

- TSVデータが正しく貼り付けられているか確認
- 学籍番号の列がB列になっているか確認
- 実行ログで「更新完了」メッセージを確認

---

## 📊 データ統計

- **抽出件数**: 1380件
- **YouTubeチャンネルID有り**: 約900件
- **Xアカウント有り**: 約1200件

---

## 🔄 定期更新

Notionでデータを更新した場合:

1. Notionから再度CSVエクスポート
2. TSVデータを再生成
3. Apps Scriptの `DATA` 変数を更新
4. `updateSNSAccounts()` を再実行

---

## 📝 注意事項

- このスクリプトは既存データを**上書き**します
- バックアップを取ってから実行することを推奨
- 大量データの更新には時間がかかる場合があります（約1-2分）
