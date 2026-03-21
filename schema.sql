CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  chat_id TEXT,
  message_id INTEGER,
  inline_message_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  submitted_at INTEGER,
  last_mode TEXT,
  last_submit_id TEXT,
  last_score INTEGER
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  submit_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_score_created ON leaderboard_entries (mode, score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_user_score_created ON leaderboard_entries (mode, user_id, score DESC, created_at DESC);
