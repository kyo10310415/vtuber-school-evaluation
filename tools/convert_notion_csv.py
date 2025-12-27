#!/usr/bin/env python3
"""
Notion CSV → TSV 変換スクリプト

使い方:
    python convert_notion_csv.py <CSVファイルのパス>

例:
    python convert_notion_csv.py "WannaV生徒名簿.csv"
"""

import csv
import sys
from datetime import datetime
from pathlib import Path


def convert_csv_to_tsv(csv_file_path):
    """NotionのCSVファイルをTSVに変換"""
    
    # ファイル存在チェック
    csv_path = Path(csv_file_path)
    if not csv_path.exists():
        print(f"❌ エラー: ファイルが見つかりません: {csv_file_path}")
        sys.exit(1)
    
    print(f"📄 CSVファイルを読み込み中: {csv_path.name}")
    
    # CSVを読み込み
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        
        # 列インデックスを特定
        try:
            student_id_idx = headers.index('学籍番号')
            x_id_idx = headers.index('X ID（＠は無し）')
            yt_id_idx = headers.index('YTチャンネルID')
        except ValueError as e:
            print(f"❌ エラー: 必要な列が見つかりません")
            print(f"   必要な列: 学籍番号, X ID（＠は無し）, YTチャンネルID")
            print(f"   見つかった列: {', '.join(headers[:10])}...")
            sys.exit(1)
        
        print(f"✅ 列を特定しました:")
        print(f"   - 学籍番号: {student_id_idx + 1}列目")
        print(f"   - X ID: {x_id_idx + 1}列目")
        print(f"   - YTチャンネルID: {yt_id_idx + 1}列目")
        print()
        
        # データを抽出
        data = []
        for row_num, row in enumerate(reader, start=2):
            if len(row) > max(student_id_idx, x_id_idx, yt_id_idx):
                student_id = row[student_id_idx].strip()
                x_id = row[x_id_idx].strip()
                yt_id = row[yt_id_idx].strip()
                
                if student_id:
                    data.append([student_id, yt_id, x_id])
        
        print(f"📊 {len(data)}件のデータを抽出しました")
    
    # TSVファイルを生成
    timestamp = datetime.now().strftime('%Y%m%d')
    output_file = csv_path.parent / f"sns_accounts_{timestamp}.tsv"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        for row in data:
            f.write('\t'.join(row) + '\n')
    
    print(f"✅ TSVファイルを生成しました: {output_file}")
    print()
    
    # プレビュー表示
    print("📋 最初の5件のプレビュー:")
    for i, row in enumerate(data[:5], start=1):
        yt_preview = row[1][:30] + '...' if len(row[1]) > 30 else row[1]
        print(f"  {i}. {row[0]}: YT={yt_preview}, X={row[2]}")
    
    if len(data) > 5:
        print(f"  ... (残り {len(data) - 5}件)")
    
    print()
    print("=" * 60)
    print("📝 次のステップ:")
    print(f"1. {output_file} をテキストエディタで開く")
    print("2. すべての内容をコピー（Ctrl+A → Ctrl+C）")
    print("3. Google Apps Scriptの DATA 変数に貼り付け")
    print("4. updateSNSAccounts() を実行")
    print("=" * 60)
    
    return output_file


def main():
    if len(sys.argv) != 2:
        print("使い方: python convert_notion_csv.py <CSVファイルのパス>")
        print()
        print("例:")
        print('  python convert_notion_csv.py "WannaV生徒名簿.csv"')
        sys.exit(1)
    
    csv_file = sys.argv[1]
    
    print("=" * 60)
    print("📊 Notion CSV → TSV 変換ツール")
    print("=" * 60)
    print()
    
    convert_csv_to_tsv(csv_file)


if __name__ == '__main__':
    main()
