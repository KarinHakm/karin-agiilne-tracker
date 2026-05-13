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

const isEmpty = db.prepare('SELECT COUNT(*) as count FROM stories').get().count === 0;

if (isEmpty) {
  const insertStory = db.prepare(
    'INSERT INTO stories (title, description, status, points, priority) VALUES (?, ?, ?, ?, ?)'
  );
  const insertCriterion = db.prepare(
    'INSERT INTO acceptance_criteria (story_id, text) VALUES (?, ?)'
  );

  const seed = db.transaction(() => {
    let r = insertStory.run(
      'Kasutajana tahan lisada uue story, et saaksin tööülesande backlogi panna.',
      '', 'todo', 3, 1
    );
    ['Vormis saab sisestada pealkirja.', 'Vormis saab sisestada kirjelduse.',
     'Vormis saab sisestada punktid.', 'Salvestamisel ilmub story Todo / Backlog veergu.']
      .forEach(t => insertCriterion.run(r.lastInsertRowid, t));

    r = insertStory.run(
      'Kasutajana tahan muuta story staatust, et näidata töö edenemist.',
      '', 'doing', 5, 1
    );
    ['Story staatust saab muuta.', 'Lubatud staatused on todo, doing ja done.',
     'Story liigub õige staatuse veergu.']
      .forEach(t => insertCriterion.run(r.lastInsertRowid, t));

    r = insertStory.run(
      'Kasutajana tahan lisada story juurde kommentaare, et arutelu oleks story juures nähtav.',
      '', 'todo', 3, 2
    );
    ['Kommentaari saab sisestada.', 'Kommentaari saab salvestada.',
     'Kommentaar kuvatakse story juures.', 'Kommentaari juures kuvatakse lisamise aeg.']
      .forEach(t => insertCriterion.run(r.lastInsertRowid, t));

    r = insertStory.run(
      "Kasutajana tahan backlogi story'sid ümber järjestada, et saaksin määrata prioriteedi.",
      '', 'todo', 8, 3
    );
    ["Backlogis olevaid story'sid saab hiirega lohistada.", 'Uus järjekord salvestatakse.',
     'Pärast lehe uuendamist jääb järjekord samaks.']
      .forEach(t => insertCriterion.run(r.lastInsertRowid, t));
  });

  seed();
}

module.exports = db;
