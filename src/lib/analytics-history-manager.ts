/**
 * Analytics History Manager
 * アナリティクスデータの履歴保存・取得を管理
 */

import type { VideoMetrics } from './youtube-analytics-client';

export interface AnalyticsHistoryRecord {
  id: number;
  studentId: string;
  channelId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  
  // ショート動画
  shortsViews: number;
  shortsLikes: number;
  shortsComments: number;
  shortsShares: number;
  shortsWatchTimeMinutes: number;
  shortsAvgViewDuration: number;
  shortsAvgViewPercentage: number;
  shortsSubscribersGained: number;
  shortsSubscribersLost: number;
  
  // 通常動画
  regularViews: number;
  regularLikes: number;
  regularComments: number;
  regularShares: number;
  regularWatchTimeMinutes: number;
  regularAvgViewDuration: number;
  regularAvgViewPercentage: number;
  regularSubscribersGained: number;
  regularSubscribersLost: number;
  
  // ライブ配信
  liveViews: number;
  liveLikes: number;
  liveComments: number;
  liveShares: number;
  liveWatchTimeMinutes: number;
  liveAvgViewDuration: number;
  liveAvgViewPercentage: number;
  liveSubscribersGained: number;
  liveSubscribersLost: number;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * PostgreSQL接続を作成
 */
async function getDbConnection(databaseUrl: string) {
  const { Pool } = await import('pg');
  return new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * アナリティクスデータを履歴に保存
 */
export async function saveAnalyticsHistory(
  databaseUrl: string | undefined,
  studentId: string,
  channelId: string,
  periodStart: string, // YYYY-MM-DD
  periodEnd: string,   // YYYY-MM-DD
  shorts: { channelId: string; metrics: VideoMetrics },
  regular: { channelId: string; metrics: VideoMetrics },
  live: { channelId: string; metrics: VideoMetrics }
): Promise<void> {
  if (!databaseUrl) {
    console.warn('[Analytics History] DATABASE_URL not available, skipping save');
    return;
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      INSERT INTO analytics_history (
        student_id, channel_id, period_start, period_end,
        shorts_views, shorts_likes, shorts_comments, shorts_shares,
        shorts_watch_time_minutes, shorts_avg_view_duration, shorts_avg_view_percentage,
        shorts_subscribers_gained, shorts_subscribers_lost,
        regular_views, regular_likes, regular_comments, regular_shares,
        regular_watch_time_minutes, regular_avg_view_duration, regular_avg_view_percentage,
        regular_subscribers_gained, regular_subscribers_lost,
        live_views, live_likes, live_comments, live_shares,
        live_watch_time_minutes, live_avg_view_duration, live_avg_view_percentage,
        live_subscribers_gained, live_subscribers_lost
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, $28, $29, $30, $31
      )
      ON CONFLICT (student_id, period_start, period_end)
      DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        shorts_views = EXCLUDED.shorts_views,
        shorts_likes = EXCLUDED.shorts_likes,
        shorts_comments = EXCLUDED.shorts_comments,
        shorts_shares = EXCLUDED.shorts_shares,
        shorts_watch_time_minutes = EXCLUDED.shorts_watch_time_minutes,
        shorts_avg_view_duration = EXCLUDED.shorts_avg_view_duration,
        shorts_avg_view_percentage = EXCLUDED.shorts_avg_view_percentage,
        shorts_subscribers_gained = EXCLUDED.shorts_subscribers_gained,
        shorts_subscribers_lost = EXCLUDED.shorts_subscribers_lost,
        regular_views = EXCLUDED.regular_views,
        regular_likes = EXCLUDED.regular_likes,
        regular_comments = EXCLUDED.regular_comments,
        regular_shares = EXCLUDED.regular_shares,
        regular_watch_time_minutes = EXCLUDED.regular_watch_time_minutes,
        regular_avg_view_duration = EXCLUDED.regular_avg_view_duration,
        regular_avg_view_percentage = EXCLUDED.regular_avg_view_percentage,
        regular_subscribers_gained = EXCLUDED.regular_subscribers_gained,
        regular_subscribers_lost = EXCLUDED.regular_subscribers_lost,
        live_views = EXCLUDED.live_views,
        live_likes = EXCLUDED.live_likes,
        live_comments = EXCLUDED.live_comments,
        live_shares = EXCLUDED.live_shares,
        live_watch_time_minutes = EXCLUDED.live_watch_time_minutes,
        live_avg_view_duration = EXCLUDED.live_avg_view_duration,
        live_avg_view_percentage = EXCLUDED.live_avg_view_percentage,
        live_subscribers_gained = EXCLUDED.live_subscribers_gained,
        live_subscribers_lost = EXCLUDED.live_subscribers_lost,
        updated_at = CURRENT_TIMESTAMP
    `;

    await pool.query(query, [
      studentId,
      channelId,
      periodStart,
      periodEnd,
      // Shorts
      shorts.metrics.views || 0,
      shorts.metrics.likes || 0,
      shorts.metrics.comments || 0,
      shorts.metrics.shares || 0,
      shorts.metrics.estimatedMinutesWatched || 0,
      shorts.metrics.averageViewDuration || 0,
      shorts.metrics.averageViewPercentage || 0,
      shorts.metrics.subscribersGained || 0,
      shorts.metrics.subscribersLost || 0,
      // Regular
      regular.metrics.views || 0,
      regular.metrics.likes || 0,
      regular.metrics.comments || 0,
      regular.metrics.shares || 0,
      regular.metrics.estimatedMinutesWatched || 0,
      regular.metrics.averageViewDuration || 0,
      regular.metrics.averageViewPercentage || 0,
      regular.metrics.subscribersGained || 0,
      regular.metrics.subscribersLost || 0,
      // Live
      live.metrics.views || 0,
      live.metrics.likes || 0,
      live.metrics.comments || 0,
      live.metrics.shares || 0,
      live.metrics.estimatedMinutesWatched || 0,
      live.metrics.averageViewDuration || 0,
      live.metrics.averageViewPercentage || 0,
      live.metrics.subscribersGained || 0,
      live.metrics.subscribersLost || 0,
    ]);

    console.log('[Analytics History] Data saved:', {
      studentId,
      channelId,
      period: `${periodStart} ~ ${periodEnd}`,
    });
  } catch (error) {
    console.error('[Analytics History] Save error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * 特定の生徒のアナリティクス履歴を取得
 */
export async function getAnalyticsHistory(
  databaseUrl: string | undefined,
  studentId: string,
  limit: number = 12 // デフォルト12週分
): Promise<AnalyticsHistoryRecord[]> {
  if (!databaseUrl) {
    console.warn('[Analytics History] DATABASE_URL not available');
    return [];
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      SELECT
        id,
        student_id,
        channel_id,
        period_start,
        period_end,
        shorts_views,
        shorts_likes,
        shorts_comments,
        shorts_shares,
        shorts_watch_time_minutes,
        shorts_avg_view_duration,
        shorts_avg_view_percentage,
        shorts_subscribers_gained,
        shorts_subscribers_lost,
        regular_views,
        regular_likes,
        regular_comments,
        regular_shares,
        regular_watch_time_minutes,
        regular_avg_view_duration,
        regular_avg_view_percentage,
        regular_subscribers_gained,
        regular_subscribers_lost,
        live_views,
        live_likes,
        live_comments,
        live_shares,
        live_watch_time_minutes,
        live_avg_view_duration,
        live_avg_view_percentage,
        live_subscribers_gained,
        live_subscribers_lost,
        created_at,
        updated_at
      FROM analytics_history
      WHERE student_id = $1
      ORDER BY period_start DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [studentId, limit]);

    return result.rows.map(row => ({
      id: row.id,
      studentId: row.student_id,
      channelId: row.channel_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      shortsViews: parseInt(row.shorts_views),
      shortsLikes: parseInt(row.shorts_likes),
      shortsComments: parseInt(row.shorts_comments),
      shortsShares: parseInt(row.shorts_shares),
      shortsWatchTimeMinutes: parseInt(row.shorts_watch_time_minutes),
      shortsAvgViewDuration: parseFloat(row.shorts_avg_view_duration),
      shortsAvgViewPercentage: parseFloat(row.shorts_avg_view_percentage),
      shortsSubscribersGained: parseInt(row.shorts_subscribers_gained),
      shortsSubscribersLost: parseInt(row.shorts_subscribers_lost),
      regularViews: parseInt(row.regular_views),
      regularLikes: parseInt(row.regular_likes),
      regularComments: parseInt(row.regular_comments),
      regularShares: parseInt(row.regular_shares),
      regularWatchTimeMinutes: parseInt(row.regular_watch_time_minutes),
      regularAvgViewDuration: parseFloat(row.regular_avg_view_duration),
      regularAvgViewPercentage: parseFloat(row.regular_avg_view_percentage),
      regularSubscribersGained: parseInt(row.regular_subscribers_gained),
      regularSubscribersLost: parseInt(row.regular_subscribers_lost),
      liveViews: parseInt(row.live_views),
      liveLikes: parseInt(row.live_likes),
      liveComments: parseInt(row.live_comments),
      liveShares: parseInt(row.live_shares),
      liveWatchTimeMinutes: parseInt(row.live_watch_time_minutes),
      liveAvgViewDuration: parseFloat(row.live_avg_view_duration),
      liveAvgViewPercentage: parseFloat(row.live_avg_view_percentage),
      liveSubscribersGained: parseInt(row.live_subscribers_gained),
      liveSubscribersLost: parseInt(row.live_subscribers_lost),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  } catch (error) {
    console.error('[Analytics History] Get error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * 全生徒の最新履歴を取得（自動取得処理用）
 */
export async function getAllStudentsLatestHistory(
  databaseUrl: string | undefined
): Promise<Array<{ studentId: string; latestPeriodEnd: string }>> {
  if (!databaseUrl) {
    console.warn('[Analytics History] DATABASE_URL not available');
    return [];
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      SELECT DISTINCT ON (student_id)
        student_id,
        period_end
      FROM analytics_history
      ORDER BY student_id, period_end DESC
    `;

    const result = await pool.query(query);

    return result.rows.map(row => ({
      studentId: row.student_id,
      latestPeriodEnd: row.period_end,
    }));
  } catch (error) {
    console.error('[Analytics History] Get latest history error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}
