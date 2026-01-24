/**
 * Database Migration Runner
 * アプリ起動時に自動的にマイグレーションを実行
 */

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
 * マイグレーションを実行
 */
export async function runMigrations(databaseUrl: string | undefined): Promise<void> {
  if (!databaseUrl) {
    console.warn('[Migration] DATABASE_URL not available, skipping migrations');
    return;
  }

  console.log('[Migration] Starting database migrations...');

  const pool = await getDbConnection(databaseUrl);

  try {
    // analytics_history テーブルを作成
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_history (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        channel_id VARCHAR(50) NOT NULL,
        
        -- 集計期間
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        
        -- ショート動画メトリクス
        shorts_views BIGINT DEFAULT 0,
        shorts_likes BIGINT DEFAULT 0,
        shorts_comments BIGINT DEFAULT 0,
        shorts_shares BIGINT DEFAULT 0,
        shorts_watch_time_minutes BIGINT DEFAULT 0,
        shorts_avg_view_duration DECIMAL(10, 2) DEFAULT 0,
        shorts_avg_view_percentage DECIMAL(5, 2) DEFAULT 0,
        shorts_subscribers_gained INTEGER DEFAULT 0,
        shorts_subscribers_lost INTEGER DEFAULT 0,
        
        -- 通常動画メトリクス
        regular_views BIGINT DEFAULT 0,
        regular_likes BIGINT DEFAULT 0,
        regular_comments BIGINT DEFAULT 0,
        regular_shares BIGINT DEFAULT 0,
        regular_watch_time_minutes BIGINT DEFAULT 0,
        regular_avg_view_duration DECIMAL(10, 2) DEFAULT 0,
        regular_avg_view_percentage DECIMAL(5, 2) DEFAULT 0,
        regular_subscribers_gained INTEGER DEFAULT 0,
        regular_subscribers_lost INTEGER DEFAULT 0,
        
        -- ライブ配信メトリクス
        live_views BIGINT DEFAULT 0,
        live_likes BIGINT DEFAULT 0,
        live_comments BIGINT DEFAULT 0,
        live_shares BIGINT DEFAULT 0,
        live_watch_time_minutes BIGINT DEFAULT 0,
        live_avg_view_duration DECIMAL(10, 2) DEFAULT 0,
        live_avg_view_percentage DECIMAL(5, 2) DEFAULT 0,
        live_subscribers_gained INTEGER DEFAULT 0,
        live_subscribers_lost INTEGER DEFAULT 0,
        
        -- メタデータ
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- ユニーク制約
        CONSTRAINT unique_student_period UNIQUE (student_id, period_start, period_end)
      )
    `);

    console.log('[Migration] ✅ analytics_history table created/verified');

    // インデックスを作成
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_history_student_id 
      ON analytics_history(student_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_history_period 
      ON analytics_history(period_start, period_end)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_history_created_at 
      ON analytics_history(created_at)
    `);

    console.log('[Migration] ✅ Indexes created/verified');

    // 更新トリガー関数を作成
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    console.log('[Migration] ✅ Trigger function created/updated');

    // トリガーを作成
    await pool.query(`
      DROP TRIGGER IF EXISTS update_analytics_history_updated_at ON analytics_history
    `);

    await pool.query(`
      CREATE TRIGGER update_analytics_history_updated_at
        BEFORE UPDATE ON analytics_history
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);

    console.log('[Migration] ✅ Trigger created/updated');
    console.log('[Migration] 🎉 All migrations completed successfully');

  } catch (error: any) {
    console.error('[Migration] ❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}
