# Notion API セットアップガイド

## ステップ1: Notion統合（Integration）の作成

1. **Notion Integrationsページにアクセス**
   ```
   https://www.notion.so/my-integrations
   ```

2. **「+ New integration」をクリック**

3. **統合情報を入力:**
   - Name: `WannaV Evaluation System`
   - Associated workspace: あなたのワークスペースを選択
   - Type: `Internal integration`

4. **Capabilities（機能）を選択:**
   - ✅ Read content
   - ✅ Read user information (including email addresses)
   - ❌ Insert content（不要）
   - ❌ Update content（不要）

5. **「Submit」をクリック**

6. **Internal Integration Tokenが表示されます**
   ```
   secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   **🔒 このトークンを安全に保存してください！**

---

## ステップ2: データベースへのアクセス権限付与

1. **Notionで対象のデータベースを開く**
   ```
   https://www.notion.so/88e474e5400f44998fa04d982b1c8ef7
   ```

2. **右上の「…」メニューをクリック**

3. **「接続先を追加」→「WannaV Evaluation System」を選択**

4. **「許可する」をクリック**

---

## ステップ3: データベースIDの確認

NotionのデータベースURLから、Database IDを抽出します:

```
https://www.notion.so/88e474e5400f44998fa04d982b1c8ef7?v=...
                      ↑ これがDatabase ID（32文字）
```

**Database ID: `88e474e5400f44998fa04d982b1c8ef7`**

---

## ステップ4: 環境変数の設定

### **Renderでの設定**

```bash
NOTION_API_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=88e474e5400f44998fa04d982b1c8ef7
```

### **ローカル開発用（.dev.vars）**

```bash
NOTION_API_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=88e474e5400f44998fa04d982b1c8ef7
```

---

## ステップ5: API接続テスト

```bash
curl -X POST https://api.notion.com/v1/databases/88e474e5400f44998fa04d982b1c8ef7/query \
  -H "Authorization: Bearer secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json"
```

**期待される応答:**
```json
{
  "results": [
    {
      "properties": {
        "学籍番号": {
          "title": [{ "text": { "content": "OLTS240488-AR" } }]
        },
        "YTチャンネルID": {
          "rich_text": [{ "text": { "content": "UCXuqSBlHAE6Xw-yeJA0Tunw" } }]
        },
        "X ID（＠は無し）": {
          "rich_text": [{ "text": { "content": "linda_gaming" } }]
        }
      }
    }
  ]
}
```

---

## プロパティ名の確認

Notionデータベースのプロパティ名:
- **学籍番号**: `学籍番号`（Title型）
- **YouTubeチャンネルID**: `YTチャンネルID`（Text型）
- **Xアカウント**: `X ID（＠は無し）`（Text型）

---

## 参考リンク

- Notion API Documentation: https://developers.notion.com/
- Database Query: https://developers.notion.com/reference/post-database-query
