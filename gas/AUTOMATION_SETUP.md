# 月次評価自動化セットアップガイド

## 概要

毎月月末に自動的に全生徒のYouTube & X評価を実行し、結果をスプレッドシートに書き込むシステムです。

---

## セットアップ手順

### 1. Google Apps Scriptを開く

1. [結果スプレッドシート](https://docs.google.com/spreadsheets/d/1t571fqZJtUjNL7_gH6G2dSNBCmS98LTnDrWEtt7J92k/edit)を開く
2. **拡張機能** → **Apps Script** をクリック
3. 新しいファイルを作成: **+ ボタン** → **スクリプト**
4. ファイル名を `MonthlyEvaluationAutomation` に変更

### 2. スクリプトをコピー

`/home/user/webapp/gas/MonthlyEvaluationAutomation.gs` の内容を全てコピーしてApps Scriptエディタに貼り付けます。

### 3. 設定を確認

スクリプト内の `CONFIG` セクションを確認・修正します:

```javascript
const CONFIG = {
  // デプロイURL（Render等のURL）
  API_BASE_URL: 'https://vtuber-school-evaluation.onrender.com',
  
  // 結果書き込み先スプレッドシートID
  RESULT_SPREADSHEET_ID: '1t571fqZJtUjNL7_gH6G2dSNBCmS98LTnDrWEtt7J92k',
  
  // 生徒マスタースプレッドシートID
  STUDENT_MASTER_SPREADSHEET_ID: '1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M',
};
```

### 4. トリガーを設定

1. Apps Scriptエディタで **関数を選択** ドロップダウンから `setupMonthlyTrigger` を選択
2. **実行** ボタンをクリック
3. 初回実行時に権限を承認:
   - 「権限を確認」をクリック
   - Googleアカウントを選択
   - 「詳細」→「（プロジェクト名）に移動」をクリック
   - 「許可」をクリック
4. ログに「月次評価トリガーを設定しました（毎月28日 午前3時実行）」と表示されれば成功

### 5. トリガーの確認

1. Apps Scriptエディタの左メニューから **トリガー（時計アイコン）** をクリック
2. 以下のトリガーが表示されていることを確認:
   - 関数: `runMonthlyEvaluation`
   - イベントソース: 時間主導型
   - 時間ベースのトリガー: 月タイマー
   - 日: 28日
   - 時刻: 午前3時〜4時

---

## テスト実行

自動実行を待たずに、手動でテストすることができます:

### 方法1: 前月の評価を実行

1. Apps Scriptエディタで **関数を選択** から `runMonthlyEvaluation` を選択
2. **実行** ボタンをクリック
3. ログを確認（**表示** → **ログ**）

### 方法2: 特定の月を指定して実行

1. `runMonthlyEvaluationManual()` 関数内の `targetMonth` を変更:

```javascript
function runMonthlyEvaluationManual() {
  const targetMonth = '2025-01'; // ← ここを変更
  
  // ...
}
```

2. **関数を選択** から `runMonthlyEvaluationManual` を選択
3. **実行** ボタンをクリック

---

## 出力結果

### YouTube評価結果シート

シート名: `YouTube_YYYY-MM`（例: `YouTube_2025-01`）

| 列 | 内容 |
|----|------|
| A | 学籍番号 |
| B | 氏名 |
| C | 評価月 |
| D | 登録者数 |
| E | 登録者伸び率 |
| F | 総再生回数 |
| G | 月間動画数 |
| H | 週間配信回数 |
| I | 週4回配信目標達成 |
| J | 平均配信時間 |
| K | 1.5時間配信目標達成 |
| L | 総いいね数 |
| M | 総コメント数 |
| N | エンゲージメント率 |
| O | タイトル品質 |
| P | サムネイル品質 |

### X評価結果シート

シート名: `X_YYYY-MM`（例: `X_2025-01`）

| 列 | 内容 |
|----|------|
| A | 学籍番号 |
| B | 氏名 |
| C | 評価月 |
| D | フォロワー数 |
| E | フォロー数 |
| F | フォロワー伸び率 |
| G | 1日あたりのフォロー数 |
| H | 1日10フォロー目標達成 |
| I | 月間投稿数 |
| J | 1日あたりの投稿数 |
| K | 1日2回投稿目標達成 |
| L | 週間企画投稿数 |
| M | 週2回企画目標達成 |
| N | 総いいね数 |
| O | 総リツイート数 |
| P | 総リプライ数 |
| Q | 総インプレッション数 |
| R | エンゲージメント率 |
| S | エンゲージメント伸び率 |
| T | インプレッション伸び率 |

---

## トラブルシューティング

### 問題1: トリガーが実行されない

**原因**: トリガーが正しく設定されていない

**解決方法**:
1. 左メニューの **トリガー** をクリック
2. トリガーが存在するか確認
3. 存在しない場合は `setupMonthlyTrigger()` を再実行

### 問題2: API呼び出しエラー

**原因**: APIサーバーがダウンしている、またはURL設定が間違っている

**解決方法**:
1. `CONFIG.API_BASE_URL` が正しいか確認
2. ブラウザで `https://vtuber-school-evaluation.onrender.com/api/health` にアクセスして動作確認
3. Renderダッシュボードでサービスの状態を確認

### 問題3: スプレッドシートに書き込めない

**原因**: スプレッドシートIDが間違っている、または権限がない

**解決方法**:
1. `CONFIG.RESULT_SPREADSHEET_ID` が正しいか確認
2. スプレッドシートの編集権限があるか確認
3. Apps Scriptの実行ユーザーを確認

### 問題4: 一部の生徒の評価が失敗する

**原因**: YouTube/Xアカウント情報が設定されていない

**解決方法**:
1. [生徒マスタシート](https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit)を確認
2. F列（YouTubeチャンネルID）とG列（Xアカウント）が設定されているか確認
3. `UpdateSNSAccounts.gs` を実行してSNS情報を更新

---

## トリガー管理

### トリガーを削除

トリガーを停止したい場合:

1. **関数を選択** から `deleteMonthlyTrigger` を選択
2. **実行** ボタンをクリック

または、左メニューの **トリガー** から手動で削除も可能です。

### トリガー一覧を確認

1. **関数を選択** から `listTriggers` を選択
2. **実行** ボタンをクリック
3. **表示** → **ログ** でトリガー一覧を確認

---

## カスタマイズ

### 実行時刻を変更

`setupMonthlyTrigger()` 関数内の以下の部分を変更:

```javascript
ScriptApp.newTrigger('runMonthlyEvaluation')
  .timeBased()
  .onMonthDay(28) // ← 実行日（28日）
  .atHour(3) // ← 実行時刻（午前3時）
  .create();
```

### 通知機能を追加

`sendCompletionNotification()` と `sendErrorNotification()` 関数にメール通知を実装:

```javascript
function sendCompletionNotification(month, youtubeCount, xCount) {
  GmailApp.sendEmail(
    'your-email@example.com',
    `月次評価完了: ${month}`,
    `YouTube: ${youtubeCount}件\nX: ${xCount}件`
  );
}
```

---

## 参考リンク

- [結果スプレッドシート](https://docs.google.com/spreadsheets/d/1t571fqZJtUjNL7_gH6G2dSNBCmS98LTnDrWEtt7J92k/edit)
- [生徒マスタシート](https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit)
- [Render ダッシュボード](https://dashboard.render.com/)
- [Google Apps Script ドキュメント](https://developers.google.com/apps-script)

---

## サポート

問題が解決しない場合は、以下の情報を添えてお問い合わせください:

1. エラーメッセージ
2. 実行ログ（**表示** → **ログ**）
3. 実行した関数名
4. 実行日時
