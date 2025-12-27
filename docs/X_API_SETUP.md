# X API（Twitter API v2）セットアップガイド

## 前提条件
- Xアカウントが必要
- 電話番号認証済みアカウント
- クレジットカード（Basic以上のプラン契約時）

---

## ステップ1: Developer Portalへアクセス

1. **X Developer Portalにアクセス**
   ```
   https://developer.x.com/
   ```

2. **右上の「Sign In」をクリック**してXアカウントでログイン

3. **Apply for access**をクリック（初回のみ）

---

## ステップ2: アプリケーション作成

1. **「Projects & Apps」→「+ Add App」をクリック**

2. **アプリ情報を入力:**
   - App name: `WannaV Growth Evaluation System`
   - Description: `WannaV生徒のSNS成長度を評価するシステム`
   - Website URL: `https://vtuber-school-evaluation.onrender.com`
   
3. **「Create」をクリック**

---

## ステップ3: APIキーを取得

アプリ作成後、以下の3つのキーが表示されます：

```
API Key (Consumer Key): xxxxxxxxxxxxxxxxxxx
API Key Secret (Consumer Secret): xxxxxxxxxxxxxxxxxxx
Bearer Token: xxxxxxxxxxxxxxxxxxx
```

**🔒 重要: これらのキーを安全に保存してください！**

---

## ステップ4: 認証設定（OAuth 2.0）

1. **アプリの「Settings」タブを開く**

2. **「User authentication settings」→「Set up」をクリック**

3. **App permissions**を選択:
   - ✅ `Read` （ツイート・ユーザー情報の読み取り）

4. **Type of App**を選択:
   - ✅ `Web App, Automated App or Bot`

5. **Callback URI / Redirect URL**を入力:
   ```
   https://vtuber-school-evaluation.onrender.com/api/callback
   ```

6. **Website URL**を入力:
   ```
   https://vtuber-school-evaluation.onrender.com
   ```

7. **「Save」をクリック**

8. **Client IDとClient Secretが表示されます**（保存してください）

---

## ステップ5: プラン選択（Basic推奨）

1. **「Products」→「X API v2」→「Subscribe to Basic」をクリック**

2. **支払い情報を入力**（月額 $100）

3. **利用規約に同意して「Subscribe」をクリック**

---

## ステップ6: 環境変数の設定

Renderの環境変数に以下を追加:

```bash
X_API_KEY=your_api_key_here
X_API_SECRET=your_api_secret_here
X_BEARER_TOKEN=your_bearer_token_here
X_CLIENT_ID=your_client_id_here
X_CLIENT_SECRET=your_client_secret_here
```

**Renderダッシュボードでの設定方法:**
1. https://dashboard.render.com/ にアクセス
2. `vtuber-school-evaluation` サービスを選択
3. 左メニューの「Environment」をクリック
4. 「Add Environment Variable」で上記の変数を追加
5. 「Save Changes」をクリック

---

## ステップ7: API接続テスト

ローカルまたはRenderで以下のコマンドを実行:

```bash
curl -X GET "https://api.x.com/2/users/by/username/jack?user.fields=public_metrics" \
  -H "Authorization: Bearer YOUR_BEARER_TOKEN"
```

**期待される応答:**
```json
{
  "data": {
    "id": "12",
    "name": "Jack Dorsey",
    "username": "jack",
    "public_metrics": {
      "followers_count": 6500000,
      "following_count": 4500,
      "tweet_count": 28000,
      "listed_count": 50000
    }
  }
}
```

---

## 利用制限（Basicプラン）

| 項目 | 上限 |
|------|------|
| ツイート取得 | 10,000リクエスト/月 |
| ユーザー検索 | 10,000リクエスト/月 |
| Rate limit | 450リクエスト/15分 |

**重要:** エンゲージメント・インプレッションデータはBasicプランでは取得できません。
代替手段として、生徒にX Analytics CSVのアップロードを依頼してください。

---

## トラブルシューティング

### エラー: "403 Forbidden"
- APIキーが正しく設定されているか確認
- アプリのPermissionsが「Read」になっているか確認

### エラー: "429 Too Many Requests"
- Rate limitに達しています
- 15分待ってから再試行

### エラー: "401 Unauthorized"
- Bearer Tokenが間違っているか期限切れ
- Developer Portalで再生成してください

---

## 参考リンク

- X API Documentation: https://developer.x.com/en/docs/x-api
- Rate Limits: https://developer.x.com/en/docs/x-api/rate-limits
- Pricing: https://developer.x.com/en/portal/products/api-pricing
