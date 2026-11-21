  // ==================== RENDER DIARY ====================
  function renderDiary() {
    const dObj = parseDateKey(selectedDateKey);
    const dayNum = dObj.getDate();
    const monthStr = UK_MONTHS_GEN[dObj.getMonth()];
    const weekdayStr = UK_WEEKDAYS[dObj.getDay()];

    let titlePrefix = `${dayNum} ${monthStr}`;
    if (selectedDateKey === TODAY_KEY) titlePrefix = `Сьогодні, ${dayNum} ${monthStr}`;
    else if (selectedDateKey === shiftKey(TODAY_KEY, -1)) titlePrefix = `Вчора, ${dayNum} ${monthStr}`;

    document.getElementById('currentDateTitle').textContent = titlePrefix;
    document.getElementById('currentDateSubtitle').textContent = weekdayStr;

    const items = appState.logs[selectedDateKey] || [];
    const targets = appState.targets;

    const totals = items.reduce(
      (acc, i) => ({
        kcal: acc.kcal + i.kcal,
        protein: acc.protein + i.protein,
        fat: acc.fat + i.fat,
        carb: acc.carb + i.carb
      }),
      { kcal: 0, protein: 0, fat: 0, carb: 0 }
    );

    updateMacroRing('kcalProgressRing', 'kcalRingCurrent', 'kcalRingTarget', totals.kcal, targets.kcal, '#D8B98A', 'ккал', true);
    updateMacroRing('proteinProgressRing', 'proteinRingCurrent', 'proteinRingTarget', totals.protein, targets.protein, '#0A84FF', 'г');
    updateMacroRing('fatProgressRing', 'fatRingCurrent', 'fatRingTarget', totals.fat, targets.fat, '#FF9F0A', 'г');
    updateMacroRing('carbProgressRing', 'carbRingCurrent', 'carbRingTarget', totals.carb, targets.carb, '#BF5AF2', 'г');

    // Meal cards: entries from one request share a dishId and render as one plate.
    const container = document.getElementById('mealsContainer');
    container.innerHTML = '';

    MEAL_META.forEach(mealMeta => {
      const mealItems = items.filter(i => i.meal === mealMeta.id).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
      const mealKcal = mealItems.reduce((sum, item) => sum + Number(item.kcal || 0), 0);
      const groups = [];
      const grouped = new Map();
      mealItems.forEach(item => {
        if (item.dishId) {
          if (!grouped.has(item.dishId)) {
            const group = { id: item.dishId, items: [], time: item.time, plateId: item.plateId || null, grossGrams: item.grossGrams || null };
            grouped.set(item.dishId, group);
            groups.push(group);
          }
          const group = grouped.get(item.dishId);
          group.items.push(item);
          if (!group.plateId && item.plateId) group.plateId = item.plateId;
          if (!group.grossGrams && item.grossGrams) group.grossGrams = item.grossGrams;
        } else {
          groups.push({ id: item.id, items: [item], time: item.time, plateId: item.plateId || null, grossGrams: item.grossGrams || null });
        }
      });

      const card = document.createElement('section');
      card.className = 'bg-[#1C1C1E] rounded-[20px] border border-white/[0.08] overflow-hidden meal-section-card';
      const headerHtml = `
        <div class="px-4 py-3 flex items-center justify-between ${mealItems.length > 0 ? 'border-b border-white/[0.07]' : ''}">
          <div class="flex items-center gap-2">
            <span class="meal-icon">${mealMeta.icon}</span>
            <h2 class="text-[15px] font-semibold text-white">${mealMeta.title}</h2>
            ${mealKcal > 0 ? `<span class="text-[13px] font-medium text-[#8E8E93]">· ${Math.round(mealKcal)} ккал</span>` : ''}
          </div>
        </div>
      `;

      let bodyHtml = '';
      if (groups.length === 0) {
        bodyHtml = '';
      } else {
        bodyHtml = `<div class="divide-y divide-white/[0.06]">` + groups.map(group => {
          const groupItems = group.items;
          const first = groupItems[0];
          const isDish = !!first.dishId;
          const grams = groupItems.reduce((sum, item) => sum + Number(item.grams || 0), 0);
          const kcal = groupItems.reduce((sum, item) => sum + Number(item.kcal || 0), 0);
          const protein = groupItems.reduce((sum, item) => sum + Number(item.protein || 0), 0);
          const fat = groupItems.reduce((sum, item) => sum + Number(item.fat || 0), 0);
          const carb = groupItems.reduce((sum, item) => sum + Number(item.carb || 0), 0);
          const title = isDish ? groupItems.map(x => x.name).join(' · ') : first.name;
          const meta = `${esc(group.time || first.time || '')} · ${formatSpacedInt(grams)} г`;
          return `
            <button onclick="openEditSheet('${first.id}')" class="meal-entry-card w-full text-left px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.06] transition flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="text-[14px] font-medium text-white ${isDish ? 'whitespace-normal leading-snug' : 'truncate'}">${esc(title)}</div>
                <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span class="text-[11px] text-[#8E8E93]">${meta}</span>
                  <span class="text-[11px] font-medium text-[#A1A1AA]">Б ${formatOneDecimal(protein)} г</span>
                  <span class="text-[11px] font-medium text-[#A1A1AA]">Ж ${formatOneDecimal(fat)} г</span>
                  <span class="text-[11px] font-medium text-[#A1A1AA]">В ${formatOneDecimal(carb)} г</span>
                </div>
              </div>
              <div class="shrink-0 text-right">
                <span class="text-[15px] font-semibold text-white">${Math.round(kcal)}</span>
                <span class="text-[11px] text-[#8E8E93]"> ккал</span>
              </div>
            </button>
          `;
        }).join('') + `</div>`;
      }

      card.innerHTML = headerHtml + bodyHtml;
      container.appendChild(card);
    });

    renderPlateSelectorUI();
  }

  // ==================== DATE STEPPERS & CALENDAR ====================
  document.getElementById('prevDayBtn').addEventListener('click', () => {
    const d = parseDateKey(selectedDateKey);
    d.setDate(d.getDate() - 1);
    selectedDateKey = toDateKey(d);
    renderDiary();
  });

  document.getElementById('nextDayBtn').addEventListener('click', () => {
    const d = parseDateKey(selectedDateKey);
    d.setDate(d.getDate() + 1);
    selectedDateKey = toDateKey(d);
    renderDiary();
  });

  function openCalendarSheet() {
    closeAllOverlays();
    const d = parseDateKey(selectedDateKey);
    calendarViewDate = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCalendarGrid();

    const bd = document.getElementById('calendarBackdrop');
    const sh = document.getElementById('calendarSheet');
    bd.classList.add('visible');
    sh.classList.add('visible');
    requestAnimationFrame(() => {
      bd.classList.add('open');
      sh.classList.add('open');
    });
  }

  function closeCalendarSheet() {
    const bd = document.getElementById('calendarBackdrop');
    const sh = document.getElementById('calendarSheet');
    bd.classList.remove('open');
    sh.classList.remove('open');
    setTimeout(() => {
      if (!sh.classList.contains('open')) {
        bd.classList.remove('visible');
        sh.classList.remove('visible');
      }
    }, 340);
  }

  function shiftCalendarMonth(delta) {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
    renderCalendarGrid();
  }

  function jumpToToday() {
    selectedDateKey = TODAY_KEY;
    closeCalendarSheet();
    renderDiary();
  }

  function renderCalendarGrid() {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    document.getElementById('calendarMonthTitle').textContent = `${UK_MONTHS_NOM[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('calendarDaysGrid');
    grid.innerHTML = '';

    for (let i = 0; i < startWeekday; i++) {
      grid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const key = toDateKey(dateObj);
      const dayLogs = appState.logs[key] || [];
      const dayKcal = dayLogs.reduce((s, x) => s + x.kcal, 0);
      const isSelected = key === selectedDateKey;
      const isToday = key === TODAY_KEY;

      let dotColor = '';
      if (dayKcal > 0) {
        dotColor = dayKcal <= appState.targets.kcal + 80 ? 'bg-[#D8B98A]' : 'bg-[#FF9F0A]';
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.onclick = () => {
        selectedDateKey = key;
        closeCalendarSheet();
        renderDiary();
      };
      btn.className = `h-10 rounded-[12px] flex flex-col items-center justify-center relative transition ${
        isSelected
          ? 'bg-[#D8B98A] text-white font-bold shadow'
          : isToday
            ? 'bg-[#2C2C2E] text-[#D8B98A] font-bold border border-[#D8B98A]/40'
            : 'hover:bg-[#2C2C2E] text-white/90 font-medium'
      }`;
      btn.innerHTML = `
        <span class="text-[13px]">${day}</span>
        <span class="w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected && dotColor ? 'bg-white' : dotColor || 'bg-transparent'}"></span>
      `;
      grid.appendChild(btn);
    }
  }

  // ==================== PLATES (AUTO-TARE) ====================
  function getSelectedPlate() {
    return appState.plates.find(p => p.id === appState.selectedPlateId) || null;
  }

  function renderPlateSelectorUI() {
    const selected = getSelectedPlate();
    const label = document.getElementById('selectedPlateLabel');
    const btn = document.getElementById('plateSelectorBtn');
    const opts = document.getElementById('plateDropdownOptions');
    if (!label || !btn || !opts) return;

    if (selected) {
      label.textContent = `${selected.name} -${selected.weight}г`;
      btn.classList.add('border-[#D8B98A]/50', 'text-[#D8B98A]');
    } else {
      label.textContent = 'Без посуду';
      btn.classList.remove('border-[#D8B98A]/50', 'text-[#D8B98A]');
    }

    opts.innerHTML = `
      <button type="button" onclick="selectPlate(null, event)"
              class="w-full px-3.5 py-2.5 text-left text-[13px] bg-[#2C2C2E] hover:bg-[#3A3A3C] flex items-center justify-between ${!selected ? 'text-white font-semibold' : 'text-white/80'}">
        <span>Без посуду (чиста вага)</span>
        ${!selected ? '<span class="text-[#D8B98A] font-bold">✓</span>' : ''}
      </button>
    ` + appState.plates.map(p => `
      <button type="button" onclick="selectPlate('${p.id}', event)"
              class="w-full px-3.5 py-2.5 text-left text-[13px] bg-[#2C2C2E] hover:bg-[#3A3A3C] flex items-center justify-between ${selected && selected.id === p.id ? 'text-white font-semibold' : 'text-white/85'}">
        <div>
          <span class="block">${esc(p.name)}</span>
          <span class="text-[11px] text-[#8E8E93]">Тара: −${p.weight} г</span>
        </div>
        ${selected && selected.id === p.id ? '<span class="text-[#D8B98A] font-bold">✓</span>' : ''}
      </button>
    `).join('');
  }

  function togglePlateDropdown(e) {
    e.stopPropagation();
    document.getElementById('plateDropdownMenu').classList.toggle('hidden');
  }

  function selectPlate(plateId, e) {
    if (e) e.stopPropagation();
    appState.selectedPlateId = plateId;
    document.getElementById('plateDropdownMenu').classList.add('hidden');
    persistState();
    renderPlateSelectorUI();
    const p = getSelectedPlate();
    if (p) showToast(`Обрано: ${p.name} (−${p.weight} г)`, '🍽');
  }

  function goToPlatesSettings(e) {
    if (e) e.stopPropagation();
    closeAllOverlays();
    switchTab('settings');
    setTimeout(() => {
      const section = document.getElementById('platesSettingsSection');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        section.classList.add('ring-2', 'ring-[#D8B98A]/60');
        setTimeout(() => section.classList.remove('ring-2', 'ring-[#D8B98A]/60'), 1400);
      }
      const nameInp = document.getElementById('newPlateName');
      if (nameInp) nameInp.focus();
    }, 80);
  }

  function renderPlatesSettingsList() {
    const list = document.getElementById('platesSettingsList');
    if (appState.plates.length === 0) {
      list.innerHTML = `<div class="px-4 py-3 text-[13px] text-[#8E8E93]">Поки немає збереженого посуду</div>`;
      return;
    }
    list.innerHTML = appState.plates.map(p => `
      <div class="px-4 py-3 flex items-center justify-between">
        <div>
          <span class="text-[15px] font-medium text-white block">${esc(p.name)}</span>
          <span class="text-[12px] text-[#8E8E93]">Вага посуду: ${p.weight} г</span>
        </div>
        <button type="button" onclick="deletePlate('${p.id}')" class="px-2.5 py-1 rounded-[8px] bg-[#FF453A]/15 text-[#FF453A] text-[12px] font-semibold">
          Видалити
        </button>
      </div>
    `).join('');
  }

  function addNewPlate(e) {
    e.preventDefault();
    const nameInp = document.getElementById('newPlateName');
    const weightInp = document.getElementById('newPlateWeight');
    const name = nameInp.value.trim();
    const weight = parseInt(weightInp.value, 10);

    if (!name || !weight || weight <= 0) {
      showToast('Вкажи назву посуду та його вагу', '⚠️');
      return;
    }

    appState.plates.push({ id: 'plate_' + Date.now(), name, weight });
    nameInp.value = '';
    weightInp.value = '';
    persistState();
    renderPlatesSettingsList();
    renderPlateSelectorUI();
    showToast(`Посуд «${name}» додано`, '🍽');
  }

  function deletePlate(plateId) {
    appState.plates = appState.plates.filter(p => p.id !== plateId);
    if (appState.selectedPlateId === plateId) appState.selectedPlateId = null;
    persistState();
    renderPlatesSettingsList();
    renderPlateSelectorUI();
    showToast('Посуд видалено', '🗑️');
  }
