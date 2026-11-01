/**
 * YouTube Data API v3 Client
 * YouTubeチャンネルの統計情報と動画データを取得
 */

import { calculateYouTubeGrade } from './grade-calculator'

/**
 * YouTubeチャンネルIDの形式を検証
 * 
 * 有効な形式:
 * - UCから始まる24文字のID（例: UCCHRAm4dV1KXhrEMAafnYsQ）
 * - @から始まるハンドル名（例: @username）
 * - ハンドルURL（例: https://www.youtube.com/@username）
 * - チャンネルURL（例: https://www.youtube.com/channel/UC...）
 * 
 * 無効な形式:
 * - メールアドレス（例: mailto:user@example.com）
 * - 空文字列
 */
export function validateYouTubeChannelId(channelId: string): { valid: boolean; normalizedId?: string; error?: string } {
  if (!channelId || channelId.trim() === '') {
    return { valid: false, error: 'チャンネルIDが空です' };
  }
  
  const trimmedId = channelId.trim();
  
  if (/^mailto:/i.test(trimmedId) || (!trimmedId.startsWith('@') && !/^https?:\/\//i.test(trimmedId) && trimmedId.includes('@'))) {
    return { valid: false, error: 'メールアドレスは無効です。YouTubeチャンネルIDを入力してください' };
  }

  let identifier = trimmedId;
  if (/^https?:\/\//i.test(trimmedId)) {
    try {
      const url = new URL(trimmedId);
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) || url.username || url.password) {
        return { valid: false, error: 'チャンネルURLが無効です' };
      }
      const channel = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/);
      const handle = url.pathname.match(/^\/(@[^/]+)\/?$/);
      if (channel) identifier = channel[1];
      else if (handle) identifier = decodeURIComponent(handle[1]);
      else return { valid: false, error: 'チャンネルURLが無効です' };
    } catch {
      return { valid: false, error: 'チャンネルURLが無効です' };
    }
  }

  if (/^UC[A-Za-z0-9_-]{22}$/.test(identifier)) {
    return { valid: true, normalizedId: identifier };
  }

  // Preserve Unicode handles; reject separators, whitespace and query delimiters.
  if (/^@[^\s@/?#&=]+$/u.test(identifier)) {
    return { valid: true, normalizedId: identifier };
  }

  return { valid: false, error: 'チャンネルIDの形式が無効です（UCから始まる24文字、または@から始まるハンドル名）' };
}

export interface YouTubeChannelStats {
  channelId: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  duration: string; // ISO 8601形式（例: PT1H30M15S）
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
}

export interface YouTubeEvaluation {
  // 基本統計
  subscriberCount: number;
  subscriberGrowthRate: number; // 伸び率（%）
  totalViews: number;
  
  // 配信頻度
  videosInMonth: number;
  weeklyStreamCount: number;
  meetsWeekly4StreamsGoal: boolean; // 週4回の配信目標達成
  
  // 配信時間
  averageStreamDuration: number; // 分単位
  meetsMinimum90MinutesGoal: boolean; // 1.5時間以上の目標達成
  
  // エンゲージメント
  totalLikes: number;
  totalComments: number;
  engagementRate: number; // (いいね数 + コメント数) / 再生数
  
  // 品質評価
  titleQuality: 'Good' | 'Fair' | 'Poor';
  thumbnailQuality: 'Good' | 'Fair' | 'Poor';
  
  // 5段階評価
  overallGrade: 'S' | 'A' | 'B' | 'C' | 'D';
  
  // 動画リスト
  recentVideos: YouTubeVideo[];
}

/**
 * YouTubeチャンネル統計を取得
 */
export async function fetchYouTubeChannelStats(
  apiKey: string,
  channelId: string
): Promise<YouTubeChannelStats | null> {
  if (!channelId) {
    console.error('[YouTube API] Channel ID is missing');
    return null;
  }

  const validation = validateYouTubeChannelId(channelId);
  if (!validation.valid || !validation.normalizedId) return null;
  const identifier = validation.normalizedId;
  const params = new URLSearchParams({ part: 'statistics', key: apiKey });
  params.set(identifier.startsWith('@') ? 'forHandle' : 'id', identifier);
  const url = `https://www.googleapis.com/youtube/v3/channels?${params}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[YouTube API] Channel stats error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.warn('[YouTube API] Channel not found');
      return null;
    }

    const item = data.items[0];
    const stats = item.statistics;
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(item.id) || !stats) {
      console.warn('[YouTube API] Invalid channel response');
      return null;
    }

    return {
      channelId: item.id,
      subscriberCount: parseInt(stats.subscriberCount || '0'),
      viewCount: parseInt(stats.viewCount || '0'),
      videoCount: parseInt(stats.videoCount || '0'),
    };
  } catch (error: any) {
    console.error('[YouTube API] Fetch error');
    return null;
  }
}

/**
 * チャンネルの最近の動画を取得
 */
export async function fetchRecentVideos(
  apiKey: string,
  channelId: string,
  maxResults: number = 20
): Promise<YouTubeVideo[]> {
  if (!channelId) {
    return [];
  }

  // 1. チャンネルの動画リストを取得
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=${maxResults}&order=date&type=video&key=${apiKey}`;

  const searchResponse = await fetch(searchUrl);

  if (!searchResponse.ok) {
    console.error(`[YouTube API] Search error: ${searchResponse.status}`);
    return [];
  }

  const searchData = await searchResponse.json();

  if (!searchData.items || searchData.items.length === 0) {
    return [];
  }

  // 2. 動画IDリストを作成
  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

  // 3. 動画詳細を取得
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`;

  const videosResponse = await fetch(videosUrl);

  if (!videosResponse.ok) {
    console.error(`[YouTube API] Videos error: ${videosResponse.status}`);
    return [];
  }

  const videosData = await videosResponse.json();

  return videosData.items.map((item: any) => ({
    videoId: item.id,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    duration: item.contentDetails.duration,
    viewCount: parseInt(item.statistics.viewCount || '0'),
    likeCount: parseInt(item.statistics.likeCount || '0'),
    commentCount: parseInt(item.statistics.commentCount || '0'),
    thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
  }));
}

/**
 * ISO 8601形式の動画時間を分単位に変換
 * 例: PT1H30M15S → 90.25分
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');

  return hours * 60 + minutes + seconds / 60;
}

/**
 * 指定月の動画をフィルタリング
 */
function filterVideosByMonth(videos: YouTubeVideo[], targetMonth: string): YouTubeVideo[] {
  // targetMonth: "2024-12" 形式
  return videos.filter((video) => {
    const publishedMonth = video.publishedAt.substring(0, 7); // "YYYY-MM"
    return publishedMonth === targetMonth;
  });
}

/**
 * YouTubeチャンネルを評価
 */
export async function evaluateYouTubeChannel(
  apiKey: string,
  channelId: string,
  targetMonth: string,
  previousSubscriberCount?: number
): Promise<YouTubeEvaluation | null> {
  if (!channelId) {
    console.error('[YouTube Evaluation] Channel ID is missing');
    return null;
  }
  
  if (!apiKey) {
    console.error('[YouTube Evaluation] API Key is missing');
    return null;
  }
  
  // ✅ チャンネルIDの検証
  const validation = validateYouTubeChannelId(channelId);
  if (!validation.valid) {
    console.error('[YouTube Evaluation] Invalid channel ID');
    console.error(`[YouTube Evaluation] Error: ${validation.error}`);
    return { error: `無効なチャンネルID: ${validation.error}` } as any;
  }
  
  const normalizedChannelId = validation.normalizedId || channelId;

  console.log('[YouTube Evaluation] Evaluation started');

  try {
    // 1. チャンネル統計を取得
    const stats = await fetchYouTubeChannelStats(apiKey, normalizedChannelId);
    if (!stats) {
      console.warn('[YouTube Evaluation] Failed to fetch channel stats');
      return { error: 'チャンネル統計の取得に失敗しました' } as any;
    }

    // 2. 最近の動画を取得（最大50件）
    const recentVideos = await fetchRecentVideos(apiKey, stats.channelId, 50);

    // 3. 対象月の動画をフィルタリング
    const monthVideos = filterVideosByMonth(recentVideos, targetMonth);

    console.log(`[YouTube Evaluation] Found ${monthVideos.length} videos in ${targetMonth}`);

    // 4. 配信頻度を計算
    const videosInMonth = monthVideos.length;
    
    // 月の実際の週数を計算（より正確に）
    const [year, month] = targetMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const actualWeeks = daysInMonth / 7; // 実際の週数
    
    const weeklyStreamCount = videosInMonth / actualWeeks;

    // 5. 配信時間を計算
    const durations = monthVideos.map((v) => parseDuration(v.duration));
    const averageStreamDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    // 6. エンゲージメントを計算
    const totalLikes = monthVideos.reduce((sum, v) => sum + v.likeCount, 0);
    const totalComments = monthVideos.reduce((sum, v) => sum + v.commentCount, 0);
    const totalViews = monthVideos.reduce((sum, v) => sum + v.viewCount, 0);
    const engagementRate = totalViews > 0
      ? ((totalLikes + totalComments) / totalViews) * 100
      : 0;

    // 7. 登録者数の伸び率を計算
    const subscriberGrowthRate = previousSubscriberCount && previousSubscriberCount > 0
      ? ((stats.subscriberCount - previousSubscriberCount) / previousSubscriberCount) * 100
      : 0;

    // 8. タイトル品質を評価（簡易）
    const titleQuality = evaluateTitleQuality(monthVideos);

    // 9. サムネ品質を評価（高解像度サムネがあるか）
    const thumbnailQuality = evaluateThumbnailQuality(monthVideos);

    const evaluation = {
      subscriberCount: stats.subscriberCount,
      subscriberGrowthRate,
      totalViews,
      videosInMonth,
      weeklyStreamCount,
      meetsWeekly4StreamsGoal: weeklyStreamCount >= 4,
      averageStreamDuration,
      meetsMinimum90MinutesGoal: averageStreamDuration >= 90,
      totalLikes,
      totalComments,
      engagementRate,
      titleQuality,
      thumbnailQuality,
      recentVideos: monthVideos.slice(0, 10), // 最新10件のみ
      overallGrade: 'C' as 'S' | 'A' | 'B' | 'C' | 'D', // 仮の値
    };

    // 10. 総合評価を計算
    evaluation.overallGrade = calculateYouTubeGrade(evaluation);

    console.log(`[YouTube Evaluation] Evaluation completed: Grade ${evaluation.overallGrade}`);

    return evaluation;
  } catch (error: any) {
    console.error('[YouTube Evaluation] Evaluation failed');
    return { error: 'YouTube評価の取得に失敗しました' } as any;
  }
}

/**
 * タイトル品質を評価
 */
function evaluateTitleQuality(videos: YouTubeVideo[]): 'Good' | 'Fair' | 'Poor' {
  if (videos.length === 0) return 'Poor';

  // 簡易評価: タイトルの長さと多様性
  const avgLength = videos.reduce((sum, v) => sum + v.title.length, 0) / videos.length;

  if (avgLength >= 20 && avgLength <= 60) {
    return 'Good';
  } else if (avgLength >= 10) {
    return 'Fair';
  } else {
    return 'Poor';
  }
}

/**
 * サムネイル品質を評価
 */
function evaluateThumbnailQuality(videos: YouTubeVideo[]): 'Good' | 'Fair' | 'Poor' {
  if (videos.length === 0) return 'Poor';

  // 高解像度サムネイルがあるかチェック
  const hasHighResThumbnails = videos.every((v) => v.thumbnailUrl && v.thumbnailUrl.includes('hq'));

  if (hasHighResThumbnails) {
    return 'Good';
  } else {
    return 'Fair';
  }
}
