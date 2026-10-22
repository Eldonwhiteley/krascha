-- Likes for the most wanted and the pets. The count sits on the entry, so it
-- outlasts new uploads. One network can like an entry once a day, so only a
-- hash of the day, the address and the entry is kept, and older days are
-- dropped as new likes come in.
ALTER TABLE scores ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS likes (
  liker TEXT PRIMARY KEY,
  day TEXT NOT NULL
);
