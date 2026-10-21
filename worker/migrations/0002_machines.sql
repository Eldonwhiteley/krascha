-- Each machine's last upload, so an owner's machines add up to the one row
-- in scores. An upload from a build that sends no machine id is kept under
-- the empty id and replaces the owner's other machines.
CREATE TABLE IF NOT EXISTS machines (
  owner TEXT NOT NULL,
  machine TEXT NOT NULL,
  kind INTEGER NOT NULL,
  mean INTEGER NOT NULL,
  prompts INTEGER NOT NULL,
  achievements TEXT NOT NULL,
  tokens_per_day INTEGER NOT NULL,
  PRIMARY KEY (owner, machine)
);
