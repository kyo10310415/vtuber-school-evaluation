#!/bin/bash
# 環境変数確認スクリプト

echo "====================================="
echo "週次アナリティクス環境変数確認"
echo "====================================="
echo ""

echo "1. 設定確認エンドポイントを実行..."
curl -s https://vtuber-school-evaluation.onrender.com/api/analytics/auto-fetch/test | jq .

echo ""
echo "====================================="
echo "確認項目:"
echo "====================================="
echo ""
echo "✅ hasServiceAccount: true であること"
echo "✅ hasWeeklySpreadsheetId: true であること"
echo "✅ weeklySpreadsheetId: NOT SET でないこと"
echo "✅ oauthTokensCount: > 0 であること"
echo ""
echo "もし hasWeeklySpreadsheetId が false の場合:"
echo "→ Renderの環境変数に WEEKLY_ANALYTICS_SPREADSHEET_ID を追加してください"
echo ""
