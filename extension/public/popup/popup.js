const statusEl = document.getElementById('status');

chrome.runtime.sendMessage({ type: 'ACESSLENS_QUERY_ACTIVE_TAB_STATUS' }, (response) => {
  if (response?.active) {
    statusEl.textContent = 'Tracking is ON for this tab';
    statusEl.className = 'on';
  } else {
    statusEl.textContent = 'Tracking is OFF for this tab';
    statusEl.className = 'off';
  }
});

document.getElementById('recalibrate').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'ACESSLENS_RECALIBRATE' });
  window.close();
});
