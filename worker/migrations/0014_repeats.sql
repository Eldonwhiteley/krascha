-- How many times an entry and each of its machines earned the achievements
-- you can earn again, like "meltdown:12,regular:3". Only the ones earned more
-- than once are listed, so an empty string means every medal was earned once.
ALTER TABLE scores ADD COLUMN repeats TEXT NOT NULL DEFAULT '';
ALTER TABLE machines ADD COLUMN repeats TEXT NOT NULL DEFAULT '';
