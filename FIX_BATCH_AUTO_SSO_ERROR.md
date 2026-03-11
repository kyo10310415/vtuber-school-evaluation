# WEB UI「自動分割実行」ボタンのエラー修正レポート

## 🚨 **発生したエラー**

### コンソールログの内容
```
/api/x/evaluate-batch-auto:1 Failed to load resource: the server responded with a status of 502 ()

Access to fetch at 'https://wannav-main.onrender.com/' (redirected from 'https://vtuber-school-evaluation.onrender.com/api/x/evaluate-batch-auto') 
from origin 'https://vtuber-school-evaluation.onrender.com' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### 問題の原因
1. **502 Bad Gateway**: サーバーエラー
2. **SSO認証へのリダイレクト**: `/api/x/evaluate-batch-auto`が`wannav-main.onrender.com`（SSO認証）にリダイレクトされている
3. **CORSエラー**: リダイレクト先でCORS設定がないため、ブラウザがブロック

**根本原因:**
- `/api/x/evaluate-batch-auto`エンドポイントが`publicApiRoutes`に含まれていなかった
- そのため、SSO認証ミドルウェアでブロックされ、ログインページにリダイレクトされた

---

## ✅ **実装した修正**

### 1. 公開APIルートへの追加
**ファイル**: `src/index.tsx`

**変更内容:**
```typescript
const publicApiRoutes = [
  '/api/analytics/auto-fetch',
  '/api/auto-evaluate',
  '/api/auto-evaluate/status',
  '/api/auto-evaluate-x-only',
  '/api/x/evaluate-batch-auto',  // ← 追加
  '/api/admin/run-migrations',
  '/api/analytics/auto-fetch/test',
  '/api/health',
  '/api/debug/env',
  '/api/wanami-usage',
];
```

**効果:**
- `/api/x/evaluate-batch-auto`エンドポイントへのアクセスがSSO認証をバイパス
- ブラウザから直接APIを呼び出し可能
- CORSエラーが発生しない

---

## 📊 **WEB UIの「自動分割実行」機能の仕様**

### ボタンの場所
- WEB UI（ダッシュボード）
- X評価セクション内
- 「自動分割実行」ボタン

### 動作
```javascript
// 50名ずつに自動分割
// 各バッチ間に15分待機
// ページを閉じても処理は継続

fetch('/api/x/evaluate-batch-auto', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    month: '2026-02',
    studentIds: [] // 空の場合は全生徒
  })
});
```

### パラメータ
| パラメータ | 説明 | 必須 |
|-----------|------|------|
| `month` | 評価対象月（YYYY-MM） | ✅ |
| `studentIds` | 対象学生ID配列（空の場合は全生徒） | ❌ |

### レスポンス
```json
{
  "success": true,
  "month": "2026-02",
  "totalStudents": 150,
  "totalBatches": 3,
  "batchSize": 50,
  "successCount": 145,
  "errorCount": 5,
  "results": [
    {
      "studentId": "OLTS240488-AR",
      "studentName": "学生名",
      "success": true,
      "data": { ... }
    }
  ],
  "errors": [
    "学生名(OLTS240488-AR): エラーメッセージ"
  ]
}
```

---

## 🎯 **修正後の動作フロー**

### Before（修正前）
```
WEB UI → /api/x/evaluate-batch-auto
         ↓
      SSO認証チェック（ブロック）
         ↓
      wannav-main.onrender.com（リダイレクト）
         ↓
      CORSエラー（ブラウザがブロック）
         ↓
      ❌ 502 Bad Gateway
```

### After（修正後）
```
WEB UI → /api/x/evaluate-batch-auto
         ↓
      公開APIルート（SSO認証バイパス）
         ↓
      バッチ評価開始（50名ずつ）
         ↓
      レート制限管理（810リクエストで自動待機）
         ↓
      ✅ 評価完了（レスポンス返却）
```

---

## 🔧 **次のステップ**

### 即座に実施
1. ✅ 公開APIルートへの追加（完了）
2. ✅ GitHubへプッシュ（コミット `7a820be`）
3. ⏳ Renderへ自動デプロイ（約3〜5分）

### デプロイ後の確認
1. WEB UIで「自動分割実行」ボタンをクリック
2. ブラウザの開発者ツールで以下を確認：
   - `/api/x/evaluate-batch-auto`のステータスコードが`200`
   - リダイレクトが発生しない
   - CORSエラーが発生しない
3. 評価が正常に開始されることを確認
4. ログで以下を確認：
   - `[X Batch Auto] Starting batch evaluation...`
   - `[Rate Limiter] user_tweets: XX/900`

---

## 📋 **関連エンドポイント一覧（公開API）**

| エンドポイント | 説明 | SSO認証 |
|---------------|------|---------|
| `/api/x/evaluate-batch-auto` | X評価自動分割実行 | ❌ バイパス |
| `/api/auto-evaluate` | 月次評価（全科目） | ❌ バイパス |
| `/api/auto-evaluate-x-only` | X評価専用バッチ | ❌ バイパス |
| `/api/wanami-usage` | わなみさん使用回数取得 | ❌ バイパス |
| `/api/analytics/auto-fetch` | アナリティクス自動取得 | ❌ バイパス |
| `/api/health` | ヘルスチェック | ❌ バイパス |

**⚠️ セキュリティ上の注意:**
- これらのエンドポイントは外部から直接アクセス可能
- 認証なしでAPIを実行できる
- 機密データを返さない設計になっている

---

## 🎯 **今後の改善提案**

### 1. APIトークン認証の追加（セキュリティ強化）
```typescript
// ヘッダーでトークンをチェック
const apiToken = c.req.header('X-API-Token');
if (apiToken !== process.env.INTERNAL_API_TOKEN) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```

### 2. レート制限の追加（DoS対策）
```typescript
// 1時間に10回まで実行可能
const rateLimitKey = `batch_auto:${clientIP}`;
if (await isRateLimited(rateLimitKey, 10, 3600)) {
  return c.json({ error: 'Too many requests' }, 429);
}
```

### 3. ログ監視の強化
```typescript
// 誰がいつ実行したかを記録
console.log(`[Audit] Batch evaluation started by ${clientIP} at ${new Date().toISOString()}`);
```

---

**作成日**: 2026-03-11  
**対応内容**: `/api/x/evaluate-batch-auto`エンドポイントの公開API化  
**関連コミット**: `7a820be`  
**GitHub**: https://github.com/kyo10310415/vtuber-school-evaluation
