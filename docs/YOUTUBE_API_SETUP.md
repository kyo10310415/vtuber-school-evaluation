# YouTube Data API v3 セットアップガイド

## 前提条件
- Googleアカウントが必要
- Google Cloud Consoleへのアクセス権限

---

## ステップ1: Google Cloud Projectの作成

1. **Google Cloud Consoleにアクセス**
   ```
   https://console.cloud.google.com/
   ```

2. **新しいプロジェクトを作成:**
   - 画面上部の「プロジェクトを選択」→「新しいプロジェクト」
   - プロジェクト名: `wannav-evaluation-system`
   - 「作成」をクリック

3. **プロジェクトを選択**（作成完了後、自動で選択されます）

---

## ステップ2: YouTube Data API v3を有効化

1. **左メニューから「APIとサービス」→「ライブラリ」を選択**

2. **検索バーに「YouTube Data API v3」と入力**

3. **「YouTube Data API v3」をクリック**

4. **「有効にする」ボタンをクリック**

---

## ステップ3: APIキーを作成

1. **左メニューから「APIとサービス」→「認証情報」を選択**

2. **「認証情報を作成」→「APIキー」をクリック**

3. **APIキーが生成されます**
   ```
   例: AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **🔒 APIキーを安全に保存してください**

---

## ステップ4: APIキーを制限（セキュリティ強化）

1. **作成したAPIキーの「編集」アイコンをクリック**

2. **「アプリケーションの制限」セクション:**
   - ✅ 「HTTPリファラー（ウェブサイト）」を選択
   - 「項目を追加」をクリック
   - 以下を追加:
     ```
     https://vtuber-school-evaluation.onrender.com/*
     http://localhost:3000/*
     ```

3. **「APIの制限」セクション:**
   - ✅ 「キーを制限」を選択
   - ✅ 「YouTube Data API v3」にチェック

4. **「保存」をクリック**

---

## ステップ5: 環境変数の設定

### **Renderでの設定**

1. https://dashboard.render.com/ にアクセス
2. `vtuber-school-evaluation` サービスを選択
3. 左メニューの「Environment」をクリック
4. 「Add Environment Variable」で以下を追加:

```bash
YOUTUBE_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

5. 「Save Changes」をクリック

### **ローカル開発用（.dev.vars）**

```bash
# .dev.vars
YOUTUBE_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## ステップ6: API接続テスト

### **チャンネル情報取得テスト**

```bash
curl "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=UCXuqSBlHAE6Xw-yeJA0Tunw&key=YOUR_API_KEY"
```

**期待される応答:**
```json
{
  "items": [
    {
      "id": "UCXuqSBlHAE6Xw-yeJA0Tunw",
      "snippet": {
        "title": "LindaのGamingチャンネル",
        "description": "...",
        "customUrl": "@lindagaming"
      },
      "statistics": {
        "viewCount": "1000000",
        "subscriberCount": "50000",
        "videoCount": "200"
      }
    }
  ]
}
```

### **動画リスト取得テスト**

```bash
curl "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=UCXuqSBlHAE6Xw-yeJA0Tunw&maxResults=10&order=date&type=video&key=YOUR_API_KEY"
```

---

## 利用制限（無料枠）

| 項目 | 制限 |
|------|------|
| **1日あたりのクォータ** | 10,000ユニット |
| **チャンネル情報取得** | 1リクエスト = 1ユニット |
| **動画検索** | 1リクエスト = 100ユニット |
| **動画詳細取得** | 1リクエスト = 1ユニット |

### **クォータの計算例**

このシステムでは1生徒あたり:
- チャンネル情報取得: 1ユニット
- 最近の動画リスト取得: 100ユニット
- 動画詳細（再生数・時間）: 10ユニット（最大10動画）

**合計: 約111ユニット/生徒**

**1日で評価できる生徒数: 約90人**（10,000 ÷ 111）

---

## クォータ超過時の対処法

### **方法1: クォータ増加リクエスト（無料）**

1. Google Cloud Console → 「APIとサービス」→「YouTube Data API v3」
2. 「割り当て」タブをクリック
3. 「クォータ増加をリクエスト」をクリック
4. 理由を記入して送信（通常2-3営業日で承認）

### **方法2: 課金プラン（有料）**

10,000ユニット超過後、追加使用量に応じて課金:
- 1,000ユニットあたり: 約$0.05
- 月10万ユニット（約900人評価）: 約$5

---

## トラブルシューティング

### エラー: "403 Forbidden - The request cannot be completed because you have exceeded your quota"
- **原因**: 1日のクォータ（10,000ユニット）を超過
- **対処**: 翌日まで待つ、またはクォータ増加リクエスト

### エラー: "400 Bad Request - The request specifies an invalid channel ID"
- **原因**: チャンネルIDが間違っている
- **対処**: Notionのデータを確認（`UC`で始まる24文字のID）

### エラー: "401 Unauthorized"
- **原因**: APIキーが無効
- **対処**: Google Cloud Consoleで新しいAPIキーを生成

---

## YouTubeチャンネルIDの確認方法

### **方法1: チャンネルページから**
1. YouTubeチャンネルページを開く
2. URLから確認:
   ```
   https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw
                                   ↑ これがチャンネルID
   ```

### **方法2: カスタムURLから取得**
1. カスタムURL（例: `@lindagaming`）しかない場合、以下のAPIで取得:
   ```bash
   curl "https://www.googleapis.com/youtube/v3/search?part=snippet&q=@lindagaming&type=channel&key=YOUR_API_KEY"
   ```

---

## 参考リンク

- YouTube Data API v3 Documentation: https://developers.google.com/youtube/v3
- クォータ計算機: https://developers.google.com/youtube/v3/determine_quota_cost
- Rate Limits: https://developers.google.com/youtube/v3/getting-started#quota
