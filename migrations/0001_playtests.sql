CREATE TABLE IF NOT EXISTS playtests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL DEFAULT 2,
  client_version TEXT NOT NULL,
  hero_id TEXT NOT NULL,
  hero_name TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 8),
  rounds INTEGER NOT NULL CHECK (rounds BETWEEN 1 AND 10),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  health INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  triples INTEGER NOT NULL DEFAULT 0,
  refreshes INTEGER NOT NULL DEFAULT 0,
  spells INTEGER NOT NULL DEFAULT 0,
  final_board TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT NOT NULL,
  fun_rating INTEGER CHECK (fun_rating BETWEEN 1 AND 5),
  replay_intent TEXT CHECK (replay_intent IN ('YES', 'MAYBE', 'NO')),
  failure_clarity INTEGER CHECK (failure_clarity BETWEEN 1 AND 5),
  ai_credibility INTEGER CHECK (ai_credibility BETWEEN 1 AND 5),
  build_description TEXT,
  comment TEXT,
  feedback_submitted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playtests_completed_at ON playtests(completed_at);
CREATE INDEX IF NOT EXISTS idx_playtests_client_version ON playtests(client_version);
CREATE INDEX IF NOT EXISTS idx_playtests_hero_id ON playtests(hero_id);
CREATE INDEX IF NOT EXISTS idx_playtests_rank ON playtests(rank);
