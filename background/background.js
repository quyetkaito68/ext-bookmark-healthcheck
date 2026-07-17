'use strict';

import { checkUrl } from '../services/urlChecker.js';

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'scan') return;

  port.onMessage.addListener(async msg => {
    if (msg.action !== 'start') return;

    const bookmarks    = msg.bookmarks;
    const concurrency  = msg.concurrency || 50;
    let cursor         = 0;
    let completed      = 0;

    async function worker() {
      while (cursor < bookmarks.length) {
        const idx = cursor++;
        const bm  = bookmarks[idx];
        const code = await checkUrl(bm.url);

        completed++;
        port.postMessage({ type: 'tick', done: completed, total: bookmarks.length });

        if (code < 200 || code >= 300) {
          port.postMessage({ type: 'result', item: { ...bm, code } });
        }
      }
    }

    const pool = Array.from(
      { length: Math.min(concurrency, bookmarks.length) },
      () => worker()
    );
    await Promise.all(pool);

    port.postMessage({ type: 'done' });
  });
});
