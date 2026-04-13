// ── MODEL ──────────────────────────────────────────────
const Model = (() => {
  let issues = [];

  return {
    getAll: () => issues,

    async load() {
      const res = await fetch('api.php');
      issues = await res.json();
    },

    async add(title, desc, resolution, reporter, owner, status, priority, date) {
      const issue = {
        id: Date.now(), title, desc, resolution,
        reporter, owner, status, priority,
        date: date || new Date().toISOString()
      };
      await fetch('api.php', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(issue) });
      issues.unshift(issue);
      return issue;  
    },

    async update(id, data) {
      await fetch(`api.php/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      issues = issues.map(i => i.id === id ? {...i, ...data} : i);
    },

    async remove(id) {
      await fetch(`api.php/${id}`, { method:'DELETE' });
      issues = issues.filter(i => i.id !== id);
    },

    get: (id) => issues.find(i => i.id === id)
  };
})();

// ── VIEW ───────────────────────────────────────────────
const View = {
  list: document.getElementById('issueList'),
  empty: document.getElementById('empty'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  fTitle: document.getElementById('fTitle'),
  fDesc: document.getElementById('fDesc'),
  fResolution: document.getElementById('fResolution'),
  fReporter: document.getElementById('fReporter'),
  fOwner: document.getElementById('fOwner'),
  fStatus: document.getElementById('fStatus'),
  fPriority: document.getElementById('fPriority'),
  fDate: document.getElementById('fDate'),

  fmt(iso) {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  renderAll(issues) {
    this.list.innerHTML = '';
    if (!issues.length) { this.empty.classList.add('show'); return; }
    this.empty.classList.remove('show');
    issues.forEach(i => this.list.appendChild(this.card(i)));
  },

  card(i) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = i.id;
    el.innerHTML = `
      <div class="card-header">
        <div class="card-title">${this.esc(i.title)}</div>
        <span class="badge ${i.status}">${i.status}</span>
      </div> 

      <div class="card-desc">${this.esc(i.desc)}</div>
      <div class="card-meta" style="margin-top:.6rem;gap:.5rem;flex-wrap:wrap;">
        <span class="badge ${i.priority}">${i.priority}</span>
        <span style="color:var(--muted);font-size:11px;">👤 ${this.esc(i.reporter)}</span>
        ${i.owner ? `<span style="color:var(--muted);font-size:11px;">🏷 ${this.esc(i.owner)}</span>` : ''}
      </div>


      ${i.resolution ? `
      <div class="resolution-block">
        <div class="label">✓ Resolution</div>
        <p>${this.esc(i.resolution)}</p>
      </div>` : ''}
      <div class="card-meta">
        <span class="card-date">${this.fmt(i.date)}</span>
        <div class="card-actions">
          <button class="edit">Edit</button>
          <button class="toggle">${i.status === 'open' ? 'Resolve' : 'Reopen'}</button>
          <button class="del">Delete</button>
        </div>
      </div>`;
    return el;
  },

  esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  openModal(title = 'New Issue', data = {}) {
    this.modalTitle.textContent = title;
    this.fTitle.value = data.title || '';
    this.fDesc.value = data.desc || '';
    this.fResolution.value = data.resolution || '';
    this.modal.classList.remove('hidden');
    this.fTitle.focus();

    this.modalTitle.textContent = title;
    this.fTitle.value = data.title || '';
    this.fDesc.value = data.desc || '';
    this.fResolution.value = data.resolution || '';
    this.fReporter.value = data.reporter || '';
    this.fOwner.value = data.owner || '';
    this.fStatus.value = data.status || 'open';
    this.fPriority.value = data.priority || 'medium';
    this.fDate.value = data.date ? data.date.slice(0,16) : '';
    this.modal.classList.remove('hidden');
    this.fTitle.focus();
  },

  closeModal() {
    this.modal.classList.add('hidden');
  },

  formData() {
    return {
      title: this.fTitle.value.trim(),
      desc: this.fDesc.value.trim(),
      resolution: this.fResolution.value.trim(),
      reporter: this.fReporter.value.trim(),
      owner: this.fOwner.value.trim(),
      status: this.fStatus.value|| 'open',
      priority: this.fPriority.value,
      date: this.fDate.value ? new Date(this.fDate.value).toISOString() : new Date().toISOString()
    };
  }
};

// ── CONTROLLER ─────────────────────────────────────────
const Controller = (() => {
  let filter = 'all';
  let editId = null;

  const filtered = () => {
    const all = Model.getAll();
    if (filter === 'all') return all;
    return all.filter(i => i.status === filter);
  };

  const render = () => View.renderAll(filtered());

  // Filter buttons
  document.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filter = btn.dataset.filter;
      Model.load().then(render);
    });
  });

  // Open modal for new issue
  document.getElementById('openModal').addEventListener('click', () => {
    editId = null;
    View.openModal();
  });

  // Cancel
  document.getElementById('cancelModal').addEventListener('click', View.closeModal.bind(View));
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) View.closeModal();
  });

  // Save
document.getElementById('saveIssue').addEventListener('click', async () => {
  const { title, desc, resolution, reporter, owner, status, priority, date } = View.formData();
  if (!title || !desc || !reporter) { alert('Title, description and reporter are required.'); return; }
  if (editId) {
    await Model.update(editId, { title, desc, resolution, reporter, owner, status, priority, date });
    editId = null;
  } else {
    await Model.add(title, desc, resolution, reporter, owner, status, priority, date);
  }
  View.closeModal(); render();
});


  // Card actions (delegation)
 document.getElementById('issueList').addEventListener('click', async e => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = Number(card.dataset.id);
  if (e.target.classList.contains('del')) {
    if (confirm('Delete this issue?')) { await Model.remove(id); render(); }
  } else if (e.target.classList.contains('edit')) {
    editId = id; View.openModal('Edit Issue', Model.get(id));
  } else if (e.target.classList.contains('toggle')) {
    const issue = Model.get(id);
    await Model.update(id, {
      title: issue.title,
      desc: issue.desc,
      resolution: issue.resolution,
      reporter: issue.reporter,
      owner: issue.owner,
      priority: issue.priority,
      date: issue.date,
      status: issue.status === 'open' ? 'resolved' : 'in-progress' === issue.status ? 'resolved' : 'open'
    });
    render();
  }
});

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') View.closeModal();
  });

  render(); // init
})();
