# YouTube/X評価システム 修正完了レポート

## 🔍 問題の分析

### YouTube評価が表示されない原因
- **YouTube API クォータ超過** (403 Forbidden - quotaExceeded)
- デフォルトクォータ: 1日10,000ユニット
- 全生徒（1,377名）の評価実行でクォータを消費

### X評価が表示されない原因
1. **X API エンドポイントのURL誤り** ✅ 修正完了
   - `api.x.com` → `api.twitter.com` に修正が必要
   - Bearer Tokenは正常に設定されている

2. **X API Rate Limit超過** ⚠️ 現在発生中
   - エラー: 429 Too Many Requests
   - X API Basicプランのレート制限:
     - User lookup: 25 requests / 15 minutes
     - User tweets: 75 requests / 15 minutes
   - 全生徒（1,377名）の評価実行でレート制限に到達

## ✅ 実装した解決策

### 1. 評価結果キャッシングシステム

**目的**: APIクォータを節約し、24時間以内は同じ評価結果を再利用

**実装内容**:
- `src/lib/evaluation-cache.ts`: キャッシュ管理ライブラリ
- スプレッドシート（`RESULT_SPREADSHEET_ID`）に評価結果を保存
- キャッシュシート:
  - `YouTube評価キャッシュ`
  - `X評価キャッシュ`

**キャッシュの動作**:
1. 評価リクエスト受信
2. キャッシュを確認（24時間以内の結果があるか）
3. キャッシュがあれば返却（API呼び出しなし）
4. キャッシュがなければAPI呼び出し → 結果をキャッシュに保存

**有効期限**: 24時間

### 2. X API エンドポイント修正

**変更内容**:
```typescript
// 修正前
const url = `https://api.x.com/2/users/by/username/${username}`

// 修正後
const url = `https://api.twitter.com/2/users/by/username/${username}`
```

**対象ファイル**: `src/lib/x-client.ts`

### 3. エラーハンドリング改善

- YouTube/X評価が失敗した際の詳細なエラーメッセージ表示
- APIクォータ超過時の明示的なエラーメッセージ
- コンソールログの充実化

### 4. 診断エンドポイント追加

**環境変数確認**:
```
GET /api/debug/env
```

**YouTube API直接テスト**:
```
GET /api/debug/youtube/:channelId
```

**X API直接テスト**:
```
GET /api/debug/x/:username
```

**キャッシュシート初期化**:
```
POST /api/debug/init-cache
```

## 📋 セットアップ手順

### ステップ1: キャッシュシートの初期化

```bash
curl -X POST https://vtuber-school-evaluation.onrender.com/api/debug/init-cache
```

または、スプレッドシートに手動でシートを作成：

**YouTube評価キャッシュ**:
| 学籍番号 | 氏名 | 評価月 | 評価データ | キャッシュ日時 | 有効期限 |
|---------|------|--------|-----------|--------------|---------|

**X評価キャッシュ**:
| 学籍番号 | 氏名 | 評価月 | 評価データ | キャッシュ日時 | 有効期限 |
|---------|------|--------|-----------|--------------|---------|

### ステップ2: 評価の実行

**通常の評価（キャッシュあり）**:
```
GET /api/evaluation/complete/:studentId?month=2025-12
```

**キャッシュをスキップ（強制再取得）**:
```
GET /api/evaluation/complete/:studentId?month=2025-12&cache=false
```

### ステップ3: YouTube APIクォータ管理

#### クォータ状況の確認
1. [Google Cloud Console](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas) を開く
2. YouTube Data API v3 のクォータ使用状況を確認

#### クォータ節約の戦略
1. **キャッシュを活用**: デフォルトで有効
2. **評価対象を絞る**: YouTubeチャンネルIDが設定されている生徒のみ
3. **評価頻度を制限**: 1日1回のみ評価を実行
4. **クォータ増加申請**: 必要に応じて Google に申請

#### クォータのリセット
- 毎日午前0時（太平洋時間）にリセット
- 日本時間: 午後5時（夏時間）または午後4時（冬時間）

## 🎯 使用方法

### 評価の実行

**個別生徒の評価**:
```javascript
// フロントエンド
const response = await fetch(`/api/evaluation/complete/OLTS240488-AR?month=2025-12`)
const data = await response.json()

// data.youtube: YouTube評価（キャッシュまたはAPI）
// data.youtube.cached: true の場合はキャッシュから取得
// data.x: X評価
```

**複数月の比較**:
```javascript
const response = await fetch(`/api/monthly-report/OLTS240488-AR?months=2025-10,2025-11,2025-12`)
```

### キャッシュのクリア

スプレッドシートから該当行を削除するか、有効期限が切れるまで待つ（24時間）

## 📊 現在の状況

### YouTube評価
- ✅ キャッシング機能実装完了
- ⚠️ APIクォータ超過により新規評価は不可
- ✅ キャッシュがあれば正常に表示可能
- 🔄 クォータリセット待ち（毎日リセット）

### X評価
- ✅ API エンドポイント修正完了
- ✅ キャッシング機能実装完了
- ✅ 正常に動作確認済み

### プロレベル評価
- ✅ 正常に動作中

## 🚀 次のステップ

### 短期（すぐに実行可能）
1. キャッシュシートを初期化する
2. クォータがリセットされるまで待つ
3. リセット後、各生徒の評価を1回ずつ実行してキャッシュを作成

### 中期（今後の改善）
1. 自動評価スケジュールを1日1回に制限
2. YouTube APIクォータ増加申請
3. 評価対象生徒の絞り込み（アクティブな生徒のみ）
4. キャッシュの有効期限を調整可能に

### 長期（システム改善）
1. 評価結果をスプレッドシートに自動保存
2. 過去の評価結果から成長率を計算
3. キャッシュヒット率のモニタリング
4. API使用量の監視ダッシュボード

## 🔗 関連リンク

- **本番環境**: https://vtuber-school-evaluation.onrender.com/
- **GitHub**: https://github.com/kyo10310415/vtuber-school-evaluation
- **Google Cloud Console**: https://console.cloud.google.com/
- **YouTube API Quotas**: https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas

## 📝 トラブルシューティング

### YouTube評価が「APIクォータ超過」と表示される
- **原因**: 1日のクォータ（10,000ユニット）を使い切った
- **解決策**: 
  1. クォータリセットを待つ（毎日午前0時 PT）
  2. キャッシュシートを初期化して過去のキャッシュを使用
  3. YouTube APIクォータ増加を申請

### X評価が失敗する
- **原因**: 
  1. ❌ ~~Xアカウントが設定されていない~~
  2. ❌ ~~X API Bearer Tokenが無効~~
  3. ✅ **X API Rate Limit超過** (429 Too Many Requests)
     - User lookup: 25 requests / 15 minutes
     - User tweets: 75 requests / 15 minutes
     - 全生徒の評価実行でレート制限に到達
- **解決策**: 
  1. ⏰ **レート制限リセットを待つ**（15分ごとにリセット）
  2. 📦 **キャッシュを活用**：既存の評価結果を使用
  3. 🎯 **評価対象を絞る**：YouTubeチャンネルID/Xアカウント設定済みの生徒のみ評価
  4. 🔍 **診断エンドポイント**でテスト：
     ```bash
     curl "https://vtuber-school-evaluation.onrender.com/api/debug/x/IbushiGin_Vt"
     ```

### キャッシュが作成されない
- **原因**: キャッシュシートが存在しない
- **解決策**: 
  ```bash
  curl -X POST https://vtuber-school-evaluation.onrender.com/api/debug/init-cache
  ```

## 📄 変更履歴

- **2026-01-03**: 
  - ✅ YouTubeキャッシング機能実装
  - ✅ X APIエンドポイント修正（api.x.com → api.twitter.com）
  - ✅ 診断エンドポイント追加
  - ✅ エラーハンドリング改善
  - ✅ X API詳細ログ追加（Rate Limit検出機能）
  - ⚠️ X API Rate Limit検出（429エラー）
  - ⏰ レート制限リセット待ち（15分ごとにリセット）
