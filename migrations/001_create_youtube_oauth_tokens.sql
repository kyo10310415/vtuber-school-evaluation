-- YouTube OAuth Tokens Table
-- Render PostgreSQLで使用するトークン保存テーブル

CREATE TABLE IF NOT EXISTS youtube_oauth_tokens (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at BIGINT NOT NULL,
  token_type VARCHAR(20) NOT NULL DEFAULT 'Bearer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成（高速検索用）
CREATE INDEX IF NOT EXISTS idx_youtube_oauth_tokens_student_id ON youtube_oauth_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_youtube_oauth_tokens_expires_at ON youtube_oauth_tokens(expires_at);

-- コメント追加
COMMENT ON TABLE youtube_oauth_tokens IS 'YouTube Analytics OAuth認証トークンを保存';
COMMENT ON COLUMN youtube_oauth_tokens.student_id IS '学籍番号（一意）';
COMMENT ON COLUMN youtube_oauth_tokens.access_token IS 'アクセストークン';
COMMENT ON COLUMN youtube_oauth_tokens.refresh_token IS 'リフレッシュトークン（オプション）';
COMMENT ON COLUMN youtube_oauth_tokens.expires_at IS 'トークン有効期限（Unix timestamp ミリ秒）';
COMMENT ON COLUMN youtube_oauth_tokens.token_type IS 'トークンタイプ（通常はBearer）';
COMMENT ON COLUMN youtube_oauth_tokens.created_at IS '作成日時';
COMMENT ON COLUMN youtube_oauth_tokens.updated_at IS '更新日時';
