js/api.js
'use strict';

const API_BASE = 'api.php';

export async function api(params, method = 'GET', body = null) {
  const url = API_BASE + '?' + new URLSearchParams(params);
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok && r.status !== 404) {
    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(err.error || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function uploadFiles(files, parentType, parentId) {
  if (!files.length) return [];
  const fd = new FormData();
  fd.append('parent_type', parentType);
  fd.append('parent_id', String(parentId));
  files.forEach(f => fd.append('files[]', f));
  const r = await fetch(`${API_BASE}?type=upload`, { method: 'POST', body: fd });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.attachments || [];
}

export function fileUrl(filename) {
  // Serve directly from /uploads/ — no api.php proxy needed for static images
  // This fixes the Content-Disposition: attachment bug that broke <img> previews
  return `uploads/${encodeURIComponent(filename)}`;
}

export const API_BASE_URL = API_BASE;
js/utils.js
'use strict';

export const $ = id => document.getElementById(id);
export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function fmtDateOnly(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function isOverdue(row) {
  if (!row.due_date) return false;
  if (['Resolved', 'Closed'].includes(row.status)) return false;
  return new Date(row.due_date) < new Date();
}

export function statusClass(s) {
  const m = {
    'New': 'new', 'Open': 'open', 'In Progress': 'inprogress',
    'Waiting for User': 'waiting', 'Waiting for Vendor': 'waiting',
    'Resolved': 'resolved', 'Closed': 'closed', 'Reopened': 'reopened'
  };
  return 'badge badge-status-' + (m[s] || 'new');
}

export function prioClass(p) {
  return 'badge badge-prio-' + (p || 'medium').toLowerCase();
}

export function copyText(txt) {
  navigator.clipboard.writeText(txt)
    .then(() => toast('Copied to clipboard', 'success'))
    .catch(() => toast('Copy failed', 'error'));
}

export function toast(msg, type = 'info', dur = 2800) {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const t = el('div', `toast ${type}`);
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

export function nowLocalISO() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

// Sanitise a string for safe use in FTS5 MATCH — strip special operators
export function sanitiseFTS(q) {
  return q.replace(/[+\-*()":^~]/g, ' ').trim();
}
js/storage.js
'use strict';

const PREFIX = 'itt_';

export function localSave(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) {}
}

export function localLoad(key, def = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v !== null ? JSON.parse(v) : def;
  } catch (e) { return def; }
}
js/upload.js
'use strict';

import { el, esc, toast } from './utils.js';
import { uploadFiles, fileUrl } from './api.js';

const ALLOWED_EXT  = ['jpg','jpeg','png','gif','pdf','txt','log','csv','docx','xlsx'];
const MAX_BYTES    = 20 * 1024 * 1024;
const MIME_TO_EXT  = { 'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp' };

/**
 * Render saved attachments (from server) as thumbnails.
 * withRemove: show ✕ button that calls DELETE on the server.
 */
export function renderSavedAttachments(atts = [], onRemove = null) {
  const wrap = el('div', 'upload-previews');
  atts.forEach(a => {
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.filename || '');
    const thumb = el('div', 'att-thumb');

    if (onRemove) {
      const rm = el('button', 'att-remove', '✕');
      rm.title = 'Remove attachment';
      rm.onclick = async (e) => {
        e.stopPropagation();
        onRemove(a, thumb);
      };
      thumb.appendChild(rm);
    }

    if (isImg) {
      // Serve directly from /uploads/ so <img> renders inline (no Content-Disposition: attachment)
      const img = el('img');
      img.src = fileUrl(a.filename);
      img.alt = esc(a.original_name);
      img.title = a.original_name;
      img.onclick = () => window.open(fileUrl(a.filename), '_blank');
      thumb.appendChild(img);
    } else {
      const icon = el('div', 'att-icon', fileIcon(a.original_name));
      thumb.appendChild(icon);
    }

    const nm = el('div', 'att-name');
    nm.textContent = a.original_name.length > 16
      ? a.original_name.slice(0, 13) + '…'
      : a.original_name;
    nm.title = a.original_name;

    const dl = el('a', 'btn btn-ghost btn-xs att-dl');
    dl.href = `api.php?type=file&name=${encodeURIComponent(a.filename)}`;
    dl.download = a.original_name;
    dl.textContent = '↓';
    dl.title = 'Download';

    thumb.appendChild(nm);
    thumb.appendChild(dl);
    wrap.appendChild(thumb);
  });
  return wrap;
}

/**
 * Render pending (local, not yet uploaded) files as thumbnails.
 */
function renderPendingThumb(file, store, previewEl) {
  const thumb = el('div', 'att-thumb');

  const rm = el('button', 'att-remove', '✕');
  rm.title = 'Remove';
  rm.onclick = (e) => {
    e.stopPropagation();
    const idx = store.indexOf(file);
    if (idx !== -1) store.splice(idx, 1);
    thumb.remove();
  };
  thumb.appendChild(rm);

  if (file.type.startsWith('image/')) {
    const img = el('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.title = file.name;
    img.onclick = () => window.open(img.src, '_blank');
    thumb.appendChild(img);
  } else {
    thumb.appendChild(el('div', 'att-icon', fileIcon(file.name)));
  }

  const nm = el('div', 'att-name');
  nm.textContent = file.name.length > 16 ? file.name.slice(0, 13) + '…' : file.name;
  nm.title = file.name;
  thumb.appendChild(nm);

  previewEl.appendChild(thumb);
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', txt: '📝', log: '📋', csv: '📊',
    docx: '📝', xlsx: '📊', png: '🖼', jpg: '🖼',
    jpeg: '🖼', gif: '🖼'
  };
  return map[ext] || '📎';
}

/**
 * Validate a file against allowed types and size.
 * Returns null if OK, error string if not.
 */
function validateFile(file) {
  const name = file.name || '';
  const ext  = name.split('.').pop().toLowerCase();

  // For clipboard pastes the name might be 'image.png' but ext check still works
  // For blobs with no name we derive ext from MIME
  const effectiveExt = ALLOWED_EXT.includes(ext)
    ? ext
    : MIME_TO_EXT[file.type] || '';

  if (!effectiveExt) return `${name || file.type}: type not allowed`;
  if (file.size > MAX_BYTES) return `${name}: too large (max 20 MB)`;
  return null;
}

/**
 * Normalise a file that may have come from clipboard (no proper name/ext).
 * Returns a new File with a proper name if needed.
 */
function normaliseFile(file) {
  const name = file.name || '';
  const ext  = name.split('.').pop().toLowerCase();
  if (name && ALLOWED_EXT.includes(ext)) return file;

  // Derive extension from MIME type
  const derivedExt = MIME_TO_EXT[file.type];
  if (!derivedExt) return file; // will be rejected by validator

  const safeName = `clipboard_${Date.now()}.${derivedExt}`;
  return new File([file], safeName, { type: file.type });
}

/**
 * Core file handler — validate, normalise, preview, push to store.
 */
function handleFiles(rawFiles, store, previewEl) {
  [...rawFiles].forEach(raw => {
    const file = normaliseFile(raw);
    const err  = validateFile(file);
    if (err) { toast(err, 'error'); return; }
    store.push(file);
    renderPendingThumb(file, store, previewEl);
  });
}

/**
 * Setup a full upload zone:
 * - click to browse
 * - drag & drop
 * - clipboard paste (anywhere on page while modal open)
 *
 * Returns a cleanup function to remove the paste listener.
 */
export function setupUploadZone(zoneId, inputId, previewId, store) {
  const zone    = document.getElementById(zoneId);
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);

  if (!zone || !input || !preview) {
    console.warn(`setupUploadZone: missing element(s) for zone=${zoneId}`);
    return () => {};
  }

  // Click to browse
  zone.onclick = () => input.click();

  // File input change
  input.onchange = e => {
    handleFiles(e.target.files, store, preview);
    input.value = ''; // reset so same file can be re-selected
  };

  // Drag & drop
  zone.ondragover  = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); };
  zone.ondrop      = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files, store, preview);
  };

  // Clipboard paste — listen on document, active while modal is open
  function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images = [...items]
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (images.length) {
      e.preventDefault();
      handleFiles(images, store, preview);
      toast(`${images.length} image(s) pasted from clipboard`, 'info', 2000);
    }
  }

  document.addEventListener('paste', onPaste);

  // Return cleanup — call when modal closes
  return function cleanup() {
    document.removeEventListener('paste', onPaste);
    zone.ondragover  = null;
    zone.ondragleave = null;
    zone.ondrop      = null;
    zone.onclick     = null;
    input.onchange   = null;
  };
}

export { uploadFiles, handleFiles };
js/dashboard.js
'use strict';

import { api }             from './api.js';
import { el, esc, fmtDate, toast } from './utils.js';
import { localLoad, localSave }    from './storage.js';

const WIDGET_KEYS = ['open','critical','overdue','resolved_week','time','pinned','recent_kb','categories','recent'];

export async function loadDashboard() {
  let data;
  try { data = await api({ type: 'dashboard' }); }
  catch (e) { toast('Dashboard load failed: ' + e.message, 'error'); return; }

  const order = localLoad('dash_order', WIDGET_KEYS);
  const grid  = document.getElementById('dashboard-grid');
  grid.innerHTML = '';

  const builders = {
    open:          () => makeStatWidget('Open Issues',   data.open_count,
                          data.open_count > 0 ? 'accent' : 'green', 'non-closed tickets'),
    critical:      () => makeStatWidget('Critical',      data.critical,
                          data.critical > 0 ? 'red' : 'green', 'open critical priority'),
    overdue:       () => makeStatWidget('Overdue',       data.overdue,
                          data.overdue > 0 ? 'orange' : 'green', 'past due date'),
    resolved_week: () => makeStatWidget('Resolved / 7d', data.resolved_week,
                          'green', 'closed this week'),
    time:          () => makeStatWidget('Total Hours',   parseFloat(data.total_time || 0).toFixed(1),
                          'accent', 'logged across all issues'),
    pinned:        () => makeListWidget('⭐ Pinned Scripts',
                          (data.pinned || []).map(s =>
                            `<code class="widget-code">${esc(s.title)}</code>`)),
    recent_kb:     () => makeListWidget('📚 Recent KB',
                          (data.recent_kb || []).map(k => esc(k.title))),
    categories:    () => makeCatWidget(data.categories || []),
    recent:        () => makeRecentWidget(data.recent_items || []),
  };

  // Render in saved order, skip unknown keys
  const rendered = new Set();
  order.forEach(key => {
    if (!builders[key] || rendered.has(key)) return;
    const w = builders[key]();
    w.dataset.widget = key;
    grid.appendChild(w);
    rendered.add(key);
  });
  // Render any new widgets not in saved order
  WIDGET_KEYS.forEach(key => {
    if (!rendered.has(key) && builders[key]) {
      const w = builders[key]();
      w.dataset.widget = key;
      grid.appendChild(w);
    }
  });

  initDashDrag(grid);
}

function makeStatWidget(title, value, color, sub) {
  const w = el('div', 'widget');
  w.innerHTML = `
    <div class="widget-title">${esc(title)}</div>
    <div class="widget-value ${esc(color)}">${esc(String(value))}</div>
    <div class="widget-sub">${esc(sub)}</div>`;
  return w;
}

function makeListWidget(title, items) {
  const w = el('div', 'widget');
  const rows = items.length
    ? items.map(i => `<li>${i}</li>`).join('')
    : '<li class="empty-row">None</li>';
  w.innerHTML = `<div class="widget-title">${esc(title)}</div><ul class="widget-list">${rows}</ul>`;
  return w;
}

function makeCatWidget(cats) {
  const w  = el('div', 'widget widget-full');
  const max = Math.max(...cats.map(c => c.cnt), 1);
  const bars = cats.map(c => `
    <div class="cat-row">
      <div class="cat-label" title="${esc(c.category)}">${esc(c.category || 'Other')}</div>
      <div class="cat-track"><div class="cat-fill" style="width:${Math.round(c.cnt / max * 100)}%"></div></div>
      <div class="cat-count">${c.cnt}</div>
    </div>`).join('');
  w.innerHTML = `
    <div class="widget-title">📊 Top Categories</div>
    ${bars || '<span class="empty-row">No data yet</span>'}`;
  return w;
}

function makeRecentWidget(items) {
  const w = el('div', 'widget widget-full');
  const rows = items.map(i => `
    <li>
      <span class="recent-type">${esc(i.type.toUpperCase())}</span>
      ${esc(i.title || i.ref || '')}
      <span class="recent-time">${fmtDate(i.updated_at)}</span>
    </li>`).join('');
  w.innerHTML = `
    <div class="widget-title">🕒 Recently Updated</div>
    <ul class="widget-list">${rows || '<li class="empty-row">Nothing yet</li>'}</ul>`;
  return w;
}

function initDashDrag(grid) {
  let dragging = null;

  grid.querySelectorAll('.widget').forEach(w => {
    w.draggable = true;
    w.addEventListener('dragstart', () => { dragging = w; w.classList.add('dragging'); });
    w.addEventListener('dragend',   () => { w.classList.remove('dragging'); dragging = null; saveDashOrder(); });
    w.addEventListener('dragover',  e => { e.preventDefault(); w.classList.add('drag-over'); });
    w.addEventListener('dragleave', e => { if (!w.contains(e.relatedTarget)) w.classList.remove('drag-over'); });
    w.addEventListener('drop', e => {
      e.preventDefault();
      w.classList.remove('drag-over');
      if (dragging && dragging !== w) grid.insertBefore(dragging, w);
    });
  });
}

function saveDashOrder() {
  const order = [...document.querySelectorAll('.widget')]
    .map(w => w.dataset.widget)
    .filter(Boolean);
  localSave('dash_order', order);
}
js/issues.js
'use strict';

import { api, uploadFiles, fileUrl } from './api.js';
import { $, el, esc, fmtDate, fmtDateOnly, isOverdue, statusClass, prioClass, copyText, toast, nowLocalISO, sanitiseFTS } from './utils.js';
import { localSave, localLoad } from './storage.js';
import { setupUploadZone, renderSavedAttachments } from './upload.js';
import { openKBForm } from './kb.js';

let issueOffset   = 0;
let issueTotal    = 0;
let issueFilter   = 'all';
let issueCatFilter = '';
let editingIssueId = null;

// Pending files: one shared array, cleared in-place (splice/length=0) to preserve closure refs
const pendingIssueFiles = [];
let cleanupUploadZone   = () => {};

// ── LOAD / RENDER ──────────────────────────────────────────

export async function loadIssues(reset = false) {
  if (reset) { issueOffset = 0; issueTotal = 0; }

  const rawQ  = document.getElementById('search-global').value.trim();
  const q     = sanitiseFTS(rawQ);
  const params = { type: 'issue', filter: issueFilter, limit: 50, offset: issueOffset };
  if (issueCatFilter) params.category = issueCatFilter;
  if (q) params.q = q;

  let data;
  try { data = await api(params); }
  catch (e) { toast('Failed to load issues: ' + e.message, 'error'); return; }

  issueTotal = data.total || 0;
  const list = $('issue-list');

  if (reset) list.innerHTML = '';

  if (!data.items?.length && issueOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>No issues found</div>';
  } else {
    (data.items || []).forEach(i => list.appendChild(renderIssueCard(i)));
  }

  issueOffset += (data.items || []).length;
  $('issue-load-more').style.display = issueOffset < issueTotal ? 'block' : 'none';
}

function renderIssueCard(issue) {
  const over = isOverdue(issue);
  const tags = (issue.tags || '').split(',').filter(Boolean)
    .map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');

  const card = el('div', 'card');
  card.dataset.id = issue.id;
  card.innerHTML = `
    <div class="card-header">
      <span class="ticket-id">${esc(issue.ticket_id || '')}</span>
      ${over ? '<span class="overdue-mark" title="Overdue"> ⚠ OVERDUE</span>' : ''}
      <span class="${statusClass(issue.status)}" style="margin-left:auto">${esc(issue.status)}</span>
      <span class="${prioClass(issue.priority)}">${esc(issue.priority)}</span>
    </div>
    <div class="card-header" style="margin-bottom:4px">
      <div class="card-title expand-toggle" style="cursor:pointer">${esc(issue.title)}</div>
    </div>
    <div class="card-meta">
      <span class="badge badge-cat">${esc(issue.category)}</span>
      ${issue.reporter    ? `<span>👤 ${esc(issue.reporter)}</span>`    : ''}
      ${issue.assigned_to ? `<span>🔧 ${esc(issue.assigned_to)}</span>` : ''}
      ${issue.asset       ? `<span>💻 ${esc(issue.asset)}</span>`       : ''}
      ${issue.time_spent  ? `<span>⏱ ${issue.time_spent}h</span>`      : ''}
      ${issue.due_date    ? `<span>📅 ${fmtDateOnly(issue.due_date)}</span>` : ''}
      <span class="card-date">${fmtDate(issue.created_at)}</span>
    </div>
    ${tags ? `<div class="tag-row">${tags}</div>` : ''}
    <div class="card-body">
      ${issue.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(issue.description)}</div></div>` : ''}
      ${issue.resolution  ? `<div class="detail-section"><div class="detail-label">Resolution</div><div class="detail-val">${esc(issue.resolution)}</div></div>`  : ''}
      <div id="inline-atts-${issue.id}" class="upload-previews"></div>
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="view">View</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-ghost btn-xs" data-action="toggle">${['Resolved','Closed'].includes(issue.status) ? 'Reopen' : 'Resolve'}</button>
      <button class="btn btn-ghost btn-xs" data-action="copy">Copy</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;

  card.querySelector('.expand-toggle').onclick = () => {
    card.classList.toggle('expanded');
    if (card.classList.contains('expanded') && (issue.attachments || []).length) {
      const attWrap = card.querySelector(`#inline-atts-${issue.id}`);
      if (!attWrap.hasChildNodes()) {
        attWrap.appendChild(renderSavedAttachments(issue.attachments));
      }
    }
  };

  card.querySelector('[data-action="view"]').onclick   = () => openIssueDetail(issue.id);
  card.querySelector('[data-action="edit"]').onclick   = () => openIssueForm(issue);
  card.querySelector('[data-action="toggle"]').onclick = () => toggleIssueStatus(issue, card);
  card.querySelector('[data-action="copy"]').onclick   = () => copyIssueSummary(issue);
  card.querySelector('[data-action="delete"]').onclick = () => deleteIssue(issue.id, card);

  return card;
}

// ── DETAIL VIEW ────────────────────────────────────────────

async function openIssueDetail(id) {
  let data;
  try { data = await api({ type: 'issue', id }); }
  catch (e) { toast('Failed to load issue: ' + e.message, 'error'); return; }

  $('detail-ticket-id').textContent = data.ticket_id || '';
  $('detail-status-badge').innerHTML = `<span class="${statusClass(data.status)}">${esc(data.status)}</span>`;
  $('detail-prio-badge').innerHTML   = `<span class="${prioClass(data.priority)}">${esc(data.priority)}</span>`;

  $('btn-detail-edit').onclick  = () => { closeModal('issue-detail-modal'); openIssueForm(data); };
  $('btn-detail-copy').onclick  = () => copyIssueSummary(data);
  $('btn-detail-print').onclick = () => window.print();

  const tl = (data.activity || []).map(a => `
    <div class="timeline-item">
      <span class="tl-action">${esc(a.action)}</span>
      ${a.detail ? ' — ' + esc(a.detail) : ''}
      <span class="tl-time">${fmtDate(a.created_at)}</span>
    </div>`).join('');

  const attWrap = el('div');
  attWrap.appendChild(renderSavedAttachments(data.attachments || []));

  $('issue-detail-body').innerHTML = `
    <div class="form-grid detail-grid">
      <div><div class="detail-label">Category</div><div class="detail-val">${esc(data.category)}</div></div>
      <div><div class="detail-label">Channel</div><div class="detail-val">${esc(data.channel)}</div></div>
      <div><div class="detail-label">Reporter</div><div class="detail-val">${esc(data.reporter) || '—'}</div></div>
      <div><div class="detail-label">Assigned To</div><div class="detail-val">${esc(data.assigned_to) || '—'}</div></div>
      <div><div class="detail-label">Team</div><div class="detail-val">${esc(data.team) || '—'}</div></div>
      <div><div class="detail-label">Asset</div><div class="detail-val">${esc(data.asset) || '—'}</div></div>
      <div><div class="detail-label">Time Spent</div><div class="detail-val">${data.time_spent || 0}h</div></div>
      <div><div class="detail-label">Due Date</div><div class="detail-val">${fmtDateOnly(data.due_date)}</div></div>
      <div><div class="detail-label">Resolution Type</div><div class="detail-val">${esc(data.resolution_type) || '—'}</div></div>
      <div><div class="detail-label">Created</div><div class="detail-val">${fmtDate(data.created_at)}</div></div>
    </div>
    ${data.description ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(data.description)}</div></div>` : ''}
    ${data.resolution  ? `<div class="detail-section"><div class="detail-label">Resolution</div><div class="detail-val">${esc(data.resolution)}</div></div>` : ''}
    ${data.root_cause  ? `<div class="detail-section"><div class="detail-label">Root Cause</div><div class="detail-val">${esc(data.root_cause)}</div></div>`  : ''}
    <div id="detail-atts-wrap"></div>
    ${tl ? `<div class="divider"></div><div class="form-section-title">Activity Timeline</div><div class="timeline">${tl}</div>` : ''}`;

  if ((data.attachments || []).length) {
    $('detail-atts-wrap').appendChild(
      (() => {
        const s = el('div');
        s.innerHTML = '<div class="detail-label" style="margin-bottom:6px">Attachments</div>';
        s.appendChild(renderSavedAttachments(data.attachments));
        return s;
      })()
    );
  }

  openModal('issue-detail-modal');
}

function copyIssueSummary(i) {
  const lines = [
    `Ticket:   ${i.ticket_id}`,
    `Title:    ${i.title}`,
    `Status:   ${i.status}`,
    `Priority: ${i.priority}`,
    `Category: ${i.category}`,
    `Reporter: ${i.reporter || '—'}`,
    `Assigned: ${i.assigned_to || '—'}`,
    i.asset       ? `Asset:    ${i.asset}` : '',
    i.time_spent  ? `Time:     ${i.time_spent}h` : '',
    '',
    i.description ? `Description:\n${i.description}` : '',
    i.resolution  ? `\nResolution:\n${i.resolution}` : '',
    i.root_cause  ? `\nRoot Cause:\n${i.root_cause}` : '',
  ].filter(l => l !== undefined && l !== null);
  copyText(lines.filter(Boolean).join('\n'));
}

// ── STATUS TOGGLE ──────────────────────────────────────────

async function toggleIssueStatus(issue, card) {
  const newStatus = ['Resolved', 'Closed'].includes(issue.status) ? 'Reopened' : 'Resolved';
  try {
    await api({ type: 'issue', id: issue.id }, 'PUT', { ...issue, status: newStatus });
    toast(`Issue ${newStatus.toLowerCase()}`, 'success');
    loadIssues(true);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

// ── DELETE ─────────────────────────────────────────────────

async function deleteIssue(id, card) {
  const ok = await confirmDialog('Soft-delete this issue? It will be hidden but not permanently removed.');
  if (!ok) return;
  try {
    await api({ type: 'issue', id }, 'DELETE');
    card.style.transition = 'opacity .2s';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 200);
    toast('Issue deleted', 'success');
  } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
}

// ── FORM ───────────────────────────────────────────────────

export function openIssueForm(issue = null) {
  editingIssueId = issue ? issue.id : null;

  // Clear pending files IN-PLACE to preserve closure reference
  pendingIssueFiles.length = 0;

  // Cleanup previous paste listener, setup new one
  cleanupUploadZone();
  cleanupUploadZone = setupUploadZone(
    'issue-upload-zone', 'issue-file-input', 'issue-att-preview', pendingIssueFiles
  );

  $('issue-modal-title').textContent  = issue ? `Edit: ${issue.ticket_id}` : 'New Issue';
  $('btn-issue-kb').style.display     = issue ? 'inline-flex' : 'none';
  $('dup-warning').classList.remove('visible');

  const def = issue || localLoad('issue_defaults', {});

  const fields = {
    'f-title':      issue?.title              || '',
    'f-desc':       issue?.description        || '',
    'f-resolution': issue?.resolution         || '',
    'f-rootcause':  issue?.root_cause         || '',
    'f-restype':    issue?.resolution_type    || def.resolution_type    || 'Unknown',
    'f-category':   issue?.category           || def.category           || 'Other',
    'f-priority':   issue?.priority           || def.priority           || 'Medium',
    'f-status':     issue?.status             || def.status             || 'New',
    'f-channel':    issue?.channel            || def.channel            || 'Email',
    'f-reporter':   issue?.reporter           || def.reporter           || '',
    'f-assigned':   issue?.assigned_to        || def.assigned_to        || '',
    'f-team':       issue?.team               || def.team               || '',
    'f-owner':      issue?.owner              || def.owner              || '',
    'f-asset':      issue?.asset              || '',
    'f-tags':       issue?.tags               || '',
    'f-time':       issue?.time_spent         || '',
    'f-due':        issue?.due_date           || '',
    'f-relevent':   issue?.related_event      || '',
    'f-created':    issue?.created_at
      ? issue.created_at.replace(' ', 'T').slice(0, 16)
      : nowLocalISO(),
  };
  Object.entries(fields).forEach(([id, val]) => { if ($(id)) $(id).value = val; });

  // Render existing attachments with remove buttons
  const prev = $('issue-att-preview');
  prev.innerHTML = '';
  if (issue?.attachments?.length) {
    prev.appendChild(renderSavedAttachments(issue.attachments, async (att, thumb) => {
      try {
        await api({ type: 'attachment', id: att.id }, 'DELETE');
        thumb.style.opacity = '0';
        setTimeout(() => thumb.remove(), 150);
      } catch (e) { toast('Remove failed', 'error'); }
    }));
  }

  openModal('issue-modal');
}

// ── DUPLICATE DETECTION ────────────────────────────────────

let _dupTimer;
export function initDupDetection() {
  $('f-title').addEventListener('input', () => {
    clearTimeout(_dupTimer);
    const v = $('f-title').value.trim();
    if (v.length < 4) { $('dup-warning').classList.remove('visible'); return; }
    _dupTimer = setTimeout(async () => {
      try {
        const data = await api({ type: 'duplicate_check', title: v });
        const dups = (data.duplicates || []).filter(d => d.id !== editingIssueId);
        if (dups.length) {
          $('dup-list').innerHTML = dups
            .map(d => `<strong>${esc(d.ticket_id)}</strong>: ${esc(d.title)} [${esc(d.status)}]`)
            .join(' | ');
          $('dup-warning').classList.add('visible');
        } else {
          $('dup-warning').classList.remove('visible');
        }
      } catch (e) {}
    }, 450);
  });
}

// ── TEMPLATES ──────────────────────────────────────────────

const TEMPLATES = {
  outlook: {
    title: 'Outlook not opening / crashing', category: 'Software', priority: 'Medium',
    tags: 'outlook,office365',
    description: 'User reports Outlook not starting or crashing on launch.\n\nSteps:\n1. Launch Outlook\n2. Application crashes or hangs\n\nOffice version:\nOS:',
  },
  vpn: {
    title: 'VPN connection failure', category: 'Network', priority: 'High',
    tags: 'vpn,network,remote',
    description: 'User unable to connect to VPN.\n\nError message:\nOS:\nLast working:',
  },
  printer: {
    title: 'Printer not printing / offline', category: 'Printer', priority: 'Low',
    tags: 'printer,printing',
    description: 'Printer shows as offline or jobs stuck in queue.\n\nPrinter model:\nLocation:\nDriver version:',
  },
  accountlock: {
    title: 'Account locked out', category: 'Account', priority: 'High',
    tags: 'ad,account,lockout',
    description: 'User account locked after failed login attempts.\n\nUsername:\nLast known location:',
    resolution: 'Unlocked via AD. User reset password.',
  },
  intune: {
    title: 'Intune device enrollment failure', category: 'Software', priority: 'Medium',
    tags: 'intune,mdm,enrollment',
    description: 'Device fails to enroll in Intune MDM.\n\nDevice:\nOS version:\nError code:',
  },
  network: {
    title: 'No network / internet connectivity', category: 'Network', priority: 'High',
    tags: 'network,connectivity,lan',
    description: 'User has no network access.\n\nLocation:\nDevice:\nSwitch port:\nLast working:',
  },
};

export function initTemplates() {
  document.querySelectorAll('.tpl-btn').forEach(btn => {
    btn.onclick = () => {
      const t = TEMPLATES[btn.dataset.tpl];
      if (!t) return;
      $('f-title').value       = t.title       || '';
      $('f-category').value    = t.category    || 'Other';
      $('f-priority').value    = t.priority    || 'Medium';
      $('f-desc').value        = t.description || '';
      $('f-resolution').value  = t.resolution  || '';
      $('f-tags').value        = t.tags        || '';
    };
  });
}

// ── SAVE ───────────────────────────────────────────────────

export function initIssueSave() {
  $('btn-issue-save').onclick = async () => {
    const title = $('f-title').value.trim();
    if (!title) { toast('Title is required', 'error'); return; }

    const payload = buildPayload();
    localSave('issue_defaults', {
      category: payload.category, priority: payload.priority,
      status: payload.status, channel: payload.channel,
      reporter: payload.reporter, assigned_to: payload.assigned_to,
      team: payload.team, owner: payload.owner,
    });

    try {
      let result;
      if (editingIssueId) result = await api({ type: 'issue', id: editingIssueId }, 'PUT', payload);
      else                result = await api({ type: 'issue' }, 'POST', payload);

      if (pendingIssueFiles.length) {
        const uploaded = await uploadFiles(pendingIssueFiles, 'issue', result.id);
        if (!uploaded.length && pendingIssueFiles.length) {
          toast('Some files failed to upload — check types/sizes', 'error');
        }
      }
      closeModal('issue-modal');
      cleanupUploadZone();
      toast(editingIssueId ? 'Issue updated' : 'Issue created', 'success');
      loadIssues(true);
    } catch (e) { toast('Save failed: ' + e.message, 'error'); }
  };

  // Resolve & Save to KB — capture field values BEFORE save closes the form
  $('btn-issue-kb').onclick = async () => {
    const resolution = $('f-resolution').value.trim();
    if (!resolution) { toast('Add a resolution first', 'error'); return; }

    // Capture NOW before modal closes
    const capturedTitle    = $('f-title').value;
    const capturedDesc     = $('f-desc').value;
    const capturedTags     = $('f-tags').value;
    const capturedIssueId  = editingIssueId;

    // Save the issue first
    await $('btn-issue-save').click();

    // Then open KB form with captured values
    setTimeout(() => {
      openKBForm(null, {
        title:           capturedTitle,
        symptoms:        capturedDesc,
        fix:             resolution,
        tags:            capturedTags,
        source_issue_id: capturedIssueId,
      });
    }, 350);
  };
}

function buildPayload() {
  return {
    title:           $('f-title').value.trim(),
    description:     $('f-desc').value,
    resolution:      $('f-resolution').value,
    root_cause:      $('f-rootcause').value,
    resolution_type: $('f-restype').value,
    category:        $('f-category').value,
    priority:        $('f-priority').value,
    status:          $('f-status').value,
    channel:         $('f-channel').value,
    reporter:        $('f-reporter').value,
    assigned_to:     $('f-assigned').value,
    team:            $('f-team').value,
    owner:           $('f-owner').value,
    asset:           $('f-asset').value,
    tags:            $('f-tags').value,
    time_spent:      $('f-time').value || 0,
    due_date:        $('f-due').value  || null,
    related_event:   $('f-relevent').value || null,
    created_at:      $('f-created').value
      ? $('f-created').value.replace('T', ' ')
      : null,
  };
}

// ── QUICK ENTRY ────────────────────────────────────────────

export function initQuickIssue() {
  $('btn-quick-issue').onclick = () => $('quick-issue-strip').classList.toggle('open');
  $('btn-qi-cancel').onclick   = () => $('quick-issue-strip').classList.remove('open');
  $('btn-qi-save').onclick     = async () => {
    const title = $('qi-title').value.trim();
    if (!title) { toast('Title required', 'error'); return; }
    try {
      await api({ type: 'issue' }, 'POST', {
        title,
        category: $('qi-category').value,
        reporter: $('qi-reporter').value,
        status:   $('qi-status').value,
        priority: $('qi-priority').value,
      });
      $('qi-title').value = '';
      $('quick-issue-strip').classList.remove('open');
      toast('Issue created', 'success');
      loadIssues(true);
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };
}

// ── FILTERS ────────────────────────────────────────────────

export function initIssueFilters() {
  document.querySelectorAll('#issue-filters .filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#issue-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      issueFilter = btn.dataset.filter;
      loadIssues(true);
    };
  });
  $('issue-cat-filter').onchange = e => { issueCatFilter = e.target.value; loadIssues(true); };
  $('btn-new-issue').onclick     = () => openIssueForm();
  $('btn-issue-more').onclick    = () => loadIssues(false);
}

// ── MODAL CLOSE ────────────────────────────────────────────

export function initIssueModalClose() {
  ['issue-modal-close', 'btn-issue-cancel'].forEach(id => {
    $(id).onclick = () => { closeModal('issue-modal'); cleanupUploadZone(); };
  });
  $('issue-detail-close').onclick = () => closeModal('issue-detail-modal');
}
js/events.js
'use strict';

import { api, uploadFiles } from './api.js';
import { $, el, esc, fmtDate, prioClass, toast, sanitiseFTS } from './utils.js';
import { localSave, localLoad } from './storage.js';
import { setupUploadZone, renderSavedAttachments } from './upload.js';

let eventOffset    = 0;
let editingEventId = null;
const pendingEventFiles = [];
let cleanupEventUpload  = () => {};

export async function loadEvents(reset = false) {
  if (reset) eventOffset = 0;
  const rawQ = document.getElementById('search-global').value.trim();
  const q    = sanitiseFTS(rawQ);
  const params = { type: 'event', limit: 50, offset: eventOffset };
  if (q) params.q = q;

  let data;
  try { data = await api(params); }
  catch (e) { toast('Failed to load events: ' + e.message, 'error'); return; }

  const list = $('event-list');
  if (reset) list.innerHTML = '';

  if (!data.items?.length && eventOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div>No events found</div>';
  } else {
    (data.items || []).forEach(ev => list.appendChild(renderEventCard(ev)));
  }

  eventOffset += (data.items || []).length;
  $('event-load-more').style.display = (data.items || []).length === 50 ? 'block' : 'none';
}

function renderEventCard(ev) {
  const tags = (ev.tags || '').split(',').filter(Boolean)
    .map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const card = el('div', 'card');
  card.innerHTML = `
    <div class="card-header">
      <span class="badge badge-cat">${esc(ev.event_type)}</span>
      <span class="badge badge-os">${esc(ev.location)}</span>
      <span class="${prioClass(ev.priority)}" style="margin-left:auto">${esc(ev.priority)}</span>
    </div>
    <div class="card-header" style="margin-bottom:4px">
      <div class="card-title expand-toggle" style="cursor:pointer">${esc(ev.subject)}</div>
    </div>
    <div class="card-meta">
      ${ev.event_date ? `<span>📅 ${fmtDate(ev.event_date)}</span>` : ''}
      ${ev.duration   ? `<span>⏱ ${ev.duration}min</span>` : ''}
      ${ev.reporter   ? `<span>👤 ${esc(ev.reporter)}</span>` : ''}
      ${ev.attendees  ? `<span>👥 ${esc(ev.attendees)}</span>` : ''}
      <span class="card-date">${fmtDate(ev.created_at)}</span>
    </div>
    ${tags ? `<div class="tag-row">${tags}</div>` : ''}
    <div class="card-body">
      ${ev.description  ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(ev.description)}</div></div>` : ''}
      ${ev.outcome      ? `<div class="detail-section"><div class="detail-label">Outcome</div><div class="detail-val">${esc(ev.outcome)}</div></div>` : ''}
      ${ev.action_items ? `<div class="detail-section"><div class="detail-label">Action Items</div><div class="detail-val">${esc(ev.action_items)}</div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="expand">Details</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;

  card.querySelector('.expand-toggle').onclick          = () => card.classList.toggle('expanded');
  card.querySelector('[data-action="expand"]').onclick  = () => card.classList.toggle('expanded');
  card.querySelector('[data-action="edit"]').onclick    = () => openEventForm(ev);
  card.querySelector('[data-action="delete"]').onclick  = () => deleteEvent(ev.id, card);
  return card;
}

export function openEventForm(ev = null) {
  editingEventId = ev ? ev.id : null;
  pendingEventFiles.length = 0;
  cleanupEventUpload();
  cleanupEventUpload = setupUploadZone(
    'event-upload-zone', 'event-file-input', 'event-att-preview', pendingEventFiles
  );

  $('event-modal-title').textContent = ev ? 'Edit Event' : 'New Event';
  const def = ev || localLoad('event_defaults', {});

  const fields = {
    'ef-subject':     ev?.subject       || '',
    'ef-type':        ev?.event_type    || def.event_type || 'Meeting',
    'ef-location':    ev?.location      || def.location   || 'Teams',
    'ef-date':        ev?.event_date    ? ev.event_date.replace(' ','T').slice(0,16) : '',
    'ef-duration':    ev?.duration      || '',
    'ef-priority':    ev?.priority      || def.priority   || 'Medium',
    'ef-category':    ev?.category      || '',
    'ef-reporter':    ev?.reporter      || def.reporter   || '',
    'ef-attendees':   ev?.attendees     || '',
    'ef-description': ev?.description   || '',
    'ef-outcome':     ev?.outcome       || '',
    'ef-actions':     ev?.action_items  || '',
    'ef-followup':    ev?.followup_date || '',
    'ef-related':     ev?.related_issues|| '',
    'ef-tags':        ev?.tags          || '',
  };
  Object.entries(fields).forEach(([id, val]) => { if ($(id)) $(id).value = val; });

  const prev = $('event-att-preview');
  prev.innerHTML = '';
  if (ev?.attachments?.length) {
    prev.appendChild(renderSavedAttachments(ev.attachments, async (att, thumb) => {
      try {
        await api({ type: 'attachment', id: att.id }, 'DELETE');
        thumb.remove();
      } catch (e) { toast('Remove failed', 'error'); }
    }));
  }
  openModal('event-modal');
}

async function deleteEvent(id, card) {
  const ok = await confirmDialog('Soft-delete this event?');
  if (!ok) return;
  try {
    await api({ type: 'event', id }, 'DELETE');
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 200);
    toast('Event deleted', 'success');
  } catch (e) { toast('Delete failed', 'error'); }
}

export function initEventSave() {
  $('btn-event-save').onclick = async () => {
    const subject = $('ef-subject').value.trim();
    if (!subject) { toast('Subject required', 'error'); return; }

    const payload = {
      subject, event_type: $('ef-type').value, location: $('ef-location').value,
      event_date:   $('ef-date').value ? $('ef-date').value.replace('T',' ') : null,
      duration:     $('ef-duration').value || null,
      priority:     $('ef-priority').value,
      category:     $('ef-category').value,
      reporter:     $('ef-reporter').value,
      attendees:    $('ef-attendees').value,
      description:  $('ef-description').value,
      outcome:      $('ef-outcome').value,
      action_items: $('ef-actions').value,
      followup_date:$('ef-followup').value || null,
      related_issues:$('ef-related').value,
      tags:         $('ef-tags').value,
    };
    localSave('event_defaults', {
      event_type: payload.event_type, location: payload.location,
      priority: payload.priority, reporter: payload.reporter,
    });
    try {
      let result;
      if (editingEventId) result = await api({ type: 'event', id: editingEventId }, 'PUT', payload);
      else                result = await api({ type: 'event' }, 'POST', payload);
      if (pendingEventFiles.length) await uploadFiles(pendingEventFiles, 'event', result.id);
      closeModal('event-modal');
      cleanupEventUpload();
      toast(editingEventId ? 'Event updated' : 'Event created', 'success');
      loadEvents(true);
    } catch (e) { toast('Save failed: ' + e.message, 'error'); }
  };
}

export function initEventControls() {
  $('btn-new-event').onclick  = () => openEventForm();
  $('btn-event-more').onclick = () => loadEvents(false);
  $('btn-quick-event').onclick = () => $('quick-event-strip').classList.toggle('open');
  $('btn-qe-cancel').onclick   = () => $('quick-event-strip').classList.remove('open');
  $('btn-qe-save').onclick     = async () => {
    const subject = $('qe-subject').value.trim();
    if (!subject) { toast('Subject required', 'error'); return; }
    try {
      await api({ type: 'event' }, 'POST', {
        subject, event_type: $('qe-type').value,
        event_date: $('qe-date').value ? $('qe-date').value.replace('T',' ') : null,
      });
      $('qe-subject').value = '';
      $('quick-event-strip').classList.remove('open');
      toast('Event created', 'success');
      loadEvents(true);
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };
  ['event-modal-close','btn-event-cancel'].forEach(id => {
    $(id).onclick = () => { closeModal('event-modal'); cleanupEventUpload(); };
  });
}
js/scripts.js
'use strict';

import { api } from './api.js';
import { $, el, esc, fmtDate, toast, sanitiseFTS } from './utils.js';
import { localSave, localLoad } from './storage.js';

let scriptOffset   = 0;
let scriptFilter   = 'all';
let editingScriptId = null;

export async function loadScripts(reset = false) {
  if (reset) scriptOffset = 0;
  const rawQ = document.getElementById('search-global').value.trim();
  const q    = sanitiseFTS(rawQ);
  const params = { type: 'script', limit: 50, offset: scriptOffset };
  if (scriptFilter === 'pinned') params.pinned = '1';
  if (q) params.q = q;

  let data;
  try { data = await api(params); }
  catch (e) { toast('Failed to load scripts: ' + e.message, 'error'); return; }

  const list = $('script-list');
  if (reset) list.innerHTML = '';

  if (!data.items?.length && scriptOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⌨️</div>No scripts found</div>';
  } else {
    (data.items || []).forEach(s => list.appendChild(renderScriptCard(s)));
  }
  scriptOffset += (data.items || []).length;
  $('script-load-more').style.display = (data.items || []).length === 50 ? 'block' : 'none';
}

function renderScriptCard(s) {
  const tags = (s.tags || '').split(',').filter(Boolean)
    .map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const riskCls = { Safe:'safe', Admin:'admin', Destructive:'destructive' }[s.risk_level] || 'safe';

  const card = el('div', 'card');
  card.innerHTML = `
    <div class="card-header" style="margin-bottom:6px">
      <div class="card-title">${s.pinned ? '⭐ ' : ''}${esc(s.title)}</div>
      <span class="badge badge-os">${esc(s.os)}</span>
      <span class="badge badge-risk-${riskCls}">${esc(s.risk_level)}</span>
    </div>
    <div class="code-block" id="cmd-${s.id}"><button class="btn btn-ghost btn-xs copy-btn-code" data-action="copy-cmd">Copy</button>${esc(s.command)}</div>
    ${tags ? `<div class="tag-row" style="margin-top:6px">${tags}</div>` : ''}
    <div class="card-body" style="margin-top:8px">
      ${s.description   ? `<div class="detail-section"><div class="detail-label">Description</div><div class="detail-val">${esc(s.description)}</div></div>` : ''}
      ${s.notes         ? `<div class="detail-section"><div class="detail-label">⚠ Notes</div><div class="detail-val" style="color:var(--yellow)">${esc(s.notes)}</div></div>` : ''}
      ${s.example_output ? `<div class="detail-section"><div class="detail-label">Example Output</div><div class="code-block">${esc(s.example_output)}</div></div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="expand">Details</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-ghost btn-xs" data-action="pin">${s.pinned ? 'Unpin' : '⭐ Pin'}</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;

  card.querySelector('[data-action="expand"]').onclick   = () => card.classList.toggle('expanded');
  card.querySelector('[data-action="copy-cmd"]').onclick = () => {
    navigator.clipboard.writeText(s.command).then(() => toast('Command copied', 'success'));
  };
  card.querySelector('[data-action="edit"]').onclick  = () => openScriptForm(s);
  card.querySelector('[data-action="pin"]').onclick   = () => togglePin(s, card);
  card.querySelector('[data-action="delete"]').onclick = () => deleteScript(s.id, card);
  return card;
}

async function togglePin(s, card) {
  try {
    await api({ type: 'script', id: s.id }, 'PUT', { ...s, pinned: s.pinned ? 0 : 1 });
    toast(s.pinned ? 'Unpinned' : 'Pinned ⭐', 'success');
    loadScripts(true);
  } catch (e) { toast('Failed', 'error'); }
}

async function deleteScript(id, card) {
  const ok = await confirmDialog('Soft-delete this script?');
  if (!ok) return;
  try {
    await api({ type: 'script', id }, 'DELETE');
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 200);
    toast('Script deleted', 'success');
  } catch (e) { toast('Delete failed', 'error'); }
}

export function openScriptForm(s = null) {
  editingScriptId = s ? s.id : null;
  $('script-modal-title').textContent = s ? 'Edit Script' : 'New Script';
  const def = s || localLoad('script_defaults', {});
  const fields = {
    'sf-title':   s?.title          || '',
    'sf-command': s?.command        || '',
    'sf-desc':    s?.description    || '',
    'sf-os':      s?.os             || def.os || 'Windows',
    'sf-risk':    s?.risk_level     || 'Safe',
    'sf-category':s?.category       || '',
    'sf-tags':    s?.tags           || '',
    'sf-notes':   s?.notes          || '',
    'sf-output':  s?.example_output || '',
  };
  Object.entries(fields).forEach(([id, val]) => { if ($(id)) $(id).value = val; });
  $('sf-pinned').checked = !!(s?.pinned);
  openModal('script-modal');
}

export function initScriptSave() {
  $('btn-script-save').onclick = async () => {
    const title   = $('sf-title').value.trim();
    const command = $('sf-command').value.trim();
    if (!title || !command) { toast('Title and command required', 'error'); return; }
    const payload = {
      title, command,
      description:    $('sf-desc').value,
      os:             $('sf-os').value,
      risk_level:     $('sf-risk').value,
      category:       $('sf-category').value,
      tags:           $('sf-tags').value,
      notes:          $('sf-notes').value,
      example_output: $('sf-output').value,
      pinned:         $('sf-pinned').checked ? 1 : 0,
    };
    localSave('script_defaults', { os: payload.os });
    try {
      if (editingScriptId) await api({ type: 'script', id: editingScriptId }, 'PUT', payload);
      else                 await api({ type: 'script' }, 'POST', payload);
      closeModal('script-modal');
      toast(editingScriptId ? 'Script updated' : 'Script saved', 'success');
      loadScripts(true);
    } catch (e) { toast('Save failed: ' + e.message, 'error'); }
  };
}

export function initScriptControls() {
  document.querySelectorAll('[data-sfilter]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('[data-sfilter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scriptFilter = btn.dataset.sfilter;
      loadScripts(true);
    };
  });
  $('btn-new-script').onclick   = () => openScriptForm();
  $('btn-script-more').onclick  = () => loadScripts(false);
  $('btn-quick-script').onclick = () => $('quick-script-strip').classList.toggle('open');
  $('btn-qs-cancel').onclick    = () => $('quick-script-strip').classList.remove('open');
  $('btn-qs-save').onclick      = async () => {
    const title   = $('qs-title').value.trim();
    const command = $('qs-command').value.trim();
    if (!title || !command) { toast('Title and command required', 'error'); return; }
    try {
      await api({ type: 'script' }, 'POST', { title, command, tags: $('qs-tags').value });
      $('qs-title').value = ''; $('qs-command').value = ''; $('qs-tags').value = '';
      $('quick-script-strip').classList.remove('open');
      toast('Script saved', 'success');
      loadScripts(true);
    } catch (e) { toast('Failed', 'error'); }
  };
  ['script-modal-close','btn-script-cancel'].forEach(id => {
    $(id).onclick = () => closeModal('script-modal');
  });
}
js/kb.js
'use strict';

import { api, uploadFiles } from './api.js';
import { $, el, esc, fmtDateOnly, toast, sanitiseFTS } from './utils.js';
import { setupUploadZone, renderSavedAttachments } from './upload.js';

let kbOffset   = 0;
let editingKBId = null;
let cleanupKBUpload = () => {};

export async function loadKB(reset = false) {
  if (reset) kbOffset = 0;
  const rawQ = document.getElementById('search-global').value.trim();
  const q    = sanitiseFTS(rawQ);
  const params = { type: 'kb', limit: 50, offset: kbOffset };
  if (q) params.q = q;

  let data;
  try { data = await api(params); }
  catch (e) { toast('Failed to load KB: ' + e.message, 'error'); return; }

  const list = $('kb-list');
  if (reset) list.innerHTML = '';

  if (!data.items?.length && kbOffset === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div>No KB articles found</div>';
  } else {
    (data.items || []).forEach(k => list.appendChild(renderKBCard(k)));
  }
  kbOffset += (data.items || []).length;
  $('kb-load-more').style.display = (data.items || []).length === 50 ? 'block' : 'none';
}

function renderKBCard(k) {
  const tags = (k.tags || '').split(',').filter(Boolean)
    .map(t => `<span class="tag">${esc(t.trim())}</span>`).join('');
  const card = el('div', 'card');
  card.innerHTML = `
    <div class="card-header" style="margin-bottom:6px">
      <div class="card-title expand-toggle" style="cursor:pointer">${esc(k.title)}</div>
      ${k.last_tested ? `<span class="card-date">Tested: ${fmtDateOnly(k.last_tested)}</span>` : ''}
    </div>
    ${tags ? `<div class="tag-row">${tags}</div>` : ''}
    <div class="card-body">
      ${k.symptoms      ? `<div class="detail-section"><div class="detail-label">Symptoms</div><div class="detail-val">${esc(k.symptoms)}</div></div>` : ''}
      ${k.cause         ? `<div class="detail-section"><div class="detail-label">Cause</div><div class="detail-val">${esc(k.cause)}</div></div>` : ''}
      ${k.fix           ? `<div class="detail-section"><div class="detail-label">Fix / Resolution</div><div class="detail-val">${esc(k.fix)}</div></div>` : ''}
      ${k.commands_used ? `<div class="detail-section"><div class="detail-label">Commands</div>
        <div class="code-block"><button class="btn btn-ghost btn-xs copy-btn-code" data-action="copy-cmd">Copy</button>${esc(k.commands_used)}</div>
      </div>` : ''}
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-xs" data-action="expand">Details</button>
      <button class="btn btn-ghost btn-xs" data-action="edit">Edit</button>
      <button class="btn btn-ghost btn-xs" data-action="copy">Copy Fix</button>
      <button class="btn btn-danger btn-xs" data-action="delete">Delete</button>
    </div>`;

  card.querySelector('.expand-toggle').onclick           = () => card.classList.toggle('expanded');
  card.querySelector('[data-action="expand"]').onclick   = () => card.classList.toggle('expanded');
  card.querySelector('[data-action="edit"]').onclick     = () => openKBForm(k);
  card.querySelector('[data-action="copy"]').onclick     = () => {
    navigator.clipboard.writeText(k.fix || k.title).then(() => toast('Fix copied', 'success'));
  };
  const copyCmd = card.querySelector('[data-action="copy-cmd"]');
  if (copyCmd) copyCmd.onclick = () => {
    navigator.clipboard.writeText(k.commands_used).then(() => toast('Commands copied', 'success'));
  };
  card.querySelector('[data-action="delete"]').onclick   = () => deleteKB(k.id, card);
  return card;
}

export function openKBForm(k = null, prefill = null) {
  editingKBId = k ? k.id : null;
  const pendingKBFiles = [];
  cleanupKBUpload();
  cleanupKBUpload = setupUploadZone(
    'kb-upload-zone', 'kb-file-input', 'kb-att-preview', pendingKBFiles
  );

  $('kb-modal-title').textContent = k ? 'Edit KB Article' : 'New KB Article';
  const src = k || prefill || {};
  const fields = {
    'kf-title':    src.title         || '',
    'kf-symptoms': src.symptoms      || '',
    'kf-cause':    src.cause         || '',
    'kf-fix':      src.fix           || '',
    'kf-commands': src.commands_used || '',
    'kf-tags':     src.tags          || '',
    'kf-tested':   src.last_tested   || '',
  };
  Object.entries(fields).forEach(([id, val]) => { if ($(id)) $(id).value = val; });
  $('kb-modal').dataset.sourceIssue = src.source_issue_id || '';

  const prev = $('kb-att-preview');
  prev.innerHTML = '';
  if (k?.attachments?.length) {
    prev.appendChild(renderSavedAttachments(k.attachments, async (att, thumb) => {
      try {
        await api({ type: 'attachment', id: att.id }, 'DELETE');
        thumb.remove();
      } catch (e) { toast('Remove failed', 'error'); }
    }));
  }
  openModal('kb-modal');
}

async function deleteKB(id, card) {
  const ok = await confirmDialog('Soft-delete this KB article?');
  if (!ok) return;
  try {
    await api({ type: 'kb', id }, 'DELETE');
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 200);
    toast('KB article deleted', 'success');
  } catch (e) { toast('Delete failed', 'error'); }
}

export function initKBSave() {
  $('btn-kb-save').onclick = async () => {
    const title = $('kf-title').value.trim();
    if (!title) { toast('Title required', 'error'); return; }
    const payload = {
      title,
      symptoms:       $('kf-symptoms').value,
      cause:          $('kf-cause').value,
      fix:            $('kf-fix').value,
      commands_used:  $('kf-commands').value,
      tags:           $('kf-tags').value,
      last_tested:    $('kf-tested').value || null,
      source_issue_id:$('kb-modal').dataset.sourceIssue || null,
    };
    try {
      let result;
      if (editingKBId) result = await api({ type: 'kb', id: editingKBId }, 'PUT', payload);
      else             result = await api({ type: 'kb' }, 'POST', payload);
      closeModal('kb-modal');
      cleanupKBUpload();
      toast(editingKBId ? 'Article updated' : 'Article created', 'success');
      loadKB(true);
    } catch (e) { toast('Save failed: ' + e.message, 'error'); }
  };
}

export function initKBControls() {
  $('btn-new-kb').onclick  = () => openKBForm();
  $('btn-kb-more').onclick = () => loadKB(false);
  ['kb-modal-close','btn-kb-cancel'].forEach(id => {
    $(id).onclick = () => { closeModal('kb-modal'); cleanupKBUpload(); };
  });
}
js/app.js
'use strict';
// Orchestrator — tab switching, global search, confirm dialog, export, boot

import { api }           from './api.js';
import { $, toast }      from './utils.js';
import { loadDashboard } from './dashboard.js';
import { loadIssues, initIssueFilters, initIssueSave, initIssueModalClose, initDupDetection, initTemplates, initQuickIssue } from './issues.js';
import { loadEvents, initEventSave, initEventControls }   from './events.js';
import { loadScripts, initScriptSave, initScriptControls } from './scripts.js';
import { loadKB, initKBSave, initKBControls }             from './kb.js';

// ── CONFIRM DIALOG ─────────────────────────────────────────
let _confirmResolve;
window.confirmDialog = function(msg) {
  return new Promise(res => {
    $('confirm-msg').textContent = msg;
    $('confirm-modal').classList.remove('hidden');
    _confirmResolve = res;
  });
};
$('btn-confirm-yes').onclick = () => { $('confirm-modal').classList.add('hidden'); _confirmResolve?.(true); };
$('btn-confirm-no').onclick  = () => { $('confirm-modal').classList.add('hidden'); _confirmResolve?.(false); };

// ── MODAL HELPERS (global so modules can call them) ─────────
window.openModal  = id => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = id => document.getElementById(id)?.classList.add('hidden');

// ── TABS ───────────────────────────────────────────────────
let activeTab = 'dashboard';

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.module').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    activeTab = t.dataset.tab;
    document.getElementById(`${activeTab}-module`).classList.add('active');
    loadTab(activeTab);
  };
});

function loadTab(tab) {
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'issues')    loadIssues(true);
  if (tab === 'events')    loadEvents(true);
  if (tab === 'scripts')   loadScripts(true);
  if (tab === 'kb')        loadKB(true);
}

// ── GLOBAL SEARCH ──────────────────────────────────────────
let _searchTimer;
$('search-global').addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => loadTab(activeTab), 320);
});

// ── EXPORT ─────────────────────────────────────────────────
$('btn-export').onclick = () => openModal('export-modal');
$('export-modal-close').onclick = () => closeModal('export-modal');
document.querySelectorAll('[data-export]').forEach(btn => {
  btn.onclick = async () => {
    try {
      const data = await api({ type: 'export', table: btn.dataset.export });
      if (!data.csv) { toast('No data to export', 'error'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data.csv], { type: 'text/csv' }));
      a.download = `${btn.dataset.export}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      closeModal('export-modal');
    } catch (e) { toast('Export failed: ' + e.message, 'error'); }
  };
});

$('btn-backup').onclick = () => { window.location.href = 'api.php?type=backup'; };
$('btn-refresh-dash').onclick = loadDashboard;

// ── INIT ALL MODULES ───────────────────────────────────────
initIssueFilters();
initIssueSave();
initIssueModalClose();
initDupDetection();
initTemplates();
initQuickIssue();
initEventSave();
initEventControls();
initScriptSave();
initScriptControls();
initKBSave();
initKBControls();

// ── BOOT ───────────────────────────────────────────────────
loadDashboard();
Now the index.html — updated to use ES modules, add KB upload zone, and add paste hint:
index.html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>IT Support Tracker</title>
<link rel="stylesheet" href="style.css"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
</head>
<body>

<div id="topbar">
  <div class="logo">IT<span>Tracker</span></div>
  <div class="search-wrap">
    <input type="text" id="search-global" placeholder="Search everything… title, tags, reporter, date" autocomplete="off"/>
  </div>
  <div class="actions">
    <button class="btn btn-ghost btn-sm" id="btn-export">Export CSV</button>
    <button class="btn btn-ghost btn-sm" id="btn-backup">Backup DB</button>
  </div>
</div>

<div id="tabs">
  <div class="tab active" data-tab="dashboard">Dashboard</div>
  <div class="tab" data-tab="issues">Issues</div>
  <div class="tab" data-tab="events">Events</div>
  <div class="tab" data-tab="scripts">Scripts</div>
  <div class="tab" data-tab="kb">Knowledge Base</div>
</div>

<div id="main">

  <!-- DASHBOARD -->
  <div class="module active" id="dashboard-module">
    <div class="mod-toolbar">
      <span style="color:var(--text2);font-size:12px">Drag widgets to reorder · order saved automatically</span>
      <button class="btn btn-ghost btn-sm" id="btn-refresh-dash" style="margin-left:auto">↻ Refresh</button>
    </div>
    <div class="list-area"><div class="dashboard-grid" id="dashboard-grid"></div></div>
  </div>

  <!-- ISSUES -->
  <div class="module" id="issues-module">
    <div class="mod-toolbar">
      <div class="filter-group" id="issue-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="open">Open</button>
        <button class="filter-btn" data-filter="resolved">Resolved</button>
        <button class="filter-btn" data-filter="closed">Closed</button>
        <button class="filter-btn" data-filter="overdue">Overdue</button>
      </div>
      <select id="issue-cat-filter" style="padding:4px 8px;font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);margin-left:4px">
        <option value="">All Categories</option>
        <option>Hardware</option><option>Software</option><option>Network</option>
        <option>Account</option><option>Security</option><option>Printer</option><option>Other</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-quick-issue">⚡ Quick</button>
        <button class="btn btn-primary btn-sm" id="btn-new-issue">+ New Issue</button>
      </div>
    </div>
    <div class="quick-strip" id="quick-issue-strip">
      <div class="form-group"><label>Title</label><input id="qi-title" placeholder="Brief description"/></div>
      <div class="form-group"><label>Category</label>
        <select id="qi-category">
          <option>Hardware</option><option>Software</option><option>Network</option>
          <option>Account</option><option>Security</option><option>Printer</option><option>Other</option>
        </select>
      </div>
      <div class="form-group"><label>Reporter</label><input id="qi-reporter" placeholder="User name"/></div>
      <div class="form-group"><label>Status</label>
        <select id="qi-status">
          <option>New</option><option>Open</option><option>In Progress</option>
          <option>Waiting for User</option><option>Waiting for Vendor</option>
        </select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="qi-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-qi-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="btn-qi-cancel">✕</button>
    </div>
    <div class="list-area" id="issue-list"><div class="empty-state"><div class="empty-icon">📋</div>No issues yet</div></div>
    <div class="load-more-wrap" id="issue-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-issue-more">Load More</button>
    </div>
  </div>

  <!-- EVENTS -->
  <div class="module" id="events-module">
    <div class="mod-toolbar">
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-quick-event">⚡ Quick</button>
        <button class="btn btn-primary btn-sm" id="btn-new-event">+ New Event</button>
      </div>
    </div>
    <div class="quick-strip" id="quick-event-strip">
      <div class="form-group"><label>Subject</label><input id="qe-subject" placeholder="Event subject"/></div>
      <div class="form-group"><label>Type</label>
        <select id="qe-type"><option>Meeting</option><option>Incident</option><option>Training</option><option>Call</option><option>Site Visit</option></select>
      </div>
      <div class="form-group"><label>Date & Time</label><input type="datetime-local" id="qe-date"/></div>
      <button class="btn btn-primary btn-sm" id="btn-qe-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="btn-qe-cancel">✕</button>
    </div>
    <div class="list-area" id="event-list"><div class="empty-state"><div class="empty-icon">📅</div>No events yet</div></div>
    <div class="load-more-wrap" id="event-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-event-more">Load More</button>
    </div>
  </div>

  <!-- SCRIPTS -->
  <div class="module" id="scripts-module">
    <div class="mod-toolbar">
      <div class="filter-group">
        <button class="filter-btn active" data-sfilter="all">All</button>
        <button class="filter-btn" data-sfilter="pinned">⭐ Pinned</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-quick-script">⚡ Quick</button>
        <button class="btn btn-primary btn-sm" id="btn-new-script">+ New Script</button>
      </div>
    </div>
    <div class="quick-strip" id="quick-script-strip">
      <div class="form-group" style="flex:2"><label>Title</label><input id="qs-title" placeholder="Script name"/></div>
      <div class="form-group" style="flex:3"><label>Command</label><input id="qs-command" placeholder="Command or one-liner"/></div>
      <div class="form-group"><label>Tags</label><input id="qs-tags" placeholder="comma,separated"/></div>
      <button class="btn btn-primary btn-sm" id="btn-qs-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="btn-qs-cancel">✕</button>
    </div>
    <div class="list-area" id="script-list"><div class="empty-state"><div class="empty-icon">⌨️</div>No scripts yet</div></div>
    <div class="load-more-wrap" id="script-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-script-more">Load More</button>
    </div>
  </div>

  <!-- KNOWLEDGE BASE -->
  <div class="module" id="kb-module">
    <div class="mod-toolbar">
      <div style="margin-left:auto">
        <button class="btn btn-primary btn-sm" id="btn-new-kb">+ New Article</button>
      </div>
    </div>
    <div class="list-area" id="kb-list"><div class="empty-state"><div class="empty-icon">📚</div>No KB articles yet</div></div>
    <div class="load-more-wrap" id="kb-load-more" style="display:none">
      <button class="btn btn-ghost" id="btn-kb-more">Load More</button>
    </div>
  </div>

</div><!-- #main -->

<div id="toast-container"></div>

<!-- ISSUE MODAL -->
<div class="modal-overlay hidden" id="issue-modal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3 id="issue-modal-title">New Issue</h3>
      <div class="template-bar">
        <span style="font-size:10px;color:var(--text3);align-self:center;margin-right:2px">TPL:</span>
        <button class="tpl-btn" data-tpl="outlook">Outlook</button>
        <button class="tpl-btn" data-tpl="vpn">VPN</button>
        <button class="tpl-btn" data-tpl="printer">Printer</button>
        <button class="tpl-btn" data-tpl="accountlock">Acct Lock</button>
        <button class="tpl-btn" data-tpl="intune">Intune</button>
        <button class="tpl-btn" data-tpl="network">Network</button>
      </div>
      <button class="btn btn-ghost btn-icon" id="issue-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="dup-warning" id="dup-warning">⚠ Possible duplicate: <span id="dup-list"></span></div>
      <div class="form-section">
        <div class="form-section-title">Core</div>
        <div class="form-grid">
          <div class="form-group full"><label>Title *</label><input id="f-title" placeholder="Brief issue description" autocomplete="off"/></div>
          <div class="form-group full"><label>Description</label><textarea id="f-desc" rows="3" placeholder="Details, steps to reproduce…"></textarea></div>
          <div class="form-group"><label>Category</label>
            <select id="f-category">
              <option>Hardware</option><option>Software</option><option>Network</option>
              <option>Account</option><option>Security</option><option>Printer</option><option>Other</option>
            </select>
          </div>
          <div class="form-group"><label>Priority</label>
            <select id="f-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
          </div>
          <div class="form-group"><label>Status</label>
            <select id="f-status">
              <option>New</option><option>Open</option><option>In Progress</option>
              <option>Waiting for User</option><option>Waiting for Vendor</option>
              <option>Resolved</option><option>Closed</option><option>Reopened</option>
            </select>
          </div>
          <div class="form-group"><label>Channel</label>
            <select id="f-channel"><option>Email</option><option>Teams</option><option>Verbal</option></select>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">People</div>
        <div class="form-grid">
          <div class="form-group"><label>Reporter</label><input id="f-reporter" placeholder="Requester"/></div>
          <div class="form-group"><label>Assigned To</label><input id="f-assigned" placeholder="Technician"/></div>
          <div class="form-group"><label>Team</label><input id="f-team"/></div>
          <div class="form-group"><label>Owner / Manager</label><input id="f-owner"/></div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Resolution</div>
        <div class="form-grid">
          <div class="form-group full"><label>Resolution</label><textarea id="f-resolution" rows="3" placeholder="What fixed it…"></textarea></div>
          <div class="form-group full"><label>Root Cause</label><textarea id="f-rootcause" rows="2" placeholder="Why it happened…"></textarea></div>
          <div class="form-group"><label>Resolution Type</label>
            <select id="f-restype">
              <option>Workaround</option><option>Permanent Fix</option><option>Vendor</option>
              <option>User Error</option><option selected>Unknown</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Details</div>
        <div class="form-grid">
          <div class="form-group"><label>Asset / Device</label><input id="f-asset" placeholder="Hostname, serial…"/></div>
          <div class="form-group"><label>Tags</label><input id="f-tags" placeholder="comma,separated"/></div>
          <div class="form-group"><label>Time Spent (hrs)</label><input type="number" id="f-time" step="0.25" min="0" placeholder="0"/></div>
          <div class="form-group"><label>Due Date</label><input type="date" id="f-due"/></div>
          <div class="form-group"><label>Created At</label><input type="datetime-local" id="f-created"/></div>
          <div class="form-group"><label>Related Event ID</label><input type="number" id="f-relevent" placeholder="Event ID"/></div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Attachments</div>
        <div class="upload-zone" id="issue-upload-zone">
          📎 Drag &amp; drop · click to browse · or <kbd>Ctrl+V</kbd> to paste screenshot<br/>
          <small style="color:var(--text3)">jpg png gif pdf txt log csv docx xlsx · max 20 MB each</small>
          <input type="file" id="issue-file-input" multiple style="display:none"
                 accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.log,.csv,.docx,.xlsx"/>
        </div>
        <div class="upload-previews" id="issue-att-preview"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-issue-cancel">Cancel</button>
      <button class="btn btn-success" id="btn-issue-kb" style="display:none">Resolve &amp; Save to KB</button>
      <button class="btn btn-primary" id="btn-issue-save">Save Issue</button>
    </div>
  </div>
</div>

<!-- ISSUE DETAIL MODAL -->
<div class="modal-overlay hidden" id="issue-detail-modal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3 id="detail-ticket-id" style="font-family:var(--font);color:var(--accent)"></h3>
      <span id="detail-status-badge"></span>
      <span id="detail-prio-badge" style="margin-left:4px"></span>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="btn-detail-copy">Copy Summary</button>
        <button class="btn btn-ghost btn-sm" id="btn-detail-print">🖨 Print</button>
        <button class="btn btn-ghost btn-sm" id="btn-detail-edit">Edit</button>
        <button class="btn btn-ghost btn-icon" id="issue-detail-close">✕</button>
      </div>
    </div>
    <div class="modal-body" id="issue-detail-body"></div>
  </div>
</div>

<!-- EVENT MODAL -->
<div class="modal-overlay hidden" id="event-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="event-modal-title">New Event</h3>
      <button class="btn btn-ghost btn-icon" id="event-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Subject *</label><input id="ef-subject" placeholder="Event subject"/></div>
        <div class="form-group"><label>Type</label>
          <select id="ef-type"><option>Meeting</option><option>Incident</option><option>Training</option><option>Call</option><option>Site Visit</option></select>
        </div>
        <div class="form-group"><label>Location</label>
          <select id="ef-location"><option>Teams</option><option>Room</option><option>Phone</option><option>On-site</option></select>
        </div>
        <div class="form-group"><label>Date &amp; Time</label><input type="datetime-local" id="ef-date"/></div>
        <div class="form-group"><label>Duration (min)</label><input type="number" id="ef-duration" min="0" placeholder="60"/></div>
        <div class="form-group"><label>Priority</label>
          <select id="ef-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
        </div>
        <div class="form-group"><label>Category</label><input id="ef-category" placeholder="e.g. Deployment"/></div>
        <div class="form-group"><label>Reporter</label><input id="ef-reporter"/></div>
        <div class="form-group full"><label>Attendees</label><input id="ef-attendees" placeholder="Comma-separated names"/></div>
        <div class="form-group full"><label>Description</label><textarea id="ef-description" rows="3"></textarea></div>
        <div class="form-group full"><label>Outcome / Decision</label><textarea id="ef-outcome" rows="2"></textarea></div>
        <div class="form-group full"><label>Action Items</label><textarea id="ef-actions" rows="2" placeholder="- Item 1&#10;- Item 2"></textarea></div>
        <div class="form-group"><label>Follow-up Date</label><input type="date" id="ef-followup"/></div>
        <div class="form-group"><label>Related Issue IDs</label><input id="ef-related" placeholder="12,45"/></div>
        <div class="form-group"><label>Tags</label><input id="ef-tags" placeholder="comma,separated"/></div>
      </div>
      <div style="margin-top:16px">
        <div class="form-section-title">Attachments</div>
        <div class="upload-zone" id="event-upload-zone">
          📎 Drag &amp; drop · click to browse · or <kbd>Ctrl+V</kbd> to paste screenshot
          <input type="file" id="event-file-input" multiple style="display:none"
                 accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.log,.csv,.docx,.xlsx"/>
        </div>
        <div class="upload-previews" id="event-att-preview"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-event-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-event-save">Save Event</button>
    </div>
  </div>
</div>

<!-- SCRIPT MODAL -->
<div class="modal-overlay hidden" id="script-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="script-modal-title">New Script</h3>
      <button class="btn btn-ghost btn-icon" id="script-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Title *</label><input id="sf-title"/></div>
        <div class="form-group full"><label>Command / Script *</label>
          <textarea id="sf-command" rows="5" style="font-family:var(--font);font-size:12px;color:#7dd3fc" placeholder="# paste command here"></textarea>
        </div>
        <div class="form-group full"><label>Description</label><textarea id="sf-desc" rows="2"></textarea></div>
        <div class="form-group"><label>OS</label>
          <select id="sf-os"><option>Windows</option><option>Linux</option><option>macOS</option><option>Network</option><option>Other</option></select>
        </div>
        <div class="form-group"><label>Risk Level</label>
          <select id="sf-risk"><option>Safe</option><option>Admin</option><option>Destructive</option></select>
        </div>
        <div class="form-group"><label>Category</label><input id="sf-category" placeholder="Cleanup, Diagnostics…"/></div>
        <div class="form-group"><label>Tags</label><input id="sf-tags" placeholder="comma,separated"/></div>
        <div class="form-group full"><label>Notes / Warnings</label><textarea id="sf-notes" rows="2" placeholder="⚠ Prerequisites, warnings…"></textarea></div>
        <div class="form-group full"><label>Example Output</label><textarea id="sf-output" rows="2"></textarea></div>
        <div class="form-group full">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
            <input type="checkbox" id="sf-pinned" style="width:14px;height:14px"/> Pin to dashboard
          </label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-script-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-script-save">Save Script</button>
    </div>
  </div>
</div>

<!-- KB MODAL -->
<div class="modal-overlay hidden" id="kb-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="kb-modal-title">New KB Article</h3>
      <button class="btn btn-ghost btn-icon" id="kb-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label>Title *</label><input id="kf-title"/></div>
        <div class="form-group full"><label>Symptoms</label><textarea id="kf-symptoms" rows="3" placeholder="What does the user see?"></textarea></div>
        <div class="form-group full"><label>Cause</label><textarea id="kf-cause" rows="2"></textarea></div>
        <div class="form-group full"><label>Fix / Resolution</label><textarea id="kf-fix" rows="4" placeholder="Step-by-step…"></textarea></div>
        <div class="form-group full"><label>Commands Used</label>
          <textarea id="kf-commands" rows="2" style="font-family:var(--font);font-size:12px" placeholder="gpupdate /force…"></textarea>
        </div>
        <div class="form-group"><label>Tags</label><input id="kf-tags" placeholder="comma,separated"/></div>
        <div class="form-group"><label>Last Tested</label><input type="date" id="kf-tested"/></div>
      </div>
      <div style="margin-top:16px">
        <div class="form-section-title">Attachments</div>
        <div class="upload-zone" id="kb-upload-zone">
          📎 Drag &amp; drop · click to browse · or <kbd>Ctrl+V</kbd> to paste screenshot
          <input type="file" id="kb-file-input" multiple style="display:none"
                 accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.log,.csv,.docx,.xlsx"/>
        </div>
        <div class="upload-previews" id="kb-att-preview"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-kb-cancel">Cancel</button>
      <button class="btn btn-primary" id="btn-kb-save">Save Article</button>
    </div>
  </div>
</div>

<!-- CONFIRM MODAL -->
<div class="modal-overlay hidden" id="confirm-modal">
  <div class="modal modal-sm">
    <div class="modal-header"><h3>Confirm Delete</h3></div>
    <div class="modal-body" style="padding:18px"><p class="confirm-msg" id="confirm-msg"></p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-confirm-no">Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-yes">Delete</button>
    </div>
  </div>
</div>

<!-- EXPORT MODAL -->
<div class="modal-overlay hidden" id="export-modal">
  <div class="modal modal-sm">
    <div class="modal-header">
      <h3>Export CSV</h3>
      <button class="btn btn-ghost btn-icon" id="export-modal-close" style="margin-left:auto">✕</button>
    </div>
    <div class="modal-body" style="padding:18px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-ghost" data-export="issues">Export Issues</button>
        <button class="btn btn-ghost" data-export="events">Export Events</button>
        <button class="btn btn-ghost" data-export="scripts">Export Scripts</button>
        <button class="btn btn-ghost" data-export="knowledge_base">Export Knowledge Base</button>
      </div>
    </div>
  </div>
</div>

<!-- ES Module entry point -->
<script type="module" src="js/app.js"></script>
</body>
</html>
Now the updated api.php — fixing the image serving bug and adding FTS sanitisation:
api.php
The only change from the previous version is the file-serve endpoint and FTS sanitisation. The style.css is unchanged. Here are the two targeted fixes:
In api.php, replace the file serve block and add FTS sanitisation:
// After: $q = trim($_GET['q'] ?? '');
// ADD:
$q = preg_replace('/[+\-*()":^~]/', ' ', $q);
$q = trim($q);

// Replace the SERVE FILE block:
if ($type === 'file' && $method === 'GET') {
    $filename = basename($_GET['name'] ?? '');
    $path = UPLOAD_DIR . $filename;
    $stmt = $db->prepare("SELECT * FROM attachments WHERE filename=? AND deleted_at IS NULL");
    $stmt->execute([$filename]);
    $att = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$att || !file_exists($path)) err('Not found', 404);
    $mime = $att['mime_type'];
    header('Content-Type: ' . $mime);
    // Images served inline so <img> tags render them — only force download for non-images
    if (str_starts_with($mime, 'image/')) {
        header('Content-Disposition: inline; filename="' . $att['original_name'] . '"');
    } else {
        header('Content-Disposition: attachment; filename="' . $att['original_name'] . '"');
    }
    header('Cache-Control: private, max-age=3600');
    readfile($path);
    exit;
}
Deploy structure:
/var/www/html/
├── index.html
├── api.php
├── style.css
├── js/
│   ├── app.js
│   ├── api.js
│   ├── utils.js
│   ├── storage.js
│   ├── upload.js
│   ├── dashboard.js
│   ├── issues.js
│   ├── events.js
│   ├── scripts.js
│   └── kb.js
├── uploads/      ← writable by www-data
└── data/         ← writable by www-data
ES modules require Apache to serve .js files with correct MIME type — this works by default on Apache 2.4+. If you hit a MIME error add to .htaccess:
AddType application/javascript .js
Upload bugs fixed:
pendingFiles.length = 0 instead of reassignment — closure reference preserved
Images served inline not attachment — <img> preview works
Clipboard paste via document.addEventListener('paste') — active while modal open, cleaned up on close
Pasted blobs get a generated filename clipboard_timestamp.png
FTS special chars sanitised before MATCH query
Upload errors surfaced to user via toast
setupUploadZone returns a cleanup function — paste listener removed on modal close
