# UI「データ読み込み」ボタンエラー修正

## 問題

所属生データページ (`https://vtuber-school-evaluation.onrender.com/analytics-data`) の「データ読み込み」ボタンをクリックすると、以下のエラーが発生：

```
エラー: Failed to fetch
```

## 原因

`/api/analytics/by-type` エンドポイントが **publicApiRoutes に含まれていなかった**ため、SSO 認証が要求され、フロントエンドからの直接アクセスが拒否されていました。

### 関連コード

**問題のあったコード (src/index.tsx 行71-82):**
```typescript
const publicApiRoutes = [
  '/api/analytics/auto-fetch',
  '/api/auto-evaluate',
  // ... 他のルート
  // ❌ /api/analytics/by-type が無い
];
```

**フロントエンド呼び出し (src/index.tsx 行779):**
```javascript
const response = await fetch('/api/analytics/by-type', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    studentId,
    channelId: student.youtubeChannelId,
    accessToken,
    startDate,
    endDate,
    saveHistory: true
  })
});
```

## 解決策

`/api/analytics/by-type` を publicApiRoutes に追加：

```typescript
const publicApiRoutes = [
  '/api/analytics/auto-fetch',
  '/api/analytics/by-type',  // ✅ 追加
  '/api/auto-evaluate',
  // ... 他のルート
];
```

## 修正手順

1. **コード修正完了** ✅
   - コミット: `3ff5ab4 - fix: Add /api/analytics/by-type to public API routes to fix UI button error`
   - GitHub: https://github.com/kyo10310415/vtuber-school-evaluation/commit/3ff5ab4

2. **Render 再デプロイ (必須)**
   - Render ダッシュボード (https://dashboard.render.com/) にアクセス
   - `vtuber-school-evaluation` サービスを選択
   - **Manual Deploy** → **Deploy latest commit** をクリック
   - デプロイ完了まで約 3-5 分待機

3. **動作確認**
   ```bash
   # ヘルスチェック
   curl https://vtuber-school-evaluation.onrender.com/api/health
   
   # テストエンドポイント
   curl https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test
   ```

4. **UI テスト**
   - https://vtuber-school-evaluation.onrender.com/analytics-data にアクセス
   - 日付範囲を選択（例: 過去7日間）
   - 「データ読み込み」ボタンをクリック
   - ✅ 期待結果: グラフ・データが正常に表示される

## 技術的詳細

### エンドポイント比較

| エンドポイント | 用途 | 認証 | タイムアウト |
|---|---|---|---|
| `/api/analytics/auto-fetch` | 週次バッチ処理 | 不要 (public) | 60分 |
| `/api/analytics/by-type` | UI手動データ取得 | **不要 (public)** ✅ | ブラウザ制限 |

### SSO 認証ミドルウェア

```typescript
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  
  // 公開APIルートはSSO認証をスキップ
  if (publicApiRoutes.some(route => path === route)) {
    return next();
  }
  
  // その他のルートはSSO認証を適用
  return ssoAuthMiddleware(c, next);
});
```

### データフロー

```
UI ボタンクリック
  ↓
POST /api/analytics/by-type
  {
    studentId: "OLST230013-OS",
    channelId: "UCxxxx",
    accessToken: "ya29.xxx",
    startDate: "2026-03-01",
    endDate: "2026-03-08",
    saveHistory: true
  }
  ↓
youtube-analytics-client.getVideosByType()
  ↓
YouTube Analytics API
  ↓
PostgreSQL (analytics_history)
  ↓
Response JSON
  {
    success: true,
    data: {
      shorts: { views, likes, ... },
      regular: { views, likes, ... },
      live: { views, likes, ... },
      overall: { subscribersGained, ... }
    }
  }
  ↓
Chart.js グラフ描画
```

## トラブルシューティング

### 1. 再デプロイ後もエラーが出る

**原因**: ブラウザキャッシュ

**解決策**:
```bash
# ハードリロード
- Windows/Linux: Ctrl + Shift + R
- Mac: Cmd + Shift + R

# または開発者ツールでキャッシュクリア
F12 → Network タブ → Disable cache にチェック
```

### 2. 「Access Token が無効です」エラー

**原因**: OAuth トークン期限切れ

**解決策**:
1. 該当生徒の「再認証」ボタンをクリック
2. Google アカウントで YouTube Analytics 権限を再付与
3. 元のページに戻り、再度「データ読み込み」を実行

### 3. データが表示されない

**チェック項目**:
```bash
# 1. OAuth トークン確認
curl https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test | jq .

# 期待される出力:
# {
#   "tokenCount": 10,
#   "studentsCount": 8,
#   "targetStudent": "NOT FOUND"
# }

# 2. API 直接テスト (要 accessToken 取得)
curl -X POST https://vtuber-school-evaluation.onrender.com/api/analytics/by-type \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "OLST230013-OS",
    "channelId": "UCxxxx",
    "accessToken": "ya29.xxx",
    "startDate": "2026-03-01",
    "endDate": "2026-03-08"
  }'
```

### 4. タイムアウトエラー

**原因**: Render Free Tier の起動遅延

**解決策**:
1. 先に別のページ（例: `/api/health`）をロードして Warm-up
2. 30秒待ってから「データ読み込み」をクリック
3. 有料プランへのアップグレード検討

## 関連ドキュメント

- [週次アナリティクス自動実行セットアップ](./WEEKLY_ANALYTICS_AUTO_SETUP.md)
- [週次アナリティクスエラー修正](./WEEKLY_ANALYTICS_ERROR_FIX.md)
- [手動実行ガイド](./MANUAL_EXECUTION_GUIDE.md)
- [README](./README.md)

## 修正履歴

- **2026-03-15**: 初回修正 - `/api/analytics/by-type` を publicApiRoutes に追加
- コミット: `3ff5ab4`
- GitHub: https://github.com/kyo10310415/vtuber-school-evaluation/commit/3ff5ab4
