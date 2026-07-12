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

export async function checkUrl(url, timeoutMs = 10000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: 'HEAD', signal: ctrl.signal,
      redirect: 'follow', cache: 'no-store'
    });
    clearTimeout(timer);
    if (r.status === 405) return checkWithGet(url, 8000);
    return r.status;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return 0;
    return checkWithGet(url, Math.min(timeoutMs, 8000));
  }
}

export async function scanConcurrently(bookmarks, concurrency, onResult, onTick) {
  let cursor   = 0;
  let completed = 0;

  async function worker() {
    while (cursor < bookmarks.length) {
      const idx = cursor++;
      const bm  = bookmarks[idx];
      const code = await checkUrl(bm.url);

      completed++;
      onTick(completed, bookmarks.length, code);

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
