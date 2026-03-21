ALTER TABLE leaderboard_entries ADD COLUMN season_key TEXT;
ALTER TABLE leaderboard_entries ADD COLUMN player_source TEXT;

UPDATE leaderboard_entries
SET
  season_key = 's' || CAST(created_at / 1209600000 AS INTEGER),
  player_source = 'telegram'
WHERE season_key IS NULL OR player_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_season_score_created
  ON leaderboard_entries (mode, season_key, score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_season_user_score_created
  ON leaderboard_entries (mode, season_key, user_id, score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard_entries (created_at);
