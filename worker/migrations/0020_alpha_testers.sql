-- Alpha tester goes to the first 2 beta testers, in the order they signed up.
-- Uploads get it from the Worker from now on, and this hands it to the
-- entries already on the board, so it shows before their next upload.
UPDATE scores
SET achievements = CASE achievements WHEN '' THEN 'alpha-tester' ELSE achievements || ',alpha-tester' END
WHERE owner IN (SELECT owner FROM beta_testers ORDER BY rowid LIMIT 2)
  AND ',' || achievements || ',' NOT LIKE '%,alpha-tester,%';
