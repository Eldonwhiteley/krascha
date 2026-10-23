-- Skynet jail: owners caught sending numbers no person types, past
-- HUMAN_PROMPTS or HUMAN_TOKENS_PER_DAY with every machine added up. A row
-- stays for good, for Skynet hacker, and free turns 1 when an upload with
-- real numbers lets them out. It keeps when they were caught and what they
-- claimed, since the made up upload itself is never saved.
CREATE TABLE IF NOT EXISTS jail (
  owner TEXT PRIMARY KEY,
  caught_at INTEGER NOT NULL,
  prompts INTEGER NOT NULL,
  tokens_per_day INTEGER NOT NULL,
  free INTEGER NOT NULL DEFAULT 0
);
-- Locks up the entries already on the board past those numbers.
INSERT INTO jail (owner, caught_at, prompts, tokens_per_day)
SELECT owner, CAST(strftime('%s', 'now') AS INTEGER) * 1000, prompts, tokens_per_day
FROM scores WHERE prompts > 1000000 OR tokens_per_day > 100000000000
ON CONFLICT (owner) DO NOTHING;
-- Drops the made up machines, so their owner's next upload with real numbers
-- adds up to real numbers and lets them out.
DELETE FROM machines WHERE prompts > 1000000 OR tokens_per_day > 100000000000;
