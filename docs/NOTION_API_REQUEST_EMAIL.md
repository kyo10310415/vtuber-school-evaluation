# Notion API統合作成の依頼メール

---

**件名:** 【依頼】WannaV評価システム用のNotion API統合作成のお願い（作業時間: 約5分）

---

お世話になっております。

生徒のSNSアカウント情報（YouTubeチャンネルID、Xアカウント）を
生徒マスタシートに自動同期するシステムを構築しております。

つきましては、Notion API統合の作成をお願いできますでしょうか？

---

## 作業手順（約5分）

### 1. Notion Integrationsページにアクセス
```
https://www.notion.so/my-integrations
```

### 2. 新しい統合を作成
- 右上の「+ New integration」をクリック

### 3. 統合情報を入力
- **Integration name**: `WannaV Evaluation System`
- **Associated workspace**: `ONE LOOP inc.` を選択
- **Type**: `Internal integration` を選択

### 4. 機能（Capabilities）を設定
- ✅ **Read content** （チェック）
- ✅ **Read user information** （チェック）
- ❌ Insert content （チェック不要）
- ❌ Update content （チェック不要）
- ❌ Read comments （チェック不要）

### 5. 「Submit」をクリック

### 6. Integration Token をコピー
- 表示される `secret_xxxxxxxxx...` の形式のトークンをコピー
- このトークンを私（k.sakamoto）に共有してください

### 7. データベースに接続
- WannaV Tutors Database を開く: https://www.notion.so/88e474e5400f44998fa04d982b1c8ef7
- 右上の「…」メニュー → 「接続を追加」
- 「WannaV Evaluation System」を選択して追加

---

## このトークンの用途

取得したトークンを使用して、以下の自動化を実現します：

- **毎日午前3時**: NotionのWannaV Tutors Databaseから最新データを取得
- **自動更新**: 生徒マスタシート（Google Sheets）のF列・G列を自動更新
- **新規生徒対応**: Notionに新しい生徒が追加されたら自動で反映

---

## セキュリティについて

- このトークンは「読み取り専用」です
- Notionのデータを変更・削除することはできません
- WannaV Tutors Databaseのみにアクセスします

---

ご協力をよろしくお願いいたします。

k.sakamoto
