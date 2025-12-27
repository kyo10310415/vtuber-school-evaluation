#!/bin/bash
# 生徒マスタシート更新用の簡易スクリプト
# 使い方: NotionからCSVをダウンロードして、このスクリプトに渡す

if [ "$#" -ne 1 ]; then
    echo "使い方: ./update_sns_accounts.sh <NotionからエクスポートしたCSVファイル>"
    exit 1
fi

CSV_FILE="$1"

if [ ! -f "$CSV_FILE" ]; then
    echo "エラー: ファイルが見つかりません: $CSV_FILE"
    exit 1
fi

echo "=== NotionCSVから生徒マスタシート用のTSVを生成 ==="

# TSVファイルを生成
OUTPUT_FILE="sns_accounts_$(date +%Y%m%d).tsv"

python3 << 'PYTHON_EOF'
import csv
import sys
import os

input_file = sys.argv[1]
output_file = sys.argv[2]

with open(input_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    headers = next(reader)
    
    # 列番号を確認
    student_id_idx = 43  # 学籍番号
    x_id_idx = 13        # X ID
    yt_id_idx = 16       # YouTubeチャンネルID
    
    # データを抽出
    data = []
    for row in reader:
        if len(row) > max(student_id_idx, x_id_idx, yt_id_idx):
            student_id = row[student_id_idx].strip()
            x_id = row[x_id_idx].strip()
            yt_id = row[yt_id_idx].strip()
            
            if student_id:
                data.append([student_id, yt_id, x_id])
    
    # TSV出力
    with open(output_file, 'w', encoding='utf-8') as out:
        for row in data:
            out.write("\t".join(row) + "\n")
    
    print(f"✅ TSVファイル生成完了: {output_file}")
    print(f"   生徒数: {len(data)}件")

PYTHON_EOF

python3 -c "import sys; sys.argv = ['', '$CSV_FILE', '$OUTPUT_FILE']" << 'PYTHON_EOF'
import csv
import sys

input_file = sys.argv[1]
output_file = sys.argv[2]

with open(input_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    headers = next(reader)
    
    student_id_idx = 43
    x_id_idx = 13
    yt_id_idx = 16
    
    data = []
    for row in reader:
        if len(row) > max(student_id_idx, x_id_idx, yt_id_idx):
            student_id = row[student_id_idx].strip()
            x_id = row[x_id_idx].strip()
            yt_id = row[yt_id_idx].strip()
            
            if student_id:
                data.append([student_id, yt_id, x_id])
    
    with open(output_file, 'w', encoding='utf-8') as out:
        for row in data:
            out.write("\t".join(row) + "\n")
    
    print(f"✅ TSVファイル生成完了: {output_file}")
    print(f"   生徒数: {len(data)}件")
PYTHON_EOF

echo ""
echo "=== 次のステップ ==="
echo "1. $OUTPUT_FILE をテキストエディタで開く"
echo "2. すべての内容をコピー（Ctrl+A → Ctrl+C）"
echo "3. Google Apps Scriptの DATA 変数に貼り付け"
echo "4. updateSNSAccounts() を実行"
