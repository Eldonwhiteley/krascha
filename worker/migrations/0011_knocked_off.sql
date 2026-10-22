-- Who has been knocked off the number one spot on the most wanted or the pets
-- list, by entry id. The board keeps who is first on each list in crown, under
-- first:wanted and first:pets, and adds the old leader here when someone else
-- takes the spot while they are still on that list.
CREATE TABLE knocked_off (entry TEXT PRIMARY KEY);
