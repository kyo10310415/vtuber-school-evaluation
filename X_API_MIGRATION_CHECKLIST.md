# X API従量課金移行 緊急対応チェックリスト

## 🚨 即座に確認すべき項目

### 1. X API Developer Console
**URL**: https://developer.x.com/en/portal/dashboard

#### 確認事項：
- [ ] **現在のプラン**：Basic（月額固定）or Pay-Per-Use（従量課金）？
- [ ] **Bearer Token の有効性**：環境変数 `X_BEARER_TOKEN` が有効か？
- [ ] **クレジット残高**：残高がある場合、残り金額は？
- [ ] **支払い方法**：クレジットカードが登録済みか？
- [ ] **使用量履歴**：直近1ヶ月のAPI呼び出し数とクレジット消費量
- [ ] **レート制限設定**：v2エンドポイントの制限値（15分あたりのリクエスト数）

---

## 📋 システム側の対応（優先度順）

### 🔴 緊急対応（今すぐ実施）

#### A. X評価のスキップオプション活用
現在のバッチ評価では `skipX=true` パラメータでX評価をスキップ可能。

**一時的にX評価を停止する場合：**
```bash
curl -X POST "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate?month=2026-02&skipX=true&skipYouTube=true&batchSize=30" \
  -H "Content-Type: application/json" \
  --max-time 600
```

#### B. キャッシュの積極的活用
システムは既にキャッシュ機能を実装済み。
- 評価結果は `評価キャッシュ` スプレッドシートに保存される
- 再評価時は自動的にキャッシュから取得（APIリクエストなし）

**確認方法：**
```bash
# キャッシュを優先（API呼び出しを最小化）
curl -X GET "https://vtuber-school-evaluation.onrender.com/api/x/evaluate/OLTS240488-AR?month=2026-02"
# ログに "[X評価] キャッシュ使用" と表示される
```

---

### 🟡 短期対応（1週間以内）

#### C. 従量課金対応のクォータ管理実装

**必要な変更：**
1. クレジット残高の取得（Developer Console APIまたは手動入力）
2. リクエストごとのクレジット消費量を記録
3. 残高が閾値を下回ったらアラート

**実装案：**
```typescript
// src/lib/x-quota-manager.ts に追加
export interface CreditStatus {
  balance: number; // 残りクレジット（$）
  threshold: number; // アラート閾値（$5未満で警告）
  lastUpdated: string;
}

// リクエスト前にクレジット残高をチェック
export async function checkCreditBalance(
  apiKey: string
): Promise<CreditStatus> {
  // Developer Console APIまたは手動入力から取得
  // 実装詳細はX API仕様に依存
}
```

#### D. レート制限の監視強化

**現在の実装：**
- 429エラーを検出して `rateLimited: true` を返す
- キャッシュに保存せず、次回再試行

**改善案：**
- レート制限エラー発生時は**自動リトライ**（15分後）
- バッチ評価を一時停止し、制限解除後に再開

---

### 🟢 中長期対応（1ヶ月以内）

#### E. 代替データソースの検討

**X API依存度を下げる選択肢：**

1. **手動入力への移行**
   - 月次レポートとして学生自身がX統計を報告
   - スプレッドシートに手動記入

2. **スクレイピング（非推奨）**
   - X APIを使わず公開プロフィールから取得
   - 規約違反リスクあり、非推奨

3. **評価基準の見直し**
   - X評価を必須項目から任意項目に変更
   - YouTube、トークメモ、わなみ使用回数など他の指標を重視

---

## 💰 コスト試算（従量課金の場合）

### 想定シナリオ
- 生徒数：150名
- 月間評価回数：2回
- 1名あたりリクエスト数：2〜3（ユーザー情報 + ツイート取得）
- 月間総リクエスト数：600〜900

### クレジット消費量（仮）
※正確な料金はX API Developer Consoleで確認

- ユーザー情報取得：$0.01/リクエスト
- ツイート取得：$0.02/リクエスト（ページネーションあり）
- **月間推定コスト：$18〜$36**

**旧Basicプラン（月$100）と比較して安価な可能性あり**
→ ただし、クレジット残高の管理が必須

---

## 🛠️ 実装サポート

必要に応じて以下の実装を提供可能：
1. クレジット残高チェック機能
2. 従量課金対応のクォータ管理
3. 自動リトライロジック
4. アラート通知（残高不足時）

**質問・確認が必要な事項：**
- X API Developer Consoleのスクリーンショット共有
- 現在のプランと支払い状況
- 月間予算の上限設定

---

## 📞 次のステップ

1. **今すぐ**：X API Developer Consoleにログインして現状確認
2. **確認後**：このチェックリストに沿って報告
3. **対応方針決定**：X評価を継続 or 一時停止 or 代替手段を選択

---

**作成日**: 2026-03-11
**システム**: VTuber School Evaluation System
**GitHub**: https://github.com/kyo10310415/vtuber-school-evaluation
