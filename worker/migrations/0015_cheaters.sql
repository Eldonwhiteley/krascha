-- Owners the board caught gaming it, for good, so a remove or a clean upload
-- later does not wash it off. Each machine keeps how many kind or mean prompts
-- it typed past 10 times in a day, which only a script does.
CREATE TABLE IF NOT EXISTS cheaters (owner TEXT PRIMARY KEY);
ALTER TABLE machines ADD COLUMN copies INTEGER NOT NULL DEFAULT 0;
-- Uploads are checked from now on, and this catches the entries already on
-- the board with more than half their prompts kind or mean.
INSERT INTO cheaters (owner)
SELECT owner FROM scores WHERE prompts >= 100 AND (kind + mean) * 2 > prompts
ON CONFLICT (owner) DO NOTHING;
