'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let allResults   = [];   // all broken bookmarks found
let selectedIds  = new Set();
let isScanning   = false;
let foundCount   = 0;
let scannedTotal = 0;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const scanBtn        = document.getElementById('scanBtn');
const progressSec    = document.getElementById('progressSection');
const progressText   = document.getElementById('progressText');
const progressBar    = document.getElementById('progressBar');
const progressCount  = document.getElementById('progressCount');
const foundCountEl   = document.getElementById('foundCount');
const toolbar        = document.getElementById('toolbar');
const selectAllCb    = document.getElementById('selectAll');
const filterCode     = document.getElementById('filterCode');
const resultCountEl  = document.getElementById('resultCount');
const deleteBtn      = document.getElementById('deleteBtn');
const deleteBtnCount = document.getElementById('deleteBtnCount');
const resultsTable   = document.getElementById('resultsTable');
const resultsTbody   = document.getElementById('resultsTbody');
const emptyState     = document.getElementById('emptyState');
const initialState   = document.getElementById('initialState');
const confirmModal   = document.getElementById('confirmModal');
const confirmMsg     = document.getElementById('confirmMsg');
const confirmYes     = document.getElementById('confirmYes');
const confirmNo      = document.getElementById('confirmNo');

// ─── Bookmark helpers ─────────────────────────────────────────────────────────
function getAllBookmarks() {
  return new Promise(resolve => {
    chrome.bookmarks.getTree(tree => {
      const list = [];
      // Walk the tree, building a breadcrumb path as we go.
      // The artificial root node (id "0") has an empty title — skip it.
      (function walk(nodes, pathParts) {
        for (const n of nodes) {
          if (n.url && /^https?:\/\//i.test(n.url)) {
            list.push({
              id:    n.id,
              title: n.title || n.url,
              url:   n.url,
              path:  pathParts.length ? pathParts.join(' › ') : '/',
            });
          }
          if (n.children) {
            const next = n.title ? [...pathParts, n.title] : pathParts;
            walk(n.children, next);
          }
        }
      })(tree, []);
      resolve(list);
    });
  });
}

function removeBookmark(id) {
  return new Promise(resolve => chrome.bookmarks.remove(id, () => resolve()));
}

// ─── URL checking ─────────────────────────────────────────────────────────────
async function checkWithGet(url, ms) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'GET', signal: ctrl.signal,
      redirect: 'follow', cache: 'no-store'
    });
    clearTimeout(timer);
    return r.status;
  } catch (e) {
    clearTimeout(timer);
    return 0;
  }
}

async function checkUrl(url, timeoutMs = 10000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: 'HEAD', signal: ctrl.signal,
      redirect: 'follow', cache: 'no-store'
    });
    clearTimeout(timer);
    // Some servers reject HEAD but serve GET – fall through for 405
    if (r.status === 405) return checkWithGet(url, 8000);
    return r.status;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return 0;                // timeout
    return checkWithGet(url, Math.min(timeoutMs, 8000));  // network error → try GET
  }
}

// Worker-pool concurrency: spawns `concurrency` async workers sharing a counter
async function scanConcurrently(bookmarks, concurrency, onResult, onTick) {
  let cursor = 0;

  async function worker() {
    while (cursor < bookmarks.length) {
      const idx = cursor++;
      const bm  = bookmarks[idx];
      const code = await checkUrl(bm.url);

      onTick(idx + 1, bookmarks.length, code);

      // Only surface non-2xx responses as "broken"
      if (code < 200 || code >= 300) {
        onResult({ ...bm, code });
      }
    }
  }

  const pool = Array.from(
    { length: Math.min(concurrency, bookmarks.length) },
    () => worker()
  );
  await Promise.all(pool);
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────
function badgeInfo(code) {
  if (code === 0)                        return { cls: 'badge-network', label: '0 – Lỗi mạng' };
  if (code >= 300 && code < 400)         return { cls: 'badge-3xx',    label: String(code) };
  if (code >= 400 && code < 500)         return { cls: 'badge-4xx',    label: String(code) };
  if (code >= 500)                       return { cls: 'badge-5xx',    label: String(code) };
  return                                        { cls: 'badge-network', label: String(code) };
}

function codeLabel(code) {
  const MAP = {
    0: '0 – Lỗi mạng / Timeout',
    301: '301 – Chuyển hướng vĩnh viễn',
    302: '302 – Chuyển hướng tạm thời',
    400: '400 – Bad Request',
    401: '401 – Unauthorized',
    403: '403 – Forbidden',
    404: '404 – Not Found',
    405: '405 – Method Not Allowed',
    410: '410 – Gone',
    429: '429 – Too Many Requests',
    500: '500 – Internal Server Error',
    502: '502 – Bad Gateway',
    503: '503 – Service Unavailable',
    504: '504 – Gateway Timeout',
  };
  return MAP[code] || String(code);
}

// Render path segments with folder icons and › separators
function renderPath(path) {
  if (!path || path === '/') return '<span class="path-root">/ (Gốc)</span>';
  return path
    .split(' › ')
    .map(seg => `<span class="path-seg"><span class="path-icon">📁</span>${esc(seg)}</span>`)
    .join('<span class="path-sep"> › </span>');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Row rendering ────────────────────────────────────────────────────────────
function createRow(item) {
  const { cls, label } = badgeInfo(item.code);
  const tr = document.createElement('tr');
  tr.dataset.id   = item.id;
  tr.dataset.code = item.code;
  tr.className    = 'result-row';
  tr.innerHTML = `
    <td><input type="checkbox" class="row-checkbox" data-id="${esc(item.id)}"></td>
    <td><span class="badge ${cls}">${esc(label)}</span></td>
    <td><div class="bm-name" title="${esc(item.title)}">${esc(item.title)}</div></td>
    <td><a class="url-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.url)}</a></td>
    <td><div class="bm-path" title="${esc(item.path)}">${renderPath(item.path)}</div></td>
  `;
  tr.querySelector('.row-checkbox').addEventListener('change', onRowCheck);
  return tr;
}

function appendRow(item) {
  const tr = createRow(item);
  resultsTbody.appendChild(tr);

  if (resultsTable.classList.contains('hidden')) {
    initialState.classList.add('hidden');
    emptyState.classList.add('hidden');
    resultsTable.classList.remove('hidden');
  }
}

// Sort rows in tbody by status code ascending
function sortRows() {
  const rows = [...resultsTbody.querySelectorAll('tr')];
  rows.sort((a, b) => (parseInt(a.dataset.code) || 0) - (parseInt(b.dataset.code) || 0));
  rows.forEach(r => resultsTbody.appendChild(r));
}

// ─── Selection helpers ────────────────────────────────────────────────────────
function visibleRows() {
  return [...resultsTbody.querySelectorAll('tr.result-row:not([style*="display: none"])')];
}

function onRowCheck(e) {
  const id = e.target.dataset.id;
  const tr = e.target.closest('tr');
  if (e.target.checked) {
    selectedIds.add(id);
    tr.classList.add('row-selected');
  } else {
    selectedIds.delete(id);
    tr.classList.remove('row-selected');
  }
  syncSelectAll();
  refreshDeleteBtn();
}

function syncSelectAll() {
  const rows    = visibleRows();
  const checked = rows.filter(r => r.querySelector('.row-checkbox').checked);
  selectAllCb.indeterminate = checked.length > 0 && checked.length < rows.length;
  selectAllCb.checked       = rows.length > 0 && checked.length === rows.length;
}

function refreshDeleteBtn() {
  const n = selectedIds.size;
  deleteBtn.disabled   = n === 0;
  deleteBtnCount.textContent = `(${n})`;
}

function refreshResultCount() {
  const visible = visibleRows().length;
  resultCountEl.textContent = `${visible} kết quả`;
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function populateFilter() {
  const codes = [...new Set(allResults.map(r => r.code))].sort((a, b) => a - b);
  filterCode.innerHTML = '<option value="all">Tất cả lỗi</option>';
  codes.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c;
    opt.textContent = codeLabel(c);
    filterCode.appendChild(opt);
  });
}

function applyFilter() {
  const val  = filterCode.value;
  const rows = resultsTbody.querySelectorAll('tr.result-row');
  rows.forEach(tr => {
    const match = val === 'all' || tr.dataset.code === val;
    tr.style.display = match ? '' : 'none';
    if (!match) {
      const id = tr.dataset.id;
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
        tr.querySelector('.row-checkbox').checked = false;
        tr.classList.remove('row-selected');
      }
    }
  });
  selectAllCb.checked = false;
  selectAllCb.indeterminate = false;
  refreshDeleteBtn();
  refreshResultCount();
}

// ─── Scan ─────────────────────────────────────────────────────────────────────
async function startScan() {
  if (isScanning) return;
  isScanning  = true;
  allResults  = [];
  selectedIds = new Set();
  foundCount  = 0;

  // Reset UI
  initialState.classList.add('hidden');
  emptyState.classList.add('hidden');
  toolbar.classList.add('hidden');
  resultsTable.classList.add('hidden');
  resultsTbody.innerHTML = '';
  progressSec.classList.remove('hidden');
  scanBtn.disabled    = true;
  scanBtn.textContent = 'Đang quét…';
  progressBar.style.width = '0%';
  progressText.textContent = 'Đang lấy danh sách bookmark…';
  progressCount.textContent = '0 / 0';
  foundCountEl.textContent  = '0 lỗi';

  try {
    const bookmarks = await getAllBookmarks();
    scannedTotal = bookmarks.length;
    progressText.textContent = `Đang quét ${scannedTotal.toLocaleString()} bookmark…`;

    await scanConcurrently(
      bookmarks,
      50,                             // 50 concurrent requests
      item => {                       // onResult callback
        allResults.push(item);
        foundCount++;
        foundCountEl.textContent = `${foundCount} lỗi`;
        appendRow(item);
      },
      (done, total) => {              // onTick progress callback
        const pct = Math.round((done / total) * 100);
        progressBar.style.width       = pct + '%';
        progressCount.textContent     = `${done.toLocaleString()} / ${total.toLocaleString()}`;
      }
    );

    // Scan done
    progressText.textContent = `Hoàn tất! Tìm thấy ${foundCount} bookmark lỗi / ${scannedTotal.toLocaleString()} tổng.`;
    sortRows();
    populateFilter();
    toolbar.classList.remove('hidden');
    refreshResultCount();

    if (allResults.length === 0) {
      resultsTable.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }

  } catch (err) {
    progressText.textContent = 'Lỗi: ' + err.message;
  } finally {
    isScanning          = false;
    scanBtn.disabled    = false;
    scanBtn.textContent = 'Quét lại';
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function performDelete() {
  confirmModal.classList.add('hidden');

  const toDelete = [...selectedIds];
  await Promise.all(toDelete.map(removeBookmark));

  // Remove rows from DOM
  toDelete.forEach(id => {
    const tr = resultsTbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
    if (tr) tr.remove();
  });

  // Update allResults
  const deleted = new Set(toDelete);
  allResults = allResults.filter(r => !deleted.has(r.id));

  selectedIds = new Set();
  selectAllCb.checked = false;
  selectAllCb.indeterminate = false;
  refreshDeleteBtn();
  populateFilter();
  refreshResultCount();

  if (allResults.length === 0) {
    resultsTable.classList.add('hidden');
    emptyState.classList.remove('hidden');
    toolbar.classList.add('hidden');
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
scanBtn.addEventListener('click', startScan);

selectAllCb.addEventListener('change', () => {
  visibleRows().forEach(tr => {
    const cb = tr.querySelector('.row-checkbox');
    cb.checked = selectAllCb.checked;
    const id  = cb.dataset.id;
    if (selectAllCb.checked) {
      selectedIds.add(id);
      tr.classList.add('row-selected');
    } else {
      selectedIds.delete(id);
      tr.classList.remove('row-selected');
    }
  });
  refreshDeleteBtn();
});

filterCode.addEventListener('change', applyFilter);

deleteBtn.addEventListener('click', () => {
  if (selectedIds.size === 0) return;
  confirmMsg.textContent =
    `Bạn có chắc muốn xóa ${selectedIds.size} bookmark đã chọn không? Thao tác này không thể hoàn tác.`;
  confirmModal.classList.remove('hidden');
});

confirmYes.addEventListener('click', performDelete);
confirmNo.addEventListener('click',  () => confirmModal.classList.add('hidden'));

confirmModal.addEventListener('click', e => {
  if (e.target === confirmModal) confirmModal.classList.add('hidden');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') confirmModal.classList.add('hidden');
});
