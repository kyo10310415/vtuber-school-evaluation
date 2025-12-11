#!/bin/bash
# GitHubプッシュスクリプト
# 使い方: ./github-push.sh YOUR_GITHUB_USERNAME

if [ -z "$1" ]; then
  echo "エラー: GitHubユーザー名を指定してください"
  echo "使い方: ./github-push.sh YOUR_USERNAME"
  exit 1
fi

USERNAME=$1
REPO_NAME="vtuber-school-evaluation"
REPO_URL="https://github.com/${USERNAME}/${REPO_NAME}.git"

echo "=== GitHubリポジトリへプッシュ ==="
echo "リポジトリURL: ${REPO_URL}"
echo ""

cd /home/user/webapp

# リモートが既に存在する場合は削除
git remote remove origin 2>/dev/null

# 新しいリモートを追加
echo "リモートリポジトリを追加中..."
git remote add origin ${REPO_URL}

# ブランチ名を確認
CURRENT_BRANCH=$(git branch --show-current)
echo "現在のブランチ: ${CURRENT_BRANCH}"

# プッシュ
echo "プッシュ中..."
git push -u origin ${CURRENT_BRANCH}

echo ""
echo "✅ プッシュ完了！"
echo "リポジトリURL: https://github.com/${USERNAME}/${REPO_NAME}"
