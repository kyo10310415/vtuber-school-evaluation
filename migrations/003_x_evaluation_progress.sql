-- X評価の進捗管理テーブル
CREATE TABLE IF NOT EXISTS x_evaluation_progress (
  id SERIAL PRIMARY KEY,
  evaluation_month VARCHAR(7) NOT NULL,  -- YYYY-MM
  current_batch_index INTEGER NOT NULL DEFAULT 0,
  total_students INTEGER NOT NULL,
  completed_students INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(evaluation_month)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_x_progress_month ON x_evaluation_progress(evaluation_month);
CREATE INDEX IF NOT EXISTS idx_x_progress_completed ON x_evaluation_progress(is_completed);
