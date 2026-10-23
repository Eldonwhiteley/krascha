-- Caught the hacker belongs to shanep alone, by GitHub user id, like Caught the
-- cheater. This hands it to the entry already on the board, so it shows before
-- the next upload.
UPDATE scores
SET achievements = CASE achievements WHEN '' THEN 'caught-the-hacker' ELSE achievements || ',caught-the-hacker' END
WHERE owner = 'github:1378027' AND ',' || achievements || ',' NOT LIKE '%,caught-the-hacker,%';
