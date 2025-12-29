/**
 * X API (Twitter API v2) Client
 * Xアカウントのユーザー情報、ツイート、エンゲージメントを取得
 */

export interface XUserMetrics {
  userId: string;
  username: string;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  listedCount: number;
}

export interface XTweet {
  tweetId: string;
  text: string;
  createdAt: string;
  publicMetrics: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    bookmarkCount: number;
    impressionCount: number;
  };
}

export interface XEvaluation {
  // 基本統計
  followersCount: number;
  followingCount: number;
  followerGrowthRate: number; // 伸び率（%）
  
  // フォロー活動
  dailyFollows: number;
  meetsDailyFollowGoal: boolean; // 1日10人フォロー目標達成
  
  // 投稿頻度
  tweetsInMonth: number;
  dailyTweetCount: number;
  meetsDailyTweetGoal: boolean; // 1日2回投稿目標達成
  
  // 企画投稿
  weeklyPlanningTweets: number;
  meetsWeeklyPlanningGoal: boolean; // 週2回企画投稿目標達成
  
  // エンゲージメント
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
  totalImpressions: number;
  engagementRate: number; // (いいね + RT + リプライ) / インプレッション
  
  // エンゲージメント伸び率
  engagementGrowthRate: number;
  impressionGrowthRate: number;
  
  // 最近のツイート
  recentTweets: XTweet[];
}

/**
 * Xユーザー情報を取得
 */
export async function fetchXUserByUsername(
  bearerToken: string,
  username: string
): Promise<XUserMetrics | null> {
  if (!username) {
    return null;
  }

  // @を除去
  const cleanUsername = username.replace('@', '');

  const url = `https://api.x.com/2/users/by/username/${cleanUsername}?user.fields=public_metrics`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[X API] User fetch error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();

  if (!data.data) {
    console.warn(`[X API] User not found: ${username}`);
    return null;
  }

  const user = data.data;
  const metrics = user.public_metrics;

  return {
    userId: user.id,
    username: user.username,
    followersCount: metrics.followers_count || 0,
    followingCount: metrics.following_count || 0,
    tweetCount: metrics.tweet_count || 0,
    listedCount: metrics.listed_count || 0,
  };
}

/**
 * ユーザーIDからユーザー情報を取得
 */
export async function fetchXUserById(
  bearerToken: string,
  userId: string
): Promise<XUserMetrics | null> {
  if (!userId) {
    return null;
  }

  const url = `https://api.x.com/2/users/${userId}?user.fields=public_metrics`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[X API] User fetch error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();

  if (!data.data) {
    console.warn(`[X API] User not found: ${userId}`);
    return null;
  }

  const user = data.data;
  const metrics = user.public_metrics;

  return {
    userId: user.id,
    username: user.username,
    followersCount: metrics.followers_count || 0,
    followingCount: metrics.following_count || 0,
    tweetCount: metrics.tweet_count || 0,
    listedCount: metrics.listed_count || 0,
  };
}

/**
 * ユーザーの最近のツイートを取得
 */
export async function fetchRecentTweets(
  bearerToken: string,
  userId: string,
  maxResults: number = 100
): Promise<XTweet[]> {
  if (!userId) {
    return [];
  }

  const url = `https://api.x.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[X API] Tweets fetch error: ${response.status} - ${errorText}`);
    return [];
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    return [];
  }

  return data.data.map((tweet: any) => ({
    tweetId: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at,
    publicMetrics: {
      retweetCount: tweet.public_metrics?.retweet_count || 0,
      replyCount: tweet.public_metrics?.reply_count || 0,
      likeCount: tweet.public_metrics?.like_count || 0,
      quoteCount: tweet.public_metrics?.quote_count || 0,
      bookmarkCount: tweet.public_metrics?.bookmark_count || 0,
      impressionCount: tweet.public_metrics?.impression_count || 0,
    },
  }));
}

/**
 * 指定月のツイートをフィルタリング
 */
function filterTweetsByMonth(tweets: XTweet[], targetMonth: string): XTweet[] {
  // targetMonth: "2024-12" 形式
  return tweets.filter((tweet) => {
    const tweetMonth = tweet.createdAt.substring(0, 7); // "YYYY-MM"
    return tweetMonth === targetMonth;
  });
}

/**
 * 企画ツイートを判定（簡易版）
 */
function isPlanningTweet(tweet: XTweet): boolean {
  const planningKeywords = [
    '企画',
    'イベント',
    'コラボ',
    '配信予定',
    '告知',
    'お知らせ',
    '参加',
    '募集',
    'プレゼント',
    'キャンペーン',
  ];

  return planningKeywords.some((keyword) => tweet.text.includes(keyword));
}

/**
 * Xアカウントを評価
 */
export async function evaluateXAccount(
  bearerToken: string,
  username: string,
  targetMonth: string,
  previousFollowersCount?: number,
  previousEngagement?: number,
  previousImpressions?: number
): Promise<XEvaluation | null> {
  if (!username) {
    return null;
  }

  console.log(`[X Evaluation] Evaluating account: ${username} for ${targetMonth}`);

  // 1. ユーザー情報を取得
  const user = await fetchXUserByUsername(bearerToken, username);
  if (!user) {
    console.warn(`[X Evaluation] Failed to fetch user: ${username}`);
    return null;
  }

  // 2. 最近のツイートを取得（最大100件）
  const recentTweets = await fetchRecentTweets(bearerToken, user.userId, 100);

  // 3. 対象月のツイートをフィルタリング
  const monthTweets = filterTweetsByMonth(recentTweets, targetMonth);

  console.log(`[X Evaluation] Found ${monthTweets.length} tweets in ${targetMonth}`);

  // 4. 投稿頻度を計算
  const tweetsInMonth = monthTweets.length;
  const daysInMonth = new Date(
    parseInt(targetMonth.split('-')[0]),
    parseInt(targetMonth.split('-')[1]),
    0
  ).getDate();
  const dailyTweetCount = tweetsInMonth / daysInMonth;

  // 5. 企画ツイートをカウント
  const planningTweets = monthTweets.filter(isPlanningTweet);
  const weeklyPlanningTweets = planningTweets.length / 4; // 月を4週間と仮定

  // 6. エンゲージメントを計算
  const totalLikes = monthTweets.reduce((sum, t) => sum + t.publicMetrics.likeCount, 0);
  const totalRetweets = monthTweets.reduce((sum, t) => sum + t.publicMetrics.retweetCount, 0);
  const totalReplies = monthTweets.reduce((sum, t) => sum + t.publicMetrics.replyCount, 0);
  const totalImpressions = monthTweets.reduce((sum, t) => sum + t.publicMetrics.impressionCount, 0);

  const totalEngagement = totalLikes + totalRetweets + totalReplies;
  const engagementRate = totalImpressions > 0
    ? (totalEngagement / totalImpressions) * 100
    : 0;

  // 7. フォロワー数の伸び率を計算
  const followerGrowthRate = previousFollowersCount && previousFollowersCount > 0
    ? ((user.followersCount - previousFollowersCount) / previousFollowersCount) * 100
    : 0;

  // 8. エンゲージメント伸び率を計算
  const engagementGrowthRate = previousEngagement && previousEngagement > 0
    ? ((totalEngagement - previousEngagement) / previousEngagement) * 100
    : 0;

  // 9. インプレッション伸び率を計算
  const impressionGrowthRate = previousImpressions && previousImpressions > 0
    ? ((totalImpressions - previousImpressions) / previousImpressions) * 100
    : 0;

  // 10. フォロー活動を推定（API制限のため簡易計算）
  // following_countの増加から推定
  const dailyFollows = 0; // Basicプランでは正確な取得不可

  return {
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    followerGrowthRate,
    dailyFollows,
    meetsDailyFollowGoal: false, // 手動入力が必要
    tweetsInMonth,
    dailyTweetCount,
    meetsDailyTweetGoal: dailyTweetCount >= 2,
    weeklyPlanningTweets,
    meetsWeeklyPlanningGoal: weeklyPlanningTweets >= 2,
    totalLikes,
    totalRetweets,
    totalReplies,
    totalImpressions,
    engagementRate,
    engagementGrowthRate,
    impressionGrowthRate,
    recentTweets: monthTweets.slice(0, 10), // 最新10件のみ
  };
}
