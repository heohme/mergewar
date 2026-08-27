CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  client_version TEXT NOT NULL,
  hero_id TEXT NOT NULL,
  hero_name TEXT NOT NULL,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 10),
  phase TEXT NOT NULL,
  description TEXT NOT NULL,
  include_logs INTEGER NOT NULL DEFAULT 1,
  behavior_log TEXT NOT NULL DEFAULT '[]',
  state_snapshot TEXT NOT NULL DEFAULT '{}',
  viewport_width INTEGER NOT NULL DEFAULT 0,
  viewport_height INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_bug_reports_session_id ON bug_reports(session_id);
