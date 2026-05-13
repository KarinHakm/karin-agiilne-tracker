const API = '/api/stories';

let stories = [];
let editingStoryId = null;
let criteriaCount = 0;
const sortableInstances = {};

// --- API abifunktsioonid ---

async function apiFetch(method, url, data) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Serveri viga' }));
    throw new Error(err.error || 'API viga');
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Toast ---

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${isError ? 'error' : 'success'}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// --- Laadimine ja renderdamine ---

async function loadStories() {
  try {
    stories = await apiFetch('GET', API);
    renderBoard();
  } catch (e) {
    showToast(e.message, true);
  }
}

function renderBoard() {
  const containers = {
    todo: document.getElementById('cards-todo'),
    doing: document.getElementById('cards-doing'),
    done: document.getElementById('cards-done')
  };

  Object.values(containers).forEach(c => (c.innerHTML = ''));

  const sorted = [...stories].sort((a, b) => a.priority - b.priority || a.id - b.id);
  sorted.forEach(story => {
    const col = containers[story.status];
    if (col) col.appendChild(createCard(story));
  });

  updateSums();
  initSortable();
}

function createCard(story) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = story.id;

  card.innerHTML = `
    <div class="card-header">
      <span class="card-id">#${story.id}</span>
      <span class="card-points">${story.points} p</span>
    </div>
    <div class="card-title">${escapeHtml(story.title)}</div>
    <div class="card-footer">
      <span>${story.acceptanceCriteria?.length || 0} tingimust</span>
      <span>${story.comments?.length || 0} komm.</span>
      <div class="card-actions">
        <button data-action="detail" title="Vaata">👁</button>
        <button data-action="edit" title="Muuda">✏️</button>
        <button data-action="delete" title="Kustuta">🗑️</button>
      </div>
    </div>
  `;

  card.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'detail' || !action) openDetail(story.id);
    if (action === 'edit') openEdit(story.id);
    if (action === 'delete') handleDelete(story.id);
  });

  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text || ''));
  return div.innerHTML;
}

function updateSums() {
  const sums = { todo: 0, doing: 0, done: 0 };
  stories.forEach(s => { sums[s.status] = (sums[s.status] || 0) + (s.points || 0); });
  document.getElementById('sum-todo').textContent = `${sums.todo} p`;
  document.getElementById('sum-doing').textContent = `${sums.doing} p`;
  document.getElementById('sum-done').textContent = `${sums.done} p`;
}

// --- Drag-and-drop (SortableJS) ---

function initSortable() {
  ['todo', 'doing', 'done'].forEach(status => {
    const el = document.getElementById(`cards-${status}`);
    if (sortableInstances[status]) sortableInstances[status].destroy();

    sortableInstances[status] = new Sortable(el, {
      group: 'stories',
      animation: 150,
      ghostClass: 'card-ghost',
      onEnd: async evt => {
        const storyId = Number(evt.item.dataset.id);
        const fromStatus = evt.from.id.replace('cards-', '');
        const toStatus = evt.to.id.replace('cards-', '');

        if (fromStatus !== toStatus) {
          try {
            const updated = await apiFetch('PATCH', `${API}/${storyId}/status`, { status: toStatus });
            const idx = stories.findIndex(s => s.id === storyId);
            if (idx !== -1) stories[idx] = { ...stories[idx], ...updated };
            updateSums();
          } catch (e) {
            showToast(e.message, true);
            renderBoard();
          }
        }

        if (toStatus === 'todo') {
          const order = [...evt.to.querySelectorAll('.card')].map((el, i) => ({
            id: Number(el.dataset.id),
            priority: i + 1
          }));
          try {
            await apiFetch('PATCH', `${API}/reorder`, { order });
            order.forEach(item => {
              const s = stories.find(s => s.id === item.id);
              if (s) s.priority = item.priority;
            });
          } catch (e) {
            showToast(e.message, true);
          }
        }
      }
    });
  });
}

// --- Lisa / Muuda modal ---

function openAddModal() {
  editingStoryId = null;
  document.getElementById('modalTitle').textContent = 'Lisa uus story';
  document.getElementById('storyTitle').value = '';
  document.getElementById('storyDescription').value = '';
  document.getElementById('storyPoints').value = '';
  document.getElementById('storyStatus').value = 'todo';
  document.getElementById('criteriaList').innerHTML = '';
  criteriaCount = 0;
  addCriterionField();
  document.getElementById('storyModal').classList.remove('hidden');
  document.getElementById('storyTitle').focus();
}

function openEdit(storyId) {
  const story = stories.find(s => s.id === storyId);
  if (!story) return;
  editingStoryId = storyId;
  document.getElementById('modalTitle').textContent = 'Muuda story';
  document.getElementById('storyTitle').value = story.title;
  document.getElementById('storyDescription').value = story.description || '';
  document.getElementById('storyPoints').value = story.points;
  document.getElementById('storyStatus').value = story.status;
  document.getElementById('criteriaList').innerHTML = '';
  criteriaCount = 0;
  const criteria = story.acceptanceCriteria || [];
  criteria.forEach(c => addCriterionField(c));
  if (!criteria.length) addCriterionField();
  document.getElementById('storyModal').classList.remove('hidden');
  document.getElementById('storyTitle').focus();
}

function closeStoryModal() {
  document.getElementById('storyModal').classList.add('hidden');
  editingStoryId = null;
}

function addCriterionField(value = '') {
  criteriaCount++;
  const div = document.createElement('div');
  div.className = 'criterion-row';
  div.innerHTML = `
    <input type="text" class="criterion-input" placeholder="Vastuvõtutingimus ${criteriaCount}" value="${escapeHtml(value)}">
    <button type="button" class="btn-icon" title="Eemalda">×</button>
  `;
  div.querySelector('.btn-icon').addEventListener('click', () => div.remove());
  document.getElementById('criteriaList').appendChild(div);
}

async function handleStorySubmit(e) {
  e.preventDefault();

  const title = document.getElementById('storyTitle').value.trim();
  const description = document.getElementById('storyDescription').value.trim();
  const pointsRaw = document.getElementById('storyPoints').value;
  const status = document.getElementById('storyStatus').value;
  const acceptanceCriteria = [...document.querySelectorAll('.criterion-input')]
    .map(i => i.value.trim())
    .filter(Boolean);

  if (!title) return showToast('Pealkiri on kohustuslik', true);
  if (pointsRaw === '') return showToast('Punktid on kohustuslikud', true);

  const points = Number(pointsRaw);
  if (!Number.isInteger(points) || points < 0) {
    return showToast('Punktid peavad olema mitte-negatiivne täisarv', true);
  }

  const data = { title, description, status, points, acceptanceCriteria };

  try {
    if (editingStoryId) {
      const updated = await apiFetch('PUT', `${API}/${editingStoryId}`, data);
      const idx = stories.findIndex(s => s.id === editingStoryId);
      if (idx !== -1) stories[idx] = updated;
      showToast('Story uuendatud!');
    } else {
      const created = await apiFetch('POST', API, data);
      stories.push(created);
      showToast('Story loodud!');
    }
    closeStoryModal();
    renderBoard();
  } catch (e) {
    showToast(e.message, true);
  }
}

async function handleDelete(storyId) {
  if (!confirm('Kas oled kindel, et soovid selle story kustutada?')) return;
  try {
    await apiFetch('DELETE', `${API}/${storyId}`);
    stories = stories.filter(s => s.id !== storyId);
    renderBoard();
    document.getElementById('detailModal').classList.add('hidden');
    showToast('Story kustutatud!');
  } catch (e) {
    showToast(e.message, true);
  }
}

// --- Detail modal ---

async function openDetail(storyId) {
  try {
    const story = await apiFetch('GET', `${API}/${storyId}`);
    const idx = stories.findIndex(s => s.id === storyId);
    if (idx !== -1) stories[idx] = story;

    const statusLabel = { todo: 'Todo/Backlog', doing: 'Doing', done: 'Done' }[story.status];

    document.getElementById('detailTitle').textContent = `#${story.id}: ${escapeHtml(story.title)}`;
    document.getElementById('detailContent').innerHTML = `
      <div class="detail-meta">
        <span class="badge badge-${story.status}">${statusLabel}</span>
        <span class="badge badge-points">${story.points} punkti</span>
        <span class="detail-dates">Loodud: ${story.created_at} | Muudetud: ${story.updated_at}</span>
      </div>
      ${story.description ? `<p class="detail-description">${escapeHtml(story.description)}</p>` : ''}
      <div class="detail-section">
        <h3>Vastuvõtutingimused</h3>
        <ul class="criteria-list">
          ${(story.acceptanceCriteria || []).length
            ? story.acceptanceCriteria.map(c => `<li>${escapeHtml(c)}</li>`).join('')
            : '<li class="empty">Tingimusi pole lisatud</li>'}
        </ul>
      </div>
      <div class="detail-section">
        <h3>Kommentaarid (${(story.comments || []).length})</h3>
        <div class="comments-list" id="comments-list">
          ${(story.comments || []).length
            ? story.comments.map(c => `
              <div class="comment" data-comment-id="${c.id}">
                <div class="comment-text">${escapeHtml(c.text)}</div>
                <div class="comment-footer">
                  <span class="comment-time">${c.created_at}</span>
                  <button class="btn-icon-sm" data-delete-comment="${c.id}" title="Kustuta">× Kustuta</button>
                </div>
              </div>`).join('')
            : '<p class="empty">Kommentaare pole</p>'}
        </div>
        <div class="add-comment">
          <textarea id="commentText" rows="2" placeholder="Lisa kommentaar..."></textarea>
          <button id="submitComment" class="btn btn-secondary btn-sm">Lisa kommentaar</button>
        </div>
      </div>
      <div class="detail-actions">
        <button id="detailEditBtn" class="btn btn-secondary">Muuda</button>
        <button id="detailDeleteBtn" class="btn btn-danger">Kustuta story</button>
      </div>
    `;

    document.getElementById('submitComment').addEventListener('click', () => handleAddComment(storyId));
    document.getElementById('detailEditBtn').addEventListener('click', () => {
      document.getElementById('detailModal').classList.add('hidden');
      openEdit(storyId);
    });
    document.getElementById('detailDeleteBtn').addEventListener('click', () => handleDelete(storyId));

    document.querySelectorAll('[data-delete-comment]').forEach(btn => {
      btn.addEventListener('click', () => handleDeleteComment(storyId, Number(btn.dataset.deleteComment)));
    });

    document.getElementById('detailModal').classList.remove('hidden');
  } catch (e) {
    showToast(e.message, true);
  }
}

async function handleAddComment(storyId) {
  const textEl = document.getElementById('commentText');
  const text = textEl.value.trim();
  if (!text) return showToast('Kommentaar ei saa olla tühi', true);
  try {
    await apiFetch('POST', `${API}/${storyId}/comments`, { text });
    textEl.value = '';
    await openDetail(storyId);
    showToast('Kommentaar lisatud!');
  } catch (e) {
    showToast(e.message, true);
  }
}

async function handleDeleteComment(storyId, commentId) {
  try {
    await apiFetch('DELETE', `${API}/${storyId}/comments/${commentId}`);
    await openDetail(storyId);
    showToast('Kommentaar kustutatud!');
  } catch (e) {
    showToast(e.message, true);
  }
}

// --- Sündmuste kuulajad ---

document.getElementById('addStoryBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeStoryModal);
document.getElementById('cancelModal').addEventListener('click', closeStoryModal);
document.getElementById('storyForm').addEventListener('submit', handleStorySubmit);
document.getElementById('addCriterion').addEventListener('click', () => addCriterionField());
document.getElementById('closeDetail').addEventListener('click', () => {
  document.getElementById('detailModal').classList.add('hidden');
});

window.addEventListener('click', e => {
  if (e.target.id === 'storyModal') closeStoryModal();
  if (e.target.id === 'detailModal') document.getElementById('detailModal').classList.add('hidden');
});

// --- Käivitamine ---

loadStories();
