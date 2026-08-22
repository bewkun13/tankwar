CREATE TABLE IF NOT EXISTS score_snapshots (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  thailand INTEGER NOT NULL DEFAULT 0 CHECK (thailand >= 0),
  myanmar INTEGER NOT NULL DEFAULT 0 CHECK (myanmar >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

