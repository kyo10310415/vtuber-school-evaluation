-- Analytics History Table
-- 週次で自動取得されたアナリティクスデータを保存

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
  
  -- ユニーク制約: 同じ生徒・同じ期間のデータは1つだけ
  CONSTRAINT unique_student_period UNIQUE (student_id, period_start, period_end)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_analytics_history_student_id ON analytics_history(student_id);
CREATE INDEX IF NOT EXISTS idx_analytics_history_period ON analytics_history(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_analytics_history_created_at ON analytics_history(created_at);

-- 更新日時を自動更新する関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガー作成
DROP TRIGGER IF EXISTS update_analytics_history_updated_at ON analytics_history;
CREATE TRIGGER update_analytics_history_updated_at
  BEFORE UPDATE ON analytics_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
