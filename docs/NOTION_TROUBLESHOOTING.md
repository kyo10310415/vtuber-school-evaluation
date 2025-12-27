# Notion API統合トラブルシューティング

## 問題: 「WannaV Evaluation System」が接続先の選択肢に表示されない

### 解決方法1: 統合を再作成

1. **既存の統合を削除**
   - https://www.notion.so/my-integrations にアクセス
   - 「WannaV Evaluation System」を開く
   - 下部の「Delete integration」をクリック

2. **新しい統合を作成（正しいワークスペースで）**
   - 「+ New integration」をクリック
   - Name: `WannaV Evaluation System`
   - **Associated workspace: データベースが存在するワークスペースを選択**
   - Type: `Internal integration`
   - Capabilities:
     - ✅ Read content
     - ✅ Read user information
   - 「Submit」をクリック

3. **新しいトークンをコピー**
   ```
   secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **再度データベースで接続先を追加**

---

### 解決方法2: Notion APIで直接権限を付与

統合が選択肢に表示されない場合でも、APIを使って直接権限を確認できます。

#### テスト方法:

```bash
# 統合トークンでデータベースにアクセスを試みる
curl -X POST https://api.notion.com/v1/databases/88e474e5400f44998fa04d982b1c8ef7/query \
  -H "Authorization: Bearer secret_あなたのトークン" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json"
```

**成功した場合（権限がある）:**
```json
{
  "results": [
    {
      "properties": {
        "学籍番号": {...},
        "YTチャンネルID": {...}
      }
    }
  ]
}
```

**失敗した場合（権限がない）:**
```json
{
  "object": "error",
  "status": 401,
  "code": "unauthorized",
  "message": "API token is invalid."
}
```

または

```json
{
  "object": "error",
  "status": 404,
  "code": "object_not_found",
  "message": "Could not find database with ID: 88e474e5400f44998fa04d982b1c8ef7"
}
```

---

### 解決方法3: データベースを統合のワークスペースに移動

1. **データベースページを開く**
2. **右上の「…」メニュー → 「Move to」をクリック**
3. **統合が作成されたワークスペースに移動**

---

### 解決方法4: ページ共有から追加

Notionの最新版では、「接続先を追加」の代わりに「共有」から統合を追加できます。

1. **データベースページを開く**
2. **右上の「共有」または「Share」ボタンをクリック**
3. **「Invite」入力欄に「WannaV」と入力**
4. **「WannaV Evaluation System」を選択**
5. **権限を「Can view」または「Can edit」に設定（「Can view」で十分）**
6. **「Invite」をクリック**

---

## 確認方法

以下のスクリーンショットのように、データベースページの「接続済み」または「Connected」セクションに「WannaV Evaluation System」が表示されていれば成功です。

または、以下のコマンドでAPIアクセスが成功すれば問題ありません：

```bash
curl -X POST https://api.notion.com/v1/databases/88e474e5400f44998fa04d982b1c8ef7/query \
  -H "Authorization: Bearer secret_あなたのトークン" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  | jq '.results | length'
```

**期待される出力:**
```
1359
```
（データベース内のページ数）

---

## よくある原因

1. **ワークスペースが違う** - 統合とデータベースが別のワークスペースにある
2. **権限が不足** - データベースの管理者権限がない
3. **統合のタイプが違う** - Public integrationで作成してしまった
4. **Notionのキャッシュ** - ブラウザのキャッシュをクリアして再試行

---

## サポートが必要な場合

以下の情報を共有してください：

1. Notion Integrationsページのスクリーンショット
2. データベースページの「…」メニューのスクリーンショット
3. curl コマンドの実行結果（エラーメッセージ）
