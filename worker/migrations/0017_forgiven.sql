-- A cheater who says sorry after being caught gets forgiven, so the board
-- keeps when each one was caught. The ones already caught count from now, so
-- an apology typed before this does not let them off.
ALTER TABLE cheaters ADD COLUMN caught_at INTEGER NOT NULL DEFAULT 0;
UPDATE cheaters SET caught_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE caught_at = 0;
-- The counts each owner had when they were forgiven. Only what they upload
-- past these can catch them again, so the counts that got them caught do not.
CREATE TABLE IF NOT EXISTS forgiven (
  owner TEXT PRIMARY KEY,
  kind INTEGER NOT NULL,
  mean INTEGER NOT NULL,
  prompts INTEGER NOT NULL,
  copies INTEGER NOT NULL
);
