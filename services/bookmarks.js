export function getAllBookmarks() {
  return new Promise(resolve => {
    chrome.bookmarks.getTree(tree => {
      const list = [];
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

export function removeBookmark(id) {
  return new Promise(resolve => chrome.bookmarks.remove(id, () => resolve()));
}

export async function searchBookmarks(query) {
  const results = await new Promise(resolve => {
    chrome.bookmarks.search({ query }, resolve);
  });

  return Promise.all(results.map(async bm => ({
    id:    bm.id,
    title: bm.title || bm.url,
    url:   bm.url,
    path:  await getPathForBookmark(bm),
  })));
}

async function getPathForBookmark(bm) {
  const parts = [];
  let cur = bm;
  while (cur.parentId) {
    const [parent] = await chrome.bookmarks.get(cur.parentId);
    if (parent && parent.id !== '0') parts.unshift(parent.title);
    cur = parent;
  }
  return parts.length ? parts.join(' › ') : '/';
}
