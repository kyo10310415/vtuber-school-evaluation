# 欠席データ取得のPostgreSQL移行

## 概要

プロレベル評価における欠席データの取得元を、Google スプレッドシートから PostgreSQL データベース（wannav_student_management）の「レッスン報告」テーブルに変更しました。

## 変更内容

### 1. 新規ファイル追加

- **`src/lib/absence-manager.ts`**
  - PostgreSQL から欠席データを取得する関数 `fetchAbsenceDataFromPostgres` を実装
  - 過去3ヶ月間の「レッスン報告」から欠席回数を集計

### 2. 既存ファイル修正

- **`src/index.tsx`**
  - L7: `fetchAbsenceDataFromPostgres` をインポート
  - L3541: `/api/evaluate` で PostgreSQL から欠席データ取得
  - L3961: `/api/auto-evaluate` で PostgreSQL から欠席データ取得

- **`.env.production.example`**
  - `DATABASE_URL` 環境変数を追加

- **`render.yaml`**
  - `DATABASE_URL` 環境変数を追加（sync: false）

## データベーススキーマ

### `lesson_reports` テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| `id` | integer | 主キー |
| `student_id` | text | 学籍番号 |
| `lesson_date` | date | レッスン日 |
| `lesson_result` | text | レッスン結果（実施済み/生徒様都合でリスケ/無断キャンセル） |
| `lesson_number` | text | レッスン番号 |
| `pro_curriculum` | text | プロカリキュラム |
| `pro_text_number` | text | プロテキスト番号 |
| `tutor_name` | text | 講師名 |
| `reported_by` | text | 報告者 |
| `reported_at` | timestamp | 報告日時 |
| `updated_at` | timestamp | 更新日時 |

## 欠席判定ロジック

`lesson_result` カラムの値によって欠席を判定:

- **欠席扱い**: 
  - `生徒様都合でリスケ`
  - `無断キャンセル`
  
- **出席扱い**:
  - `実施済み`

## 集計期間

評価月の前月末から遡って3ヶ月間のレッスン報告を集計します。

**例**: 評価月が `2026-03` の場合
- 開始日: `2025-12-01`
- 終了日: `2026-03-31`（評価月の最終日）

## 環境変数設定

Render ダッシュボードで以下の環境変数を設定してください:

```
DATABASE_URL=postgresql://wannav_student_management_user:h3C2XSTV6YPywcATL3WTZHwrruFmrAHB@dpg-d6ar8bd6ubrc73crlk10-a.singapore-postgres.render.com/wannav_student_management
```

## テスト方法

ローカルでテスト:

```bash
# テストスクリプトを実行
npx tsx test-absence-fetch.js
```

期待される出力例:
```
[fetchAbsenceDataFromPostgres] Connected to PostgreSQL
[fetchAbsenceDataFromPostgres] Date range: { from: '2025-12-01', to: '2026-03-31' }
[fetchAbsenceDataFromPostgres] Found 1 students with absences
✅ Successfully fetched absence data for 1 students

Sample data (first 5 students):
  - OLTS250961-MR: 1 absences in 2026-03
```

## 関連システム

データベースは以下のシステムで管理されています:
- **リポジトリ**: https://github.com/kyo10310415/wannav-student-management
- **テーブル**: `lesson_reports`

## 旧実装との比較

| 項目 | 旧実装（スプレッドシート） | 新実装（PostgreSQL） |
|-----|------------------------|---------------------|
| データソース | Google スプレッドシート | PostgreSQL database |
| スプレッドシートID | `19dlNvTEp3SaFgXK7HWEamyhJDKpAODqoTnRhqOtNC4k` | - |
| 関数 | `fetchAbsenceData` | `fetchAbsenceDataFromPostgres` |
| 認証 | Google Service Account | PostgreSQL接続文字列 |
| パフォーマンス | API呼び出し遅延あり | データベース直接アクセスで高速 |

## 注意事項

- 旧実装の `fetchAbsenceData` 関数（`src/lib/google-client.ts`）は残していますが、使用されていません
- 必要に応じて将来削除可能です
- `ABSENCE_SPREADSHEET_ID` 環境変数も不要になりましたが、後方互換性のため残しています

## デプロイ手順

1. Render ダッシュボードで `DATABASE_URL` 環境変数を設定
2. GitHub に変更をプッシュ
3. Render が自動デプロイ
4. `/api/auto-evaluate` エンドポイントで動作確認

## トラブルシューティング

### 接続エラー

```
Error: connection refused
```

→ DATABASE_URL が正しく設定されているか確認してください。

### SSL エラー

```
Error: self signed certificate
```

→ `absence-manager.ts` で `ssl: { rejectUnauthorized: false }` を設定済みです。

### データが取得できない

```
Found 0 students with absences
```

→ 以下を確認:
1. `lesson_reports` テーブルにデータが存在するか
2. `lesson_date` が指定期間内か
3. `lesson_result` が `実施済み` 以外のレコードが存在するか

## 更新履歴

- **2026-04-09**: PostgreSQL 移行完了、テスト成功
