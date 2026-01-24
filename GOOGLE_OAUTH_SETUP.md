# Google OAuth 2.0 設定ガイド

## 1. Google Cloud Consoleプロジェクトの作成

1. https://console.cloud.google.com/ にアクセス
2. 上部の**プロジェクト選択**ドロップダウンをクリック
3. **新しいプロジェクト**をクリック
4. プロジェクト名: `VTuber School Evaluation`
5. **作成**をクリック

## 2. YouTube APIの有効化

### YouTube Data API v3

1. **APIとサービス** → **ライブラリ**
2. 検索バーで「YouTube Data API v3」を検索
3. **有効にする**をクリック

### YouTube Analytics API

1. 同じく**ライブラリ**で「YouTube Analytics API」を検索
2. **有効にする**をクリック

## 3. OAuth 2.0 クライアントIDの作成

### 認証情報の作成

1. **APIとサービス** → **認証情報**
2. **認証情報を作成** → **OAuth 2.0 クライアント ID**

### 同意画面の設定（初回のみ）

**OAuth同意画面が未設定の場合:**

1. **OAuth同意画面を構成**をクリック
2. **User Type**: **外部** を選択（または**内部**、組織の場合）
3. **作成**をクリック

**アプリ情報:**
- **アプリ名**: `VTuber School Evaluation`
- **ユーザーサポートメール**: あなたのメールアドレス
- **デベロッパーの連絡先情報**: あなたのメールアドレス
- **保存して次へ**

**スコープ:**
- **スコープを追加または削除**をクリック
- 以下のスコープを追加：
  ```
  https://www.googleapis.com/auth/youtube.readonly
  https://www.googleapis.com/auth/yt-analytics.readonly
  ```
- **保存して次へ**

**テストユーザー:**
- **テストユーザーを追加**をクリック
- 生徒やスタッフのGoogleアカウントを追加
- **保存して次へ**

**概要:**
- 内容を確認して**ダッシュボードに戻る**

### OAuth 2.0 クライアントIDの作成（続き）

1. **認証情報** → **認証情報を作成** → **OAuth 2.0 クライアント ID**
2. **アプリケーションの種類**: **ウェブアプリケーション**
3. **名前**: `VTuber School Evaluation - YouTube Analytics`

**承認済みのリダイレクトURI:**
- **URI を追加**をクリック
- 以下を入力：
  ```
  https://vtuber-school-evaluation.onrender.com/api/analytics/auth/callback
  ```

4. **作成**をクリック

### 認証情報の取得

作成後、ポップアップに以下が表示されます：

- **クライアントID**: `123456789-abcdefghijklmnop.apps.googleusercontent.com`
- **クライアントシークレット**: `GOCSPX-aBcDeFgHiJkLmNoPqRsTuVwXyZ`

**これらをコピーしてください！**

## 4. Render環境変数の設定

Render Dashboard → vtuber-school-evaluation → Environment

| Key | Value |
|-----|-------|
| `YOUTUBE_ANALYTICS_CLIENT_ID` | `<コピーしたクライアントID>` |
| `YOUTUBE_ANALYTICS_CLIENT_SECRET` | `<コピーしたクライアントシークレット>` |
| `YOUTUBE_ANALYTICS_REDIRECT_URI` | `https://vtuber-school-evaluation.onrender.com/api/analytics/auth/callback` |

**Save Changes** をクリック

## 5. 動作確認

1. Renderの再デプロイ完了を待つ
2. https://vtuber-school-evaluation.onrender.com/analytics-data にアクセス
3. **OAuth認証**ボタンをクリック
4. Google OAuth画面が開くことを確認
5. YouTubeアカウントでログイン
6. スコープの許可を求められる
7. **許可**をクリック
8. 認証完了メッセージが表示される

## トラブルシューティング

### エラー: redirect_uri_mismatch

**原因:** リダイレクトURIが一致していない

**対処:**
1. Google Cloud Console → 認証情報 → OAuth 2.0 クライアントID
2. **承認済みのリダイレクトURI**を確認
3. 正確に `https://vtuber-school-evaluation.onrender.com/api/analytics/auth/callback` が設定されているか確認
4. 余分なスペースや `/` がないか確認

### エラー: access_denied

**原因:** テストユーザーに追加されていない

**対処:**
1. OAuth同意画面 → テストユーザー
2. 使用するGoogleアカウントを追加

### エラー: invalid_client

**原因:** クライアントIDまたはシークレットが間違っている

**対処:**
1. Render Environment変数を確認
2. Google Cloud Consoleの認証情報を再確認
3. 余分なスペースや改行がないか確認

## 参考リンク

- Google Cloud Console: https://console.cloud.google.com/
- YouTube Data API v3: https://developers.google.com/youtube/v3
- YouTube Analytics API: https://developers.google.com/youtube/analytics
- OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
