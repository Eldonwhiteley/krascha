-- Each entry's Silo 7 total out of 50, so the bunks can be ranked across
-- everyone, not just the most wanted and the pets. NULL until the Worker
-- works it out, which it does for any NULL row before reading the board. If
-- the board's scoring ever changes, a migration that sets it back to NULL is
-- all it takes to rescore everyone.
ALTER TABLE scores ADD COLUMN silo INTEGER;

CREATE INDEX IF NOT EXISTS scores_by_silo ON scores (silo DESC, uploaded_at);
