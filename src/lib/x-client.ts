/**
 * X API (Twitter API v2) Client
 * Xアカウントのユーザー情報、ツイート、エンゲージメントを取得
 */

import { calculateXGrade } from './grade-calculator'

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
  
  // 5段階評価
  overallGrade: 'S' | 'A' | 'B' | 'C' | 'D';
  
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
    console.error('[X API] Username is empty');
    return null;
  }

  if (!bearerToken) {
    console.error('[X API] Bearer token is empty');
    return null;
  }

  // @を除去
  const cleanUsername = username.replace('@', '');
  console.log(`[X API] Fetching user: ${cleanUsername}`);

  const url = `https://api.twitter.com/2/users/by/username/${cleanUsername}?user.fields=public_metrics`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
      },
    });

    console.log(`[X API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[X API] User fetch error: ${response.status} - ${errorText}`);
      
      // エラーメッセージを詳細に解析
      try {
        const errorJson = JSON.parse(errorText);
        console.error(`[X API] Error details:`, errorJson);
        
        // 429 Too Many Requests の場合は特別なエラーを返す
        if (response.status === 429) {
          console.warn(`[X API] Rate limit exceeded when fetching user: ${username}`);
          // nullではなく、特別なマーカーオブジェクトを返す
          return { rateLimited: true } as any;
        }
      } catch {
        // JSON解析に失敗した場合はそのままテキストを出力
      }
      
      return null;
    }

    const data = await response.json();
    console.log(`[X API] Response data:`, JSON.stringify(data).substring(0, 200));

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
  } catch (error: any) {
    console.error(`[X API] Fetch exception:`, error);
    return null;
  }
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

  const url = `https://api.twitter.com/2/users/${userId}?user.fields=public_metrics`;

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
 * ユーザーの最近のツイートを取得（対象月のみ）
 * リプライは除外し、オリジナルツイートとリツイートのみを取得
 * @returns { tweets: XTweet[], rateLimited: boolean } - ツイート配列とレート制限フラグ
 */
export async function fetchRecentTweets(
  bearerToken: string,
  userId: string,
  maxResults: number = 100,
  targetMonth?: string // 追加: 対象月 (YYYY-MM 形式)
): Promise<{ tweets: XTweet[], rateLimited: boolean }> {
  if (!userId) {
    console.error('[X API] userId is empty in fetchRecentTweets');
    return { tweets: [], rateLimited: false };
  }

  if (!bearerToken) {
    console.error('[X API] bearerToken is empty in fetchRecentTweets');
    return { tweets: [], rateLimited: false };
  }

  // 対象月の開始・終了日時を計算
  let startTime: string | undefined;
  let endTime: string | undefined;
  
  if (targetMonth) {
    const [year, month] = targetMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1)); // 月初
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59)); // 月末
    
    startTime = startDate.toISOString();
    endTime = endDate.toISOString();
    
    console.log(`[X API] Fetching tweets for ${targetMonth}: ${startTime} to ${endTime}`);
  }

  // すべてのツイートを格納する配列
  let allTweets: XTweet[] = [];
  let nextToken: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 1; // ✅ 月間クォータ対策: 1ページ（100件）のみ取得に制限

  try {
    do {
      pageCount++;
      
      // URL パラメータを構築
      const params = new URLSearchParams({
        max_results: maxResults.toString(),
        'tweet.fields': 'created_at,public_metrics,referenced_tweets',
        exclude: 'retweets,replies' // ✅ リツイートとリプライを除外（オリジナルツイートのみ）
      });
      
      if (startTime) params.append('start_time', startTime);
      if (endTime) params.append('end_time', endTime);
      if (nextToken) params.append('pagination_token', nextToken);
      
      const url = `https://api.twitter.com/2/users/${userId}/tweets?${params.toString()}`;

      console.log(`[X API] Fetching tweets page ${pageCount} for user: ${userId}, maxResults: ${maxResults}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
      });

      console.log(`[X API] Tweets fetch response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[X API] Tweets fetch error: ${response.status} - ${errorText}`);
        
        // エラーメッセージを詳細に解析
        try {
          const errorJson = JSON.parse(errorText);
          console.error(`[X API] Tweets error details:`, errorJson);
          
          // 429 Too Many Requests の場合は特別な処理
          if (response.status === 429) {
            console.warn(`[X API] Rate limit exceeded for user ${userId}. Tweets will be skipped.`);
            // レート制限エラーはフラグを立てて返す
            return { tweets: allTweets, rateLimited: true };
          }
        } catch {
          // JSON解析に失敗した場合はそのままテキストを出力
        }
        
        // エラー時は現在までに取得したツイートを返す
        return { tweets: allTweets, rateLimited: false };
      }

      const data = await response.json();
      console.log(`[X API] Retrieved ${data.data?.length || 0} tweets on page ${pageCount}`);

      if (!data.data || data.data.length === 0) {
        console.log(`[X API] No more tweets found for user: ${userId}`);
        break;
      }

      const tweets = data.data
        .filter((tweet: any) => {
          // referenced_tweets がある場合、リツイートや引用ツイートの可能性
          if (tweet.referenced_tweets) {
            const isRetweet = tweet.referenced_tweets.some((ref: any) => ref.type === 'retweeted');
            const isReply = tweet.referenced_tweets.some((ref: any) => ref.type === 'replied_to');
            
            // リツイートとリプライを除外
            if (isRetweet || isReply) {
              return false;
            }
          }
          return true;
        })
        .map((tweet: any) => ({
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
      
      console.log(`[X API] Page ${pageCount}: Retrieved ${data.data.length} tweets, after filtering: ${tweets.length} original tweets`);
      
      allTweets = allTweets.concat(tweets);
      
      // 次のページトークンを取得
      nextToken = data.meta?.next_token;
      
      // 対象月のツイートがなくなったら終了（期間指定がある場合）
      if (targetMonth && tweets.length > 0) {
        const lastTweetMonth = tweets[tweets.length - 1].createdAt.substring(0, 7);
        if (lastTweetMonth < targetMonth) {
          console.log(`[X API] Reached tweets before target month. Stopping pagination.`);
          break;
        }
      }
      
    } while (nextToken && pageCount < maxPages);
    
    console.log(`[X API] Total tweets retrieved: ${allTweets.length} (${pageCount} pages)`);
    return { tweets: allTweets, rateLimited: false };
    
  } catch (error: any) {
    console.error(`[X API] Fetch tweets exception:`, error);
    return { tweets: allTweets, rateLimited: false };
  }
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
    console.error('[X Evaluation] Username is missing');
    return { error: 'ユーザー名が指定されていません' } as any;
  }
  
  if (!bearerToken) {
    console.error('[X Evaluation] Bearer token is missing');
    return { error: 'X APIトークンが設定されていません' } as any;
  }

  console.log(`[X Evaluation] Evaluating account: ${username} for ${targetMonth}`);
  console.log(`[X Evaluation] Bearer token exists: ${!!bearerToken}, length: ${bearerToken?.length || 0}`);

  try {
    // 1. ユーザー情報を取得
    console.log(`[X Evaluation] Starting evaluation for: ${username}`);
    console.log(`[X Evaluation] Bearer token length: ${bearerToken?.length || 0}`);
    console.log(`[X Evaluation] Target month: ${targetMonth}`);
    
    const user = await fetchXUserByUsername(bearerToken, username);
    if (!user) {
      console.error(`[X Evaluation] Failed to fetch user: ${username}`);
      console.error(`[X Evaluation] This may be due to:`);
      console.error(`  - Invalid bearer token`);
      console.error(`  - User not found`);
      console.error(`  - API rate limit exceeded`);
      console.error(`  - Network error`);
      return { error: 'ユーザー情報の取得に失敗しました' } as any;
    }
    
    // レート制限チェック（ユーザー情報取得時）
    if ((user as any).rateLimited) {
      console.warn(`[X Evaluation] Rate limited when fetching user info for ${username}`);
      return { 
        error: 'X APIのレート制限により、ユーザー情報を取得できませんでした',
        rateLimited: true
      } as any;
    }

    console.log(`[X Evaluation] User fetched successfully: ${user.username} (ID: ${user.userId})`);

    // 2. 対象月のツイートを取得（リプライ除外、対象月のみ）
    console.log(`[X Evaluation] Fetching tweets for user ID: ${user.userId}, month: ${targetMonth}`);
    const { tweets: monthTweets, rateLimited } = await fetchRecentTweets(bearerToken, user.userId, 100, targetMonth);
    console.log(`[X Evaluation] Retrieved ${monthTweets.length} tweets in ${targetMonth}, rateLimited: ${rateLimited}`);

    // ⚠️ データ品質チェック: レート制限によりツイートデータが取得できていない場合はエラー
    if (rateLimited) {
      console.warn(`[X Evaluation] Rate limited - cannot retrieve tweet data for ${username} in ${targetMonth}`);
      return { 
        error: 'X APIのレート制限により、ツイートデータを取得できませんでした',
        rateLimited: true,
        partialData: {
          followersCount: user.followersCount,
          followingCount: user.followingCount
        }
      } as any;
    }

  // 3. 投稿頻度を計算
  const tweetsInMonth = monthTweets.length;
  const daysInMonth = new Date(
    parseInt(targetMonth.split('-')[0]),
    parseInt(targetMonth.split('-')[1]),
    0
  ).getDate();
  const dailyTweetCount = tweetsInMonth / daysInMonth;

  // 4. 企画ツイートをカウント
  const planningTweets = monthTweets.filter(isPlanningTweet);
  const weeklyPlanningTweets = planningTweets.length / 4; // 月を4週間と仮定

  // 5. エンゲージメントを計算
  const totalLikes = monthTweets.reduce((sum, t) => sum + t.publicMetrics.likeCount, 0);
  const totalRetweets = monthTweets.reduce((sum, t) => sum + t.publicMetrics.retweetCount, 0);
  const totalReplies = monthTweets.reduce((sum, t) => sum + t.publicMetrics.replyCount, 0);
  const totalImpressions = monthTweets.reduce((sum, t) => sum + t.publicMetrics.impressionCount, 0);

  const totalEngagement = totalLikes + totalRetweets + totalReplies;
  const engagementRate = totalImpressions > 0
    ? (totalEngagement / totalImpressions) * 100
    : 0;

  // 6. フォロワー数の伸び率を計算
  const followerGrowthRate = previousFollowersCount && previousFollowersCount > 0
    ? ((user.followersCount - previousFollowersCount) / previousFollowersCount) * 100
    : 0;

  // 7. エンゲージメント伸び率を計算
  const engagementGrowthRate = previousEngagement && previousEngagement > 0
    ? ((totalEngagement - previousEngagement) / previousEngagement) * 100
    : 0;

  // 8. インプレッション伸び率を計算
  const impressionGrowthRate = previousImpressions && previousImpressions > 0
    ? ((totalImpressions - previousImpressions) / previousImpressions) * 100
    : 0;

  // 9. フォロー活動を推定（API制限のため簡易計算）
  // following_countの増加から推定
  const dailyFollows = 0; // Basicプランでは正確な取得不可

  const evaluation = {
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
    overallGrade: 'C' as 'S' | 'A' | 'B' | 'C' | 'D', // 仮の値
  };

  // 総合評価を計算
  evaluation.overallGrade = calculateXGrade(evaluation);

  console.log(`[X Evaluation] Evaluation completed: Grade ${evaluation.overallGrade}`);

  return evaluation;
  } catch (error: any) {
    console.error('[X Evaluation] Error:', error.message, error.stack);
    return { error: error.message } as any;
  }
}
