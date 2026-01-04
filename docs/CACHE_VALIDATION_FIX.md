# キャッシュ検証ロジック修正

## 📅 修正日
2026-01-04

## 🎯 問題の概要

### 発生していた問題
1. **YouTube評価**: 403 quotaExceeded エラーでも動画0件の評価結果（Grade D）がキャッシュに保存される
2. **X評価**: 429 Too Many Requests エラーでもツイート0件の評価結果がキャッシュに保存される
3. **結果**: エラー結果がキャッシュされ、次回も同じエラーが返される

### 根本原因

#### YouTube評価
```typescript
// fetchRecentVideos() の動作
if (!searchResponse.ok) {
  console.error(`[YouTube API] Search error: ${searchResponse.status} - ${errorText}`);
  return [];  // ← 空配列を返す
}

// 結果
evaluateYouTubeChannel() が動画0件で評価を続行
  ↓
Grade D の評価オブジェクトを返す
  ↓
エラー結果がキャッシュに保存される ❌
```

#### X評価
```typescript
// fetchXUserByUsername() の動作
if (!response.ok) {
  console.error(`[X API] User fetch error: ${response.status}`);
  return null;  // ← null を返す
}

// 結果
evaluateXAccount() がユーザー取得失敗で null を返す
  ↓
null がキャッシュチェックを通過しない
  ↓
次回も API 呼び出し → レート制限に引っかかる ❌
```

## 🔧 修正内容

### 修正1: `/api/evaluate` エンドポイント

#### YouTube評価
```typescript
// ✅ Before
if (youtubeEval) {
  await saveCachedEvaluation(...)
}

// ✅ After
if (youtubeEval && youtubeEval.videosInMonth > 0) {
  await saveCachedEvaluation(...)
  console.log(`[/api/evaluate] YouTube evaluation saved for ${student.studentId}`)
} else {
  console.log(`[/api/evaluate] YouTube evaluation skipped cache (0 videos or API error) for ${student.studentId}`)
}
```

#### X評価
```typescript
// ✅ Before
if (xEval) {
  await saveCachedEvaluation(...)
}

// ✅ After
if (xEval && (xEval.tweetsInMonth > 0 || xEval.followersCount > 0)) {
  await saveCachedEvaluation(...)
  console.log(`[/api/evaluate] X evaluation saved for ${student.studentId}`)
} else {
  console.log(`[/api/evaluate] X evaluation skipped cache (no data or API error) for ${student.studentId}`)
}
```

### 修正2: `/api/evaluation/complete` エンドポイント

#### YouTube評価
```typescript
// ✅ Before
if (evaluation) {
  result.youtube = evaluation
  
  if (useCache) {
    await saveCachedEvaluation(...)
  }
  console.log(`[YouTube評価] API使用: ${studentId}`)
}

// ✅ After
if (evaluation) {
  result.youtube = evaluation
  
  if (useCache && evaluation.videosInMonth > 0) {
    await saveCachedEvaluation(...)
    console.log(`[YouTube評価] API使用（キャッシュ保存）: ${studentId}`)
  } else {
    console.log(`[YouTube評価] API使用（キャッシュスキップ：動画0件）: ${studentId}`)
  }
}
```

#### X評価
```typescript
// ✅ Before
if (evaluation) {
  result.x = evaluation
  
  if (useCache) {
    await saveCachedEvaluation(...)
  }
  console.log(`[X評価] API使用: ${studentId}`)
}

// ✅ After
if (evaluation) {
  result.x = evaluation
  
  if (useCache && (evaluation.tweetsInMonth > 0 || evaluation.followersCount > 0)) {
    await saveCachedEvaluation(...)
    console.log(`[X評価] API使用（キャッシュ保存）: ${studentId}`)
  } else {
    console.log(`[X評価] API使用（キャッシュスキップ：データ不足）: ${studentId}`)
  }
}
```

## ✅ 修正の効果

### Before（修正前）
```
評価実行
  ↓
YouTube評価: 403 quotaExceeded → 動画0件で Grade D → キャッシュ保存 ❌
  ↓
X評価: 429 Too Many Requests → ユーザー取得失敗 → null 返却
  ↓
次回評価
  ↓
YouTube: キャッシュヒット → Grade D（エラー結果）表示 ❌
X: API 再呼び出し → 再度レート制限 ❌
```

### After（修正後）
```
評価実行
  ↓
YouTube評価: 403 quotaExceeded → 動画0件で Grade D → キャッシュスキップ ✅
  ↓
X評価: 429 Too Many Requests → ユーザー取得失敗 → null 返却 → キャッシュスキップ ✅
  ↓
次回評価（クォータ/レート制限解除後）
  ↓
YouTube: キャッシュなし → API 再呼び出し → 正常評価 → キャッシュ保存 ✅
X: キャッシュなし → API 再呼び出し → 正常評価 → キャッシュ保存 ✅
```

## 📊 キャッシュ保存条件

### YouTube評価
- **保存する条件**: `videosInMonth > 0`
- **スキップする条件**: `videosInMonth === 0`（APIエラーで動画が取得できなかった場合）

### X評価
- **保存する条件**: `tweetsInMonth > 0 || followersCount > 0`
- **スキップする条件**: ツイート0件かつフォロワー情報がない（APIエラーでユーザー情報が取得できなかった場合）

## 🚀 次のステップ

### 1. 既存の不正キャッシュをクリア

結果スプレッドシートの `youtube_cache` と `x_cache` シートから、以下の条件に該当する行を削除：

- **YouTube**: `videosInMonth = 0` の行
- **X**: `tweetsInMonth = 0` かつ `followersCount = 0` の行

### 2. 再評価の実施

クォータ/レート制限が解除された後：

- **YouTube**: 毎日 00:00 PT（日本時間 16:00-17:00頃）にリセット
- **X**: 15分ごとにリセット

### 3. 動作確認

```bash
# 1. 評価実行
curl -X POST "https://vtuber-school-evaluation.onrender.com/api/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"month": "2025-12", "studentIds": ["OLTS240488-AR"]}'

# 2. ログ確認
# - YouTube: "[YouTube評価] API使用（キャッシュ保存）" が表示されるか
# - X: "[X評価] API使用（キャッシュ保存）" が表示されるか

# 3. 評価詳細で確認
curl "https://vtuber-school-evaluation.onrender.com/api/evaluation/complete/OLTS240488-AR?month=2025-12"
```

## 📚 関連ドキュメント

- [X評価エラー修正](./X_EVALUATION_FIX_SUMMARY.md)
- [評価エンドポイント統合](./EVALUATION_ENDPOINT_FIX.md)
- [バッチ評価概要](./BATCH_EVALUATION_SUMMARY.md)

## 🔗 関連コミット

- Commit: `8ffcab6` - Fix: Only cache successful evaluations (skip error results)
- Date: 2026-01-04
- Files: `src/index.tsx`
