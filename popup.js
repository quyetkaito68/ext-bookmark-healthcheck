document.getElementById('startBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
  window.close();
});
