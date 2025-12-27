# CSV→TSV変換ツール

NotionからエクスポートしたCSVファイルを、Google Apps Script用のTSVデータに変換するツールです。

---

## 🛠️ ツール一覧

### 1. **Webツール（最も簡単）** ⭐ 推奨

ブラウザで完結する変換ツール

- **ファイル**: `csv-to-tsv-converter.html`
- **使い方**: ブラウザで開いてCSVをアップロード
- **メリット**: 
  - ✅ インストール不要
  - ✅ ドラッグ&ドロップで変換
  - ✅ ワンクリックでコピー
  - ✅ TSVファイルのダウンロードも可能

**アクセス方法:**
1. ローカルで使用:
   ```
   file:///home/user/webapp/tools/csv-to-tsv-converter.html
   ```

2. Webで使用（GitHub Pages）:
   ```
   https://kyo10310415.github.io/vtuber-school-evaluation/tools/csv-to-tsv-converter.html
   ```

---

### 2. **Pythonスクリプト**

コマンドラインで変換

- **ファイル**: `convert_notion_csv.py`
- **使い方**:
  ```bash
  python tools/convert_notion_csv.py "WannaV生徒名簿.csv"
  ```
- **メリット**:
  - ✅ バッチ処理可能
  - ✅ スクリプトに組み込める
  - ✅ 自動化しやすい

---

### 3. **シェルスクリプト**

Bashで変換（既存）

- **ファイル**: `../scripts/update_sns_accounts.sh`
- **使い方**:
  ```bash
  bash scripts/update_sns_accounts.sh "WannaV生徒名簿.csv"
  ```

---

## 📋 使い方（Webツール推奨）

### **手順:**

1. **NotionからCSVをエクスポート**
   - WannaV Tutors Database を開く
   - 右上の「…」→「エクスポート」→「CSV」
   - ダウンロードしたZIPを解凍

2. **Webツールで変換**
   - `csv-to-tsv-converter.html` をブラウザで開く
   - CSVファイルをドラッグ&ドロップ（または選択）
   - 「変換する」をクリック

3. **結果をコピー**
   - 「クリップボードにコピー」をクリック

4. **Google Apps Scriptに貼り付け**
   - Apps Scriptの `UpdateSNSAccounts.gs` を開く
   - `DATA` 変数に貼り付け
   - `updateSNSAccounts()` を実行

---

## 🎯 変換内容

### **入力（NotionのCSV）:**
```csv
名前,学籍番号,X ID（＠は無し）,YTチャンネルID,...
石山光司,OLTS240488-AR,linda_gaming,UCXuqSBlHAE6Xw-yeJA0Tunw,...
```

### **出力（TSV）:**
```tsv
OLTS240488-AR	UCXuqSBlHAE6Xw-yeJA0Tunw	linda_gaming
OLST230057-TQ	UC1234567890abcdefghijk	tanaka_vtuber
```

**フォーマット:**
```
学籍番号 [TAB] YouTubeチャンネルID [TAB] Xアカウント
```

---

## 📊 対応する列

NotionのCSVから以下の列を抽出します：

| 列名 | 列番号 | 説明 |
|------|--------|------|
| 学籍番号 | 44列目 | 必須 |
| X ID（＠は無し） | 14列目 | オプション |
| YTチャンネルID | 17列目 | オプション |

---

## 🔧 トラブルシューティング

### エラー: 「必要な列が見つかりません」

- NotionのCSVが正しいか確認してください
- 列名が変更されていないか確認してください
  - `学籍番号`
  - `X ID（＠は無し）`
  - `YTチャンネルID`

### 変換結果が空

- CSVファイルに学籍番号が入っているか確認してください
- 1行目がヘッダー行になっているか確認してください

### Webツールが動作しない

- モダンなブラウザ（Chrome, Firefox, Edge）を使用してください
- JavaScriptが有効になっているか確認してください

---

## 🚀 定期更新フロー

### **週1回の更新作業（所要時間: 約3分）**

1. **月曜日午前**: NotionからCSVをエクスポート
2. **Webツールで変換**: 30秒
3. **Apps Scriptで実行**: 1分
4. **結果確認**: 30秒

---

## 📝 今後の改善案

### **自動化の可能性:**

1. **Notion API統合を取得できた場合**:
   - Google Apps Scriptで完全自動化（毎日午前3時）
   - 手動作業ゼロ

2. **Zapier/Make.com を使う場合**:
   - Notion更新時に自動でGoogle Sheetsに反映
   - 月額約$20〜

3. **現在の手動更新**:
   - 週1回、約3分の作業
   - コスト: 無料

---

## 🔗 関連ファイル

- **Google Apps Script**: `/gas/UpdateSNSAccounts.gs`
- **手順書**: `/gas/UpdateSNSAccounts_README.md`
- **Notion API自動同期**: `/gas/NotionAutoSync.gs`

---

## 📞 サポート

問題が発生した場合は、以下を確認してください：

1. NotionのCSVファイルが最新か
2. 必要な列（学籍番号、X ID、YTチャンネルID）が存在するか
3. ブラウザのコンソールでエラーが表示されていないか

---

## 📄 ライセンス

MIT License
