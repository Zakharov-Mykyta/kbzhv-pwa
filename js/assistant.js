  // ==================== ШЕФ ASSISTANT ====================
  function scrollAssistantToBottom() {
    const area = document.getElementById('assistantScrollArea');
    if (area) area.scrollTop = area.scrollHeight;
  }

  function assistantTimeLabel(value) {
    const d = value ? new Date(value) : new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function assistantFormatText(value) {
    let text = esc(String(value || ''));
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-black/20 px-1 py-0.5 text-[.92em]">$1</code>')
      .replace(/^\s*[-•]\s+(.+)$/gm, '<span class="inline-block pl-2">• $1</span>')
      .replace(/\n/g, '<br>');
    return text;
  }

  function assistantTotals(items) {
    return items.reduce((t, item) => ({
      grams: t.grams + Number(item.grams || 0),
      kcal: t.kcal + Number(item.kcal || 0),
      protein: t.protein + Number(item.protein || 0),
      fat: t.fat + Number(item.fat || 0),
      carb: t.carb + Number(item.carb || 0)
    }), { grams: 0, kcal: 0, protein: 0, fat: 0, carb: 0 });
  }

  function assistantDateLabel(key) {
    const d = parseDateKey(key);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  function buildAssistantDiaryContext() {
    const allKeys = Object.keys(appState.logs || {}).sort();
    const last30 = [];
    for (let i = 29; i >= 0; i--) last30.push(shiftKey(TODAY_KEY, -i));
    if (!last30.includes(selectedDateKey)) last30.push(selectedDateKey);
    const datesWithData = [...new Set([...last30, ...allKeys.filter(k => k <= TODAY_KEY).slice(-30)])].sort();
    const recentEntries = [];
    const daily = [];
    datesWithData.forEach(date => {
      const items = (appState.logs[date] || []).slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
      const totals = assistantTotals(items);
      daily.push({ date, count: items.length, kcal: Math.round(totals.kcal), protein: Math.round(totals.protein * 10) / 10,
        fat: Math.round(totals.fat * 10) / 10, carb: Math.round(totals.carb * 10) / 10 });
      if (date >= shiftKey(TODAY_KEY, -29) || date === selectedDateKey) {
        items.forEach(item => recentEntries.push({
          id: item.id, dishId: item.dishId || null, date, time: item.time || '', meal: item.meal || 'snack',
          name: item.name, grams: Number(item.grams || 0), kcal: Number(item.kcal || 0),
          protein: Number(item.protein || 0), fat: Number(item.fat || 0), carb: Number(item.carb || 0)
        }));
      }
    });
    const current = (appState.logs[selectedDateKey] || []).slice();
    const currentTotals = assistantTotals(current);
    const weekKeys = Array.from({ length: 7 }, (_, i) => shiftKey(TODAY_KEY, i - 6));
    const weekTotals = assistantTotals(weekKeys.flatMap(k => appState.logs[k] || []));
    return {
      today: TODAY_KEY,
      selectedDate: selectedDateKey,
      selectedDateTotals: { kcal: Math.round(currentTotals.kcal), protein: Math.round(currentTotals.protein * 10) / 10,
        fat: Math.round(currentTotals.fat * 10) / 10, carb: Math.round(currentTotals.carb * 10) / 10, entries: current.length },
      targets: appState.targets,
      last7DaysTotals: { kcal: Math.round(weekTotals.kcal), protein: Math.round(weekTotals.protein * 10) / 10,
        fat: Math.round(weekTotals.fat * 10) / 10, carb: Math.round(weekTotals.carb * 10) / 10,
        daysWithEntries: weekKeys.filter(k => (appState.logs[k] || []).length).length },
      dailyTotalsLast30Days: daily,
      recentEntries: recentEntries.slice(-180),
      availableHistory: 'Детальні записи передаються максимум за останні 30 днів. Для старіших дат повідомляй, що в контексті немає повної деталізації.'
    };
  }

  function buildAssistantSystemInstruction() {
    const foodGuidance = (appState.geminiPrompt || DEFAULT_GEMINI_PROMPT)
      .replace(/9\. Відповідай виключно[\s\S]*$/i, '')
      .trim();
    return `Ти — Шеф, персональний шеф Крихти з харчування та щоденника КБЖВ. Завжди відповідай українською, природно, доброзичливо та по суті. Пиши коротко: без вступів, повторів запиту, очевидних пояснень і декоративних підзаголовків. Зазвичай достатньо 1–3 коротких речень. Списки використовуй лише коли вони справді полегшують сприйняття.

ТВОЇ ЗАВДАННЯ:
- Відповідай на запитання про калорійність, КБЖВ, продукти, приготування та загальні принципи харчування.
- Аналізуй дані щоденника лише на основі переданого DIARY_CONTEXT. Не вигадуй відсутні записи, вагу, цифри чи тенденції. Якщо даних недостатньо — прямо скажи.
- Підсумовуй день/тиждень/місяць і за потреби позначай showSummary як "today", "selected", "7d" або "30d", щоб застосунок показав числову картку з фактичних даних.
- Давай помірковані загальні поради. Не став діагнозів, не призначай лікування та не заохочуй небезпечне обмеження їжі.

ЗАПИС У ЩОДЕННИК:
- Повертай type="add_food" лише коли користувач явно просить додати/записати/занести їжу або описує щойно спожиту їжу в контексті обліку. Запитання «скільки калорій у…?» саме по собі НЕ означає запис.
- Перед додаванням завжди підготуй список інгредієнтів як окремі позиції однієї страви/тарілки, якщо користувач не описав декілька окремих прийомів їжі.
- Для запису використовуй вибрану користувачем дату, якщо він не назвав іншу. Якщо назвав відносну дату (наприклад, «вчора» або «позавчора»), обчисли її від DIARY_CONTEXT.today і поверни поле date у форматі YYYY-MM-DD. Не вигадуй дату.
- У items вказуй вагу та КБЖВ для фактичної порції кожного інгредієнта, не на 100 г. Якщо точна вага не вказана — оціни розумну порцію і скажи в reply, що вага приблизна.
- Якщо користувач указав загальну вагу, розподіли її між інгредієнтами так, щоб сума grams дорівнювала цій вазі. Не призначай загальну вагу кожному інгредієнту.
- Не додавай олію, цукор, соуси чи інші інгредієнти, яких не згадано або не видно на фото.
- Якщо фото і текст суперечать одне одному, пріоритет має текст. Якщо фото не є їжею або вміст незрозумілий, постав уточнювальне запитання замість вигаданого складу.
- ДОДАВАННЯ НЕ ВИКОНУЄТЬСЯ АВТОМАТИЧНО. Застосунок відкриє вікно підтвердження, користувач сам натисне «Додати до щоденника».
- Ніколи не заявляй, що запис уже збережено, доки користувач не підтвердив картку.
- Не змінюй і не видаляй старі записи. Для запитів на редагування/видалення поясни, що це можна зробити в самому щоденнику.

ВИКОРИСТОВУЙ КОНТЕКСТ:
DIARY_CONTEXT передається як JSON в останньому повідомленні користувача. Він містить денні цілі, вибрану дату, поточний підсумок, підсумок за 7 днів, щоденні суми за 30 днів і детальні недавні записи. Час локальний.

ІНСТРУКЦІЯ ДЛЯ ОЦІНКИ ЇЖІ, НАЛАШТОВАНА КОРИСТУВАЧЕМ:
${foodGuidance}

ФОРМАТ ВІДПОВІДІ: поверни лише один коректний JSON-об'єкт без Markdown та тексту поза JSON:
{"type":"answer|add_food","reply":"текст для користувача","showSummary":"none|today|selected|7d|30d","date":"YYYY-MM-DD","meal":"breakfast|lunch|dinner|snack","time":"HH:MM","items":[{"name":"назва","grams":100,"kcal":150,"protein":5,"fat":4,"carb":20}]}
Для type="answer" поля items, date, meal і time можна не повертати. Для type="add_food" items обов'язковий, усі числові поля мають бути невід'ємними числами, grams > 0. date повертай лише якщо користувач явно назвав іншу дату; інакше застосунок використає вибрану дату. showSummary використовуй лише коли користувач просить підсумок/статистику/показати прогрес; інакше "none". Не додавай невідомі поля.`;
  }

  async function requestAssistantResponse(newUserText, imageDataUrl = null) {
    const key = (appState.apiKey || '').trim();
    const model = (appState.geminiModel || '').trim();
    if (!key || !model) throw new Error('Gemini не налаштовано. Відкрий Налаштування → ШІ, додай API-ключ, завантаж моделі та збережи вибрану модель.');

    const previous = assistantMessages.slice(-10);
    const contents = previous.map((message, index) => {
      const role = message.role === 'assistant' ? 'model' : 'user';
      const text = String(message.text || '').trim() || (message.hasImage ? '[Користувач додав фото]' : '');
      if (!text) return null;
      const parts = [{ text }];
      if (message.role === 'user' && message.id === assistantMessages[assistantMessages.length - 1]?.id && imageDataUrl) {
        const match = String(imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) throw new Error('Не вдалося підготувати фотографію. Додай її ще раз.');
        parts.unshift({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      return { role, parts };
    }).filter(Boolean);
    const context = buildAssistantDiaryContext();
    const contextText = `DIARY_CONTEXT (використовуй лише ці дані для запитів про щоденник):\n${JSON.stringify(context)}`;
    if (contents.length) contents[contents.length - 1].parts.push({ text: contextText });
    else contents.push({ role: 'user', parts: [{ text: `${newUserText}\n\n${contextText}` }] });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildAssistantSystemInstruction() }] },
        contents,
        generationConfig: { temperature: 0.35, responseMimeType: 'application/json' }
      })
    });
    if (!response.ok) {
      let message = '';
      try { message = (await response.json()).error?.message || ''; } catch (e) {}
      throw new Error(message || `Gemini API · HTTP ${response.status}`);
    }
    const data = await response.json();
    const output = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').filter(Boolean).join('\n').trim();
    if (!output) throw new Error(`Gemini не повернув відповідь (${data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'порожня відповідь'}).`);
    let parsed;
    try { parsed = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()); }
    catch (e) { throw new Error('Gemini повернув некоректний формат відповіді. Спробуй переформулювати запит.'); }
    if (!parsed || !['answer', 'add_food'].includes(parsed.type) || typeof parsed.reply !== 'string') {
      throw new Error('Gemini повернув відповідь неочікуваного формату.');
    }
    if (parsed.type === 'add_food') {
      parsed.items = parseGeminiFoodResponse(parsed.items);
      const explicitGrams = parseExplicitFoodGrams(newUserText);
      if (explicitGrams) parsed.items = normalizeItemsToTotalGrams(parsed.items, explicitGrams);
      const allowedMeals = ['breakfast', 'lunch', 'dinner', 'snack'];
      parsed.meal = allowedMeals.includes(parsed.meal) ? parsed.meal : detectMealCategory(newUserText);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(parsed.time || ''))) parsed.time = getCurrentTimeStr();
      const candidateDate = String(parsed.date || '');
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(candidateDate) ? new Date(`${candidateDate}T00:00:00`) : null;
      parsed.date = parsedDate && !Number.isNaN(parsedDate.getTime()) && toDateKey(parsedDate) === candidateDate ? candidateDate : selectedDateKey;
    }
    parsed.showSummary = ['today', 'selected', '7d', '30d'].includes(parsed.showSummary) ? parsed.showSummary : 'none';
    return parsed;
  }

  function assistantSummaryCard(period) {
    const dates = (period === 'today' || period === 'selected')
      ? [period === 'today' ? TODAY_KEY : selectedDateKey]
      : Array.from({ length: period === '7d' ? 7 : 30 }, (_, i) => shiftKey(TODAY_KEY, i - (period === '7d' ? 6 : 29)));
    const summaryDate = dates[0];
    const dailyRows = dates.map(date => ({ date, totals: assistantTotals(appState.logs[date] || []) }));
    const totals = assistantTotals(dates.flatMap(date => appState.logs[date] || []));
    const divisor = Math.max(1, dates.length);
    const avg = { kcal: totals.kcal / divisor, protein: totals.protein / divisor, fat: totals.fat / divisor, carb: totals.carb / divisor };
    const target = appState.targets;
    if (period === 'today' || period === 'selected') {
      const metrics = [
        { label: 'Калорії', value: totals.kcal, target: target.kcal, unit: 'ккал', color: '#D8B98A' },
        { label: 'Білки', value: totals.protein, target: target.protein, unit: 'г', color: '#0A84FF' },
        { label: 'Жири', value: totals.fat, target: target.fat, unit: 'г', color: '#FF9F0A' },
        { label: 'Вуглеводи', value: totals.carb, target: target.carb, unit: 'г', color: '#BF5AF2' }
      ];
      return `<section class="assistant-summary-card"><div class="flex items-center justify-between mb-2"><b class="text-[12px] text-white">${period === 'today' ? 'Підсумок за сьогодні' : 'Підсумок за вибраний день'}</b><span class="text-[10px] text-[#8E8E93]">${assistantDateLabel(summaryDate)}</span></div>${metrics.map(m => `<div class="assistant-summary-row"><span class="assistant-summary-label">${m.label}</span><div class="assistant-summary-track"><div class="assistant-summary-fill" style="width:${Math.min(100, m.target > 0 ? m.value / m.target * 100 : 0)}%;background:${m.color}"></div></div><span class="assistant-summary-value">${formatOneDecimal(m.value)} / ${formatOneDecimal(m.target)} ${m.unit}</span></div>`).join('')}<div class="mt-2 pt-2 border-t border-white/[0.07] flex justify-between text-[10px]"><span class="text-[#8E8E93]">Калорій до цілі</span><b class="text-white">${formatOneDecimal(Math.max(0, target.kcal - totals.kcal))} ккал</b></div></section>`;
    }
    const activeDays = dailyRows.filter(row => row.totals.kcal > 0).length;
    const bars = dailyRows.slice(-7).map(row => {
      const h = Math.max(3, Math.min(100, target.kcal > 0 ? row.totals.kcal / target.kcal * 100 : 0));
      const d = parseDateKey(row.date);
      return `<div class="flex-1 flex flex-col items-center gap-1"><div class="h-16 w-full flex items-end"><div class="w-full rounded-t-[5px]" style="height:${h}%;background:#D8B98A;opacity:${row.totals.kcal ? 1 : .2}"></div></div><span class="text-[9px] text-[#8E8E93]">${d.getDate()}/${d.getMonth()+1}</span></div>`;
    }).join('');
    return `<section class="assistant-summary-card"><div class="flex items-center justify-between mb-2"><b class="text-[12px] text-white">Середнє за ${period === '7d' ? '7' : '30'} днів</b><span class="text-[10px] text-[#8E8E93]">${activeDays} дн. із записами</span></div><div class="grid grid-cols-2 gap-2 mb-3"><div class="rounded-[10px] bg-[#2C2C2E] p-2"><span class="text-[9px] text-[#8E8E93] block">Калорії</span><b class="text-[16px] text-[#D8B98A]">${Math.round(avg.kcal)}</b></div><div class="rounded-[10px] bg-[#2C2C2E] p-2"><span class="text-[9px] text-[#8E8E93] block">Білок</span><b class="text-[16px] text-[#0A84FF]">${Math.round(avg.protein)} г</b></div><div class="rounded-[10px] bg-[#2C2C2E] p-2"><span class="text-[9px] text-[#8E8E93] block">Жири</span><b class="text-[16px] text-[#FF9F0A]">${Math.round(avg.fat)} г</b></div><div class="rounded-[10px] bg-[#2C2C2E] p-2"><span class="text-[9px] text-[#8E8E93] block">Вуглеводи</span><b class="text-[16px] text-[#BF5AF2]">${Math.round(avg.carb)} г</b></div></div><div class="flex items-end gap-2 h-[84px]">${bars}</div></section>`;
  }

  function assistantActionCard(action, messageId) {
    if (action.status === 'added') {
      return `<section class="assistant-action-card"><div class="flex items-center gap-2"><span class="text-[#D8B98A] text-[17px]">✓</span><div class="min-w-0 flex-1"><div class="text-[12px] font-bold text-white">Додано до щоденника</div><div class="text-[10px] text-[#A1A1AA] mt-0.5">${assistantDateLabel(action.date)} · ${esc(action.time || '')}</div></div></div><button type="button" class="assistant-action-secondary w-full mt-2" onclick="assistantGoToDiary('${esc(action.date)}')">Відкрити цей день</button></section>`;
    }
    return `<section class="assistant-action-cta"><span class="assistant-action-cta-label">Запис підготовлено</span><button type="button" onclick="openAssistantActionModal('${messageId}')">Перевірити запис</button></section>`;
  }

  function assistantActionDraftGrams(action) {
    const draftGrams = action.formDraft?.grams;
    return action.items.map((item, index) => {
      const value = Array.isArray(draftGrams) ? Number(draftGrams[index]) : NaN;
      return Number.isFinite(value) && value > 0 ? Math.round(value) : Math.max(1, Math.round(Number(item.grams) || 1));
    });
  }

  function assistantActionTotals(action, gramsValues) {
    return action.items.reduce((sum, item, index) => {
      const grams = Math.max(1, Number(gramsValues[index]) || 1);
      const ratio = grams / Math.max(1, Number(item.grams) || 1);
      sum.grams += grams;
      sum.kcal += Number(item.kcal || 0) * ratio;
      sum.protein += Number(item.protein || 0) * ratio;
      sum.fat += Number(item.fat || 0) * ratio;
      sum.carb += Number(item.carb || 0) * ratio;
      return sum;
    }, { grams:0, kcal:0, protein:0, fat:0, carb:0 });
  }

  function createAssistantDishEditorState(messageId, action) {
    const draft = action.formDraft || {};
    if (!Array.isArray(action.originalNames)) action.originalNames = action.items.map(item => String(item.name || ''));
    const savedGrams = Array.isArray(draft.grams) ? draft.grams : [];
    const items = action.items.map((item, index) => {
      const baseGrams = Math.max(1, Number(item.grams) || 1);
      const grams = Math.max(1, Math.round(Number(savedGrams[index]) || baseGrams));
      return {
        ...item,
        id: item.id || `assistant_${messageId}_${index}`,
        originalName: String(action.originalNames[index] ?? item.name ?? ''),
        originalGrams: baseGrams,
        grams,
        perGram: {
          kcal: Number(item.kcal || 0) / baseGrams,
          protein: Number(item.protein || 0) / baseGrams,
          fat: Number(item.fat || 0) / baseGrams,
          carb: Number(item.carb || 0) / baseGrams
        }
      };
    });
    const totalGrams = items.reduce((sum, item) => sum + item.grams, 0);
    const plateId = draft.plateId !== undefined ? draft.plateId : (action.appliedPlateId || '');
    const selectedPlate = appState.plates.find(plate => plate.id === plateId);
    return {
      context: 'assistant', messageId, id: messageId, dishId: messageId,
      isGroup: true, items, selectedIngredientIndex: Math.max(0, Math.min(Number(draft.selectedIngredientIndex ?? action.selectedIngredientIndex) || 0, items.length - 1)),
      meal: draft.meal || action.meal || 'snack', plateId,
      grossGrams: Number(draft.grossGrams || action.grossGrams) || (selectedPlate ? totalGrams + Number(selectedPlate.weight || 0) : null),
      totalGrams, tareEligible: action.tareEligible !== false, isSaving: false
    };
  }

  function setAssistantClonedInputValue(input, value) {
    if (!input) return;
    const normalized = value == null ? '' : String(value);
    input.value = normalized;
    input.setAttribute('value', normalized);
  }

  function updateAssistantDateTimeDisplay(messageId, root = document) {
    const dateInput = root.querySelector(`#assistantActionDate_${messageId}`);
    const timeInput = root.querySelector(`#assistantAction_editItemTime_${messageId}`);
    const dateDisplay = root.querySelector(`#assistantActionDateDisplay_${messageId}`);
    const timeDisplay = root.querySelector(`#assistantActionTimeDisplay_${messageId}`);
    if (dateDisplay) {
      const match = String(dateInput?.value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const localDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        dateDisplay.textContent = new Intl.DateTimeFormat('uk-UA', {
          day: 'numeric', month: 'short', year: 'numeric'
        }).format(localDate);
      } else {
        dateDisplay.textContent = 'Обрати дату';
      }
    }
    if (timeDisplay) timeDisplay.textContent = timeInput?.value || 'Обрати час';
  }

  function assistantActionModalContent(action, messageId) {
    // Clone the actual Diary edit card so both places use the same markup,
    // spacing, controls and typography. The assistant only adds a date field.
    const editSheet = document.getElementById('editSheet');
    const diaryForm = Array.from(editSheet?.children || []).find(element => element.classList.contains('space-y-3.5'));
    if (!diaryForm) return '<p class="text-[13px] text-[#FF9F0A]">Не вдалося відкрити редактор страви.</p>';

    const clone = diaryForm.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelector('#editSingleNameWrap')?.remove();
    clone.querySelector('button[onclick="deleteEditingItem()"]')?.parentElement?.remove();
    clone.querySelector('#editDishEditor')?.classList.remove('hidden');
    clone.querySelector('#editItemSlider')?.classList.add('hidden');

    const timeInput = clone.querySelector('#editItemTime');
    if (timeInput) {
      const timeWrap = timeInput.parentElement;
      const label = timeWrap.querySelector('label');
      if (label) label.textContent = 'Час';
      timeWrap.className = 'assistant-action-date-time-field';

      const dateWrap = document.createElement('div');
      dateWrap.className = 'assistant-action-date-time-field';
      dateWrap.innerHTML = `
        <label>Дата</label>
        <div class="assistant-action-date-time-control">
          <span id="assistantActionDateDisplay_${messageId}" class="assistant-action-date-time-display" aria-hidden="true">Обрати дату</span>
          <span class="assistant-action-date-time-icon" aria-hidden="true">▦</span>
          <input id="assistantActionDate_${messageId}" type="date" class="assistant-action-date-time-native" aria-label="Дата" />
        </div>`;

      const timeControl = document.createElement('div');
      timeControl.className = 'assistant-action-date-time-control';
      const timeDisplay = document.createElement('span');
      timeDisplay.id = `assistantActionTimeDisplay_${messageId}`;
      timeDisplay.className = 'assistant-action-date-time-display';
      timeDisplay.setAttribute('aria-hidden', 'true');
      timeDisplay.textContent = 'Обрати час';
      const timeIcon = document.createElement('span');
      timeIcon.className = 'assistant-action-date-time-icon';
      timeIcon.setAttribute('aria-hidden', 'true');
      timeIcon.textContent = '◷';
      timeInput.className = 'assistant-action-date-time-native';
      timeInput.setAttribute('aria-label', 'Час');
      timeControl.append(timeDisplay, timeIcon, timeInput);
      timeWrap.appendChild(timeControl);

      const dateTimeRow = document.createElement('div');
      dateTimeRow.className = 'assistant-action-modal-date-time';
      timeWrap.parentNode.replaceChild(dateTimeRow, timeWrap);
      dateTimeRow.append(dateWrap, timeWrap);
    }

    // The Diary's own editor buttons are replaced by this modal's fixed footer.
    const actionRow = Array.from(clone.querySelectorAll('button')).find(button => (button.getAttribute('onclick') || '').includes('saveEditingItem'))?.parentElement;
    actionRow?.remove();

    const idMap = {};
    clone.querySelectorAll('[id]').forEach(element => {
      const oldId = element.id;
      if ([
        `assistantActionDate_${messageId}`,
        `assistantActionDateDisplay_${messageId}`,
        `assistantActionTimeDisplay_${messageId}`
      ].includes(oldId)) return;
      const newId = `assistantAction_${oldId}_${messageId}`;
      idMap[oldId] = newId;
      element.id = newId;
    });
    clone.querySelectorAll('[for]').forEach(element => {
      const oldFor = element.getAttribute('for');
      if (idMap[oldFor]) element.setAttribute('for', idMap[oldFor]);
    });

    const state = editingItemState;
    const plateSelect = clone.querySelector(`#${idMap.editItemPlateSelect}`);
    if (plateSelect) {
      plateSelect.innerHTML = '<option value="">Без посуду</option>' + appState.plates.map(plate =>
        `<option value="${esc(plate.id)}">${esc(plate.name)} (−${Math.round(Number(plate.weight) || 0)} г)</option>`
      ).join('');
      plateSelect.value = state?.plateId || '';
    }
    const totalInput = clone.querySelector(`#${idMap.editItemGrams}`);
    if (totalInput) {
      setAssistantClonedInputValue(totalInput, state?.totalGrams || 1);
      totalInput.setAttribute('oninput', 'assistantActionTotalGramsChanged()');
    }
    const grossInput = clone.querySelector(`#${idMap.editItemGrossGrams}`);
    if (grossInput) setAssistantClonedInputValue(grossInput, state?.grossGrams || '');
    const dateInput = clone.querySelector(`#assistantActionDate_${messageId}`);
    if (dateInput) {
      setAssistantClonedInputValue(dateInput, action.formDraft?.date || action.date || TODAY_KEY);
      dateInput.setAttribute('oninput', `updateAssistantDateTimeDisplay('${messageId}')`);
      dateInput.setAttribute('onchange', `updateAssistantDateTimeDisplay('${messageId}'); saveAssistantActionDraft('${messageId}')`);
    }
    const clonedTimeInput = clone.querySelector(`#${idMap.editItemTime}`);
    if (clonedTimeInput) {
      setAssistantClonedInputValue(clonedTimeInput, action.formDraft?.time || action.time || getCurrentTimeStr());
      clonedTimeInput.setAttribute('oninput', `updateAssistantDateTimeDisplay('${messageId}')`);
      clonedTimeInput.setAttribute('onchange', `updateAssistantDateTimeDisplay('${messageId}'); saveAssistantActionDraft('${messageId}')`);
    }
    updateAssistantDateTimeDisplay(messageId, clone);
    return clone.outerHTML;
  }

  function saveAssistantActionDraft(messageId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.status !== 'pending') return;
    const action = message.action;
    const state = editingItemState?.context === 'assistant' && editingItemState.messageId === messageId ? editingItemState : null;
    const date = document.getElementById(`assistantActionDate_${messageId}`);
    const time = state ? dishEditorElement('editItemTime') : document.getElementById(`assistantAction_editItemTime_${messageId}`);
    const plate = state ? dishEditorElement('editItemPlateSelect') : document.getElementById(`assistantAction_editItemPlateSelect_${messageId}`);
    const gross = state ? dishEditorElement('editItemGrossGrams') : document.getElementById(`assistantAction_editItemGrossGrams_${messageId}`);
    const mealButtons = document.querySelectorAll(`#assistantAction_editMealSelector_${messageId} button.active`);
    const grams = state
      ? state.items.map(item => Math.max(1, Math.round(Number(item.grams) || 1)))
      : action.items.map((item, index) => Math.max(1, Number(document.getElementById(`assistantActionGrams_${messageId}_${index}`)?.value) || Number(item.grams) || 1));
    const names = state
      ? state.items.map(item => String(item.name || ''))
      : action.items.map((item, index) => document.getElementById(`assistantActionName_${messageId}_${index}`)?.value ?? item.name);
    if (state) {
      // Persist the current editor values as the new baseline so reopening the
      // modal keeps exact grams/macros and does not compound percentage changes.
      action.originalNames = state.items.map(item => String(item.originalName ?? item.name ?? ''));
      action.items = state.items.map((item, index) => {
        const g = grams[index];
        return {
          id: item.id, name: names[index], grams: g,
          kcal: Math.round(item.perGram.kcal * g),
          protein: Math.round(item.perGram.protein * g * 10) / 10,
          fat: Math.round(item.perGram.fat * g * 10) / 10,
          carb: Math.round(item.perGram.carb * g * 10) / 10
        };
      });
      action.grossItems = action.items.map(item => ({...item}));
      action.selectedIngredientIndex = state.selectedIngredientIndex;
      action.appliedPlateId = state.plateId || null;
      action.grossGrams = state.plateId ? (Math.max(1, Number(gross?.value) || Number(state.grossGrams) || grams.reduce((sum,value)=>sum+value,0))) : null;
      state.grossGrams = action.grossGrams;
    } else {
      names.forEach((name, index) => { action.items[index].name = name; });
    }
    action.formDraft = {
      ...(action.formDraft || {}),
      date: date?.value || action.date || selectedDateKey,
      time: time?.value || action.time || getCurrentTimeStr(),
      meal: state?.meal || mealButtons[0]?.dataset.meal || action.formDraft?.meal || action.meal || 'snack',
      plateId: plate ? plate.value : (action.appliedPlateId || ''),
      grossGrams: gross && plate?.value ? (Math.max(1, Number(gross.value) || 1)) : null,
      grams, names,
      selectedIngredientIndex: state?.selectedIngredientIndex ?? Math.max(0, Math.min(Number(action.selectedIngredientIndex) || 0, action.items.length - 1))
    };
    persistAssistantMessages();
  }

  function assistantActionCurrentGrams(messageId, action) {
    return action.items.map((item,index) => Math.max(1, Number(document.getElementById(`assistantActionGrams_${messageId}_${index}`)?.value) || Number(item.grams) || 1));
  }

  function assistantActionPieMarkup(items, grams, selectedIndex) {
    const total = Math.max(1, grams.reduce((sum,value) => sum + value, 0));
    let angle = -Math.PI / 2;
    const parts = ['<circle cx="120" cy="120" r="111" fill="#D7D4CF" opacity=".14"/>'];
    items.forEach((entry,index) => {
      const share = Math.max(0, Number(grams[index]) || 0) / total;
      const sweep = Math.PI * 2 * share;
      const start = angle, end = angle + sweep;
      const selected = index === selectedIndex;
      const radius = selected ? 101 : 96;
      if (share >= .9999) {
        parts.push(`<circle cx="120" cy="120" r="${radius}" fill="${DISH_SLICE_COLORS[index % DISH_SLICE_COLORS.length]}" />`);
        parts.push('<text class="dish-pie-label" x="120" y="120">100%</text>');
      } else {
        parts.push(`<path class="dish-pie-slice ${selected ? 'selected' : ''}" d="${dishSlicePath(start,end,radius)}" fill="${DISH_SLICE_COLORS[index % DISH_SLICE_COLORS.length]}" onclick="assistantActionSelectIngredient('${assistantActionActiveMessageId}',${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();assistantActionSelectIngredient('${assistantActionActiveMessageId}',${index})}" role="button" tabindex="0" aria-label="${esc(entry.name)} ${Math.round(share*100)} відсотків" />`);
        if (share >= .075) {
          const mid = start + sweep / 2;
          const labelRadius = radius * .62;
          const x = 120 + Math.cos(mid) * labelRadius;
          const y = 120 + Math.sin(mid) * labelRadius;
          parts.push(`<text class="dish-pie-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${Math.round(share*100)}%</text>`);
        }
      }
      angle = end;
    });
    parts.push('<circle cx="120" cy="120" r="111" fill="none" stroke="#9A9A9F" stroke-opacity=".3" stroke-width="5"/>');
    return parts.join('');
  }

  function refreshAssistantActionDish(messageId, updateInputs = false) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action) return;
    const action = message.action;
    const grams = assistantActionCurrentGrams(messageId, action);
    const total = Math.max(1, grams.reduce((sum,value) => sum + value, 0));
    const index = Math.max(0, Math.min(Number(action.selectedIngredientIndex) || 0, action.items.length - 1));
    action.selectedIngredientIndex = index;
    const selected = action.items[index];
    const share = grams[index] / total * 100;
    const svg = document.getElementById(`assistantActionPieSvg_${messageId}`);
    if (svg) svg.innerHTML = assistantActionPieMarkup(action.items, grams, index);
    const title = document.getElementById(`assistantActionSelectedTitle_${messageId}`);
    const meta = document.getElementById(`assistantActionSelectedMeta_${messageId}`);
    const shareValue = document.getElementById(`assistantActionShareValue_${messageId}`);
    const slider = document.getElementById(`assistantActionShare_${messageId}`);
    if (title) title.textContent = selected?.name || 'Страва';
    if (meta) meta.textContent = selected ? `${grams[index]} г · ${formatOneDecimal(share)}% від тарілки` : '—';
    if (shareValue) shareValue.textContent = `${Math.round(share)}%`;
    if (slider) {
      slider.value = String(Math.max(1, Math.min(99, Math.round(share))));
      slider.style.setProperty('--range-progress', `${Math.max(1, Math.min(99, share))}%`);
      slider.max = String(Math.max(1, Math.floor(100 * (total - (action.items.length - 1)) / total)));
      slider.disabled = action.items.length < 2;
    }
    const count = document.getElementById(`assistantActionIngredientCount_${messageId}`);
    if (count) count.textContent = `${action.items.length} ${action.items.length === 1 ? 'продукт' : action.items.length < 5 ? 'продукти' : 'продуктів'}`;
    action.items.forEach((item,i) => {
      const row = document.getElementById(`assistantActionIngredientRow_${messageId}_${i}`);
      const pct = document.getElementById(`assistantActionPercent_${messageId}_${i}`);
      const nameInput = document.getElementById(`assistantActionName_${messageId}_${i}`);
      if (row) row.classList.toggle('selected', i === index);
      if (pct) pct.textContent = `${formatOneDecimal(grams[i] / total * 100)}%`;
      if (updateInputs && nameInput && nameInput !== document.activeElement) nameInput.value = item.name;
    });
  }

  function assistantActionSelectIngredient(messageId, index) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || !message.action.items[index]) return;
    message.action.selectedIngredientIndex = index;
    refreshAssistantActionDish(messageId);
    saveAssistantActionDraft(messageId);
  }

  function assistantActionSetName(messageId, index, value) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action?.items[index]) return;
    message.action.items[index].name = value;
    if (Number(message.action.selectedIngredientIndex) === index) {
      const title = document.getElementById(`assistantActionSelectedTitle_${messageId}`);
      if (title) title.textContent = value.trim() || 'Без назви';
    }
    saveAssistantActionDraft(messageId);
  }

  function setAssistantActionIngredientShare(messageId, value) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.items.length < 2) return;
    const action = message.action;
    const gramsNow = assistantActionCurrentGrams(messageId, action);
    const total = gramsNow.reduce((sum,grams) => sum + grams, 0);
    const index = Math.max(0, Math.min(Number(action.selectedIngredientIndex) || 0, action.items.length - 1));
    const maxGrams = Math.max(1, total - (action.items.length - 1));
    const target = Math.max(1, Math.min(maxGrams, Math.round(total * Number(value) / 100)));
    const otherIndexes = action.items.map((_,i) => i).filter(i => i !== index);
    const redistributed = distributeDishGrams(total - target, otherIndexes.map(i => gramsNow[i]));
    const next = gramsNow.slice();
    next[index] = target;
    otherIndexes.forEach((itemIndex,n) => { next[itemIndex] = redistributed[n]; });
    next.forEach((grams,i) => { const input = document.getElementById(`assistantActionGrams_${messageId}_${i}`); if (input) input.value = String(grams); });
    updateAssistantActionTotal(messageId);
  }

  function selectAssistantActionMeal(messageId, mealId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action) return;
    const allowed = ['breakfast','lunch','dinner','snack'];
    if (!allowed.includes(mealId)) return;
    document.querySelectorAll(`#assistantActionMeal_${messageId} button`).forEach(button => button.classList.toggle('active', button.dataset.meal === mealId));
    saveAssistantActionDraft(messageId);
  }

  function assistantActionApplyPlate(messageId, plateId, grossTotal) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action) return false;
    const action = message.action;
    const currentNames = action.items.map(item => String(item.name || ''));
    const sourceItems = (action.grossItems || action.items).map((item,index) => ({...item, name:currentNames[index] || item.name}));
    const safeGross = Math.max(1, Math.round(Number(grossTotal) || sourceItems.reduce((sum,item) => sum + Number(item.grams || 0),0)));
    const plate = appState.plates.find(p => p.id === plateId) || null;
    const tare = plate && editingItemState?.tareEligible !== false ? Math.max(0, Number(plate.weight) || 0) : 0;
    const netTotal = safeGross - tare;
    if (plate && action.tareEligible !== false && netTotal < sourceItems.length) {
      showToast('Після віднімання тари має залишитися достатньо ваги для всіх інгредієнтів', '⚠️');
      return false;
    }
    if (plate && action.tareEligible !== false) {
      const exact = sourceItems.map(item => netTotal * (Number(item.grams) || 0) / sourceItems.reduce((sum,entry) => sum + (Number(entry.grams) || 0), 0));
      const allocated = exact.map(Math.floor);
      let remainder = netTotal - allocated.reduce((sum,value) => sum + value, 0);
      exact.map((value,index) => ({index, fraction:value-allocated[index]})).sort((a,b) => b.fraction-a.fraction).slice(0,remainder).forEach(part => allocated[part.index]++);
      action.items = sourceItems.map((item,index) => {
        const originalGrams = Math.max(1, Number(item.grams) || 1);
        const grams = Math.max(1, allocated[index]);
        const ratio = grams / originalGrams;
        return {...item, grams, kcal:Math.round(Number(item.kcal||0)*ratio), protein:Math.round(Number(item.protein||0)*ratio*10)/10, fat:Math.round(Number(item.fat||0)*ratio*10)/10, carb:Math.round(Number(item.carb||0)*ratio*10)/10};
      });
    } else {
      action.items = sourceItems;
    }
    action.appliedPlateId = plate ? plate.id : null;
    action.tareWeight = tare;
    action.grossGrams = plate ? safeGross : null;
    action.formDraft = {
      ...(action.formDraft || {}),
      plateId: plate ? plate.id : '',
      grossGrams: plate ? safeGross : null,
      grams: action.items.map(item => Math.max(1, Math.round(Number(item.grams) || 1))),
      names: action.items.map(item => item.name)
    };
    return true;
  }

  function assistantActionPlateChanged(messageId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.status !== 'pending') return;
    const action = message.action;
    const select = document.getElementById(`assistantActionPlate_${messageId}`);
    const grossInput = document.getElementById(`assistantActionGross_${messageId}`);
    const source = action.grossItems || action.items;
    const sourceGross = source.reduce((sum,item) => sum + Math.max(1, Number(item.grams) || 1), 0);
    const gross = Math.max(1, Number(grossInput?.value) || Number(action.grossGrams) || sourceGross);
    const plateId = select?.value || '';
    if (!assistantActionApplyPlate(messageId, plateId, gross)) {
      if (select) select.value = action.appliedPlateId || '';
      return;
    }
    const row = document.getElementById(`assistantActionGrossRow_${messageId}`);
    if (row) row.classList.toggle('hidden', !plateId);
    if (grossInput && plateId) grossInput.value = String(gross);
    action.selectedIngredientIndex = Math.min(Number(action.selectedIngredientIndex) || 0, action.items.length - 1);
    action.formDraft.grams.forEach((grams,index) => { const input = document.getElementById(`assistantActionGrams_${messageId}_${index}`); if (input) input.value = String(grams); });
    const tareLine = document.getElementById(`assistantActionTare_${messageId}`);
    const plate = appState.plates.find(p => p.id === plateId);
    const total = action.items.reduce((sum,item) => sum + Number(item.grams || 0),0);
    if (tareLine) {
      tareLine.textContent = plate ? (action.tareEligible === false ? 'Вага інгредієнтів задана окремо — тару не віднімаємо.' : `${gross} г брутто − ${Math.round(plate.weight)} г (${esc(plate.name)}) = ${Math.round(total)} г нетто`) : '';
      tareLine.classList.toggle('hidden', !plate);
    }
    refreshAssistantActionDish(messageId, true);
    updateAssistantActionTotal(messageId, false);
  }

  function assistantActionGrossChanged(messageId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action) return;
    const action = message.action;
    const grossInput = document.getElementById(`assistantActionGross_${messageId}`);
    const plateId = document.getElementById(`assistantActionPlate_${messageId}`)?.value || '';
    const plate = appState.plates.find(p => p.id === plateId);
    if (!plate) return;
    const gross = Math.max(1, Math.round(Number(grossInput?.value) || 1));
    const tare = action.tareEligible === false ? 0 : Math.max(0, Number(plate.weight) || 0);
    const net = gross - tare;
    if (net < action.items.length) {
      showToast('Вага брутто замала для цієї тарілки', '⚠️');
      if (grossInput) grossInput.value = String(Number(action.grossGrams) || net + tare);
      return;
    }
    const current = assistantActionCurrentGrams(messageId, action);
    const allocation = distributeDishGrams(net, current);
    allocation.forEach((grams,index) => { const input = document.getElementById(`assistantActionGrams_${messageId}_${index}`); if (input) input.value = String(grams); });
    action.grossGrams = gross;
    updateAssistantActionTotal(messageId, false);
  }

  function assistantActionRemoveIngredient(messageId, index) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.items.length <= 1) return;
    saveAssistantActionDraft(messageId);
    const action = message.action;
    const plateId = action.formDraft?.plateId || '';
    const gross = Number(action.formDraft?.grossGrams) || action.grossGrams || null;
    action.items.splice(index,1);
    if (action.grossItems?.length) action.grossItems.splice(index,1);
    if (action.originalNames?.length) action.originalNames.splice(index,1);
    const previousGrams = Array.isArray(action.formDraft?.grams) ? action.formDraft.grams : [];
    previousGrams.splice(index,1);
    action.selectedIngredientIndex = Math.max(0, Math.min(Number(action.selectedIngredientIndex) || 0, action.items.length - 1));
    action.formDraft.grams = previousGrams;
    if (plateId) {
      const sourceTotal = (action.grossItems || action.items).reduce((sum,item) => sum + Number(item.grams || 0),0);
      assistantActionApplyPlate(messageId, plateId, gross || sourceTotal);
    }
    const body = document.getElementById('assistantActionModalBody');
    body.innerHTML = assistantActionModalContent(action,messageId);
    refreshAssistantActionDish(messageId,true);
    updateAssistantActionTotal(messageId,false);
    saveAssistantActionDraft(messageId);
  }

  function updateAssistantActionModalViewport() {
    const sheet = document.getElementById('assistantActionSheet');
    if (!sheet || !assistantActionActiveMessageId) return;
    const viewport = window.visualViewport;
    if (viewport) {
      const visibleHeight = Math.max(220, Math.round(viewport.height));
      const bottomInset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      sheet.style.setProperty('--assistant-action-vh', `${visibleHeight}px`);
      sheet.style.setProperty('--assistant-action-bottom', `${bottomInset}px`);
    } else {
      sheet.style.removeProperty('--assistant-action-vh');
      sheet.style.removeProperty('--assistant-action-bottom');
    }
  }

  function openAssistantActionModal(messageId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.status !== 'pending') return;
    if (!Array.isArray(message.action.originalNames)) message.action.originalNames = (message.action.grossItems || message.action.items).map(item => String(item.name || ''));
    closeAllOverlays();
    assistantActionActiveMessageId = messageId;
    editingItemState = createAssistantDishEditorState(messageId, message.action);
    const backdrop = document.getElementById('assistantActionBackdrop');
    const sheet = document.getElementById('assistantActionSheet');
    const body = document.getElementById('assistantActionModalBody');
    const footer = document.getElementById('assistantActionModalFooter');
    body.innerHTML = assistantActionModalContent(message.action, messageId);
    footer.innerHTML = `<div class="assistant-action-modal-actions"><button type="button" onclick="confirmAssistantFood('${messageId}')" class="assistant-action-modal-confirm">Додати до щоденника</button><button type="button" onclick="discardAssistantAction('${messageId}')" class="assistant-action-modal-cancel">Скасувати</button></div>`;
    // Assign live values after injection as well: iOS date/time controls and
    // cloned number inputs can otherwise render empty until the first edit.
    const modalDate = document.getElementById(`assistantActionDate_${messageId}`);
    if (modalDate) modalDate.value = message.action.formDraft?.date || message.action.date || TODAY_KEY;
    const modalTime = dishEditorElement('editItemTime');
    if (modalTime) modalTime.value = message.action.formDraft?.time || message.action.time || getCurrentTimeStr();
    const modalGrams = dishEditorElement('editItemGrams');
    if (modalGrams) modalGrams.value = String(editingItemState.totalGrams);
    const modalGross = dishEditorElement('editItemGrossGrams');
    if (modalGross) modalGross.value = editingItemState.grossGrams ? String(editingItemState.grossGrams) : '';
    updateAssistantDateTimeDisplay(messageId);
    const plateSelect = dishEditorElement('editItemPlateSelect');
    if (plateSelect) plateSelect.value = editingItemState.plateId || '';
    renderDishEditor();
    syncEditPlateUI(editingItemState.totalGrams);
    selectEditMeal(editingItemState.meal);
    saveAssistantActionDraft(messageId);
    const session = ++assistantActionModalSession;
    backdrop.classList.add('visible');
    sheet.classList.add('visible');
    backdrop.setAttribute('aria-hidden', 'false');
    sheet.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('assistant-action-modal-open');
    updateAssistantActionModalViewport();
    requestAnimationFrame(() => {
      if (session !== assistantActionModalSession || assistantActionActiveMessageId !== messageId) return;
      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
  }

  function closeAssistantActionModal(saveDraft = true) {
    if (!assistantActionActiveMessageId) return;
    const activeMessage = assistantMessages.find(m => m.id === assistantActionActiveMessageId);
    if (activeMessage?.action?.isConfirming) return;
    const messageId = assistantActionActiveMessageId;
    if (saveDraft) saveAssistantActionDraft(messageId);
    if (editingItemState?.context === 'assistant' && editingItemState.messageId === messageId) editingItemState = null;
    assistantActionActiveMessageId = null;
    const session = ++assistantActionModalSession;
    const backdrop = document.getElementById('assistantActionBackdrop');
    const sheet = document.getElementById('assistantActionSheet');
    if (!backdrop || !sheet) return;
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    sheet.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('assistant-action-modal-open');
    if (sheet.style) {
      sheet.style.removeProperty('--assistant-action-vh');
      sheet.style.removeProperty('--assistant-action-bottom');
    }
    setTimeout(() => {
      if (session !== assistantActionModalSession || assistantActionActiveMessageId) return;
      backdrop.classList.remove('visible');
      sheet.classList.remove('visible');
    }, 340);
  }

  function renderAssistantChat() {
    const list = document.getElementById('assistantMessages');
    const welcome = document.getElementById('assistantWelcome');
    if (!list || !welcome) return;
    welcome.classList.toggle('hidden', assistantMessages.length > 0);
    list.innerHTML = assistantMessages.map((message) => {
      const isUser = message.role === 'user';
      const bubble = `<div class="assistant-message ${isUser ? 'assistant-message-user' : 'assistant-message-bot'}">${!isUser ? '<span class="assistant-avatar assistant-avatar-small"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 13.5 9l6.2 1.5-6.2 1.5-1.5 6.2-1.5-6.2L4.3 10.5 10.5 9 12 2.8Z"/></svg></span>' : ''}<div class="min-w-0"><div class="assistant-bubble ${isUser ? 'assistant-bubble-user' : 'assistant-bubble-bot'}">${assistantFormatText(message.text)}</div>${message.hasImage ? '<div class="assistant-photo-chip">▧ Фото</div>' : ''}<div class="assistant-message-meta">${esc(message.timeLabel || '')}</div></div></div>`;
      const summary = !isUser && ['today', 'selected', '7d', '30d'].includes(message.showSummary) ? assistantSummaryCard(message.showSummary) : '';
      const action = !isUser && message.action ? assistantActionCard(message.action, message.id) : '';
      return bubble + summary + action;
    }).join('');
    const typing = document.getElementById('assistantTyping');
    if (typing) typing.classList.toggle('hidden', !assistantBusy);
    requestAnimationFrame(scrollAssistantToBottom);
  }

  function addAssistantMessage(role, text, extra = {}) {
    const message = { id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, role, text: String(text || ''), timeLabel: assistantTimeLabel(), ...extra };
    assistantMessages.push(message);
    persistAssistantMessages();
    renderAssistantChat();
    return message;
  }

  function sendAssistantQuickPrompt(text) {
    const input = document.getElementById('foodPromptInput');
    input.value = text;
    updateComposerActions();
    sendAssistantMessage();
  }

  async function sendAssistantMessage() {
    if (assistantBusy) return;
    const input = document.getElementById('foodPromptInput');
    const text = input.value.trim();
    const imageDataUrl = pendingFoodImage || null;
    if (!text && !imageDataUrl) return;
    const userMessage = addAssistantMessage('user', text || 'Проаналізуй, будь ласка, це фото.', { hasImage: !!imageDataUrl });
    input.value = '';
    removeFoodImage();
    updateComposerActions();
    assistantBusy = true;
    document.getElementById('foodSubmitBtn').disabled = true;
    document.getElementById('micBtn').disabled = true;
    renderAssistantChat();
    try {
      const result = await requestAssistantResponse(text || 'Проаналізуй їжу на фото. Якщо я явно прошу занести її до щоденника, підготуй запис; інакше просто опиши побачене та приблизне КБЖВ.', imageDataUrl);
      if (result.type === 'add_food') {
        const id = `action_${Date.now()}_${++assistantPendingCounter}`;
        const action = { items: result.items.map(item => ({...item})), grossItems: result.items.map(item => ({...item})), originalNames: result.items.map(item => String(item.name || '')), grossGrams: result.items.reduce((sum, item) => sum + Number(item.grams || 0), 0), tareEligible: !hasMultipleExplicitFoodWeights(text), meal: result.meal, time: result.time, date: result.date || selectedDateKey, status: 'pending' };
        const actionMessage = addAssistantMessage('assistant', result.reply || 'Підготував позиції для щоденника. Перевір їх перед додаванням.', { action, id });
        openAssistantActionModal(actionMessage.id);
      } else {
        addAssistantMessage('assistant', result.reply, { showSummary: result.showSummary });
      }
    } catch (error) {
      const message = String(error.message || 'Невідома помилка').replace(/\s+/g, ' ').slice(0, 360);
      // Restore the exact draft (including photo) so a busy/failed Gemini request is retryable.
      assistantMessages = assistantMessages.filter(entry => entry.id !== userMessage.id);
      persistAssistantMessages();
      input.value = text;
      if (imageDataUrl) {
        pendingFoodImage = imageDataUrl;
        document.getElementById('foodImagePreviewName').textContent = 'Фото страви';
        document.getElementById('foodImagePreview').classList.remove('hidden');
      }
      updateComposerActions();
      addAssistantMessage('assistant', `Не вдалося виконати запит: ${message}\n\nТвій запит залишився в полі введення — можеш повторити спробу.`);
      if (!appState.apiKey || !appState.geminiModel) {
        setTimeout(() => {
          const list = document.getElementById('assistantMessages');
          if (list) {
            const last = list.lastElementChild;
            if (last) {
              const button = document.createElement('button');
              button.type = 'button'; button.className = 'assistant-action-secondary mt-2'; button.textContent = 'Відкрити налаштування Gemini';
              button.onclick = () => switchTab('settings');
              last.querySelector('.min-w-0')?.appendChild(button);
            }
          }
        }, 0);
      }
    } finally {
      assistantBusy = false;
      document.getElementById('foodSubmitBtn').disabled = false;
      document.getElementById('micBtn').disabled = false;
      renderAssistantChat();
    }
  }

  function updateAssistantActionTotal(messageId, syncGross = true) {
    const msg = assistantMessages.find(m => m.id === messageId);
    if (!msg?.action) return;
    const action = msg.action;
    const grams = assistantActionCurrentGrams(messageId, action);
    const totals = assistantActionTotals(action, grams);
    const setText = (suffix, value) => {
      const el = document.getElementById(`assistantAction${suffix}_${messageId}`);
      if (el) el.textContent = value;
    };
    setText('Total', `${Math.round(totals.grams)} г`);
    setText('Kcal', `${Math.round(totals.kcal)}`);
    setText('Protein', `${formatOneDecimal(totals.protein)} г`);
    setText('Fat', `${formatOneDecimal(totals.fat)} г`);
    setText('Carb', `${formatOneDecimal(totals.carb)} г`);
    const plateId = document.getElementById(`assistantActionPlate_${messageId}`)?.value || '';
    const plate = appState.plates.find(p => p.id === plateId);
    const tareLine = document.getElementById(`assistantActionTare_${messageId}`);
    const grossInput = document.getElementById(`assistantActionGross_${messageId}`);
    if (plate && grossInput) {
      const gross = syncGross && action.tareEligible !== false ? Math.round(totals.grams + Number(plate.weight || 0)) : Math.max(1, Number(grossInput.value) || totals.grams + Number(plate.weight || 0));
      if (syncGross && action.tareEligible !== false) grossInput.value = String(gross);
      action.grossGrams = action.tareEligible === false ? null : gross;
      if (tareLine) {
        tareLine.textContent = action.tareEligible === false
          ? 'Вага інгредієнтів задана окремо — тару не віднімаємо.'
          : `${gross} г брутто − ${Math.round(Number(plate.weight) || 0)} г (${plate.name}) = ${Math.round(totals.grams)} г нетто`;
        tareLine.classList.remove('hidden');
      }
    } else {
      if (grossInput) grossInput.value = String(Math.round(totals.grams));
      if (tareLine) {
        tareLine.textContent = '';
        tareLine.classList.add('hidden');
      }
      action.grossGrams = null;
    }
    refreshAssistantActionDish(messageId);
    saveAssistantActionDraft(messageId);
  }

  async function confirmAssistantFood(messageId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.status !== 'pending') return;
    const action = message.action;
    if (action.isConfirming) return;
    saveAssistantActionDraft(messageId);
    const editorState = editingItemState?.context === 'assistant' && editingItemState.messageId === messageId ? editingItemState : null;
    const grams = editorState ? editorState.items.map(item => Number(item.grams)) : assistantActionDraftGrams(action);
    if (grams.some(value => !Number.isFinite(value) || value < 1 || value > 10000)) {
      showToast('Перевір вагу кожного інгредієнта', '⚠️');
      return;
    }
    const date = document.getElementById(`assistantActionDate_${messageId}`).value;
    const time = (editingItemState?.context === 'assistant' ? dishEditorElement('editItemTime')?.value : document.getElementById(`assistantAction_editItemTime_${messageId}`)?.value) || getCurrentTimeStr();
    const meal = editorState?.meal || action.formDraft?.meal || action.meal || 'snack';
    const plateId = editorState?.plateId || action.formDraft?.plateId || null;
    const selectedPlate = appState.plates.find(plate => plate.id === plateId) || null;
    const netTotalGrams = grams.reduce((sum, value) => sum + Math.round(value || 0), 0);
    const draftGross = Number(editorState?.grossGrams || action.formDraft?.grossGrams || action.grossGrams || 0);
    const savedGrossGrams = selectedPlate && action.tareEligible !== false ? (draftGross || netTotalGrams + Number(selectedPlate.weight || 0)) : null;
    if (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { showToast('Перевір дату та час запису', '⚠️'); return; }
    const allowedMeals = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!allowedMeals.includes(meal)) return;
    const originalNames = Array.isArray(action.originalNames) ? action.originalNames : action.items.map(item => item.name);
    const changedIndices = [];
    const changed = [];
    action.items.forEach((item,index) => {
      const name = String(item.name || '').trim() || String(originalNames[index] || '');
      if (name.localeCompare(String(originalNames[index] || ''), 'uk', {sensitivity:'base'}) !== 0) {
        changedIndices.push(index);
        changed.push({...item, name, grams:Math.round(grams[index])});
      }
    });
    if (changed.length) {
      if (!(appState.apiKey || '').trim()) { showToast('Для перерахунку змінених інгредієнтів потрібен Gemini API-ключ', '⚠️'); return; }
      const confirmButton = document.querySelector('#assistantActionModalFooter .assistant-action-modal-confirm');
      const footerButtons = document.querySelectorAll('#assistantActionModalFooter button');
      const previousText = confirmButton?.textContent || 'Додати до щоденника';
      action.isConfirming = true;
      footerButtons.forEach(button => { button.disabled = true; });
      if (confirmButton) confirmButton.textContent = 'Gemini перераховує…';
      try {
        const recalculated = await recalculateEditedDishNames(changed, meal);
        changedIndices.forEach((targetIndex,index) => {
          if (recalculated[index]) {
            const result = recalculated[index];
            action.items[targetIndex] = {...action.items[targetIndex], name:changed[index].name, grams:Math.round(grams[targetIndex]), kcal:Number(result.kcal)||0, protein:Number(result.protein)||0, fat:Number(result.fat)||0, carb:Number(result.carb)||0};
          }
        });
      } catch (error) {
        const messageText = String(error.message || 'Не вдалося перерахувати КБЖВ').replace(/\s+/g,' ').slice(0,180);
        action.isConfirming = false;
        showToast(`Не вдалося перерахувати: ${messageText}`, '⚠️');
        footerButtons.forEach(button => { button.disabled = false; });
        if (confirmButton) confirmButton.textContent = previousText;
        return;
      }
      action.isConfirming = false;
      footerButtons.forEach(button => { button.disabled = false; });
      if (confirmButton) confirmButton.textContent = previousText;
      if (message.action !== action || action.status !== 'pending') return;
    }
    if (!appState.logs[date]) appState.logs[date] = [];
    const dishId = `dish_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    action.items.forEach((item, index) => {
      const ratio = grams[index] / Math.max(1, Number(item.grams));
      appState.logs[date].push({
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        dishId, mod: Date.now(), meal, time, name: item.name, grams: Math.round(grams[index]),
        plateId: index === 0 ? plateId : null, grossGrams: index === 0 ? savedGrossGrams : null, plateNote: index === 0 && selectedPlate && savedGrossGrams ? `${savedGrossGrams} г − ${selectedPlate.weight} г тари` : null, source: 'gemini-assistant',
        kcal: Math.round(Number(item.kcal) * ratio), protein: Math.round(Number(item.protein) * ratio * 10) / 10,
        fat: Math.round(Number(item.fat) * ratio * 10) / 10, carb: Math.round(Number(item.carb) * ratio * 10) / 10
      });
    });
    action.status = 'added'; action.date = date; action.time = time; action.meal = meal;
    closeAssistantActionModal(false);
    persistState(); persistAssistantMessages();
    if (date === selectedDateKey) renderDiary();
    renderAssistantChat();
    showToast(`Додано до щоденника · ${assistantDateLabel(date)}`, '✅');
  }

  function assistantGoToDiary(date) {
    if (date) selectedDateKey = date;
    renderDiary();
    switchTab('diary');
  }

  function discardAssistantAction(messageId) {
    const message = assistantMessages.find(m => m.id === messageId);
    if (!message?.action || message.action.isConfirming) return;
    if (assistantActionActiveMessageId === messageId) closeAssistantActionModal(false);
    message.action.status = 'discarded';
    message.action = null;
    message.text += '\n\nДодавання скасовано.';
    persistAssistantMessages();
    renderAssistantChat();
  }

  function clearAssistantChat() {
    if (!assistantMessages.length) return;
    if (!confirm('Очистити історію чату? Записи щоденника не зміняться.')) return;
    assistantMessages = [];
    persistAssistantMessages();
    renderAssistantChat();
    showToast('Історію чату очищено');
  }
