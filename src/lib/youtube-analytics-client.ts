/**
 * YouTube Analytics API クライアント
 * OAuth 2.0を使用してユーザーのアナリティクスデータを取得
 */

export interface YouTubeAnalyticsData {
  channelId: string;
  videoId?: string;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    estimatedMinutesWatched?: number;
    averageViewDuration?: number;
    averageViewPercentage?: number;
    subscribersGained?: number;
    subscribersLost?: number;
  };
  impressions?: number;
  impressionClickThroughRate?: number;
  estimatedRevenue?: number;
  retentionData?: {
    timestamps: number[];      // 秒単位のタイムスタンプ
    retentionRates: number[];  // 0-100の視聴維持率
    duration: number;          // 動画の長さ（秒）
  };
  trafficSources?: {
    sourceType: string;
    views: number;
    percentage: number;
  }[];
  demographics?: {
    ageGroup: string;
    gender: string;
    viewsPercentage: number;
  }[];
}

export interface OAuthTokenInfo {
  studentId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp
  tokenType: string;
}

/**
 * OAuth 2.0 認証URLを生成
 */
export function generateAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
    ].join(' '),
    access_type: 'offline', // リフレッシュトークンを取得
    prompt: 'consent',      // 毎回同意画面を表示（リフレッシュトークン取得のため）
    state: state,           // CSRF対策用のステート
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * 認証コードをアクセストークンに交換
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<OAuthTokenInfo> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await response.json();
  
  return {
    studentId: '', // 後で設定
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
    tokenType: data.token_type,
  };
}

/**
 * リフレッシュトークンを使って新しいアクセストークンを取得
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenInfo> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();
  
  return {
    studentId: '', // 後で設定
    accessToken: data.access_token,
    refreshToken: refreshToken, // リフレッシュトークンは変わらない
    expiresAt: Date.now() + (data.expires_in * 1000),
    tokenType: data.token_type,
  };
}

/**
 * チャンネル全体のインプレッション/CTRを取得
 */
export async function getChannelImpressions(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string
): Promise<{
  impressions: number;
  impressionClickThroughRate: number;
}> {
  // インプレッション関連のメトリクスは dimensions なしで取得
  // ids=channel==MINE を使用（OAuth認証済みチャンネルの場合）
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'impressions,impressionClickThroughRate',
  });

  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[getChannelImpressions] Failed: ${response.status} ${error}`);
    console.log('[getChannelImpressions] This channel/account does not have access to impressions metric');
    // impressionsが利用できない場合は0を返す
    return { impressions: 0, impressionClickThroughRate: 0 };
  }

  const data = await response.json();
  const row = data.rows?.[0] || [];

  return {
    impressions: row[0] || 0,
    impressionClickThroughRate: row[1] || 0,
  };
}

/**
 * チャンネルの詳細アナリティクスを取得
 */
export async function getChannelAnalytics(
  accessToken: string,
  channelId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): Promise<YouTubeAnalyticsData> {
  // YouTube Analytics API v2を使用
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: [
      'views',
      'likes',
      'comments',
      'shares',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'subscribersGained',
      'subscribersLost',
    ].join(','),
  });

  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch channel analytics: ${response.status} ${error}`);
  }

  const data = await response.json();
  
  // レスポンスの形式:
  // {
  //   "columnHeaders": [{"name": "views", "columnType": "METRIC", "dataType": "INTEGER"}, ...],
  //   "rows": [[123, 45, 6, 7, ...]]
  // }
  
  const headers = data.columnHeaders || [];
  const row = data.rows?.[0] || [];
  
  const metrics: any = {};
  headers.forEach((header: any, index: number) => {
    if (header.columnType === 'METRIC') {
      metrics[header.name] = row[index] || 0;
    }
  });

  return {
    channelId,
    metrics,
  };
}

/**
 * 動画の視聴維持率を取得
 */
export async function getVideoRetention(
  accessToken: string,
  videoId: string
): Promise<YouTubeAnalyticsData['retentionData']> {
  const params = new URLSearchParams({
    ids: `channel==MINE`,
    filters: `video==${videoId}`,
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    dimensions: 'elapsedVideoTimeRatio',
  });

  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to fetch retention data: ${response.status} ${error}`);
    return undefined;
  }

  const data = await response.json();
  const rows = data.rows || [];
  
  if (rows.length === 0) {
    return undefined;
  }

  // レスポンス形式:
  // rows: [[elapsedTimeRatio, audienceWatchRatio, relativeRetention], ...]
  // elapsedTimeRatio: 0-1の動画経過時間の割合
  // audienceWatchRatio: 0-1の視聴維持率
  
  const timestamps: number[] = [];
  const retentionRates: number[] = [];
  
  rows.forEach((row: any[]) => {
    const elapsedTimeRatio = row[0] || 0;
    const watchRatio = row[1] || 0;
    
    timestamps.push(elapsedTimeRatio);
    retentionRates.push(watchRatio * 100); // パーセンテージに変換
  });

  return {
    timestamps,
    retentionRates,
    duration: timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0,
  };
}

/**
 * トラフィックソースを取得
 */
export async function getTrafficSources(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string
): Promise<YouTubeAnalyticsData['trafficSources']> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views',
    dimensions: 'insightTrafficSourceType',
    sort: '-views',
    maxResults: '10',
  });

  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to fetch traffic sources: ${response.status} ${error}`);
    return undefined;
  }

  const data = await response.json();
  const rows = data.rows || [];
  
  if (rows.length === 0) {
    return undefined;
  }

  // rows: [[sourceType, views], ...]
  const totalViews = rows.reduce((sum: number, row: any[]) => sum + (row[1] || 0), 0);
  
  // トラフィックソースの日本語マッピング
  const trafficSourceLabels: { [key: string]: string } = {
    'ADVERTISING': '広告',
    'ANNOTATION': 'アノテーション',
    'CAMPAIGN_CARD': 'キャンペーンカード',
    'END_SCREEN': '終了画面',
    'EXT_URL': '外部URL',
    'HASHTAGS': 'ハッシュタグ',
    'LIVE_REDIRECT': 'ライブリダイレクト',
    'NOTIFICATION': '通知',
    'PLAYLIST': '再生リスト',
    'PRODUCT_PAGE': '製品ページ',
    'RELATED_VIDEO': '関連動画',
    'SHORTS': 'ショート',
    'SUBSCRIBER': 'チャンネル登録者',
    'YT_CHANNEL': 'YouTubeチャンネル',
    'YT_OTHER_PAGE': 'YouTubeその他',
    'YT_SEARCH': 'YouTube検索',
    'UNKNOWN': '不明',
  };
  
  return rows.map((row: any[]) => {
    const sourceType = row[0] || 'UNKNOWN';
    return {
      sourceType: trafficSourceLabels[sourceType] || sourceType,
      views: row[1] || 0,
      percentage: totalViews > 0 ? ((row[1] || 0) / totalViews) * 100 : 0,
    };
  });
}

/**
 * 視聴者の年齢・性別分布を取得
 */
export async function getDemographics(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string
): Promise<YouTubeAnalyticsData['demographics']> {
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'viewsPercentage',
    dimensions: 'ageGroup,gender',
    sort: '-viewsPercentage',
  });

  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to fetch demographics: ${response.status} ${error}`);
    return undefined;
  }

  const data = await response.json();
  const rows = data.rows || [];
  
  if (rows.length === 0) {
    return undefined;
  }

  // rows: [[ageGroup, gender, viewsPercentage], ...]
  return rows.map((row: any[]) => ({
    ageGroup: row[0] || 'UNKNOWN',
    gender: row[1] || 'UNKNOWN',
    viewsPercentage: row[2] || 0,
  }));
}

/**
 * チャンネルの動画リストを取得（過去1週間）
 */
export async function getRecentVideos(
  accessToken: string,
  channelId: string,
  daysBack: number = 7
): Promise<Array<{
  videoId: string;
  title: string;
  publishedAt: string;
  duration: string;
  isShort: boolean;
  isLive: boolean;
}>> {
  // 過去N日間の日付を計算
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const publishedAfter = startDate.toISOString();

  // YouTube Data API v3で動画リストを取得
  const searchParams = new URLSearchParams({
    part: 'id,snippet',
    channelId: channelId,
    maxResults: '50',
    order: 'date',
    publishedAfter: publishedAfter,
    type: 'video',
  });

  const searchResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!searchResponse.ok) {
    const error = await searchResponse.text();
    throw new Error(`Failed to fetch videos: ${searchResponse.status} ${error}`);
  }

  const searchData = await searchResponse.json();
  const items = searchData.items || [];

  if (items.length === 0) {
    return [];
  }

  // 動画IDのリスト
  const videoIds = items.map((item: any) => item.id.videoId).join(',');

  // 動画の詳細情報を取得（duration, liveBroadcastContentを含む）
  const videosParams = new URLSearchParams({
    part: 'contentDetails,liveStreamingDetails',
    id: videoIds,
  });

  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!videosResponse.ok) {
    const error = await videosResponse.text();
    throw new Error(`Failed to fetch video details: ${videosResponse.status} ${error}`);
  }

  const videosData = await videosResponse.json();
  const videoDetailsMap = new Map();
  
  videosData.items?.forEach((item: any) => {
    videoDetailsMap.set(item.id, {
      duration: item.contentDetails.duration,
      liveBroadcastContent: item.snippet?.liveBroadcastContent,
      actualStartTime: item.liveStreamingDetails?.actualStartTime,
    });
  });

  // 動画リストを整形
  return items.map((item: any) => {
    const videoId = item.id.videoId;
    const details = videoDetailsMap.get(videoId) || {};
    const duration = details.duration || 'PT0S';
    
    // ISO 8601形式の期間をパース（例：PT1M30S -> 90秒）
    const parseDuration = (iso8601Duration: string): number => {
      const match = iso8601Duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2] || '0');
      const seconds = parseInt(match[3] || '0');
      return hours * 3600 + minutes * 60 + seconds;
    };

    const durationSeconds = parseDuration(duration);
    
    // ショート動画判定：60秒以下
    const isShort = durationSeconds > 0 && durationSeconds <= 60;
    
    // ライブ配信判定：actualStartTimeがある or liveBroadcastContent == 'live'/'completed'
    const isLive = !!details.actualStartTime;

    return {
      videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      duration,
      isShort,
      isLive,
    };
  });
}

/**
 * 動画のインプレッション/クリック率を取得
 */
export async function getVideoImpressions(
  accessToken: string,
  videoId: string,
  startDate: string,
  endDate: string
): Promise<{
  impressions: number;
  impressionClickThroughRate: number;
  views: number;
}> {
  const params = new URLSearchParams({
    ids: `channel==MINE`,
    startDate,
    endDate,
    metrics: 'cardImpressions,cardClickRate,views',
    filters: `video==${videoId}`,
  });

  const response = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to fetch video impressions: ${response.status} ${error}`);
    return { impressions: 0, impressionClickThroughRate: 0, views: 0 };
  }

  const data = await response.json();
  const row = data.rows?.[0] || [];

  return {
    impressions: row[0] || 0,
    impressionClickThroughRate: row[1] || 0,
    views: row[2] || 0,
  };
}

/**
 * 複数動画のアナリティクスを一括取得（動画タイプ別）
 */
export async function getVideosByType(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string
): Promise<{
  shorts: YouTubeAnalyticsData;
  regular: YouTubeAnalyticsData;
  live: YouTubeAnalyticsData;
  overall: {
    totalImpressions: number;
    averageClickThroughRate: number;
    estimatedRevenue: number;
  };
}> {
  console.log(`[VideosByType] Fetching analytics for period: ${startDate} to ${endDate}`);
  
  // Step 1: Analytics APIで全動画のデータを取得（dimensions=video）
  // impressions, impressionClickThroughRate も取得可能
  const params = new URLSearchParams({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: [
      'views',
      'likes',
      'comments',
      'shares',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'subscribersGained',
      'subscribersLost',
      'impressions',
      'impressionClickThroughRate',
    ].join(','),
    dimensions: 'video',
    maxResults: '200',
    sort: '-views',
  });

  try {
    const response = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[VideosByType] Failed to fetch analytics:', response.status, error);
      throw new Error(`Failed to fetch analytics: ${response.status}`);
    }

    const data = await response.json();
    const headers = data.columnHeaders || [];
    const rows = data.rows || [];

    console.log(`[VideosByType] Fetched ${rows.length} videos with data`);

    if (rows.length === 0) {
      // データがない場合は全て0を返す
      const emptyMetrics = {
        metrics: {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          estimatedMinutesWatched: 0,
          averageViewDuration: 0,
          averageViewPercentage: 0,
          subscribersGained: 0,
          subscribersLost: 0,
        },
        impressions: 0,
        impressionClickThroughRate: 0,
        estimatedRevenue: 0,
      };
      
      return {
        shorts: { channelId, ...emptyMetrics },
        regular: { channelId, ...emptyMetrics },
        live: { channelId, ...emptyMetrics },
        overall: {
          totalImpressions: 0,
          averageClickThroughRate: 0,
          estimatedRevenue: 0,
        },
      };
    }

    // ヘッダーからインデックスを取得
    const getIndex = (name: string) => headers.findIndex((h: any) => h.name === name);
    const videoIdIndex = getIndex('video');
    const viewsIndex = getIndex('views');
    const likesIndex = getIndex('likes');
    const commentsIndex = getIndex('comments');
    const sharesIndex = getIndex('shares');
    const estimatedMinutesWatchedIndex = getIndex('estimatedMinutesWatched');
    const averageViewDurationIndex = getIndex('averageViewDuration');
    const averageViewPercentageIndex = getIndex('averageViewPercentage');
    const subscribersGainedIndex = getIndex('subscribersGained');
    const subscribersLostIndex = getIndex('subscribersLost');
    const impressionsIndex = getIndex('impressions');
    const impressionClickThroughRateIndex = getIndex('impressionClickThroughRate');

    // Step 2: Data APIで各動画の種類を判別
    const videoIds = rows.map((row: any[]) => row[videoIdIndex]).filter(Boolean);
    
    console.log(`[VideosByType] Classifying ${videoIds.length} videos...`);
    
    // 動画情報を取得（バッチで取得）
    const videoInfoMap = new Map<string, { isShort: boolean; isLive: boolean }>();
    
    // YouTube Data API v3で動画情報を取得（最大50件ずつ）
    for (let i = 0; i < videoIds.length; i += 50) {
      const batchIds = videoIds.slice(i, i + 50).join(',');
      const videoResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${batchIds}&part=contentDetails,liveStreamingDetails`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (videoResponse.ok) {
        const videoData = await videoResponse.json();
        videoData.items?.forEach((item: any) => {
          // 動画の長さをパース（ISO 8601形式: PT1M23S）
          const duration = item.contentDetails?.duration || '';
          const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          const hours = parseInt(durationMatch?.[1] || '0');
          const minutes = parseInt(durationMatch?.[2] || '0');
          const seconds = parseInt(durationMatch?.[3] || '0');
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;

          const isShort = totalSeconds > 0 && totalSeconds <= 60;
          const isLive = !!item.liveStreamingDetails;

          videoInfoMap.set(item.id, { isShort, isLive });
        });
      }
    }

    // Step 3: プログラム側で集計
    const shortsData: any = { 
      views: 0, likes: 0, comments: 0, shares: 0, 
      estimatedMinutesWatched: 0, averageViewDuration: 0, averageViewPercentage: 0, 
      subscribersGained: 0, subscribersLost: 0,
      impressions: 0, impressionClickThroughRate: 0,
      count: 0 
    };
    const regularData: any = { 
      views: 0, likes: 0, comments: 0, shares: 0, 
      estimatedMinutesWatched: 0, averageViewDuration: 0, averageViewPercentage: 0, 
      subscribersGained: 0, subscribersLost: 0,
      impressions: 0, impressionClickThroughRate: 0,
      count: 0 
    };
    const liveData: any = { 
      views: 0, likes: 0, comments: 0, shares: 0, 
      estimatedMinutesWatched: 0, averageViewDuration: 0, averageViewPercentage: 0, 
      subscribersGained: 0, subscribersLost: 0,
      impressions: 0, impressionClickThroughRate: 0,
      count: 0 
    };

    rows.forEach((row: any[]) => {
      const videoId = row[videoIdIndex];
      const videoInfo = videoInfoMap.get(videoId);
      
      if (!videoInfo) {
        console.log(`[VideosByType] Video ${videoId} not found in videoInfoMap`);
        return;
      }

      const metrics = {
        views: row[viewsIndex] || 0,
        likes: row[likesIndex] || 0,
        comments: row[commentsIndex] || 0,
        shares: row[sharesIndex] || 0,
        estimatedMinutesWatched: row[estimatedMinutesWatchedIndex] || 0,
        averageViewDuration: row[averageViewDurationIndex] || 0,
        averageViewPercentage: row[averageViewPercentageIndex] || 0,
        subscribersGained: row[subscribersGainedIndex] || 0,
        subscribersLost: row[subscribersLostIndex] || 0,
        impressions: row[impressionsIndex] || 0,
        impressionClickThroughRate: row[impressionClickThroughRateIndex] || 0,
      };

      let targetData;
      let typeName;
      if (videoInfo.isShort && !videoInfo.isLive) {
        targetData = shortsData;
        typeName = 'short';
      } else if (videoInfo.isLive) {
        targetData = liveData;
        typeName = 'live';
      } else {
        targetData = regularData;
        typeName = 'regular';
      }

      console.log(`[VideosByType] Video ${videoId} classified as ${typeName} (isShort: ${videoInfo.isShort}, isLive: ${videoInfo.isLive}, views: ${metrics.views})`);

      // 合計を計算
      Object.keys(metrics).forEach(key => {
        targetData[key] += metrics[key as keyof typeof metrics];
      });
      targetData.count += 1;
    });

    console.log('[VideosByType] Classification complete:', {
      shorts: shortsData.count,
      regular: regularData.count,
      live: liveData.count,
    });

    // 平均値を計算（CTRと平均視聴率）
    const calculateAverages = (data: any) => {
      if (data.count === 0) return data;
      data.impressionClickThroughRate = data.impressionClickThroughRate / data.count;
      data.averageViewPercentage = data.averageViewPercentage / data.count;
      data.averageViewDuration = data.averageViewDuration / data.count;
      return data;
    };

    calculateAverages(shortsData);
    calculateAverages(regularData);
    calculateAverages(liveData);

    // データを整形して返す
    const formatData = (data: any) => ({
      metrics: {
        views: data.views,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
        estimatedMinutesWatched: data.estimatedMinutesWatched,
        averageViewDuration: data.averageViewDuration,
        averageViewPercentage: data.averageViewPercentage,
        subscribersGained: data.subscribersGained,
        subscribersLost: data.subscribersLost,
        impressions: data.impressions,
        impressionClickThroughRate: data.impressionClickThroughRate,
      },
    });

    // 全体のインプレッション/CTRを計算
    const totalImpressions = shortsData.impressions + regularData.impressions + liveData.impressions;
    const totalCounts = shortsData.count + regularData.count + liveData.count;
    const averageClickThroughRate = totalCounts > 0
      ? (shortsData.impressionClickThroughRate * shortsData.count +
         regularData.impressionClickThroughRate * regularData.count +
         liveData.impressionClickThroughRate * liveData.count) / totalCounts
      : 0;

    return {
      shorts: {
        channelId,
        ...formatData(shortsData),
      },
      regular: {
        channelId,
        ...formatData(regularData),
      },
      live: {
        channelId,
        ...formatData(liveData),
      },
      overall: {
        totalImpressions,
        averageClickThroughRate,
        estimatedRevenue: 0,  // 推定収益は別途取得が必要
      },
    };
  } catch (error) {
    console.error('[VideosByType] Error:', error);
    const emptyMetrics = {
      metrics: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        estimatedMinutesWatched: 0,
        averageViewDuration: 0,
        averageViewPercentage: 0,
        subscribersGained: 0,
        subscribersLost: 0,
      },
      impressions: 0,
      impressionClickThroughRate: 0,
      estimatedRevenue: 0,
    };
    
    return {
      shorts: { channelId, ...emptyMetrics },
      regular: { channelId, ...emptyMetrics },
      live: { channelId, ...emptyMetrics },
      overall: {
        totalImpressions: 0,
        averageClickThroughRate: 0,
        estimatedRevenue: 0,
      },
    };
  }
}
