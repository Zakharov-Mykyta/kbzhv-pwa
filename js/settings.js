  // ==================== SETTINGS ====================
  function populateSettingsInputs() {
    if (!targetsInputsDirty) {
      document.getElementById('settingKcal').value = appState.targets.kcal;
      document.getElementById('settingProtein').value = appState.targets.protein;
      document.getElementById('settingFat').value = appState.targets.fat;
      document.getElementById('settingCarb').value = appState.targets.carb;
    }
    if (!geminiInputsDirty) {
      document.getElementById('apiKeyInput').value = appState.apiKey || '';
      document.getElementById('geminiPromptInput').value = appState.geminiPrompt || DEFAULT_GEMINI_PROMPT;
      renderGeminiModelsSelect(appState.geminiModel || '');
    }
    renderPlatesSettingsList();
    document.getElementById('gdriveClientId').value = appState.gdrive.clientId || '';
    updateGdriveUI();
    if (appState.gdrive.connected) gdLoadLib().catch(() => {});
  }

  function saveSettings() {
    appState.targets.kcal = Math.max(1000, parseInt(document.getElementById('settingKcal').value, 10) || 1800);
    appState.targets.protein = Math.max(40, parseInt(document.getElementById('settingProtein').value, 10) || 115);
    appState.targets.fat = Math.max(20, parseInt(document.getElementById('settingFat').value, 10) || 65);
    appState.targets.carb = Math.max(30, parseInt(document.getElementById('settingCarb').value, 10) || 170);
    targetsInputsDirty = false;

    persistState();
    renderDiary();
    showToast('Денні цілі збережено');
  }

  function setGeminiStatus(message, isError = false) {
    const status = document.getElementById('geminiStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `text-[11px] leading-relaxed ${isError ? 'text-[#FF9F0A]' : 'text-[#8E8E93]'}`;
  }

  function renderGeminiModelsSelect(preferred = '') {
    const select = document.getElementById('geminiModelSelect');
    if (!select) return;
    const current = preferred || select.value || appState.geminiModel || '';
    if (!geminiAvailableModels.length) {
      select.innerHTML = current
        ? `<option value="${esc(current)}">${esc(current)} · збережена модель</option>`
        : '<option value="">Завантаж моделі</option>';
      return;
    }
    select.innerHTML = geminiAvailableModels.map(model =>
      `<option value="${esc(model.id)}">${esc(model.label)} · ${esc(model.id)}</option>`
    ).join('');
    if (current && geminiAvailableModels.some(model => model.id === current)) select.value = current;
    else select.value = geminiAvailableModels[0].id;
  }

  function compareGeminiModels(a, b) {
    const aFlash = /flash/i.test(a.id) ? 1 : 0;
    const bFlash = /flash/i.test(b.id) ? 1 : 0;
    if (aFlash !== bFlash) return bFlash - aFlash;
    const aStable = !/(preview|experimental|exp)/i.test(a.id) ? 1 : 0;
    const bStable = !/(preview|experimental|exp)/i.test(b.id) ? 1 : 0;
    if (aStable !== bStable) return bStable - aStable;
    const aNums = (a.id.match(/\d+/g) || []).map(Number);
    const bNums = (b.id.match(/\d+/g) || []).map(Number);
    for (let i = 0; i < Math.max(aNums.length, bNums.length); i++) {
      const diff = (bNums[i] || 0) - (aNums[i] || 0);
      if (diff) return diff;
    }
    return a.id.localeCompare(b.id);
  }

  async function readGeminiApiError(response) {
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw);
      return parsed.error?.message || `HTTP ${response.status}`;
    } catch (e) {
      return raw.slice(0, 240) || `HTTP ${response.status}`;
    }
  }

  async function loadGeminiModels() {
    const key = document.getElementById('apiKeyInput').value.trim();
    const button = document.getElementById('loadGeminiModelsBtn');
    if (!key) {
      setGeminiStatus('Додай API-ключ.', true);
      showToast('Потрібен Gemini API-ключ', '⚠️');
      return;
    }

    button.disabled = true;
    button.textContent = 'Завантажую…';
    setGeminiStatus('Завантажую моделі…');

    try {
      const all = [];
      let pageToken = '';
      let pages = 0;
      do {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('pageSize', '1000');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const response = await fetch(url.toString(), { headers: { 'x-goog-api-key': key } });
        if (!response.ok) throw new Error(await readGeminiApiError(response));
        const data = await response.json();
        all.push(...(data.models || []));
        pageToken = data.nextPageToken || '';
        pages++;
      } while (pageToken && pages < 20);

      const excluded = /(embedding|tts|transcribe|live|robotics|image|computer|deep-research|veo|lyria)/i;
      const byId = new Map();
      all.forEach(model => {
        const id = model.baseModelId || String(model.name || '').replace(/^models\//, '');
        if (!id.startsWith('gemini-') || excluded.test(id)) return;
        if (!(model.supportedGenerationMethods || []).includes('generateContent')) return;
        if (!byId.has(id)) byId.set(id, {
          id,
          label: model.displayName || id,
          description: model.description || ''
        });
      });
      geminiAvailableModels = [...byId.values()].sort(compareGeminiModels);
      if (!geminiAvailableModels.length) {
        throw new Error('Ключ прийнято, але Gemini-моделі недоступні для цього ключа. Перевір доступ у Google AI Studio.');
      }

      const savedChoice = document.getElementById('geminiModelSelect').value || appState.geminiModel;
      renderGeminiModelsSelect(savedChoice);
      setGeminiStatus(`Ключ працює · ${geminiAvailableModels.length} моделей доступно.`);
      showToast(`Знайдено моделей: ${geminiAvailableModels.length}`, '✅');
    } catch (error) {
      const message = String(error.message || 'Невідома помилка').replace(/\s+/g, ' ').slice(0, 220);
      setGeminiStatus(`Не вдалося завантажити моделі: ${message}`, true);
      showToast('Не вдалося перевірити Gemini', '⚠️');
    } finally {
      button.disabled = false;
      button.textContent = 'Завантажити моделі';
    }
  }

  function saveGeminiSettings() {
    const key = document.getElementById('apiKeyInput').value.trim();
    const model = document.getElementById('geminiModelSelect').value;
    const prompt = document.getElementById('geminiPromptInput').value.trim();
    if (key && !model) {
      showToast('Спочатку завантаж і вибери модель', '⚠️');
      return;
    }
    if (!prompt) {
      showToast('Інструкція для ШІ не може бути порожньою', '⚠️');
      return;
    }
    appState.apiKey = key;
    appState.geminiModel = model || '';
    appState.geminiPrompt = prompt;
    geminiInputsDirty = false;
    persistState(true);
    setGeminiStatus(key ? 'Збережено.' : 'Локальний режим.');
    showToast('Налаштування ШІ збережено', '✨');
  }

  async function testGeminiConnection() {
    const key = document.getElementById('apiKeyInput').value.trim();
    const model = document.getElementById('geminiModelSelect').value || appState.geminiModel;
    const button = document.getElementById('testGeminiBtn');
    if (!key || !model) {
      setGeminiStatus('Додай ключ і вибери модель.', true);
      showToast('Немає ключа або моделі', '⚠️');
      return;
    }
    button.disabled = true;
    button.textContent = 'Перевіряю…';
    setGeminiStatus('Перевіряю з’єднання…');
    try {
      const raw = await geminiRequest(model, key,
        'Ти перевіряєш з’єднання. Відповідай тільки коротким JSON-об’єктом.',
        'Поверни JSON: {"status":"ok"}');
      JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
      setGeminiStatus('З’єднання працює.');
      showToast('Gemini працює', '✅');
    } catch (error) {
      const message = String(error.message || 'Невідома помилка').replace(/\s+/g, ' ').slice(0, 220);
      setGeminiStatus(`Тест не пройшов: ${message}`, true);
      showToast('Gemini не пройшов тест', '⚠️');
    } finally {
      button.disabled = false;
      button.textContent = "Перевірити з’єднання";
    }
  }

  function toggleApiKeyVisibility() {
    const inp = document.getElementById('apiKeyInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  function exportDataJson() {
    const blob = new Blob([JSON.stringify({ ...appState, apiKey: '', gdrive: undefined }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kbzhv-backup-${TODAY_KEY}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('JSON-копію завантажено', '📤');
  }

  function clearAllData() {
    if (!confirm('Видалити всі записи та налаштування? Дію не можна скасувати.')) return;
    const tomb = { ...appState.tombstones }, g = appState.gdrive;
    Object.values(appState.logs).flat().forEach(i => { tomb[i.id] = Date.now(); });
    appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
    appState.tombstones = tomb; appState.gdrive = g;
    targetsInputsDirty = false; geminiInputsDirty = false;
    selectedDateKey = TODAY_KEY;
    persistState();
    populateSettingsInputs();
    renderDiary();
    showToast('Дані видалено', '🗑️');
  }

  function importDataJson(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const p = JSON.parse(rd.result);
        if (!p || typeof p.logs !== 'object' || !p.targets) throw new Error('bad');
        if (!confirm('Замінити поточні дані даними з файлу?')) return;
        const { reminders: legacyReminders, ...backupData } = p;
        appState = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), ...backupData, apiKey: appState.apiKey, gdrive: appState.gdrive };
        targetsInputsDirty = false; geminiInputsDirty = false;
        persistState(); populateSettingsInputs(); renderDiary();
        showToast('Дані відновлено', '📥');
      } catch (e) { showToast('Невірний файл копії', '⚠️'); }
    };
    rd.readAsText(f);
    ev.target.value = '';
  }

  async function shareBackup() {
    const file = new File([JSON.stringify({ ...appState, apiKey: '', gdrive: undefined }, null, 2)], `kbzhv-backup-${TODAY_KEY}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'КБЖВ — резервна копія' }); } catch (e) {}
    } else exportDataJson();
  }
