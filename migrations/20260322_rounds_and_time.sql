ALTER TABLE leaderboard_entries ADD COLUMN rounds_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leaderboard_entries ADD COLUMN time_used_ms INTEGER NOT NULL DEFAULT 0;
