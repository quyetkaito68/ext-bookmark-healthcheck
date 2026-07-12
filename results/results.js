'use strict';

import { getAllBookmarks, removeBookmark } from '../services/bookmarks.js';
import { scanConcurrently } from '../services/urlChecker.js';
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

    await scanConcurrently(
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
