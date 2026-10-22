-- Kyle Reese belongs to lhindman alone, by GitHub user id. Uploads get it from
-- the Worker from now on, and this hands it to the entry already on the board,
-- so it shows before the next upload.
UPDATE scores
SET achievements = CASE achievements WHEN '' THEN 'kyle-reese' ELSE achievements || ',kyle-reese' END
WHERE owner = 'github:2855647' AND ',' || achievements || ',' NOT LIKE '%,kyle-reese,%';
