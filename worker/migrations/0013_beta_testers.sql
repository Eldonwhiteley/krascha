-- The first 5 owners to upload, who hold Beta tester for good. A remove
-- leaves the owner here, so they get it back when they upload again. The
-- board has no first upload time, so this takes the owners already on it in
-- the order their rows went in.
CREATE TABLE beta_testers (owner TEXT PRIMARY KEY);

INSERT OR IGNORE INTO beta_testers (owner) SELECT owner FROM scores ORDER BY rowid LIMIT 5;

UPDATE scores
SET achievements = CASE achievements WHEN '' THEN 'beta-tester' ELSE achievements || ',beta-tester' END
WHERE owner IN (SELECT owner FROM beta_testers) AND ',' || achievements || ',' NOT LIKE '%,beta-tester,%';
