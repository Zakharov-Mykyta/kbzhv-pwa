  // ==================== PWA UPDATE ====================
  let pwaRegistration = null;
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
      pwaRegistration = pwaRegistration || await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await pwaRegistration.update();

      let worker = pwaRegistration.waiting;
      if (!worker && pwaRegistration.installing) {
        const installing = pwaRegistration.installing;
        worker = await new Promise(resolve => {
          const finish = () => {
            if (pwaRegistration.waiting) resolve(pwaRegistration.waiting);
            else if (installing.state === 'installed') resolve(installing);
            else if (installing.state === 'redundant') resolve(null);
          };
          installing.addEventListener('statechange', finish);
          finish();
        });
      }

      if (worker && worker.state === 'installed') {
        if (status) status.textContent = 'Застосовую оновлення…';
        const controllerChanged = new Promise(resolve => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        });
        worker.postMessage({ type: 'SKIP_WAITING' });
        await Promise.race([controllerChanged, new Promise(resolve => setTimeout(resolve, 10000))]);
        location.reload();
        return;
      }

      if (status) status.textContent = 'Застосунок актуальний.';
      showToast('Оновлень немає — у тебе остання версія', '✓');
    } catch (error) {
      console.error('PWA update failed:', error);
      if (status) status.textContent = 'Не вдалося перевірити оновлення.';
      showToast('Не вдалося оновити. Перевір інтернет', '⚠️');
    } finally {
      if (button) button.disabled = false;
    }
  }
