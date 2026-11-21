  // ==================== BARCODE SCANNER / OPEN FOOD FACTS ====================
  function setBarcodeStatus(message, kind = '') {
    const el = document.getElementById('barcodeStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `barcode-status mb-3${kind ? ' ' + kind : ''}`;
  }

  function loadBarcodeLibrary() {
    if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
    if (barcodeLibraryPromise) return barcodeLibraryPromise;
    barcodeLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Html5Qrcode) resolve(window.Html5Qrcode);
        else { barcodeLibraryPromise = null; reject(new Error('Бібліотека сканера не завантажилася.')); }
      };
      script.onerror = () => {
        barcodeLibraryPromise = null;
        script.remove();
        reject(new Error('Не вдалося завантажити сканер. Перевір підключення до інтернету.'));
      };
      document.head.appendChild(script);
    });
    return barcodeLibraryPromise;
  }

  function releaseBarcodeVideoTracks() {
    const reader = document.getElementById('barcodeReader');
    const streams = new Set();
    if (barcodeActiveStream) streams.add(barcodeActiveStream);
    reader?.querySelectorAll('video').forEach(video => {
      if (video.srcObject && typeof video.srcObject.getTracks === 'function') streams.add(video.srcObject);
      try { video.pause(); } catch (ignored) {}
    });
    streams.forEach(stream => {
      if (!stream || typeof stream.getTracks !== 'function') return;
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch (ignored) {}
      });
    });
    reader?.querySelectorAll('video').forEach(video => {
      try { video.srcObject = null; } catch (ignored) {}
    });
    barcodeActiveStream = null;
  }

  async function disposeBarcodeScanner(scanner) {
    const reader = document.getElementById('barcodeReader');
    const video = reader?.querySelector('video');
    if (video?.srcObject) barcodeActiveStream = video.srcObject;
    if (scanner) {
      try { if (scanner.isScanning) await scanner.stop(); } catch (ignored) {}
    }
    // Stop the actual MediaStream before html5-qrcode clears/removes its video node.
    releaseBarcodeVideoTracks();
    if (scanner) {
      try { scanner.clear(); } catch (ignored) {}
    }
    releaseBarcodeVideoTracks();
  }

  async function startBarcodeScanner(session) {
    let scanner = null;
    let startPromise = null;
    try {
      const Scanner = await loadBarcodeLibrary();
      const sheet = document.getElementById('barcodeSheet');
      if (session !== barcodeSessionId || !sheet?.classList.contains('visible') || document.hidden) return;
      const reader = document.getElementById('barcodeReader');
      if (reader) reader.innerHTML = '';
      const formats = window.Html5QrcodeSupportedFormats;
      const supported = formats ? [formats.EAN_13, formats.EAN_8, formats.UPC_A, formats.UPC_E, formats.CODE_128, formats.ITF].filter(v => v !== undefined) : undefined;

      scanner = new Scanner('barcodeReader', { formatsToSupport: supported, verbose: false });
      barcodeScannerInstance = scanner;
      barcodeScannerStarting = true;
      startPromise = scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 270, height: 140 }, aspectRatio: 1.7, rememberLastUsedCamera: false },
        code => handleBarcodeDetected(code),
        () => {}
      );
      barcodeStartPromise = startPromise;
      await startPromise;

      if (barcodeStartPromise === startPromise) barcodeStartPromise = null;
      const video = reader?.querySelector('video');
      if (video?.srcObject) barcodeActiveStream = video.srcObject;
      if (session !== barcodeSessionId || !sheet.classList.contains('visible') || document.hidden) {
        if (barcodeScannerInstance === scanner) {
          await stopBarcodeScanner();
        } else if (barcodeStopPromise) {
          await barcodeStopPromise;
        }
        return;
      }
      barcodeScannerStarting = false;
      setBarcodeStatus('Наведи штрихкод у рамку.');
    } catch (error) {
      if (barcodeStartPromise === startPromise) barcodeStartPromise = null;
      if (barcodeScannerInstance === scanner && scanner) {
        await stopBarcodeScanner();
      } else if (barcodeStopPromise) {
        await barcodeStopPromise;
      } else if (scanner) {
        await disposeBarcodeScanner(scanner);
      }
      if (session !== barcodeSessionId || document.hidden) return;
      barcodeScannerStarting = false;
      setBarcodeStatus(`${error.message || 'Не вдалося запустити камеру.'} Перевір HTTPS або введи код вручну.`, 'error');
    }
  }

  async function stopBarcodeScanner() {
    if (barcodeStopPromise) return barcodeStopPromise;
    const scanner = barcodeScannerInstance;
    const pendingStart = barcodeStartPromise;
    barcodeScannerInstance = null;
    barcodeStartPromise = null;
    barcodeScannerStarting = false;
    barcodeStopPromise = (async () => {
      if (pendingStart) {
        try { await pendingStart; } catch (ignored) {}
      }
      await disposeBarcodeScanner(scanner);
      const reader = document.getElementById('barcodeReader');
      if (reader) reader.innerHTML = '';
    })().finally(() => { barcodeStopPromise = null; });
    return barcodeStopPromise;
  }

  async function openBarcodeSheet() {
    const sheet = document.getElementById('barcodeSheet');
    if (sheet.classList.contains('open') && (barcodeScannerStarting || barcodeScannerInstance)) return;
    const session = ++barcodeSessionId;
    barcodeResumePending = false;
    barcodeResultHandled = false;
    scannedProduct = null;
    document.getElementById('barcodeProductPanel').classList.add('hidden');
    document.getElementById('barcodeManualInput').value = '';
    document.getElementById('barcodeServingGrams').value = 100;
    document.getElementById('barcodeTime').value = getCurrentTimeStr();
    document.documentElement.classList.add('barcode-scanner-open');
    setBarcodeStatus('Підключаю камеру…');
    document.getElementById('barcodeBackdrop').classList.add('visible');
    sheet.classList.add('visible');
    requestAnimationFrame(() => {
      if (session !== barcodeSessionId) return;
      document.getElementById('barcodeBackdrop').classList.add('open');
      sheet.classList.add('open');
    });

    await stopBarcodeScanner();
    if (session !== barcodeSessionId || !sheet.classList.contains('visible')) return;
    await startBarcodeScanner(session);
  }

  async function closeBarcodeSheet() {
    const closingSession = ++barcodeSessionId;
    barcodeResumePending = false;
    document.getElementById('barcodeBackdrop').classList.remove('open');
    document.getElementById('barcodeSheet').classList.remove('open');
    await stopBarcodeScanner();
    setTimeout(() => {
      if (closingSession !== barcodeSessionId || document.getElementById('barcodeSheet').classList.contains('open')) return;
      document.getElementById('barcodeBackdrop').classList.remove('visible');
      document.getElementById('barcodeSheet').classList.remove('visible');
      document.documentElement.classList.remove('barcode-scanner-open');
    }, 340);
  }

  async function handleBarcodeDetected(code) {
    if (barcodeScannerStarting || !barcodeScannerInstance || barcodeResultHandled) return;
    const normalized = String(code || '').replace(/\s+/g, '');
    if (!/^\d{8,14}$/.test(normalized)) return;
    barcodeResultHandled = true;
    barcodeScannerStarting = false;
    await stopBarcodeScanner();
    const reader = document.getElementById('barcodeReader');
    if (reader) reader.innerHTML = '';
    await lookupOpenFoodFacts(normalized);
  }

  function suspendMediaForBackground() {
    cancelVoiceRecognitionForBackground();
    const sheet = document.getElementById('barcodeSheet');
    const scannerWasActive = Boolean(barcodeScannerStarting || barcodeScannerInstance || barcodeStartPromise);
    if (sheet?.classList.contains('open') && scannerWasActive) {
      barcodeResumePending = true;
      ++barcodeSessionId;
      stopBarcodeScanner();
    }
  }

  async function resumeBarcodeScannerAfterForeground() {
    if (!barcodeResumePending || document.hidden) return;
    barcodeResumePending = false;
    const sheet = document.getElementById('barcodeSheet');
    if (!sheet?.classList.contains('open')) return;
    const session = ++barcodeSessionId;
    setBarcodeStatus('Повторно підключаю камеру…');
    await stopBarcodeScanner();
    if (session !== barcodeSessionId || document.hidden || !sheet.classList.contains('open')) return;
    await startBarcodeScanner(session);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendMediaForBackground();
    else resumeBarcodeScannerAfterForeground();
  });
  window.addEventListener('pagehide', suspendMediaForBackground);
  window.addEventListener('pageshow', () => {
    if (!document.hidden) resumeBarcodeScannerAfterForeground();
  });

  async function lookupBarcodeManually() {
    const code = document.getElementById('barcodeManualInput').value.trim().replace(/\s+/g, '');
    if (!/^\d{8,14}$/.test(code)) {
      setBarcodeStatus('Введи коректний штрихкод довжиною 8–14 цифр.', 'error');
      return;
    }
    await lookupOpenFoodFacts(code);
  }

  async function lookupOpenFoodFacts(code) {
    setBarcodeStatus('Шукаю продукт…');
    document.getElementById('barcodeProductPanel').classList.add('hidden');
    try {
      const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=code,status,product_name,product_name_uk,product_name_en,brands,quantity,image_front_small_url,nutriments&lc=uk&cc=ua`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Сервіс продуктів відповів HTTP ${response.status}.`);
      const data = await response.json();
      if (!['success', 'success_with_warnings'].includes(data.status) || !data.product) throw new Error('Продукт не знайдений у базі. Можеш додати його вручну через поле опису їжі.');
      const product = data.product;
      const n = product.nutriments || {};
      const kcal = Number(n['energy-kcal_100g'] ?? (Number(n['energy-kj_100g']) / 4.184));
      const protein = Number(n.proteins_100g);
      const fat = Number(n.fat_100g);
      const carb = Number(n.carbohydrates_100g);
      if (![kcal, protein, fat, carb].every(v => Number.isFinite(v) && v >= 0)) throw new Error('У картці продукту немає повних даних КБЖВ на 100 г.');
      scannedProduct = {
        code,
        name: String(product.product_name_uk || product.product_name || product.product_name_en || '').trim() || `Продукт ${code}`,
        brand: String(product.brands || '').trim(),
        image: String(product.image_front_small_url || ''),
        kcal, protein, fat, carb
      };
      document.getElementById('barcodeProductName').textContent = scannedProduct.name;
      document.getElementById('barcodeProductBrand').textContent = scannedProduct.brand;
      document.getElementById('barcodeProductCode').textContent = `Штрихкод · ${code}`;
      const image = document.getElementById('barcodeProductImage');
      if (scannedProduct.image) image.src = scannedProduct.image; else image.removeAttribute('src');
      document.getElementById('barcodeKcal100').textContent = Math.round(kcal);
      document.getElementById('barcodeProtein100').textContent = `${protein.toFixed(1)} г`;
      document.getElementById('barcodeFat100').textContent = `${fat.toFixed(1)} г`;
      document.getElementById('barcodeCarb100').textContent = `${carb.toFixed(1)} г`;
      document.getElementById('barcodeMeal').value = detectMealCategory('');
      document.getElementById('barcodeTime').value = getCurrentTimeStr();
      document.getElementById('barcodeProductPanel').classList.remove('hidden');
      updateBarcodeServingPreview();
      setBarcodeStatus('Перевір дані та порцію.', 'success');
    } catch (error) {
      setBarcodeStatus(error.message || 'Не вдалося отримати дані продукту.', 'error');
    }
  }

  function updateBarcodeServingPreview() {
    if (!scannedProduct) return;
    const grams = Math.max(1, Number(document.getElementById('barcodeServingGrams').value) || 1);
    document.getElementById('barcodeServingKcal').textContent = `${Math.round(scannedProduct.kcal * grams / 100)} ккал`;
  }

  function addScannedProduct() {
    if (!scannedProduct) return;
    const grams = Math.max(1, Math.min(5000, Number(document.getElementById('barcodeServingGrams').value) || 100));
    const time = document.getElementById('barcodeTime').value || getCurrentTimeStr();
    const meal = document.getElementById('barcodeMeal').value;
    if (!appState.logs[selectedDateKey]) appState.logs[selectedDateKey] = [];
    appState.logs[selectedDateKey].push({
      id: 'barcode_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      mod: Date.now(), meal, time, name: scannedProduct.name, grams,
      kcal: Math.round(scannedProduct.kcal * grams / 100),
      protein: Math.round(scannedProduct.protein * grams / 100 * 10) / 10,
      fat: Math.round(scannedProduct.fat * grams / 100 * 10) / 10,
      carb: Math.round(scannedProduct.carb * grams / 100 * 10) / 10,
      source: 'barcode', barcode: scannedProduct.code
    });
    persistState();
    renderDiary();
    closeBarcodeSheet();
    showToast('Продукт додано зі штрихкоду', '✅');
  }

  document.getElementById('barcodeOpenBtn').addEventListener('click', () => { closeAttachmentMenu(); openBarcodeSheet(); });
  document.getElementById('barcodeServingGrams').addEventListener('input', updateBarcodeServingPreview);
