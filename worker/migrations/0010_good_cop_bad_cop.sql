-- Good cop, bad cop goes to an owner with one machine that leans nice and one
-- that leans mean. Uploads get it from the Worker from now on, and this hands
-- it to the entries already on the board. A machine leans nice when its kind
-- prompts outweigh twice its mean ones, the same way the score leans.
UPDATE scores
SET achievements = CASE achievements WHEN '' THEN 'good-cop-bad-cop' ELSE achievements || ',good-cop-bad-cop' END
WHERE owner IN (
  SELECT owner FROM machines GROUP BY owner
  HAVING MAX(kind - 2 * mean) > 0 AND MIN(kind - 2 * mean) < 0
) AND ',' || achievements || ',' NOT LIKE '%,good-cop-bad-cop,%';
