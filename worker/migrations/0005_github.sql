-- The GitHub login of a checked entry, so the board can link to the account.
-- Empty for key entries and for checked ones not uploaded since, which get
-- it on their next upload.
ALTER TABLE scores ADD COLUMN github TEXT NOT NULL DEFAULT '';
