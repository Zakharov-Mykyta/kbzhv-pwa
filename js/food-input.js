  // ==================== QUICK ADD & VOICE ====================
  function quickAddItem(name, grams, kcal, protein, fat, carb, meal) {
    if (!appState.logs[selectedDateKey]) appState.logs[selectedDateKey] = [];
    appState.logs[selectedDateKey].push({
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      mod: Date.now(),
      meal,
      time: getCurrentTimeStr(),
      name,
      grams,
      kcal,
      protein,
      fat,
      carb
    });
    persistState();
    renderDiary();
    showToast(`Додано: ${name} (+${kcal} ккал)`);
  }

  function prefillMealHint(mealId) {
    const map = { breakfast: 'На сніданок ', lunch: 'На обід ', dinner: 'На вечерю ', snack: 'Перекус ' };
    switchTab('assistant');
    const input = document.getElementById('foodPromptInput');
    input.value = map[mealId] || '';
    updateComposerActions();
    input.focus();
  }

  function updateComposerActions() {
    const input = document.getElementById('foodPromptInput');
    const mic = document.getElementById('micBtn');
    const send = document.getElementById('foodSubmitBtn');
    if (!input || !mic || !send) return;
    const isRecording = mic.classList.contains('is-recording');
    const hasContent = Boolean(input.value.trim()) || Boolean(pendingFoodImage);
    mic.hidden = hasContent && !isRecording;
    send.hidden = !hasContent || isRecording;
  }

  const attachmentMenu = document.getElementById('attachmentMenu');
  const attachmentMenuBtn = document.getElementById('attachmentMenuBtn');
  function closeAttachmentMenu() {
    attachmentMenu.classList.add('hidden');
    attachmentMenuBtn.classList.remove('is-open');
    attachmentMenuBtn.setAttribute('aria-expanded', 'false');
  }
  attachmentMenuBtn.addEventListener('click', () => {
    const willOpen = attachmentMenu.classList.contains('hidden');
    attachmentMenu.classList.toggle('hidden', !willOpen);
    attachmentMenuBtn.classList.toggle('is-open', willOpen);
    attachmentMenuBtn.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', event => {
    if (!attachmentMenu.contains(event.target) && !attachmentMenuBtn.contains(event.target)) closeAttachmentMenu();
  });
  document.getElementById('foodPromptInput').addEventListener('input', updateComposerActions);
  updateComposerActions();

  let _rec = null;
  let _recCleanupTimer = null;
  function resetVoiceRecognition(rec) {
    if (rec && _rec !== rec) return;
    _rec = null;
    if (_recCleanupTimer) { clearTimeout(_recCleanupTimer); _recCleanupTimer = null; }
    const banner = document.getElementById('voiceBanner');
    const mic = document.getElementById('micBtn');
    banner?.classList.add('hidden');
    mic?.classList.remove('is-recording');
    mic?.setAttribute('aria-pressed', 'false');
    updateComposerActions();
  }
  function scheduleVoiceCleanup(rec, delay = 1800) {
    if (_rec !== rec) return;
    if (_recCleanupTimer) clearTimeout(_recCleanupTimer);
    _recCleanupTimer = setTimeout(() => {
      if (_rec !== rec) return;
      // Some iOS standalone sessions fail to dispatch `end` after stop/abort.
      // Release the recognizer anyway so the next tap always creates a fresh session.
      try { rec.abort(); } catch (ignored) {}
      resetVoiceRecognition(rec);
    }, delay);
  }
  function cancelVoiceRecognitionForBackground() {
    const rec = _rec;
    if (!rec) return;
    // Clear our state before aborting so late WebKit callbacks cannot touch a new session.
    resetVoiceRecognition(rec);
    try { rec.abort(); } catch (ignored) {}
  }
  document.getElementById('micBtn').addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const banner = document.getElementById('voiceBanner');
    const input = document.getElementById('foodPromptInput');
    const mic = document.getElementById('micBtn');
    if (!SR) { showToast('Голос недоступний. Скористайся 🎤 на клавіатурі', '🎙'); input.focus(); return; }
    if (_rec) {
      const activeRec = _rec;
      try {
        activeRec.stop();
        scheduleVoiceCleanup(activeRec, 1800);
      } catch (error) {
        try { activeRec.abort(); } catch (ignored) {}
        resetVoiceRecognition(activeRec);
      }
      return;
    }
    let rec;
    try {
      rec = new SR();
      _rec = rec;
      rec.lang = 'uk-UA';
      rec.interimResults = true;
      rec.continuous = false;
      const base = input.value ? input.value.trim() + ' ' : '';
      rec.onstart = () => {
        if (_rec !== rec) return;
        if (_recCleanupTimer) { clearTimeout(_recCleanupTimer); _recCleanupTimer = null; }
        banner.classList.remove('hidden');
        mic.classList.add('is-recording');
        mic.setAttribute('aria-pressed', 'true');
      };
      rec.onresult = event => {
        if (_rec !== rec) return;
        input.value = base + Array.from(event.results).map(result => result[0].transcript).join(' ');
        updateComposerActions();
      };
      rec.onerror = event => {
        if (_rec !== rec) return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          showToast('Немає доступу до мікрофона. Перевір дозвіл для сайту в налаштуваннях iPhone.', '⚠️');
        } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
          showToast('Голосове введення перервано. Спробуй ще раз.', '⚠️');
        }
        scheduleVoiceCleanup(rec, 700);
      };
      rec.onend = () => resetVoiceRecognition(rec);
      rec.start();
    } catch (error) {
      if (rec) {
        try { rec.abort(); } catch (ignored) {}
        resetVoiceRecognition(rec);
      } else {
        banner.classList.add('hidden');
        mic.classList.remove('is-recording');
        mic.setAttribute('aria-pressed', 'false');
      }
      showToast('Не вдалося запустити голосове введення. Спробуй ще раз.', '⚠️');
    }
  });

  // ==================== MULTI-ITEM UKRAINIAN PARSER ====================
  const FOOD_DB = [
    { keys: ['борщ'], name: 'Борщ український', defaultG: 350, share: 1.0, per100: { kcal: 58, p: 3.2, f: 2.8, c: 5.2 } },
    { keys: ['хліб', 'тост'], name: 'Хліб / тости', defaultG: 50, share: 0.25, per100: { kcal: 255, p: 8.0, f: 2.5, c: 49.0 } },
    { keys: ['гречк'], name: 'Гречка відварна', defaultG: 200, share: 0.55, per100: { kcal: 110, p: 4.2, f: 1.1, c: 21.3 } },
    { keys: ['булгур'], name: 'Булгур відварний', defaultG: 200, share: 0.55, per100: { kcal: 115, p: 3.8, f: 0.8, c: 23.5 } },
    { keys: ['рис'], name: 'Рис відварний', defaultG: 200, share: 0.55, per100: { kcal: 130, p: 2.7, f: 0.3, c: 28.0 } },
    { keys: ['вівсян'], name: 'Вівсянка на воді', defaultG: 250, share: 0.8, per100: { kcal: 88, p: 3.0, f: 1.7, c: 15.0 } },
    { keys: ['філе', 'курк', 'куряч'], name: 'Куряче філе варене', defaultG: 180, share: 0.45, per100: { kcal: 165, p: 23.0, f: 3.6, c: 0.0 } },
    { keys: ['котлет'], name: 'Курячі котлети', defaultG: 160, share: 0.45, per100: { kcal: 195, p: 17.5, f: 10.5, c: 7.0 } },
    { keys: ['сосиск'], name: 'Сосиски відварні', defaultG: 120, share: 0.35, per100: { kcal: 260, p: 11.0, f: 23.0, c: 2.0 } },
    { keys: ['яйц', 'яєчн'], name: 'Яйця курячі', defaultG: 120, share: 0.5, per100: { kcal: 155, p: 12.6, f: 10.6, c: 0.7 } },
    { keys: ['сир', 'творог'], name: 'Сир кисломолочний 5%', defaultG: 200, share: 0.85, per100: { kcal: 121, p: 16.0, f: 5.0, c: 3.0 } },
    { keys: ['банан'], name: 'Банан', defaultG: 130, share: 0.5, per100: { kcal: 89, p: 1.1, f: 0.3, c: 22.8 } },
    { keys: ['яблук'], name: 'Яблуко', defaultG: 200, share: 1.0, per100: { kcal: 52, p: 0.4, f: 0.2, c: 12.6 } },
    { keys: ['чай'], name: 'Чай з цукром', defaultG: 250, share: 1.0, per100: { kcal: 12, p: 0.0, f: 0.0, c: 3.0 } },
    { keys: ['кав', 'лате', 'капуч'], name: 'Кава з молоком', defaultG: 220, share: 1.0, per100: { kcal: 32, p: 1.5, f: 1.5, c: 3.0 } },
    { keys: ['мед'], name: 'Мед натуральний', defaultG: 15, share: 0.15, per100: { kcal: 304, p: 0.3, f: 0.0, c: 82.4 } },
    { keys: ['салат', 'огір', 'помідор'], name: 'Салат зі свіжих овочів', defaultG: 150, share: 0.35, per100: { kcal: 45, p: 1.1, f: 2.5, c: 4.5 } },
    { keys: ['картопл', 'пюре'], name: 'Картопля відварна', defaultG: 200, share: 0.55, per100: { kcal: 95, p: 2.0, f: 2.2, c: 17.0 } }
  ];

  function detectMealCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('снідан')) return 'breakfast';
    if (lower.includes('обід')) return 'lunch';
    if (lower.includes('вечер')) return 'dinner';
    if (lower.includes('перекус') || lower.includes('чай') || lower.includes('кав')) return 'snack';
    const hr = new Date().getHours();
    if (hr < 11) return 'breakfast';
    if (hr < 16) return 'lunch';
    if (hr < 21) return 'dinner';
    return 'snack';
  }

  function offlineSmartParse(promptText, activePlate = null) {
    const lower = promptText.toLowerCase();
    const meal = detectMealCategory(lower);

    const chunks = lower.split(/(?:,|\s+із\s+|\s+зі\s+|\s+з\s+|\s+і\s+|\s+та\s+|\s+плюс\s+)/);
    const foundItems = [];

    chunks.forEach(chunk => {
      const matched = FOOD_DB.find(entry => entry.keys.some(k => chunk.includes(k)));
      if (matched) {
        const gramMatch = chunk.match(/(\d{2,4})\s*(?:г|гр|мл)/);
        const pieceMatch = chunk.match(/(?:^|\s)(\d)\s*(?:шт|шмат|яйц|котлет)/);
        let explicitGrams = null;
        if (gramMatch) explicitGrams = parseInt(gramMatch[1], 10);
        else if (pieceMatch) {
          const cnt = parseInt(pieceMatch[1], 10);
          explicitGrams = matched.keys.includes('хліб') ? cnt * 28 : cnt * 60;
        }
        foundItems.push({ matched, explicitGrams });
      }
    });

    if (foundItems.length === 0) {
      const cleanName = promptText.replace(/^(на\s+(сніданок|обід|вечерю)|перекус)\s*/i, '').trim();
      const gramMatch = promptText.match(/(\d{2,4})\s*(?:г|гр|мл)/);
      const rawGrams = gramMatch ? parseInt(gramMatch[1], 10) : 200;
      let netGrams = rawGrams;
      let plateNote = null;

      if (activePlate && rawGrams > activePlate.weight + 20) {
        netGrams = rawGrams - activePlate.weight;
        plateNote = `${rawGrams}г − ${activePlate.weight}г`;
      }

      return [{
        meal,
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        grams: netGrams,
        plateId: plateNote ? activePlate.id : null,
        grossGrams: plateNote ? rawGrams : null,
        plateNote,
        kcal: Math.round(netGrams * 1.45),
        protein: Math.round(netGrams * 0.08 * 10) / 10,
        fat: Math.round(netGrams * 0.05 * 10) / 10,
        carb: Math.round(netGrams * 0.16 * 10) / 10
      }];
    }

    const totalWeightMatch = lower.match(/(\d{2,4})\s*(?:г|гр|мл)/);
    const itemsWithNoExplicit = foundItems.filter(x => x.explicitGrams === null);
    const itemsWithExplicit = foundItems.filter(x => x.explicitGrams !== null);

    if (foundItems.length > 1 && itemsWithExplicit.length === 1 && itemsWithNoExplicit.length >= 1 && totalWeightMatch) {
      let totalGross = itemsWithExplicit[0].explicitGrams;
      let netPool = totalGross;
      let appliedPlate = null;

      if (activePlate && totalGross > activePlate.weight + 30) {
        netPool = totalGross - activePlate.weight;
        appliedPlate = activePlate;
      }

      const shareSum = foundItems.reduce((s, x) => s + x.matched.share, 0);
      return foundItems.map((entry, idx) => {
        const portionGrams = Math.max(15, Math.round(netPool * (entry.matched.share / shareSum)));
        const factor = portionGrams / 100;
        return {
          meal,
          name: entry.matched.name,
          grams: portionGrams,
          plateId: idx === 0 && appliedPlate ? appliedPlate.id : null,
          grossGrams: idx === 0 && appliedPlate ? totalGross : null,
          plateNote: idx === 0 && appliedPlate ? `посуд −${appliedPlate.weight}г` : null,
          kcal: Math.round(entry.matched.per100.kcal * factor),
          protein: Math.round(entry.matched.per100.p * factor * 10) / 10,
          fat: Math.round(entry.matched.per100.f * factor * 10) / 10,
          carb: Math.round(entry.matched.per100.c * factor * 10) / 10
        };
      });
    }

    return foundItems.map((entry, idx) => {
      let rawG = entry.explicitGrams || entry.matched.defaultG;
      let netG = rawG;
      let plateNote = null;
      let appliedPlate = null;

      if (idx === 0 && activePlate && entry.explicitGrams && rawG > activePlate.weight + 20) {
        netG = rawG - activePlate.weight;
        plateNote = `${rawG}г − ${activePlate.weight}г`;
        appliedPlate = activePlate;
      }

      const factor = netG / 100;
      return {
        meal,
        name: entry.matched.name,
        grams: netG,
        plateId: appliedPlate ? appliedPlate.id : null,
        grossGrams: appliedPlate ? rawG : null,
        plateNote,
        kcal: Math.round(entry.matched.per100.kcal * factor),
        protein: Math.round(entry.matched.per100.p * factor * 10) / 10,
        fat: Math.round(entry.matched.per100.f * factor * 10) / 10,
        carb: Math.round(entry.matched.per100.c * factor * 10) / 10
      };
    });
  }

  function buildGeminiSystemInstruction(activeDishware = null, extraInstruction = '') {
    let instruction = (appState.geminiPrompt || DEFAULT_GEMINI_PROMPT).trim();
    if (activeDishware) {
      instruction += `\n\nКонтекст тари: користувач обрав посуд «${activeDishware.name}» вагою ${activeDishware.weight} г. Якщо в повідомленні вказана загальна вага посуду разом із вмістом, відніми цю тару ОДИН раз від загальної ваги їжі перед розподілом ваги між позиціями. Не віднімай її окремо від кожної позиції. Якщо вага вказана без тари або неясно, чи включено посуд, не віднімай її повторно.`;
    }
    if (extraInstruction) instruction += `\n\n${extraInstruction}`;
    return instruction;
  }

  async function geminiRequest(model, key, systemInstruction, userText, imageDataUrl = null) {
    const userParts = [];
    if (imageDataUrl) {
      const match = String(imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) throw new Error('Не вдалося підготувати зображення для Gemini. Додай фото ще раз.');
      userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    if (userText && userText.trim()) userParts.push({ text: userText.trim() });
    if (!userParts.length) userParts.push({ text: 'Проаналізуй їжу на доданому фото.' });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: userParts }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        })
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      let message = '';
      try { message = JSON.parse(raw).error?.message || ''; } catch (e) {}
      const err = new Error(message || `HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const output = parts.map(part => part.text || '').filter(Boolean).join('\n').trim();
    if (!output) {
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'Порожня відповідь';
      throw new Error(`Gemini не повернув текст (${reason}).`);
    }
    return output;
  }

  function parseGeminiFoodResponse(raw) {
    let parsed;
    if (Array.isArray(raw)) {
      parsed = raw;
    } else if (raw && typeof raw === 'object') {
      parsed = Array.isArray(raw.items) ? raw.items : null;
    } else {
      const text = String(raw || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const first = text.indexOf('[');
        const last = text.lastIndexOf(']');
        if (first < 0 || last <= first) throw new Error('Відповідь Gemini не є коректним JSON-масивом.');
        parsed = JSON.parse(text.slice(first, last + 1));
      }
    }
    if (!Array.isArray(parsed) && Array.isArray(parsed?.items)) parsed = parsed.items;
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('Gemini не знайшов жодної позиції.');

    const allowedMeals = ['breakfast', 'lunch', 'dinner', 'snack'];
    const items = parsed.map((item, index) => {
      const name = String(item?.name || '').trim();
      const grams = Number(item?.grams);
      const kcal = Number(item?.kcal);
      const protein = Number(item?.protein);
      const fat = Number(item?.fat);
      const carb = Number(item?.carb);
      if (!name || !Number.isFinite(grams) || grams <= 0 || grams > 10000 ||
          ![kcal, protein, fat, carb].every(v => Number.isFinite(v) && v >= 0)) {
        throw new Error(`Gemini повернув некоректні дані для позиції №${index + 1}.`);
      }
      return {
        name,
        meal: allowedMeals.includes(item.meal) ? item.meal : 'snack',
        grams: Math.round(grams),
        kcal: Math.round(kcal),
        protein: Math.round(protein * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        carb: Math.round(carb * 10) / 10,
        plateId: null,
        grossGrams: null,
        plateNote: null
      };
    });
    return items;
  }

  function normalizeItemsToTotalGrams(items, totalGrams) {
    const target = Number(totalGrams);
    if (!Number.isFinite(target) || target <= 0 || !items.length) return items;
    if (target < items.length) throw new Error(`Загальна вага ${target} г замала для ${items.length} окремих позицій. Збільш вагу або об'єднай страви.`);
    const sourceTotal = items.reduce((sum, item) => sum + Number(item.grams || 0), 0);
    if (!sourceTotal) return items;
    let assigned = 0;
    return items.map((item, index) => {
      const grams = index === items.length - 1
        ? Math.max(1, Math.round(target - assigned))
        : Math.max(1, Math.round(target * item.grams / sourceTotal));
      assigned += grams;
      const ratio = grams / item.grams;
      return {
        ...item, grams,
        kcal: Math.round(item.kcal * ratio),
        protein: Math.round(item.protein * ratio * 10) / 10,
        fat: Math.round(item.fat * ratio * 10) / 10,
        carb: Math.round(item.carb * ratio * 10) / 10
      };
    });
  }

  async function parseWithGeminiIfAvailable(promptText, activePlate = null, imageDataUrl = null, totalGrams = null) {
    const key = (appState.apiKey || '').trim();
    if (!key) {
      if (imageDataUrl) throw new Error('Для розпізнавання фото потрібен Gemini API-ключ. Додай ключ у Налаштуваннях → ШІ.');
      await new Promise(resolve => setTimeout(resolve, 180));
      const offlineItems = offlineSmartParse(promptText, totalGrams ? null : activePlate);
      return { items: normalizeItemsToTotalGrams(offlineItems, totalGrams), source: 'offline' };
    }

    const extra = totalGrams ? `Користувач підтвердив загальну ЧИСТУ вагу їжі: ${totalGrams} г. Сума поля grams для всіх позицій повинна дорівнювати рівно ${totalGrams} г. Не призначай цю вагу кожній позиції окремо. Тару вже враховано застосунком — нічого більше не віднімай.` : '';
    const model = appState.geminiModel || 'gemini-2.5-flash';
    const raw = await geminiRequest(model, key, buildGeminiSystemInstruction(totalGrams ? null : activePlate, extra), promptText, imageDataUrl);
    const items = normalizeItemsToTotalGrams(parseGeminiFoodResponse(raw), totalGrams);
    return { items, source: 'gemini' };
  }

  function parseExplicitFoodGrams(promptText) {
    const matches = [...String(promptText || '').matchAll(/(\d+(?:[.,]\d+)?)\s*(кг|г|гр|грам(?:а|и|ів)?)(?=\s|$|[,.!?;:])/giu)];
    if (!matches.length) return null;
    const values = matches.map(match => {
      const amount = Number(match[1].replace(',', '.'));
      return Math.round(amount * (match[2].toLowerCase() === 'кг' ? 1000 : 1));
    }).filter(value => Number.isFinite(value) && value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }


  function hasMultipleExplicitFoodWeights(promptText) {
    const matches = String(promptText || '').match(/\d+(?:[.,]\d+)?\s*(?:кг|г|гр|грам(?:а|и|ів)?)(?=\s|$|[,.!?;:])/giu) || [];
    return matches.length > 1;
  }

  function updateFoodRequestWeightHint() {
    const input = document.getElementById('foodRequestGrams');
    const hint = document.getElementById('foodRequestWeightHint');
    if (!input || !hint) return;
    const value = Number(input.value);
    const plateId = document.getElementById('foodRequestPlateSelect')?.value || '';
    const plate = appState.plates.find(p => p.id === plateId);
    if (Number.isFinite(value) && value > 0 && plate && !hasMultipleExplicitFoodWeights(pendingFoodRequest?.text)) {
      const net = Math.round(value) - Number(plate.weight || 0);
      hint.textContent = net > 0
        ? `Брутто ${Math.round(value)} г − тара ${Math.round(plate.weight)} г = ${net} г їжі.`
        : 'Вага менша за тару.';
      hint.classList.toggle('text-[#FF9F0A]', net <= 0);
    } else if (Number.isFinite(value) && value > 0 && plate) {
      hint.classList.remove('text-[#FF9F0A]');
      hint.textContent = `Вага інгредієнтів задана окремо — тару не віднімаю.`;
    } else {
      hint.classList.remove('text-[#FF9F0A]');
      hint.textContent = Number.isFinite(value) && value > 0
        ? `Вага їжі: ${Math.round(value)} г.`
        : 'Без ваги ШІ оцінить порцію.';
    }
  }

  function openFoodRequestSheet(promptText, imageDataUrl = pendingFoodImage) {
    closeEditSheet();
    closeCalendarSheet();
    document.getElementById('periodDropdownMenu').classList.add('hidden');

    const rememberedPlate = appState.plates.some(p => p.id === appState.selectedPlateId)
      ? appState.selectedPlateId : '';
    pendingFoodRequest = {
      text: promptText,
      imageDataUrl: imageDataUrl || null,
      totalGrams: parseExplicitFoodGrams(promptText),
      meal: detectMealCategory(promptText),
      time: getCurrentTimeStr(),
      plateId: rememberedPlate
    };

    document.getElementById('foodRequestText').textContent = promptText || (imageDataUrl ? 'Розпізнати їжу на фото' : '');
    const gramsInput = document.getElementById('foodRequestGrams');
    gramsInput.value = pendingFoodRequest.totalGrams || '';
    updateFoodRequestWeightHint();
    const photoWrap = document.getElementById('foodRequestPhotoWrap');
    const photo = document.getElementById('foodRequestPhoto');
    if (imageDataUrl) { photo.src = imageDataUrl; photoWrap.classList.remove('hidden'); }
    else { photo.removeAttribute('src'); photoWrap.classList.add('hidden'); }
    const plateSelect = document.getElementById('foodRequestPlateSelect');
    plateSelect.innerHTML = `<option value="">Без посуду</option>` +
      appState.plates.map(p => `<option value="${p.id}">${esc(p.name)} · ${p.weight} г</option>`).join('');
    plateSelect.value = rememberedPlate;
    updateFoodRequestWeightHint();
    document.getElementById('foodRequestTime').value = pendingFoodRequest.time;
    document.getElementById('foodRequestError').classList.add('hidden');
    document.getElementById('confirmFoodRequestBtn').disabled = false;
    document.getElementById('confirmFoodRequestBtn').textContent = 'Розпізнати та додати';
    selectFoodRequestMeal(pendingFoodRequest.meal);

    const backdrop = document.getElementById('foodRequestBackdrop');
    const sheet = document.getElementById('foodRequestSheet');
    backdrop.classList.add('visible');
    sheet.classList.add('visible');
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
  }

  function closeFoodRequestSheet() {
    if (isParsingFood) return;
    const backdrop = document.getElementById('foodRequestBackdrop');
    const sheet = document.getElementById('foodRequestSheet');
    if (!backdrop || !sheet) return;
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      if (!sheet.classList.contains('open')) {
        backdrop.classList.remove('visible');
        sheet.classList.remove('visible');
      }
    }, 340);
    if (!isParsingFood) pendingFoodRequest = null;
  }

  function selectFoodRequestMeal(mealId) {
    if (pendingFoodRequest) pendingFoodRequest.meal = mealId;
    document.querySelectorAll('#foodRequestMealSelector button').forEach(btn => {
      btn.className = btn.dataset.meal === mealId
        ? 'py-2 rounded-[9px] text-[11px] font-semibold bg-[#1C1C1E] text-white shadow transition'
        : 'py-2 rounded-[9px] text-[11px] font-medium text-[#8E8E93] transition';
    });
  }

  async function confirmFoodRequest() {
    if (!pendingFoodRequest || isParsingFood) return;
    const input = document.getElementById('foodPromptInput');
    const submitButton = document.getElementById('foodSubmitBtn');
    const confirmButton = document.getElementById('confirmFoodRequestBtn');
    const aiBanner = document.getElementById('aiParsingBanner');
    const aiLabel = document.getElementById('aiParsingLabel');
    const text = pendingFoodRequest.text;
    const imageDataUrl = pendingFoodRequest.imageDataUrl || null;
    const meal = pendingFoodRequest.meal;
    const time = document.getElementById('foodRequestTime').value || getCurrentTimeStr();
    const gramsValue = Number(document.getElementById('foodRequestGrams').value);
    const enteredTotalGrams = Number.isFinite(gramsValue) && gramsValue > 0 ? Math.round(gramsValue) : null;
    const plateId = document.getElementById('foodRequestPlateSelect').value;
    const activePlate = appState.plates.find(p => p.id === plateId) || null;
    // A selected plate means the entered scale reading is gross weight.
    // Convert it to net food weight before sending it to Gemini or the local parser.
    const includesPlateWeight = Boolean(activePlate && enteredTotalGrams && !hasMultipleExplicitFoodWeights(text));
    const totalGrams = enteredTotalGrams
      ? enteredTotalGrams - (includesPlateWeight ? Number(activePlate.weight || 0) : 0)
      : null;
    if (totalGrams !== null && totalGrams <= 0) {
      const errorEl = document.getElementById('foodRequestError');
      errorEl.textContent = 'Вага їжі має бути більшою за вагу посуду.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (!text.trim() && !imageDataUrl) return;
    pendingFoodRequest.time = time;
    pendingFoodRequest.totalGrams = totalGrams;
    pendingFoodRequest.plateId = plateId;
    appState.selectedPlateId = plateId || null;

    isParsingFood = true;
    confirmButton.disabled = true;
    confirmButton.textContent = 'Розпізнаю…';
    submitButton.disabled = true;
    submitButton.classList.add('opacity-50');
    aiLabel.textContent = appState.apiKey
      ? `Gemini · ${appState.geminiModel || 'обрана модель'}…`
      : (imageDataUrl ? 'Для фото потрібен Gemini API…' : 'Локальний парсер…');
    aiBanner.classList.remove('hidden');
    input.disabled = true;

    try {
      const requestText = text || 'Проаналізуй їжу на доданому фото. Визнач видимі продукти та приблизну порцію.';
      const result = await parseWithGeminiIfAvailable(requestText, activePlate, imageDataUrl, totalGrams);
      const parsedItems = result.items;
      if (!parsedItems.length) throw new Error('Не вдалося розпізнати позиції.');

      if (!appState.logs[selectedDateKey]) appState.logs[selectedDateKey] = [];
      const dishId = 'dish_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      let totalAdded = 0;
      parsedItems.forEach((item, index) => {
        totalAdded += item.kcal;
        const grossGrams = includesPlateWeight && activePlate && index === 0 ? enteredTotalGrams : null;
        const hasPlate = !!(activePlate && index === 0);
        appState.logs[selectedDateKey].push({
          id: 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          dishId,
          mod: Date.now(),
          meal,
          time,
          name: item.name,
          grams: item.grams,
          plateId: hasPlate ? activePlate.id : null,
          grossGrams,
          plateNote: grossGrams && activePlate ? `${grossGrams} г − ${activePlate.weight} г тари` : null,
          source: result.source === 'gemini' ? (imageDataUrl ? 'gemini-photo' : 'gemini') : 'offline',
          kcal: item.kcal,
          protein: item.protein,
          fat: item.fat,
          carb: item.carb
        });
      });

      persistState();
      input.value = '';
      removeFoodImage();
      updateComposerActions();
      isParsingFood = false;
      closeFoodRequestSheet();
      renderDiary();
      showToast(result.source === 'gemini'
        ? `Тарілку додано · ${parsedItems.length} складн. · ${Math.round(totalAdded)} ккал`
        : `Тарілку додано локально · ${parsedItems.length} складн.`, result.source === 'gemini' ? '✨' : 'ℹ️');
    } catch (error) {
      const message = String(error.message || 'Невідома помилка').replace(/\s+/g, ' ').slice(0, 180);
      const errorEl = document.getElementById('foodRequestError');
      errorEl.textContent = appState.apiKey ? `Не вдалося виконати запит: ${message}` : message;
      errorEl.classList.remove('hidden');
      if (appState.apiKey) setGeminiStatus(`Помилка запиту: ${message}`, true);
      showToast(appState.apiKey ? `Gemini: ${message.slice(0, 100)}` : 'Не вдалося розпізнати запис', '⚠️');
    } finally {
      aiBanner.classList.add('hidden');
      input.disabled = false;
      isParsingFood = false;
      submitButton.disabled = false;
      submitButton.classList.remove('opacity-50');
      confirmButton.disabled = false;
      confirmButton.textContent = 'Розпізнати та додати';
      input.focus();
    }
  }

  function imageFileToDataUrl(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) return reject(new Error('Обери файл зображення.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не вдалося прочитати фото.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Не вдалося відкрити фото.'));
        img.onload = () => {
          const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) return reject(new Error('Браузер не зміг обробити фото.'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function removeFoodImage() {
    pendingFoodImage = null;
    ['foodCameraInput', 'foodGalleryInput'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
    document.getElementById('foodImagePreview').classList.add('hidden');
    document.getElementById('foodImagePreviewName').textContent = '';
    updateComposerActions();
  }

  function handleFoodImageSelection(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    // Clear immediately so choosing or capturing the same file again still fires "change" on iOS.
    input.value = '';
    if (!file) return;
    (async () => {
      try {
        pendingFoodImage = await imageFileToDataUrl(file);
        document.getElementById('foodImagePreviewName').textContent = file.name || 'Фото страви';
        document.getElementById('foodImagePreview').classList.remove('hidden');
        updateComposerActions();
        showToast('Фото додано', '📷');
      } catch (error) {
        removeFoodImage();
        showToast(error.message || 'Не вдалося додати фото', '⚠️');
      }
    })();
  }

  document.getElementById('cameraPickBtn').addEventListener('click', () => {
    closeAttachmentMenu();
    const cameraInput = document.getElementById('foodCameraInput');
    cameraInput.value = '';
    cameraInput.click();
  });
  document.getElementById('galleryPickBtn').addEventListener('click', () => {
    closeAttachmentMenu();
    const galleryInput = document.getElementById('foodGalleryInput');
    galleryInput.value = '';
    galleryInput.click();
  });
  document.getElementById('foodCameraInput').addEventListener('change', handleFoodImageSelection);
  document.getElementById('foodGalleryInput').addEventListener('change', handleFoodImageSelection);

  document.getElementById('foodRequestGrams').addEventListener('input', updateFoodRequestWeightHint);
  document.getElementById('foodRequestPlateSelect').addEventListener('change', updateFoodRequestWeightHint);

  document.getElementById('foodInputForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendAssistantMessage();
  });
