# 🚀 Renderデプロイ - 完全ガイド

## 📋 準備完了状況

✅ **GitHubリポジトリ**: https://github.com/kyo10310415/vtuber-school-evaluation  
✅ **スプレッドシート構造**: 実際のデータ構造に対応済み  
✅ **コード**: 本番デプロイ可能

---

## 🔐 必要な環境変数

### 1. GOOGLE_SERVICE_ACCOUNT

Google Cloud Projectのサービスアカウントキー（JSON形式、1行）

**取得方法**:
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. サービスアカウントを作成
3. JSONキーをダウンロード
4. 改行を削除して1行に変換

**変換方法**:
```bash
# macOS/Linux
cat service-account.json | jq -c

# オンラインツール
# https://jsonformatter.org/json-minify
```

**サンプル**:
```
{"type":"service_account","project_id":"your-project",...}
```

---

### 2. GEMINI_API_KEY

Google Gemini APIキー

**取得方法**:
1. [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
2. 「Create API Key」をクリック
3. APIキーをコピー

---

### 3. STUDENT_MASTER_SPREADSHEET_ID

**値**: `1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M`

**スプレッドシート**: https://docs.google.com/spreadsheets/d/1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M/edit

**シート名**: `リスト`（コード内でデフォルト設定済み）

**列構造**:
- A列: 学籍番号
- B列: 氏名
- C列: トークメモフォルダURL
- D列: 入学年月
- E列: ステータス

**⚠️ 重要**: サービスアカウントに**閲覧権限**を付与してください

---

### 4. ABSENCE_SPREADSHEET_ID

**値**: `19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k`

**スプレッドシート**: https://docs.google.com/spreadsheets/d/19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k/edit

**列構造**:
- F列: 学籍番号
- G列: 前月の欠席回数

**⚠️ 重要**: サービスアカウントに**閲覧権限**を付与してください

---

### 5. PAYMENT_SPREADSHEET_ID

**値**: `1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo`

**スプレッドシート**: https://docs.google.com/spreadsheets/d/1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo/edit

**シート名**: `RAW_支払い状況`

**列構造**:
- ヘッダー行: 13行目
- E列: 学籍番号
- AN列以降: 支払いステータス（ヘッダーがyyyy/mm形式）

**システムの動作**:
- ヘッダー行（13行目）のAN列以降から対象月（yyyy/mm形式）を検索
- 該当する列のデータ（14行目以降）を取得して評価

**⚠️ 重要**: サービスアカウントに**閲覧権限**を付与してください

---

### 6. RESULT_SPREADSHEET_ID

**新規作成が必要**

**目的**: システムが自動で採点結果を書き込むスプレッドシート

**作成方法**:
1. [新規スプレッドシート作成](https://docs.google.com/spreadsheets/create)
2. 名前を「評価結果」などに変更
3. URLからIDをコピー: `https://docs.google.com/spreadsheets/d/【ここがID】/edit`
4. **空のままでOK**（システムが自動で書き込み）

**⚠️ 重要**: サービスアカウントに**編集権限**を付与してください

---

## 🔧 サービスアカウント権限設定

**サービスアカウントのメールアドレス**:
```
your-service-account@your-project.iam.gserviceaccount.com
```

### 各スプレッドシートに共有設定

| スプレッドシート | 必要な権限 | ID |
|----------------|----------|-----|
| 生徒マスター | 閲覧者 | `1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M` |
| 欠席データ | 閲覧者 | `19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k` |
| 支払いデータ | 閲覧者 | `1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo` |
| 結果出力 | **編集者** | （新規作成したスプレッドシートのID） |

**共有手順**:
1. 各スプレッドシートを開く
2. 右上の「共有」ボタンをクリック
3. サービスアカウントのメールアドレスを追加
4. 適切な権限（閲覧者 or 編集者）を選択
5. 「送信」をクリック

---

## 🚀 Renderデプロイ手順

### ステップ1: Renderアカウント作成

👉 **https://render.com/** にアクセスしてサインアップ

### ステップ2: 新しいWeb Serviceを作成

1. **「New +」** ボタンをクリック
2. **「Web Service」** を選択
3. **「Connect GitHub」** をクリック
4. リポジトリを選択: **`vtuber-school-evaluation`**

### ステップ3: 基本設定

| 項目 | 値 |
|------|---|
| **Name** | `vtuber-school-evaluation` |
| **Region** | `Oregon (US West)` |
| **Branch** | `main` |
| **Root Directory** | （空欄） |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |

### ステップ4: Instance Type選択

- **Free** を選択

⚠️ **注意**: 無料プランは15分非アクティブでスリープします

### ステップ5: 環境変数設定

「Environment」セクションの「Add Environment Variable」をクリックして、以下をすべて追加：

```
NODE_ENV=production
GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}
GEMINI_API_KEY=your-gemini-api-key
STUDENT_MASTER_SPREADSHEET_ID=1MHRtvgDb-AWm7iBz9ova7KknwCrbcykp15ZtAlkbq-M
ABSENCE_SPREADSHEET_ID=19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k
PAYMENT_SPREADSHEET_ID=1z-FKQnVZj9gtZEAbOFqfSkQyYqTWkmeZjTBBbzVxRpo
RESULT_SPREADSHEET_ID=your-result-spreadsheet-id
```

**⚠️ 注意**:
- `GOOGLE_SERVICE_ACCOUNT`は改行なしの1行JSON
- `RESULT_SPREADSHEET_ID`は新規作成したスプレッドシートのID

### ステップ6: デプロイ実行

「**Create Web Service**」ボタンをクリック

デプロイには5〜10分かかります。

---

## ✅ デプロイ完了後の確認

### 1. URLを確認

デプロイ完了後、以下のようなURLが発行されます：
```
https://vtuber-school-evaluation.onrender.com
```

### 2. ヘルスチェック

```bash
curl https://vtuber-school-evaluation.onrender.com/api/health
```

**期待されるレスポンス**:
```json
{"status":"ok","timestamp":"2024-12-11T..."}
```

### 3. 生徒一覧取得

```bash
curl https://vtuber-school-evaluation.onrender.com/api/students
```

**期待されるレスポンス**:
```json
{
  "success": true,
  "students": [
    {
      "studentId": "2024001",
      "name": "山田太郎",
      "talkMemoFolderUrl": "https://...",
      "enrollmentDate": "2024-04",
      "status": "在籍中"
    }
  ]
}
```

---

## 🎯 Google Apps Scriptの設定

デプロイ完了後、`gas-script.js`の`API_BASE_URL`を更新：

```javascript
// デプロイしたRenderのURLに変更
const API_BASE_URL = 'https://vtuber-school-evaluation.onrender.com';
```

### トリガー設定

1. Google Apps Scriptエディタで「トリガー」（時計アイコン）をクリック
2. 「トリガーを追加」
3. 以下のように設定：
   - 実行する関数: `runMonthlyEvaluation`
   - イベントのソース: `時間主導型`
   - 時間ベースのトリガーのタイプ: `月タイマー`
   - 日: `1日`
   - 時刻: `午前9時～10時`

---

## 🐛 トラブルシューティング

### エラー: "Application failed to start"

**原因**: 環境変数が不足または不正

**解決策**:
1. Render Dashboard → Service → Environment タブを確認
2. すべての環境変数が設定されているか確認
3. `GOOGLE_SERVICE_ACCOUNT`のJSON形式が正しいか確認

### エラー: "Permission denied"

**原因**: サービスアカウントの権限不足

**解決策**:
1. 各スプレッドシートの共有設定を確認
2. サービスアカウントのメールアドレスが共有されているか確認
3. 適切な権限（閲覧者 or 編集者）が付与されているか確認

### エラー: "Service Unavailable"

**原因**: Renderの無料プランはスリープする

**解決策**:
- 初回リクエスト時に起動を待つ（30秒程度）
- または有料プラン（$7/月〜）にアップグレード

### デプロイログの確認

Render Dashboard → Service → Logs タブでログを確認

---

## 📊 料金について

### Render Free Plan（無料）
- ✅ 750時間/月の稼働時間
- ⚠️ 15分非アクティブでスリープ
- ✅ 月次バッチ処理には十分

### Render Starter Plan（$7/月）
- ✅ 常時稼働
- ✅ スリープなし

---

## 🎉 完了チェックリスト

- [ ] Google Cloud Projectでサービスアカウント作成完了
- [ ] Gemini APIキー取得完了
- [ ] 結果出力用スプレッドシート作成完了
- [ ] すべてのスプレッドシートにサービスアカウントを共有完了
- [ ] Renderでデプロイ完了
- [ ] ヘルスチェックAPI動作確認完了
- [ ] 生徒一覧API動作確認完了
- [ ] Google Apps Script設定完了
- [ ] 月次トリガー設定完了

---

**デプロイ完了後、このチェックリストを確認してください！** ✅

---

**作成日**: 2024-12-11  
**GitHubリポジトリ**: https://github.com/kyo10310415/vtuber-school-evaluation
