/**
 * YouTube Analytics API クライアント
 * OAuth 2.0を使用してユーザーのアナリティクスデータを取得
 */

export interface YouTubeAnalyticsData {
  channelId: string;
  videoId?: string;
  metrics: {
    views?: number;
    impressions?: number;
    impressionClickThroughRate?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    estimatedMinutesWatched?: number;
    averageViewDuration?: number;
    averageViewPercentage?: number;
    subscribersGained?: number;
    subscribersLost?: number;
  };
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
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: [
      'views',
      'impressions',
      'impressionClickThroughRate',
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
    ids: `channel==${channelId}`,
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
    ids: `channel==${channelId}`,
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
