# WannaV ChatGPT 読み取り専用データ

既存のWannaV MCP接続に評価システムを追加します。新しいサーバーやGoogle OAuthクライアントは作りません。RenderのNode起動経路で `/integrations/chatgpt/v1/catalog` と `/query` を、既存のSSOとは独立した専用Bearerトークンで保護します。匿名401、更新405。通常の業務画面・APIのSSO・役割検査はそのままです。

## 配置

このサービスに固有の32文字以上のランダムな`CHATGPT_READ_TOKEN`をRenderで設定し、共通MCPサーバーの`EVALUATION_TOKEN`にも同じ値を設定します。共通サーバーの`EVALUATION_URL`は`https://vtuber-school-evaluation.onrender.com`です。秘密値をチャット・Git・ログへ出しません。

Sheetsは既存の`GOOGLE_SERVICE_ACCOUNT`・`RESULT_SPREADSHEET_ID`・`STUDENT_MASTER_SPREADSHEET_ID`、Analyticsは既存の`DATABASE_URL`を使います。Sheetsの接続には読み取り専用スコープを要求し、固定GETのみ実行します。DBは固定SELECTとREAD ONLYトランザクションのみ。DB移行・採点・同期・Gemini・YouTube/X API・シートへの書き込みは実行しません。

## データセット

| データセット | 内容 |
|---|---|
| evaluation.students | 生徒マスターの現在値。フォルダー・認証情報は出力しない |
| evaluation.months | プロレベルの月次結果シート一覧。SNSのみ保存された月は含まない |
| evaluation.prolevel | 指定月の生徒ごとの最新有効評価・項目別ランク・コメント |
| evaluation.youtube | 指定月の保存済みYouTube評価・指標 |
| evaluation.x | 指定月の保存済みX評価・指標 |
| evaluation.analytics | PostgreSQLに保存された期間別YouTube Analytics指標 |

prolevel/youtube/xは`month=YYYY-MM`必須です。月次シートが未作成・ヘッダー不正・通信失敗なら取得失敗とし、0件に置き換えません。既存UIと同じくトークメモ不足・分析エラーのプロレベル行を除外し、最後に追記された有効な行を使用します。旧形式の「欠席・遅刻評価」は個別の欠席・遅刻に分解しません。S〜Dは順序尺度として返し、独自の平均点・再評価は作りません。

SNSは既存画面と同じ完全キャッシュ条件・キャッシュ日時順で選びます。有効期限は既存の月次表示と同様に無視します。完全キャッシュがない生徒は`status=incomplete/invalid_json`、指標・ランクはnullです。取得不能を0やDに置き換えません。キャッシュの任意JSONは公開せず、定義済みの指標だけを返します。

Sheetsの取得は20秒・8MiBに制限し、同時の同じ読取りを共有します。結果が1万行・4MiBを超えた場合は共通サーバーの既存ルールで部分集計を拒否します。Analyticsの期間を合計する場合は重複期間・平均指標の加重を確認してください。現在の担当Tutorとの結合で過去の担当を推測しません。

`npm run test:chatgpt`と`npm run test:security`は模擬データだけで検証します。本番の認証情報・外部APIをテストへ渡しません。
