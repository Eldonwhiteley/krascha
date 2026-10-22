-- Leader of the human resistance belongs to shanep alone, by GitHub user id.
-- Uploads get it from the Worker from now on, and this hands it to the entry
-- already on the board, so it shows before the next upload.
UPDATE scores
SET achievements = CASE achievements WHEN '' THEN 'resistance-leader' ELSE achievements || ',resistance-leader' END
WHERE owner = 'github:1378027' AND ',' || achievements || ',' NOT LIKE '%,resistance-leader,%';
