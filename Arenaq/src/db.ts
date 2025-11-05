import Database from 'better-sqlite3';
export const db = new Database('ladder.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS snapshots (
  key TEXT PRIMARY KEY,
  bracket TEXT NOT NULL,
  name TEXT NOT NULL,
  realm_slug TEXT NOT NULL,
  rating INTEGER NOT NULL,
  won INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  played INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);
`);