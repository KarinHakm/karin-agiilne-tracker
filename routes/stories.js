const express = require('express');
const router = express.Router();
const db = require('../database');

function getStoryWithDetails(id) {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(id);
  if (!story) return null;
  story.acceptanceCriteria = db
    .prepare('SELECT text FROM acceptance_criteria WHERE story_id = ?')
    .all(id)
    .map(c => c.text);
  story.comments = db
    .prepare('SELECT * FROM comments WHERE story_id = ? ORDER BY created_at ASC')
    .all(id);
  return story;
}

// GET /api/stories
router.get('/', (req, res) => {
  const stories = db.prepare('SELECT * FROM stories ORDER BY priority ASC, id ASC').all();
  const result = stories.map(story => {
    story.acceptanceCriteria = db
      .prepare('SELECT text FROM acceptance_criteria WHERE story_id = ?')
      .all(story.id)
      .map(c => c.text);
    story.comments = db
      .prepare('SELECT * FROM comments WHERE story_id = ? ORDER BY created_at ASC')
      .all(story.id);
    return story;
  });
  res.json(result);
});

// PATCH /api/stories/reorder — peab olema enne /:id route'e
router.patch('/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order peab olema massiiv' });
  }
  const updatePriority = db.prepare('UPDATE stories SET priority = ? WHERE id = ?');
  const reorderMany = db.transaction(items => {
    for (const item of items) {
      updatePriority.run(item.priority, item.id);
    }
  });
  reorderMany(order);
  res.json({ success: true });
});

// GET /api/stories/:id
router.get('/:id', (req, res) => {
  const story = getStoryWithDetails(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story ei leitud' });
  res.json(story);
});

// POST /api/stories
router.post('/', (req, res) => {
  const { title, description = '', status = 'todo', points, acceptanceCriteria = [] } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Pealkiri on kohustuslik' });
  }
  if (points === undefined || points === null || points === '') {
    return res.status(400).json({ error: 'Punktid on kohustuslikud' });
  }
  if (!Number.isInteger(Number(points)) || Number(points) < 0) {
    return res.status(400).json({ error: 'Punktid peavad olema mitte-negatiivne täisarv' });
  }
  if (!['todo', 'doing', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Staatus peab olema todo, doing või done' });
  }

  const maxRow = db.prepare('SELECT MAX(priority) as maxP FROM stories WHERE status = ?').get(status);
  const priority = (maxRow.maxP || 0) + 1;

  const result = db
    .prepare('INSERT INTO stories (title, description, status, points, priority) VALUES (?, ?, ?, ?, ?)')
    .run(title.trim(), description, status, Number(points), priority);

  const storyId = result.lastInsertRowid;
  const insertCriterion = db.prepare('INSERT INTO acceptance_criteria (story_id, text) VALUES (?, ?)');
  for (const criterion of acceptanceCriteria) {
    if (criterion.trim()) insertCriterion.run(storyId, criterion.trim());
  }

  res.status(201).json(getStoryWithDetails(storyId));
});

// PUT /api/stories/:id
router.put('/:id', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story ei leitud' });

  const { title, description, status, points, acceptanceCriteria } = req.body;

  if (title !== undefined && title.trim() === '') {
    return res.status(400).json({ error: 'Pealkiri ei saa olla tühi' });
  }
  if (points !== undefined && (points === '' || !Number.isInteger(Number(points)) || Number(points) < 0)) {
    return res.status(400).json({ error: 'Punktid peavad olema mitte-negatiivne täisarv' });
  }
  if (status !== undefined && !['todo', 'doing', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Staatus peab olema todo, doing või done' });
  }

  db.prepare(`
    UPDATE stories SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      points = COALESCE(?, points),
      updated_at = strftime('%Y-%m-%d %H:%M', 'now')
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    description !== undefined ? description : null,
    status || null,
    points !== undefined ? Number(points) : null,
    req.params.id
  );

  if (acceptanceCriteria !== undefined) {
    db.prepare('DELETE FROM acceptance_criteria WHERE story_id = ?').run(req.params.id);
    const insertCriterion = db.prepare('INSERT INTO acceptance_criteria (story_id, text) VALUES (?, ?)');
    for (const criterion of acceptanceCriteria) {
      if (criterion.trim()) insertCriterion.run(req.params.id, criterion.trim());
    }
  }

  res.json(getStoryWithDetails(req.params.id));
});

// DELETE /api/stories/:id
router.delete('/:id', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story ei leitud' });
  db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// PATCH /api/stories/:id/status
router.patch('/:id/status', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story ei leitud' });

  const { status } = req.body;
  if (!['todo', 'doing', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Staatus peab olema todo, doing või done' });
  }

  db.prepare("UPDATE stories SET status = ?, updated_at = strftime('%Y-%m-%d %H:%M', 'now') WHERE id = ?")
    .run(status, req.params.id);
  res.json(getStoryWithDetails(req.params.id));
});

// POST /api/stories/:id/comments
router.post('/:id/comments', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story ei leitud' });

  const { text } = req.body;
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Kommentaari tekst on kohustuslik' });
  }

  const result = db
    .prepare('INSERT INTO comments (story_id, text) VALUES (?, ?)')
    .run(req.params.id, text.trim());
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(comment);
});

// DELETE /api/stories/:id/comments/:commentId
router.delete('/:id/comments/:commentId', (req, res) => {
  const comment = db
    .prepare('SELECT * FROM comments WHERE id = ? AND story_id = ?')
    .get(req.params.commentId, req.params.id);
  if (!comment) return res.status(404).json({ error: 'Kommentaar ei leitud' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
  res.status(204).send();
});

module.exports = router;
