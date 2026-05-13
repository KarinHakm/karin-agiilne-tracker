const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stories.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'doing', 'done')),
    points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
    priority INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M', 'now'))
  );

  CREATE TABLE IF NOT EXISTS acceptance_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M', 'now')),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );
`);

module.exports = db;
