# Notion自動同期セットアップガイド

## 📋 概要

NotionのWannaV Tutors Databaseから生徒のSNSアカウント情報を**毎日自動で**生徒マスタシート（Google Sheets）に同期します。

---

## 🎯 実現すること

- ✅ **毎日午前3時**: 自動でNotionからデータ取得
- ✅ **自動更新**: 生徒マスタシートのF列・G列を更新
- ✅ **新規生徒対応**: Notionに追加された生徒も自動反映
- ✅ **メンテナンス不要**: 一度設定すれば自動で動作

---

## 📝 前提条件

### 1. Notion API統合の作成

**管理者**に依頼して、Notion API統合を作成してもらう必要があります。

依頼メールテンプレート:
```
/home/user/webapp/docs/NOTION_API_REQUEST_EMAIL.md
```

または GitHub:
```
https://github.com/kyo10310415/vtuber-school-evaluation/blob/main/docs/NOTION_API_REQUEST_EMAIL.md
```

取得するもの:
- **Notion Integration Token** (形式: `secret_xxxxxxxxxxxxx...`)

---

## 🚀 セットアップ手順

### **ステップ1: Google Apps Scriptを開く**

1. **生徒マスタスプレッドシートを開く:**
   ```
   https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit
   ```

2. **「拡張機能」→「Apps Script」をクリック**

---

### **ステップ2: スクリプトを作成**

1. **新しいスクリプトファイルを作成:**
   - 左側の「+」ボタン → 「スクリプト」をクリック
   - ファイル名: `NotionAutoSync`

2. **スクリプトコードを貼り付け:**
   
   GitHubから最新版をコピー:
   ```
   https://github.com/kyo10310415/vtuber-school-evaluation/blob/main/gas/NotionAutoSync.gs
   ```
   
   または、ローカルファイル:
   ```
   /home/user/webapp/gas/NotionAutoSync.gs
   ```

3. **「保存」をクリック**（Ctrl+S / Cmd+S）

---

### **ステップ3: Notion APIトークンを設定**

1. **関数ドロップダウンから `setupNotionToken` を選択**

2. **「実行」ボタン（▶）をクリック**

3. **権限を承認:**
   - 「承認が必要です」→「権限を確認」
   - Googleアカウントを選択
   - 「このアプリは確認されていません」→「詳細」→「安全ではないページに移動」
   - 「許可」をクリック

4. **Notion APIトークンを入力:**
   - プロンプトが表示されます
   - 管理者から取得した `secret_xxxxx...` 形式のトークンを貼り付け
   - 「OK」をクリック

5. **「成功」ダイアログが表示されれば完了**

---

### **ステップ4: 手動テスト実行**

1. **関数ドロップダウンから `testSync` を選択**

2. **「実行」ボタン（▶）をクリック**

3. **実行ログを確認:**
   ```
   === Notion自動同期開始 ===
   Notionデータ取得中...
   Notion取得完了: 1380件
   生徒マスタシート更新中...
   ✅ 1350件の生徒データを更新しました
   生徒マスタシート更新完了
   === Notion自動同期完了 ===
   ```

4. **生徒マスタシートを確認:**
   - F列: YouTubeチャンネルID
   - G列: Xアカウント

5. **「テスト完了」ダイアログが表示されれば成功**

---

### **ステップ5: 自動実行トリガーを設定**

1. **関数ドロップダウンから `setupDailyTrigger` を選択**

2. **「実行」ボタン（▶）をクリック**

3. **「トリガー設定完了」ダイアログが表示されれば完了**

4. **トリガーを確認:**
   - 左メニューの「トリガー」（⏰時計アイコン）をクリック
   - 以下のトリガーが追加されていることを確認:
     ```
     関数: syncNotionToSheet
     イベント: 時間主導型 - 日タイマー - 午前3時～4時
     ```

---

## ✅ セットアップ完了！

これで、**毎日午前3時**に自動でNotionと生徒マスタシートが同期されます。

---

## 🔍 動作確認

### **翌日の午前4時以降に確認:**

1. **生徒マスタシートを開く**

2. **F列・G列が最新のNotionデータで更新されているか確認**

3. **Apps Scriptの実行ログを確認:**
   - Apps Scriptエディタを開く
   - 左メニューの「実行数」をクリック
   - 最新の `syncNotionToSheet` の実行結果を確認

---

## 🛠️ トラブルシューティング

### エラー: 「NOTION_API_TOKEN が設定されていません」

- `setupNotionToken()` を実行してトークンを設定してください

### エラー: 「Notion API Error: 401 - Unauthorized」

- Notion APIトークンが無効です
- 管理者に再度トークンを発行してもらってください

### エラー: 「Notion API Error: 404 - object_not_found」

- データベースIDが間違っているか、統合がデータベースに接続されていません
- 管理者にデータベースへの接続を確認してもらってください

### 自動実行が動作しない

- トリガーが正しく設定されているか確認:
  - 左メニュー「トリガー」→ `syncNotionToSheet` が存在するか
- 実行履歴を確認:
  - 左メニュー「実行数」→ エラーがないか確認

---

## 📊 機能

### **利用可能な関数:**

| 関数名 | 説明 |
|--------|------|
| `syncNotionToSheet()` | Notionから生徒マスタシートを更新（トリガーから自動実行） |
| `setupNotionToken()` | Notion APIトークンを設定 |
| `setupDailyTrigger()` | 毎日午前3時の自動実行トリガーを設定 |
| `removeDailyTrigger()` | 自動実行トリガーを削除 |
| `testSync()` | 手動でテスト実行 |

---

## 🔄 メンテナンス

### **Notion APIトークンを更新する場合:**

1. `setupNotionToken()` を実行
2. 新しいトークンを入力

### **自動実行を停止する場合:**

1. `removeDailyTrigger()` を実行

### **自動実行を再開する場合:**

1. `setupDailyTrigger()` を実行

---

## 📝 注意事項

- このスクリプトは生徒マスタシートのF列・G列を**上書き**します
- 大量データの更新には時間がかかる場合があります（約1-2分）
- Google Apps Scriptの実行時間制限: 6分/実行
- トリガーの実行回数制限: 無料アカウントは1日90分まで

---

## 🔗 参考リンク

- スクリプト: https://github.com/kyo10310415/vtuber-school-evaluation/blob/main/gas/NotionAutoSync.gs
- Notion API Documentation: https://developers.notion.com/
