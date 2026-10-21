-- One row per owner: a GitHub account the Worker checked ("github:<id>") or
-- a key the CLI made up ("key:<sha256 of the key>"). Neither the GitHub token
-- nor the key itself is stored, so an upload just replaces the owner's last one.
CREATE TABLE IF NOT EXISTS scores (
  owner TEXT PRIMARY KEY,
  verified INTEGER NOT NULL,
  entry_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind INTEGER NOT NULL,
  mean INTEGER NOT NULL,
  prompts INTEGER NOT NULL,
  score REAL NOT NULL,
  achievements TEXT NOT NULL,
  tokens_per_day INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,
  upload_day TEXT NOT NULL,
  uploads_today INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS scores_by_score ON scores (score, uploaded_at);

-- How many unverified entries each network started today. Only a hash of the
-- address and the day is kept, and older days are dropped as new ones come in.
CREATE TABLE IF NOT EXISTS new_entries (
  origin TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (origin, day)
);
