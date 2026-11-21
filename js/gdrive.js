  // ==================== GOOGLE DRIVE SYNC (appDataFolder) ====================
  const GD_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const GD_FILE = 'kbzhv-data.json';
  let _gdToken = null, _gdExp = 0, _syncTimer = null, _syncing = false;

  function gdLoadLib() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const el = document.createElement('script');
      el.src = 'https://accounts.google.com/gsi/client';
      el.onload = () => res();
      el.onerror = () => rej(new Error('lib'));
      document.head.appendChild(el);
    });
  }

  async function gdToken(prompt) {
    if (_gdToken && Date.now() < _gdExp - 60000) return _gdToken;
    await gdLoadLib();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: appState.gdrive.clientId,
        scope: GD_SCOPE,
        callback: r => {
          if (r.error || !r.access_token) return reject(new Error(r.error || 'auth'));
          _gdToken = r.access_token; _gdExp = Date.now() + (r.expires_in || 3600) * 1000;
          resolve(_gdToken);
        },
        error_callback: e => reject(new Error((e && e.type) || 'auth'))
      });
      client.requestAccessToken({ prompt: prompt || '' });
    });
  }

  async function gdApi(url, opt = {}, prompt = '') {
    const t = await gdToken(prompt);
    const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401) { _gdToken = null; throw new Error('auth'); }
    if (!r.ok) throw new Error('http ' + r.status);
    return r;
  }

  function syncPayload() {
    const { targets, plates, calorieDisplayMode, logs, tombstones, settingsMod } = appState;
    return { v: 2, targets, plates, calorieDisplayMode, logs, tombstones, settingsMod };
  }

  function mergeRemote(rm) {
    const ts = { ...(rm.tombstones || {}) };
    for (const k in appState.tombstones) ts[k] = Math.max(ts[k] || 0, appState.tombstones[k]);
    const cutoff = Date.now() - 90 * 864e5;
    for (const k in ts) if (ts[k] < cutoff) delete ts[k];

    const dates = new Set([...Object.keys(appState.logs), ...Object.keys(rm.logs || {})]);
    const out = {};
    dates.forEach(d => {
      const m = new Map();
      [...((rm.logs || {})[d] || []), ...(appState.logs[d] || [])].forEach(it => {
        const o = m.get(it.id);
        if (!o || (it.mod || 0) >= (o.mod || 0)) m.set(it.id, it);
      });
      const arr = [...m.values()].filter(it => !(ts[it.id] > (it.mod || 0)));
      arr.sort((a, b) => String(a.time).localeCompare(String(b.time)));
      if (arr.length) out[d] = arr;
    });
    appState.logs = out;
    appState.tombstones = ts;

    if ((rm.settingsMod || 0) > (appState.settingsMod || 0)) {
      if (rm.targets) appState.targets = rm.targets;
      if (rm.plates) appState.plates = rm.plates;
      if (rm.calorieDisplayMode) appState.calorieDisplayMode = rm.calorieDisplayMode;
      appState.settingsMod = rm.settingsMod;
      if (!appState.plates.some(p => p.id === appState.selectedPlateId)) appState.selectedPlateId = null;
      _settingsHash = settingsHash();
    }
  }

  async function syncGdrive(prompt = '', silent = true) {
    const g = appState.gdrive;
    if (!g.connected || _syncing) return;
    if (!navigator.onLine) { if (!silent) showToast('Немає інтернету', '⚠️'); return; }
    _syncing = true; setGdStatus('Синхронізація…');
    try {
      const q = encodeURIComponent(`name='${GD_FILE}'`);
      const list = await (await gdApi(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`, {}, prompt)).json();
      const id = list.files && list.files[0] && list.files[0].id;
      if (id) mergeRemote(await (await gdApi(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json());
      const body = JSON.stringify(syncPayload());
      if (id) {
        await gdApi(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      } else {
        const b = 'kbzhv' + Date.now();
        const mp = `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: GD_FILE, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
        await gdApi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: mp });
      }
      g.lastSync = new Date().toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      g.needsAuth = false;
      persistState(true); renderDiary();
      if (!silent) showToast('Синхронізовано з Google Диском', '☁️');
    } catch (e) {
      g.needsAuth = true; persistState(true);
      if (!silent) showToast('Не вдалося синхронізувати. Перевір вхід', '⚠️');
    } finally {
      _syncing = false; updateGdriveUI();
    }
  }

  function scheduleSync() {
    const g = appState.gdrive;
    if (!g.connected || !g.autoSync) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => syncGdrive('', true), 4000);
  }

  async function connectGdrive() {
    const id = document.getElementById('gdriveClientId').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) { showToast('Вкажи коректний Client ID', '⚠️'); return; }
    const g = appState.gdrive;
    g.clientId = id; g.connected = true; g.needsAuth = false;
    _gdToken = null;
    persistState(true); updateGdriveUI();
    await syncGdrive('consent', false);
    if (g.needsAuth) { g.connected = false; persistState(true); updateGdriveUI(); }
  }

  function disconnectGdrive() {
    try { if (_gdToken && window.google) google.accounts.oauth2.revoke(_gdToken, () => {}); } catch (e) {}
    _gdToken = null;
    appState.gdrive.connected = false;
    persistState(true); updateGdriveUI();
    showToast('Google Диск відключено', '☁️');
  }

  function toggleGdriveAutoSync() {
    appState.gdrive.autoSync = !appState.gdrive.autoSync;
    persistState(true); updateGdriveUI();
  }

  function setGdStatus(t) { const e = document.getElementById('gdriveStatus'); if (e) e.textContent = t; }

  function updateGdriveUI() {
    const g = appState.gdrive;
    const setup = document.getElementById('gdriveSetupView');
    if (!setup) return;
    setup.classList.toggle('hidden', g.connected);
    document.getElementById('gdriveConnectedView').classList.toggle('hidden', !g.connected);
    setGdStatus(!g.connected ? 'Не підключено'
      : g.needsAuth ? 'Потрібен повторний вхід'
      : `Остання синхронізація: ${g.lastSync || 'ще не було'}`);
    const b = document.getElementById('gdriveAutoToggle');
    if (b) b.className = g.autoSync ? 'w-[46px] h-[28px] rounded-full bg-[#D8B98A] p-[2px] transition-colors flex items-center justify-end' : 'w-[46px] h-[28px] rounded-full bg-[#2C2C2E] p-[2px] transition-colors flex items-center justify-start';
  }
