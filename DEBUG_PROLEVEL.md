# プロレベル評価が実行されない問題 - デバッグガイド

## 🔍 確認すべきログ

Renderのログで以下を確認してください：

### 1. 実行開始ログ
```
[Auto Evaluate] Starting evaluation for 2025-12
[Auto Evaluate] Batch size: 5, Batch index: 0
[Auto Evaluate] Found XXX total students
[Auto Evaluate] Filtered to XXX active students
[Auto Evaluate] Processing batch 0: students 1-5
```

### 2. 生徒ごとの処理ログ
```
[Auto Evaluate] Processing student: OLST230013-OS (岡本恵里奈)
[Auto Evaluate] Fetching talk memo for OLST230013-OS
```

### 3. エラーログ
```
[Auto Evaluate] Pro-level evaluation error for OLST230013-OS: <エラー内容>
```

または

```
[Auto Evaluate] Error: <エラー内容>
```

## 📋 確認項目

### A. Geminiが初期化されているか
ログに以下が表示されているか確認：
```
Gemini analyzer not initialized
```

### B. トークメモフォルダへのアクセス権限
ログに以下が表示されているか確認：
```
Failed to fetch spreadsheet metadata: 403
Permission denied
```

### C. トークメモドキュメントが見つからない
ログに以下が表示されているか確認：
```
[Auto Evaluate] No talk memo document found for OLST230013-OS
```

### D. タイムアウト
処理が途中で停止している

### E. バッチサイズの問題
大量の生徒を一度に処理しようとしてタイムアウト

## 🚀 次のステップ

以下の情報を共有してください：

1. **Renderログの該当部分**
   - 特に `[Auto Evaluate]` で始まる行
   - エラーメッセージ全文

2. **実行時のパラメータ**
   - バッチサイズ
   - バッチインデックス
   - スキップフラグ

3. **処理された生徒数**
   - ログに表示される成功数
   - スプレッドシートに書き込まれた件数

## 🔧 手動テスト方法

### 1人だけテストする
```bash
curl -X POST "https://vtuber-school-evaluation.onrender.com/api/auto-evaluate?month=2025-12&batchSize=1&batchIndex=0" \
  -H "Content-Type: application/json" \
  --max-time 300
```

### ログを詳しく見る
Renderダッシュボード → Logs → `[Auto Evaluate]` で検索

---

**Renderのログ全文を共有してください！**
