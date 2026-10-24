-- When the board first saw each achievement on each entry, so the medals go
-- in the order they were earned. The Worker adds a row the first time an
-- upload or a read shows one. The ones held before the board kept dates get
-- 0, which puts them first, in list order.
CREATE TABLE IF NOT EXISTS earned (
  entry TEXT NOT NULL,
  achievement TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (entry, achievement)
);
-- Splits each stored list like "meltdown,regular" into one row per id.
WITH RECURSIVE split (entry, achievement, rest) AS (
  SELECT entry_id, '', achievements || ',' FROM scores
  UNION ALL
  SELECT entry, substr(rest, 1, instr(rest, ',') - 1), substr(rest, instr(rest, ',') + 1)
  FROM split WHERE rest <> ''
)
INSERT OR IGNORE INTO earned (entry, achievement, earned_at)
SELECT entry, achievement, 0 FROM split WHERE achievement <> '';
-- The board knows when it caught each cheater and hacker.
INSERT OR IGNORE INTO earned (entry, achievement, earned_at)
SELECT entry_id, 'cheater-cheater', caught_at FROM scores JOIN cheaters USING (owner);
INSERT OR IGNORE INTO earned (entry, achievement, earned_at)
SELECT entry_id, 'skynet-hacker', caught_at FROM scores JOIN jail USING (owner);
