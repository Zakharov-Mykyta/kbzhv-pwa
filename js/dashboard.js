  // ==================== 4-TAB NAVIGATION ====================
  function switchTab(tab) {
    closeAllOverlays();
    const views = {
      diary: document.getElementById('viewDiary'),
      stats: document.getElementById('viewStats'),
      assistant: document.getElementById('viewAssistant'),
      settings: document.getElementById('viewSettings')
    };
    const tabs = {
      diary: document.getElementById('tabDiary'),
      stats: document.getElementById('tabStats'),
      assistant: document.getElementById('tabAssistant'),
      settings: document.getElementById('tabSettings')
    };
    Object.keys(views).forEach(k => {
      const active = k === tab;
      views[k].classList.toggle('hidden', !active);
      tabs[k].classList.toggle('text-[#D8B98A]', active);
      tabs[k].classList.toggle('text-[#8E8E93]', !active);
      tabs[k].setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (tab === 'stats') renderStats();
    if (tab === 'assistant') {
      renderAssistantChat();
      requestAnimationFrame(scrollAssistantToBottom);
    }
    if (tab === 'settings') populateSettingsInputs();
  }

  // ==================== STATISTICS ====================
  function togglePeriodDropdown(e) {
    e.stopPropagation();
    document.getElementById('periodDropdownMenu').classList.toggle('hidden');
  }

  function selectStatPeriod(period, labelText) {
    statPeriod = period;
    document.getElementById('periodDropdownLabel').textContent = labelText;
    document.getElementById('periodDropdownMenu').classList.add('hidden');

    document.querySelectorAll('[data-period-check]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.periodCheck !== period);
    });

    const customBar = document.getElementById('customRangeBar');
    if (period === 'custom') {
      customBar.classList.remove('hidden');
      const startInp = document.getElementById('customStartInput');
      const endInp = document.getElementById('customEndInput');
      if (!startInp.value) startInp.value = shiftKey(TODAY_KEY, -13);
      if (!endInp.value) endInp.value = TODAY_KEY;
    } else {
      customBar.classList.add('hidden');
    }

    renderStats();
  }

  function setStatMacro(macro) {
    statMacro = macro;
    ['kcal', 'protein', 'fat', 'carb'].forEach(m => {
      const btn = document.getElementById(`macroBtn_${m}`);
      btn.className = m === macro
        ? 'rounded-[9px] text-[12px] font-semibold bg-[#2C2C2E] text-white shadow transition'
        : 'rounded-[9px] text-[12px] font-semibold text-[#8E8E93] transition';
    });
    renderStats();
  }

  function getDaySums(dateKey) {
    const list = appState.logs[dateKey] || [];
    return list.reduce(
      (acc, i) => ({
        kcal: acc.kcal + i.kcal,
        protein: acc.protein + i.protein,
        fat: acc.fat + i.fat,
        carb: acc.carb + i.carb
      }),
      { kcal: 0, protein: 0, fat: 0, carb: 0 }
    );
  }

  function buildSeriesForPeriod() {
    const today = parseDateKey(TODAY_KEY);

    if (statPeriod === '7d') {
      document.getElementById('statHeaderSubtitle').textContent = 'Останні 7 днів';
      const arr = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = toDateKey(d);
        arr.push({
          label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
          fullTitle: `${d.getDate()} ${UK_MONTHS_GEN[d.getMonth()]}`,
          isToday: key === TODAY_KEY,
          ...getDaySums(key)
        });
      }
      return arr;
    }

    if (statPeriod === '30d') {
      document.getElementById('statHeaderSubtitle').textContent = 'Останні 30 днів';
      const arr = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = toDateKey(d);
        arr.push({
          label: `${d.getDate()}`,
          fullTitle: `${d.getDate()} ${UK_MONTHS_GEN[d.getMonth()]}`,
          isToday: key === TODAY_KEY,
          ...getDaySums(key)
        });
      }
      return arr;
    }

    if (statPeriod === '1y') {
      document.getElementById('statHeaderSubtitle').textContent = 'Останні 12 місяців (середнє/день)';
      const arr = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const pref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`;
        const days = Object.keys(appState.logs).filter(k => k.startsWith(pref)).map(k => getDaySums(k)).filter(x => x.kcal > 0);
        const n = days.length || 1;
        const avg = f => days.reduce((a, x) => a + x[f], 0) / n;
        arr.push({
          label: UK_MONTHS_NOM[d.getMonth()].slice(0, 3),
          fullTitle: `${UK_MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`,
          isToday: i === 0,
          kcal: avg('kcal'), protein: avg('protein'), fat: avg('fat'), carb: avg('carb')
        });
      }
      return arr;
    }

    const startStr = document.getElementById('customStartInput').value || shiftKey(TODAY_KEY, -13);
    const endStr = document.getElementById('customEndInput').value || TODAY_KEY;
    let sDate = parseDateKey(startStr);
    let eDate = parseDateKey(endStr);
    if (sDate > eDate) [sDate, eDate] = [eDate, sDate];

    document.getElementById('statHeaderSubtitle').textContent = `${startStr.slice(5)} — ${endStr.slice(5)}`;
    const arr = [];
    const cursor = new Date(sDate);
    let guard = 0;
    while (cursor <= eDate && guard < 45) {
      const key = toDateKey(cursor);
      arr.push({
        label: `${cursor.getDate()}`,
        fullTitle: `${cursor.getDate()} ${UK_MONTHS_GEN[cursor.getMonth()]}`,
        isToday: key === TODAY_KEY,
        ...getDaySums(key)
      });
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    return arr;
  }

  function renderStats() {
    const series = buildSeriesForPeriod();
    const macroConfig = {
      kcal: { unit: 'ккал', color: '#D8B98A', target: appState.targets.kcal },
      protein: { unit: 'г білка', color: '#D8B98A', target: appState.targets.protein },
      fat: { unit: 'г жирів', color: '#FF9F0A', target: appState.targets.fat },
      carb: { unit: 'г вуглев.', color: '#BF5AF2', target: appState.targets.carb }
    };

    const cfg = macroConfig[statMacro];
    const validDays = series.filter(d => d.kcal > 0 && (!d.isToday || d.kcal >= 600));
    const divisor = validDays.length || 1;

    const avgMetric = Math.round(validDays.reduce((s, d) => s + d[statMacro], 0) / divisor);
    document.getElementById('chartAvgValue').textContent = formatSpacedInt(avgMetric);
    const unitEl = document.getElementById('chartAvgUnit');
    unitEl.textContent = cfg.unit;
    unitEl.style.color = cfg.color;
    document.getElementById('chartTargetValue').textContent = `${formatSpacedInt(cfg.target)} ${statMacro === 'kcal' ? 'ккал' : 'г'}`;

    const avgKcal = Math.round(validDays.reduce((s, d) => s + d.kcal, 0) / divisor);
    const avgProt = Math.round(validDays.reduce((s, d) => s + d.protein, 0) / divisor);
    const avgFat = Math.round(validDays.reduce((s, d) => s + d.fat, 0) / divisor);
    const avgCarb = Math.round(validDays.reduce((s, d) => s + d.carb, 0) / divisor);

    document.getElementById('avgGridKcal').textContent = `${formatSpacedInt(avgKcal)} ккал`;
    const diff = avgKcal - appState.targets.kcal;
    document.getElementById('avgGridDeficit').textContent = validDays.length ? `${diff > 0 ? '+' : ''}${formatSpacedInt(diff)} ккал/д до цілі` : 'Немає даних';
    document.getElementById('avgGridProtein').textContent = `${avgProt} г`;
    document.getElementById('avgGridFat').textContent = `${avgFat} г`;
    document.getElementById('avgGridCarb').textContent = `${avgCarb} г`;

    const maxDataVal = Math.max(...series.map(d => d[statMacro]), cfg.target * 1.15, 10);
    const plotHeightPx = 132;
    const targetPx = Math.min(plotHeightPx - 6, Math.round((cfg.target / maxDataVal) * plotHeightPx));
    document.getElementById('chartTargetLine').style.bottom = `${targetPx}px`;

    document.getElementById('barDetailPill').classList.add('hidden');
    const plotArea = document.getElementById('chartPlotArea');
    const xAxis = document.getElementById('chartXAxis');
    plotArea.querySelectorAll('.bar-slot').forEach(el => el.remove());
    xAxis.innerHTML = '';

    const count = series.length;
    const gapClass = count > 20 ? 'gap-[2px]' : count > 10 ? 'gap-1' : 'gap-2.5';
    plotArea.className = `relative h-[140px] flex items-end justify-between border-b border-white/[0.08] ${gapClass}`;
    xAxis.className = `flex items-center justify-between pt-2 ${gapClass}`;

    series.forEach((point, idx) => {
      const val = Math.round(point[statMacro]);
      const barPx = val > 0 ? Math.max(6, Math.round((val / maxDataVal) * plotHeightPx)) : 3;

      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'bar-slot flex-1 h-full flex items-end justify-center group focus:outline-none z-20';
      slot.onclick = () => {
        document.getElementById('barDetailPill').classList.remove('hidden');
        document.getElementById('barDetailLabel').textContent = point.fullTitle;
        document.getElementById('barDetailVal').textContent = `${formatSpacedInt(val)} ${statMacro === 'kcal' ? 'ккал' : 'г'}`;
        document.getElementById('barDetailVal').style.color = cfg.color;
      };

      const bar = document.createElement('div');
      bar.style.height = `${barPx}px`;
      bar.style.backgroundColor = val === 0 ? '#2C2C2E' : cfg.color;
      bar.className = `w-full max-w-[26px] ${count > 20 ? 'rounded-t-[3px]' : 'rounded-t-[7px]'} transition-all duration-300 group-hover:opacity-80`;
      slot.appendChild(bar);
      plotArea.appendChild(slot);

      const tick = document.createElement('span');
      const showTick = count <= 12 || idx === 0 || idx === count - 1 || idx % 5 === 0;
      tick.className = `flex-1 text-center text-[10px] font-medium ${point.isToday ? 'text-white font-bold' : 'text-[#8E8E93]'}`;
      tick.textContent = showTick ? point.label : '';
      xAxis.appendChild(tick);
    });
  }
