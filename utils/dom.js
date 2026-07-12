import { badgeInfo } from './badge.js';

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderPath(path) {
  if (!path || path === '/') return '<span class="path-root">/ (Gốc)</span>';
  return path
    .split(' › ')
    .map(seg => `<span class="path-seg"><span class="path-icon">📁</span>${esc(seg)}</span>`)
    .join('<span class="path-sep"> › </span>');
}

export function createRow(item) {
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
  return tr;
}
