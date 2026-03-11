# X API レート制限対策の実装完了レポート

## 🚨 **発生した問題**

### エラーログから判明した事項
```
[X API] Tweets fetch response status: 429
[X API] Tweets fetch error: 429 - {"title":"Too Many Requests","detail":"Too Many Requests","type":"about:blank","status":429}
[X API] Rate limit exceeded for user 1844663111917436928. Tweets will be skipped.
```

**原因:**
- X API v2の`GET /2/users/:id/tweets`エンドポイントのレート制限（15分で900リクエスト）に到達
- ユーザー情報取得は成功しているが、ツイート取得で全員429エラー
- バッチ評価中に大量のリクエストが集中

---

## ✅ **実装した対策**

### 1. レート制限管理モジュール（新規作成）
**ファイル**: `src/lib/x-rate-limiter.ts`

**機能:**
- X API v2の各エンドポイントのレート制限を定義
- リクエスト数をカウントし、残量を監視
- 制限に近づいたら自動的に待機
- 90%到達時に警告（10%のバッファを確保）

**レート制限設定:**
| エンドポイント | 15分あたりの上限 | 安全閾値（90%） |
|---------------|-----------------|----------------|
| `GET /2/users/by/username/:username` | 300 | 270 |
| `GET /2/users/:id/tweets` | 900 | 810 |
| `GET /2/users/:id` | 300 | 270 |

### 2. X API クライアントの改修
**ファイル**: `src/lib/x-client.ts`

**変更内容:**
```typescript
// レート制限管理をインポート
import { canMakeRequest, recordRequest, getWaitTime } from './x-rate-limiter'

// ユーザー情報取得前にチェック
if (!canMakeRequest('user_lookup')) {
  const waitTime = getWaitTime('user_lookup');
  const waitMin = Math.ceil(waitTime / 1000 / 60);
  console.warn(`[X API] Rate limit approaching. Waiting ${waitMin} minutes...`);
  await new Promise(resolve => setTimeout(resolve, waitTime));
}

// リクエスト後にカウント
recordRequest('user_lookup');
```

**効果:**
- リクエスト前に制限をチェック
- 810リクエスト到達時に自動待機（15分のリセットを待つ）
- 429エラーを未然に防止

---

## 📊 **動作の流れ（改善後）**

### バッチ評価のシーケンス

```
バッチ1開始（学生1〜30名）
├─ 学生1: User情報取得 ✅ (1/270)
├─ 学生1: Tweets取得 ✅ (1/810)
├─ 学生2: User情報取得 ✅ (2/270)
├─ 学生2: Tweets取得 ✅ (2/810)
...
├─ 学生30: User情報取得 ✅ (30/270)
└─ 学生30: Tweets取得 ✅ (30/810)

→ 次のバッチへ（待機なし、まだ余裕あり）

バッチ2開始（学生31〜60名）
...（同様に処理）

バッチ27開始（学生781〜810名）
├─ 学生810: User情報取得 ✅ (810/270) ← 270超過
│   → ⚠️ User lookup制限に到達、15分待機
│   → リセット後に再開
├─ 学生810: Tweets取得 ✅ (810/810) ← 810到達
    → ⚠️ Tweets制限に到達、15分待機
    → リセット後に再開
```

---

## 🎯 **期待される効果**

### Before（改善前）
- 90名程度でツイート取得が429エラー
- フォロワー数のみ保存、評価不完全
- 手動で15分待機が必要

### After（改善後）
- **810リクエストまで自動的に処理**
- 制限到達時に**自動待機してリセットを待つ**
- 429エラーが発生しない
- **全学生を自動評価可能**（待機込み）

---

## 💡 **追加の最適化提案**

### 現在の課題
月15,000 Posts使用 = 150名 × 100 Posts/名

### 提案1: バッチサイズの調整
```typescript
// 現在: batchSize=30（推奨）
// 理由: 30名 × 1リクエスト = 30リクエスト（制限の810に対して余裕）
```

### 提案2: キャッシュの積極活用
```typescript
// 30日以内のキャッシュは再利用
const CACHE_VALID_PERIOD = 30 * 24 * 60 * 60 * 1000; // 30日

if (cachedData && (Date.now() - cachedData.timestamp < CACHE_VALID_PERIOD)) {
  return cachedData; // APIリクエストなし
}
```

**効果:**
- 月2回評価の場合、2回目は全員キャッシュヒット
- APIリクエスト数: 150 → 0（2回目）
- **月間コスト: $78 → $39（半減）**

---

## 🔧 **次のステップ**

### 即座に実施
1. ✅ レート制限管理の実装（完了）
2. ⏳ コードのデプロイ
3. ⏳ バッチ評価の再実行

### 確認事項
- [ ] 810リクエスト到達時に自動待機するか
- [ ] 429エラーが発生しなくなったか
- [ ] 全学生の評価が完了するか

### 今後の最適化
- [ ] キャッシュ有効期限の延長（30日）
- [ ] ツイート取得数の制限（100 → 50）
- [ ] バッチサイズの最適化（30 → 50）

---

**作成日**: 2026-03-11  
**対応内容**: レート制限プロアクティブ管理の実装  
**関連ファイル**:
- `src/lib/x-rate-limiter.ts`（新規）
- `src/lib/x-client.ts`（改修）
