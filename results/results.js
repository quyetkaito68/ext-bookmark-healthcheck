'use strict';

import { getAllBookmarks, removeBookmark } from '../services/bookmarks.js';
import { codeLabel } from '../utils/badge.js';
import { esc, renderPath, createRow } from '../utils/dom.js';

// ─── State ───────────────────────────────────────────────────────────────────
let allResults   = [];
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
const contextMenu    = document.getElementById('contextMenu');
const ctxDelete      = document.getElementById('ctxDelete');

let ctxTargetId = null;

// ─── Row rendering ────────────────────────────────────────────────────────────
function appendRow(item) {
  const tr = createRow(item);
  tr.querySelector('.row-checkbox').addEventListener('change', onRowCheck);
  resultsTbody.appendChild(tr);

  if (resultsTable.classList.contains('hidden')) {
    initialState.classList.add('hidden');
    emptyState.classList.add('hidden');
    resultsTable.classList.remove('hidden');
  }
}

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
function scanViaBackground(bookmarks, concurrency, onResult, onTick) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'scan' });

    port.onMessage.addListener(msg => {
      if (msg.type === 'result') onResult(msg.item);
      if (msg.type === 'tick')   onTick(msg.done, msg.total);
      if (msg.type === 'done')   { port.disconnect(); resolve(); }
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
    });

    port.postMessage({ action: 'start', bookmarks, concurrency });
  });
}

async function startScan() {
  if (isScanning) return;
  isScanning  = true;
  allResults  = [];
  selectedIds = new Set();
  foundCount  = 0;

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

    await scanViaBackground(
      bookmarks,
      50,
      item => {
        allResults.push(item);
        foundCount++;
        foundCountEl.textContent = `${foundCount} lỗi`;
        appendRow(item);
      },
      (done, total) => {
        const pct = Math.round((done / total) * 100);
        progressBar.style.width       = pct + '%';
        progressCount.textContent     = `${done.toLocaleString()} / ${total.toLocaleString()}`;
      }
    );

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

  toDelete.forEach(id => {
    const tr = resultsTbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
    if (tr) tr.remove();
  });

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

let pendingConfirmAction = null;

deleteBtn.addEventListener('click', () => {
  if (selectedIds.size === 0) return;
  confirmMsg.textContent =
    `Bạn có chắc muốn xóa ${selectedIds.size} bookmark đã chọn không? Thao tác này không thể hoàn tác.`;
  confirmModal.classList.remove('hidden');
  pendingConfirmAction = performDelete;
});

confirmYes.addEventListener('click', () => {
  if (pendingConfirmAction) {
    confirmModal.classList.add('hidden');
    pendingConfirmAction();
    pendingConfirmAction = null;
  }
});
confirmNo.addEventListener('click', () => {
  pendingConfirmAction = null;
  confirmModal.classList.add('hidden');
});

confirmModal.addEventListener('click', e => {
  if (e.target === confirmModal) {
    confirmModal.classList.add('hidden');
    pendingConfirmAction = null;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    confirmModal.classList.add('hidden');
    pendingConfirmAction = null;
    hideContextMenu();
  }
});

// ─── Context Menu ───────────────────────────────────────────────────────────
function showContextMenu(x, y, bmId) {
  ctxTargetId = bmId;
  contextMenu.style.left = x + 'px';
  contextMenu.style.top  = y + 'px';
  contextMenu.classList.remove('hidden');

  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = (x - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = (y - rect.height) + 'px';
  }
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  ctxTargetId = null;
}

resultsTbody.addEventListener('contextmenu', e => {
  const tr = e.target.closest('tr.result-row');
  if (!tr) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, tr.dataset.id);
});

document.addEventListener('click', e => {
  if (!contextMenu.contains(e.target)) hideContextMenu();
});

ctxDelete.addEventListener('click', () => {
  if (!ctxTargetId) return;
  const bm = allResults.find(r => r.id === ctxTargetId);
  if (!bm) { hideContextMenu(); return; }
  confirmMsg.textContent =
    `Bạn có chắc muốn xóa bookmark "${bm.title}" không? Thao tác này không thể hoàn tác.`;
  contextMenu.classList.add('hidden');
  confirmModal.classList.remove('hidden');

  pendingConfirmAction = async () => {
    await removeBookmark(bm.id);
    const tr = resultsTbody.querySelector(`tr[data-id="${CSS.escape(bm.id)}"]`);
    if (tr) tr.remove();
    allResults = allResults.filter(r => r.id !== bm.id);
    selectedIds.delete(bm.id);
    syncSelectAll();
    refreshDeleteBtn();
    populateFilter();
    refreshResultCount();
    if (allResults.length === 0) {
      resultsTable.classList.add('hidden');
      emptyState.classList.remove('hidden');
      toolbar.classList.add('hidden');
    }
  };
});
