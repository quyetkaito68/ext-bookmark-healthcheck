'use strict';

import { searchBookmarks } from '../services/bookmarks.js';

const startBtn     = document.getElementById('startBtn');
const searchInput  = document.getElementById('searchInput');
const clearBtn     = document.getElementById('clearSearch');
const searchOutput = document.getElementById('searchResults');

let debounceTimer = null;

startBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('results/results.html') });
  window.close();
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  clearBtn.style.display = q ? 'flex' : 'none';

  clearTimeout(debounceTimer);
  if (q.length < 2) {
    searchOutput.innerHTML = '';
    return;
  }
  debounceTimer = setTimeout(() => runSearch(q), 300);
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.style.display = 'none';
  searchOutput.innerHTML = '';
  searchInput.focus();
});

async function runSearch(query) {
  searchOutput.innerHTML = '<div class="no-results">Đang tìm…</div>';

  try {
    const results = await searchBookmarks(query);
    const items   = results.slice(0, 20);

    if (items.length === 0) {
      searchOutput.innerHTML = '<div class="no-results">Không tìm thấy bookmark</div>';
      return;
    }

    searchOutput.innerHTML = '';
    for (const bm of items) {
      const div = document.createElement('div');
      div.className = 'search-item';
      div.innerHTML =
        `<div class="search-item-title">${esc(bm.title)}</div>` +
        `<div class="search-item-url">${esc(bm.url)}</div>` +
        `<div class="search-item-path">📁 ${esc(bm.path)}</div>`;
      div.addEventListener('click', () => {
        chrome.tabs.create({ url: bm.url });
        window.close();
      });
      searchOutput.appendChild(div);
    }
  } catch {
    searchOutput.innerHTML = '<div class="no-results">Đã xảy ra lỗi</div>';
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
