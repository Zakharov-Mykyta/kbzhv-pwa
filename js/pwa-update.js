// ==================== PWA UPDATE LIFECYCLE ====================
let pwaRegistration = null;
let pwaReloading = false;
let pwaLastUpdateCheck = 0;
let pwaAutoUpdateInitialized = false;

function waitForWorkerInstall(worker, timeoutMs = 25000) {
  if (!worker) return Promise.resolve(null);
  if (['installed', 'activated', 'redundant'].includes(worker.state)) return Promise.resolve(worker.state);
  return new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished || !['installed', 'activated', 'redundant'].includes(worker.state)) return;
      finished = true;
      clearTimeout(timer);
      worker.removeEventListener('statechange', finish);
      resolve(worker.state);
    };
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      worker.removeEventListener('statechange', finish);
      resolve(worker.state);
    }, timeoutMs);
    worker.addEventListener('statechange', finish);
    finish();
  });
}

function watchPwaRegistration(registration) {
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        const status = document.getElementById('pwaUpdateStatus');
        if (status) status.textContent = 'Оновлення завантажено…';
      }
    });
  });
}

async function checkPwaForUpdates(silent = true, force = false) {
  if (!('serviceWorker' in navigator)) return;
  const now = Date.now();
  if (!force && now - pwaLastUpdateCheck < 60000) return;
  pwaLastUpdateCheck = now;

  try {
    if (!pwaRegistration) {
      pwaRegistration = await navigator.serviceWorker.getRegistration('./')
        || await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      watchPwaRegistration(pwaRegistration);
    }
    await pwaRegistration.update();
    if (!silent) {
      const status = document.getElementById('pwaUpdateStatus');
      if (status && !pwaRegistration.installing && !pwaRegistration.waiting) {
        status.textContent = 'Застосунок актуальний.';
        showToast('Оновлень немає — у тебе остання версія', '✓');
      }
    }
  } catch (error) {
    console.warn('[Krykhta PWA] Update check failed:', error);
    if (!silent) {
      const status = document.getElementById('pwaUpdateStatus');
      if (status) status.textContent = 'Не вдалося перевірити оновлення.';
      showToast('Не вдалося перевірити оновлення. Перевір інтернет', '⚠️');
    }
  }
}

async function initializePwaUpdates() {
  if (pwaAutoUpdateInitialized || !('serviceWorker' in navigator)) return;
  pwaAutoUpdateInitialized = true;

  // Ignore the first controller assignment on a fresh install; reload only
  // when an already controlled app receives a genuinely newer worker.
  let hasSeenController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasSeenController) {
      hasSeenController = true;
      return;
    }
    if (pwaReloading) return;
    pwaReloading = true;
    const status = document.getElementById('pwaUpdateStatus');
    if (status) status.textContent = 'Оновлення застосовано. Перезапускаю…';
    window.location.reload();
  });

  try {
    pwaRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    watchPwaRegistration(pwaRegistration);
    // Check immediately after startup; the active app remains usable meanwhile.
    await checkPwaForUpdates(true, true);
  } catch (error) {
    console.warn('[Krykhta PWA] Service worker registration failed:', error);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkPwaForUpdates(true);
  });
  window.addEventListener('online', () => checkPwaForUpdates(true, true));
  // GitHub Pages deployments can complete after the app was opened; retry
  // periodically while foregrounded so the new worker is picked up promptly.
  window.setInterval(() => {
    if (!document.hidden) checkPwaForUpdates(true, true);
  }, 5 * 60 * 1000);
}

async function updatePwaApp() {
  const button = document.getElementById('updatePwaBtn');
  const status = document.getElementById('pwaUpdateStatus');
  const version = document.getElementById('appVersionLabel');
  if (version) version.textContent = `Версія ${APP_VERSION}`;
  if (!('serviceWorker' in navigator)) {
    if (status) status.textContent = 'Оновлення недоступне.';
    showToast('Оновлення недоступне в цьому браузері', '⚠️');
    return;
  }

  if (button) button.disabled = true;
  if (status) status.textContent = 'Перевіряю оновлення…';
  try {
    if (!pwaRegistration) {
      pwaRegistration = await navigator.serviceWorker.getRegistration('./')
        || await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      watchPwaRegistration(pwaRegistration);
    }

    const previousController = navigator.serviceWorker.controller;
    await pwaRegistration.update();
    if (pwaRegistration.installing) await waitForWorkerInstall(pwaRegistration.installing);
    if (pwaRegistration.waiting) pwaRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // controllerchange handles the reload. Do not issue a second reload here.
    if (previousController && navigator.serviceWorker.controller !== previousController) {
      if (status) status.textContent = 'Оновлення застосовується…';
      return;
    }

    if (pwaRegistration.installing || pwaRegistration.waiting) {
      if (status) status.textContent = 'Завантажую файли оновлення…';
      return;
    }

    if (status) status.textContent = 'Застосунок актуальний.';
    showToast('Оновлень немає — у тебе остання версія', '✓');
  } catch (error) {
    console.error('[Krykhta PWA] Manual update failed:', error);
    if (status) status.textContent = 'Не вдалося оновити. Перевір інтернет.';
    showToast('Не вдалося оновити. Перевір інтернет', '⚠️');
  } finally {
    if (button) button.disabled = false;
  }
}
