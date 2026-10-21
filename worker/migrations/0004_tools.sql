-- The agents each upload was typed into, as comma separated ids from TOOLS.
-- A machine keeps its own, and the owner's row keeps every machine's. Empty
-- for uploads from builds older than tools on the board, which show none.
ALTER TABLE machines ADD COLUMN tools TEXT NOT NULL DEFAULT '';

ALTER TABLE scores ADD COLUMN tools TEXT NOT NULL DEFAULT '';
