  // ==================== BOOTSTRAP ====================
  window.addEventListener('DOMContentLoaded', () => {
    ['settingKcal', 'settingProtein', 'settingFat', 'settingCarb'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => { targetsInputsDirty = true; });
    });
    ['apiKeyInput', 'geminiPromptInput'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => { geminiInputsDirty = true; });
    });
    document.getElementById('geminiModelSelect').addEventListener('change', () => { geminiInputsDirty = true; });
    document.getElementById('assistantMessages').addEventListener('input', (event) => {
      const input = event.target;
      const match = input && input.id && input.id.match(/^assistantActionGrams_(.+)_\d+$/);
      if (match) updateAssistantActionTotal(match[1]);
    });
    renderDiary();
    renderAssistantChat();
    const versionLabel = document.getElementById('appVersionLabel');
    if (versionLabel) versionLabel.textContent = `Версія ${APP_VERSION}`;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    const standaloneMode = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (standaloneMode) document.documentElement.classList.add('pwa-standalone');
    initializePwaUpdates();
    if (appState.gdrive.connected) syncGdrive('', true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && assistantActionActiveMessageId) closeAssistantActionModal();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateAssistantActionModalViewport);
    window.visualViewport.addEventListener('scroll', updateAssistantActionModalViewport);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const nk = toDateKey(new Date());
    if (nk !== TODAY_KEY) {
      if (selectedDateKey === TODAY_KEY) selectedDateKey = nk;
      TODAY_KEY = nk;
      renderDiary();
    }
    if (appState.gdrive.connected && appState.gdrive.autoSync) syncGdrive('', true);
  });
  window.addEventListener('online', () => scheduleSync());
