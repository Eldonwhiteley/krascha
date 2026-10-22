-- Who holds Most decorated, by entry id. The board works out the holder when
-- it is read and moves it only to someone with more, so a tie needs to know
-- who had it first.
CREATE TABLE crown (id TEXT PRIMARY KEY, entry TEXT NOT NULL);
