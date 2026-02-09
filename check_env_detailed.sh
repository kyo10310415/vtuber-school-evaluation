#!/bin/bash
# 環境変数確認（詳細版）

echo "====================================="
echo "環境変数確認 - 詳細モード"
echo "====================================="
echo ""

echo "実行中..."
curl -v https://vtuber-school-evaluation.onrender.com/api/analytics/check-env

echo ""
echo ""
echo "====================================="
echo "JSONフォーマット版"
echo "====================================="
curl -s https://vtuber-school-evaluation.onrender.com/api/analytics/check-env | jq .

echo ""
