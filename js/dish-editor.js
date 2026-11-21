  // ==================== EDIT ITEM SHEET (WITH PLATE TARE) ====================
  function openEditSheet(itemId) {
    closeAllOverlays();
    const allItems = appState.logs[selectedDateKey] || [];
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const isGroup = !!item.dishId;
    const groupItems = isGroup
      ? allItems.filter(i => i.dishId === item.dishId).sort((a,b) => String(a.time || '').localeCompare(String(b.time || '')))
      : [item];
    const safeItems = groupItems.map(entry => {
      const grams = Math.max(1, Number(entry.grams) || 1);
      return {
        ...entry,
        originalName: entry.name,
        originalGrams: grams,
        perGram: {
          kcal: Number(entry.kcal || 0) / grams,
          protein: Number(entry.protein || 0) / grams,
          fat: Number(entry.fat || 0) / grams,
          carb: Number(entry.carb || 0) / grams
        }
      };
    });
    const totalGrams = safeItems.reduce((sum, entry) => sum + entry.grams, 0);
    const initialPlateId = groupItems.find(entry => entry.plateId)?.plateId || '';
    const firstGross = groupItems.find(entry => entry.grossGrams)?.grossGrams || null;
    const plateSelect = dishEditorElement('editItemPlateSelect');
    plateSelect.innerHTML = `<option value="">Без посуду</option>` +
      appState.plates.map(plate => `<option value="${plate.id}">${esc(plate.name)} (−${plate.weight} г)</option>`).join('');
    plateSelect.value = initialPlateId;

    editingItemState = isGroup ? {
      id: item.id,
      dishId: item.dishId,
      isGroup: true,
      items: safeItems,
      selectedIngredientIndex: 0,
      meal: item.meal,
      plateId: initialPlateId,
      grossGrams: firstGross,
      totalGrams,
      isSaving: false
    } : {
      id: item.id,
      originalName: item.name,
      meal: item.meal,
      plateId: initialPlateId,
      perGram: safeItems[0].perGram,
      isGroup: false,
      isSaving: false
    };

    const singleNameWrap = document.getElementById('editSingleNameWrap');
    const dishEditor = document.getElementById('editDishEditor');
    const title = document.querySelector('#editSheet h3');
    singleNameWrap.classList.toggle('hidden', isGroup);
    dishEditor.classList.toggle('hidden', !isGroup);
    title.textContent = isGroup ? 'Редагувати тарілку' : 'Редагувати запис';

    document.getElementById('editItemName').value = item.name;
    document.getElementById('editItemTime').value = item.time || getCurrentTimeStr();
    dishEditorElement('editItemGrams').value = isGroup ? totalGrams : item.grams;
    document.getElementById('editItemSlider').value = Math.min(800, isGroup ? totalGrams : item.grams);
    document.getElementById('editItemSlider').classList.toggle('hidden', isGroup);

    const activePlate = appState.plates.find(plate => plate.id === initialPlateId);
    dishEditorElement('editItemGrossGrams').value = firstGross || (activePlate ? totalGrams + activePlate.weight : '');
    syncEditPlateUI(totalGrams);
    selectEditMeal(item.meal);
    if (isGroup) renderDishEditor();
    updateEditPreview(totalGrams);

    const bd = document.getElementById('editBackdrop');
    const sh = document.getElementById('editSheet');
    bd.classList.add('visible');
    sh.classList.add('visible');
    requestAnimationFrame(() => {
      bd.classList.add('open');
      sh.classList.add('open');
      requestAnimationFrame(() => {
        if (isGroup && editingItemState?.isGroup) renderDishEditor();
      });
    });
  }

  function getDishTotalGrams() {
    if (!editingItemState?.isGroup) return 0;
    return editingItemState.items.reduce((sum, entry) => sum + Math.max(1, Number(entry.grams) || 1), 0);
  }

  function distributeDishGrams(total, weightHints) {
    const count = weightHints.length;
    if (!count) return [];
    const safeTotal = Math.max(count, Math.round(Number(total) || count));
    if (count === 1) return [safeTotal];
    const hints = weightHints.map(value => Math.max(1, Number(value) || 1));
    const sum = hints.reduce((a,b) => a+b, 0);
    const pool = safeTotal - count;
    let assigned = 0;
    return hints.map((weight, index) => {
      if (index === count - 1) return safeTotal - assigned;
      const value = 1 + Math.floor(pool * weight / sum);
      assigned += value;
      return value;
    });
  }

  function getDishEditorTareWeight(plate) {
    if (!plate) return 0;
    if (editingItemState?.context === 'assistant' && editingItemState.tareEligible === false) return 0;
    return Math.max(0, Number(plate.weight) || 0);
  }

  function getDishEditorTareHint(gross, plate, net) {
    if (editingItemState?.context === 'assistant' && editingItemState.tareEligible === false) {
      return 'Вага інгредієнтів задана окремо — тару не віднімаємо.';
    }
    return `${gross} г брутто − ${Math.round(Number(plate?.weight) || 0)} г (${plate?.name || 'посуд'}) = ${net} г нетто`;
  }

  function setDishTotalGrams(total, updateInput = true) {
    if (!editingItemState?.isGroup) return;
    const items = editingItemState.items;
    const grams = distributeDishGrams(total, items.map(entry => entry.grams));
    items.forEach((entry, index) => { entry.grams = grams[index]; });
    editingItemState.totalGrams = grams.reduce((sum,value) => sum+value,0);
    if (updateInput) dishEditorElement('editItemGrams').value = editingItemState.totalGrams;
    const plate = appState.plates.find(p => p.id === editingItemState.plateId);
    if (plate) {
      const tareWeight = getDishEditorTareWeight(plate);
      const gross = editingItemState.totalGrams + tareWeight;
      dishEditorElement('editItemGrossGrams').value = gross;
      editingItemState.grossGrams = gross;
      if (editingItemState.context === 'assistant' && editingItemState.sourceGrossGrams != null) {
        editingItemState.sourceGrossGrams = gross;
      }
      const hint = dishEditorElement('editTareFormulaHint');
      hint.textContent = getDishEditorTareHint(gross, plate, editingItemState.totalGrams);
      hint.classList.remove('hidden');
    }
    renderDishEditor();
    updateEditPreview(editingItemState.totalGrams);
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  function setDishIngredientName(index, value) {
    const entry = editingItemState?.items?.[index];
    if (!entry) return;
    entry.name = value;
    if (editingItemState.selectedIngredientIndex === index) {
      const title = dishEditorElement('dishSelectedTitle');
      if (title) title.textContent = value.trim() || 'Без назви';
    }
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  function setDishIngredientGrams(index, value) {
    if (!editingItemState?.isGroup) return;
    const items = editingItemState.items;
    if (!items[index]) return;
    const total = getDishTotalGrams();
    const requested = Math.max(1, Math.round(Number(value) || 1));
    if (items.length === 1) {
      items[0].grams = requested;
      editingItemState.totalGrams = requested;
    } else {
      const target = Math.min(requested, Math.max(1, total - (items.length - 1)));
      const others = items.map((entry, i) => i === index ? 0 : entry.grams);
      const rest = distributeDishGrams(total - target, others.filter((_,i) => i !== index));
      let cursor = 0;
      items.forEach((entry, i) => { entry.grams = i === index ? target : rest[cursor++]; });
      editingItemState.totalGrams = total;
    }
    dishEditorElement('editItemGrams').value = editingItemState.totalGrams;
    const plate = appState.plates.find(p => p.id === editingItemState.plateId);
    if (plate) {
      const tareWeight = getDishEditorTareWeight(plate);
      const gross = editingItemState.totalGrams + tareWeight;
      dishEditorElement('editItemGrossGrams').value = gross;
      editingItemState.grossGrams = gross;
      dishEditorElement('editTareFormulaHint').textContent = getDishEditorTareHint(gross, plate, editingItemState.totalGrams);
    }
    renderDishEditor();
    updateEditPreview(editingItemState.totalGrams);
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  function setDishIngredientShare(value) {
    if (!editingItemState?.isGroup || editingItemState.items.length < 2) return;
    const state = editingItemState;
    const index = state.selectedIngredientIndex;
    const total = getDishTotalGrams();
    const count = state.items.length;
    const maxGrams = Math.max(1, total - (count - 1));
    const targetGrams = Math.max(1, Math.min(maxGrams, Math.round(total * Number(value) / 100)));
    const otherIndexes = state.items.map((_,i) => i).filter(i => i !== index);
    const otherWeights = otherIndexes.map(i => state.items[i].grams);
    const redistributed = distributeDishGrams(total - targetGrams, otherWeights);
    state.items[index].grams = targetGrams;
    otherIndexes.forEach((itemIndex, n) => { state.items[itemIndex].grams = redistributed[n]; });
    state.totalGrams = total;
    dishEditorElement('editItemGrams').value = total;
    const plate = appState.plates.find(p => p.id === state.plateId);
    if (plate) {
      const tareWeight = getDishEditorTareWeight(plate);
      const gross = total + tareWeight;
      dishEditorElement('editItemGrossGrams').value = gross;
      state.grossGrams = gross;
      dishEditorElement('editTareFormulaHint').textContent = getDishEditorTareHint(gross, plate, total);
    }
    refreshDishEditorVisuals();
    updateEditPreview(total);
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  function selectDishIngredient(index) {
    if (!editingItemState?.isGroup || !editingItemState.items[index]) return;
    editingItemState.selectedIngredientIndex = index;
    renderDishEditor();
  }

  function focusDishIngredient(index) {
    if (!editingItemState?.isGroup || !editingItemState.items[index]) return;
    editingItemState.selectedIngredientIndex = index;
    refreshDishEditorVisuals(false);
  }

  function removeDishIngredient(index) {
    if (!editingItemState?.isGroup) return;
    if (editingItemState.items.length <= 1) {
      showToast('У тарілці має залишитися хоча б один складник', '⚠️');
      return;
    }
    editingItemState.items.splice(index, 1);
    editingItemState.selectedIngredientIndex = Math.max(0, Math.min(editingItemState.selectedIngredientIndex, editingItemState.items.length - 1));
    editingItemState.totalGrams = getDishTotalGrams();
    dishEditorElement('editItemGrams').value = editingItemState.totalGrams;
    const plate = appState.plates.find(p => p.id === editingItemState.plateId);
    if (plate) {
      const tareWeight = getDishEditorTareWeight(plate);
      const gross = editingItemState.totalGrams + tareWeight;
      dishEditorElement('editItemGrossGrams').value = gross;
      editingItemState.grossGrams = gross;
      dishEditorElement('editTareFormulaHint').textContent = getDishEditorTareHint(gross, plate, editingItemState.totalGrams);
    }
    renderDishEditor();
    updateEditPreview(editingItemState.totalGrams);
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  const DISH_SLICE_COLORS = ['#D8B98A','#0A84FF','#FF9F0A','#BF5AF2','#FF6482','#64D2FF','#A1A1AA','#D0A5FF'];

  function dishSlicePath(startAngle, endAngle, radius = 96) {
    const cx = 120, cy = 120;
    const start = { x: cx + radius * Math.cos(startAngle), y: cy + radius * Math.sin(startAngle) };
    const end = { x: cx + radius * Math.cos(endAngle), y: cy + radius * Math.sin(endAngle) };
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
  }

  function buildDishPieSvg() {
    const items = editingItemState?.items || [];
    const total = Math.max(1, getDishTotalGrams());
    let angle = -Math.PI / 2;
    const parts = ['<circle cx="120" cy="120" r="111" fill="#D7D4CF" opacity=".14"/>'];
    items.forEach((entry,index) => {
      const share = Math.max(0, Number(entry.grams) || 0) / total;
      const sweep = Math.PI * 2 * share;
      const start = angle, end = angle + sweep;
      const selected = index === editingItemState.selectedIngredientIndex;
      const radius = selected ? 101 : 96;
      let path;
      if (share >= .9999) path = '<circle cx="120" cy="120" r="96" fill="' + DISH_SLICE_COLORS[index % DISH_SLICE_COLORS.length] + '" />';
      else path = `<path class="dish-pie-slice ${selected ? 'selected' : ''}" d="${dishSlicePath(start,end,radius)}" fill="${DISH_SLICE_COLORS[index % DISH_SLICE_COLORS.length]}" onclick="selectDishIngredient(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDishIngredient(${index})}" role="button" tabindex="0" aria-label="${esc(entry.name)} ${Math.round(share*100)} відсотків" />`;
      parts.push(path);
      if (share >= .075) {
        const mid = start + sweep / 2;
        const labelRadius = radius * .62;
        const x = 120 + Math.cos(mid) * labelRadius;
        const y = 120 + Math.sin(mid) * labelRadius;
        parts.push(`<text class="dish-pie-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${Math.round(share*100)}%</text>`);
      }
      angle = end;
    });
    parts.push('<circle cx="120" cy="120" r="111" fill="none" stroke="#9A9A9F" stroke-opacity=".3" stroke-width="5"/>');
    return parts.join('');
  }

  function refreshDishEditorVisuals(updateList = true) {
    if (!editingItemState?.isGroup) return;
    const items = editingItemState.items;
    const total = Math.max(1,getDishTotalGrams());
    const index = Math.max(0,Math.min(editingItemState.selectedIngredientIndex,items.length-1));
    editingItemState.selectedIngredientIndex = index;
    const selected = items[index];
    const share = selected ? selected.grams / total * 100 : 0;
    const svg = dishEditorElement('dishPieSvg');
    if (svg) svg.innerHTML = buildDishPieSvg();
    const title = dishEditorElement('dishSelectedTitle');
    const meta = dishEditorElement('dishSelectedMeta');
    if (title) title.textContent = selected?.name || 'Обери сектор';
    if (meta) meta.textContent = selected ? `${selected.grams} г · ${formatOneDecimal(share)}% від тарілки` : '—';
    const value = dishEditorElement('dishShareValue');
    if (value) value.textContent = `${Math.round(share)}%`;
    const slider = dishEditorElement('dishShareSlider');
    if (slider) {
      slider.value = String(Math.max(1,Math.min(99,Math.round(share))));
      slider.style.setProperty('--range-progress', `${Math.max(1,Math.min(99,share))}%`);
      slider.disabled = items.length < 2;
      slider.max = String(Math.max(1,Math.floor(100*(total-(items.length-1))/total)));
    }
    const count = dishEditorElement('dishIngredientCount');
    if (count) count.textContent = `${items.length} ${items.length === 1 ? 'продукт' : items.length < 5 ? 'продукти' : 'продуктів'}`;
    const list = dishEditorElement('dishIngredientsList');
    if (list && updateList) list.innerHTML = items.map((entry,i) => {
      const pct = entry.grams / total * 100;
      return `<div class="dish-ingredient-row ${i===index?'selected':''}" onclick="selectDishIngredient(${i})">
        <span class="dish-ingredient-dot" style="background:${DISH_SLICE_COLORS[i % DISH_SLICE_COLORS.length]}"></span>
        <input class="dish-ingredient-name" type="text" value="${esc(entry.name)}" aria-label="Назва інгредієнта" onclick="event.stopPropagation()" onfocus="focusDishIngredient(${i})" oninput="setDishIngredientName(${i},this.value)" />
        <input class="dish-ingredient-grams" type="number" inputmode="numeric" min="1" max="10000" value="${entry.grams}" aria-label="Вага в грамах" onclick="event.stopPropagation()" onchange="setDishIngredientGrams(${i},this.value)" />
        <span class="dish-ingredient-percent">${formatOneDecimal(pct)}%</span>
        <button type="button" class="dish-remove-ingredient" aria-label="Прибрати інгредієнт" onclick="event.stopPropagation();removeDishIngredient(${i})">×</button>
      </div>`;
    }).join('');
    else if (list) list.querySelectorAll('.dish-ingredient-row').forEach((row,i) => row.classList.toggle('selected', i === index));
  }

  function renderDishEditor() {
    refreshDishEditorVisuals();
  }

  function syncEditPlateUI(currentNetGrams) {
    if (!editingItemState) return;
    const plateSelect = dishEditorElement('editItemPlateSelect');
    const plateId = plateSelect?.value || '';
    editingItemState.plateId = plateId;
    const plate = appState.plates.find(p => p.id === plateId);
    const grossRow = dishEditorElement('editGrossRow');
    const hintEl = dishEditorElement('editTareFormulaHint');
    const net = editingItemState.isGroup ? getDishTotalGrams() : currentNetGrams;

    if (plate) {
      grossRow.classList.remove('hidden');
      const grossInp = dishEditorElement('editItemGrossGrams');
      const tareWeight = getDishEditorTareWeight(plate);
      const grossVal = parseInt(grossInp.value, 10) || (net + tareWeight);
      grossInp.value = grossVal;
      const netVal = Math.max(1, grossVal - tareWeight);
      if (!editingItemState.isGroup) {
        dishEditorElement('editItemGrams').value = netVal;
        dishEditorElement('editItemSlider').value = Math.min(800, netVal);
      }
      hintEl.textContent = getDishEditorTareHint(grossVal, plate, netVal);
      hintEl.classList.remove('hidden');
      if (editingItemState.context === 'assistant') editingItemState.grossGrams = grossVal;
      updateEditPreview(editingItemState.isGroup ? net : netVal);
    } else {
      grossRow.classList.add('hidden');
      hintEl.classList.add('hidden');
      editingItemState.grossGrams = null;
      updateEditPreview(net);
    }
  }

  function handleEditPlateChange() {
    if (!editingItemState) return;
    const netNow = editingItemState.isGroup ? getDishTotalGrams() : (parseInt(dishEditorElement('editItemGrams').value, 10) || 100);
    const plateId = dishEditorElement('editItemPlateSelect').value;
    const plate = appState.plates.find(p => p.id === plateId);
    const previousPlateId = editingItemState.plateId || '';
    editingItemState.plateId = plateId;
    if (plate) {
      const tareWeight = getDishEditorTareWeight(plate);
      const explicitGross = editingItemState.context === 'assistant' &&
        editingItemState.tareEligible !== false &&
        Number(editingItemState.sourceGrossGrams) > 0
        ? Math.round(Number(editingItemState.sourceGrossGrams))
        : null;
      const gross = explicitGross || netNow + tareWeight;
      const net = gross - tareWeight;
      if (editingItemState.isGroup && net < editingItemState.items.length) {
        editingItemState.plateId = previousPlateId;
        dishEditorElement('editItemPlateSelect').value = previousPlateId;
        showToast('Після віднімання тари має залишитися достатньо ваги для всіх інгредієнтів', '⚠️');
        return;
      }
      dishEditorElement('editItemGrossGrams').value = gross;
      editingItemState.grossGrams = gross;
      if (explicitGross != null && editingItemState.isGroup) {
        setDishTotalGrams(net);
      } else if (!explicitGross && editingItemState.context === 'assistant' && editingItemState.sourceGrossGrams != null) {
        editingItemState.sourceGrossGrams = gross;
      }
    } else {
      editingItemState.grossGrams = null;
      if (previousPlateId && editingItemState.context === 'assistant' &&
          editingItemState.tareEligible !== false && Number(editingItemState.sourceGrossGrams) > 0 &&
          editingItemState.isGroup) {
        setDishTotalGrams(Math.round(Number(editingItemState.sourceGrossGrams)));
      }
    }
    syncEditPlateUI(netNow);
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  function handleEditGrossInput() {
    if (!editingItemState) return;
    const plate = appState.plates.find(p => p.id === editingItemState.plateId);
    if (!plate) return;
    const grossVal = Math.max(0, parseInt(dishEditorElement('editItemGrossGrams').value, 10) || 0);
    const tareWeight = getDishEditorTareWeight(plate);
    const netVal = Math.max(1, grossVal - tareWeight);
    if (editingItemState.isGroup) {
      setDishTotalGrams(netVal);
    } else {
      dishEditorElement('editItemGrams').value = netVal;
      dishEditorElement('editItemSlider').value = Math.min(800, netVal);
      dishEditorElement('editTareFormulaHint').textContent = getDishEditorTareHint(grossVal, plate, netVal);
      updateEditPreview(netVal);
    }
    editingItemState.grossGrams = grossVal;
    if (editingItemState.context === 'assistant' && editingItemState.sourceGrossGrams != null) {
      editingItemState.sourceGrossGrams = grossVal;
    }
    if (editingItemState.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  function closeEditSheet() {
    if (editingItemState?.isSaving) return;
    const stateBeingClosed = editingItemState;
    const bd = document.getElementById('editBackdrop');
    const sh = document.getElementById('editSheet');
    bd.classList.remove('open');
    sh.classList.remove('open');
    setTimeout(() => {
      if (!sh.classList.contains('open')) {
        bd.classList.remove('visible');
        sh.classList.remove('visible');
        if (editingItemState === stateBeingClosed) editingItemState = null;
      }
    }, 340);
  }

  function updateEditPreview(grams) {
    if (!editingItemState) return;
    let nutrition;
    if (editingItemState.isGroup) {
      nutrition = editingItemState.items.reduce((sum, entry) => ({
        kcal: sum.kcal + entry.perGram.kcal * entry.grams,
        protein: sum.protein + entry.perGram.protein * entry.grams,
        fat: sum.fat + entry.perGram.fat * entry.grams,
        carb: sum.carb + entry.perGram.carb * entry.grams
      }), { kcal:0, protein:0, fat:0, carb:0 });
    } else {
      const g = Math.max(1, Number(grams) || 0);
      const pg = editingItemState.perGram;
      nutrition = { kcal:pg.kcal*g, protein:pg.protein*g, fat:pg.fat*g, carb:pg.carb*g };
    }
    dishEditorElement('previewKcal').textContent = `${Math.round(nutrition.kcal)} ккал`;
    dishEditorElement('previewProtein').textContent = `${formatOneDecimal(nutrition.protein)} г`;
    dishEditorElement('previewFat').textContent = `${formatOneDecimal(nutrition.fat)} г`;
    dishEditorElement('previewCarb').textContent = `${formatOneDecimal(nutrition.carb)} г`;
  }

  document.getElementById('editItemSlider').addEventListener('input', (e) => {
    if (editingItemState?.isGroup) return;
    const netVal = parseInt(e.target.value, 10);
    dishEditorElement('editItemGrams').value = netVal;
    const plate = appState.plates.find(p => p.id === editingItemState?.plateId);
    if (plate) {
      const grossVal = netVal + plate.weight;
      dishEditorElement('editItemGrossGrams').value = grossVal;
      dishEditorElement('editTareFormulaHint').textContent = `${grossVal} г брутто − ${plate.weight} г (${plate.name}) = ${netVal} г нетто`;
    }
    updateEditPreview(netVal);
  });

  dishEditorElement('editItemGrams').addEventListener('input', (e) => {
    if (!editingItemState) return;
    const netVal = Math.max(editingItemState.isGroup ? editingItemState.items.length : 1, parseInt(e.target.value, 10) || 1);
    if (editingItemState.isGroup) {
      setDishTotalGrams(netVal, false);
      return;
    }
    dishEditorElement('editItemSlider').value = Math.min(800, netVal);
    const plate = appState.plates.find(p => p.id === editingItemState?.plateId);
    if (plate) {
      const grossVal = netVal + plate.weight;
      dishEditorElement('editItemGrossGrams').value = grossVal;
      dishEditorElement('editTareFormulaHint').textContent = `${grossVal} г брутто − ${plate.weight} г (${plate.name}) = ${netVal} г нетто`;
    }
    updateEditPreview(netVal);
  });

  function assistantActionTotalGramsChanged() {
    if (editingItemState?.context !== 'assistant' || !editingItemState.isGroup) return;
    const input = dishEditorElement('editItemGrams');
    const requested = Math.max(editingItemState.items.length, parseInt(input?.value, 10) || 1);
    setDishTotalGrams(requested, false);
    saveAssistantActionDraft(editingItemState.messageId);
  }

  function selectEditMeal(mealId) {
    if (editingItemState) editingItemState.meal = mealId;
    (dishEditorElement('editMealSelector')?.querySelectorAll('button') || []).forEach(btn => {
      btn.className = btn.dataset.meal === mealId
        ? 'py-1.5 rounded-[9px] text-[12px] font-semibold bg-[#1C1C1E] text-white shadow transition'
        : 'py-1.5 rounded-[9px] text-[12px] font-medium text-[#8E8E93] transition';
    });
    if (editingItemState?.context === 'assistant') saveAssistantActionDraft(editingItemState.messageId);
  }

  async function recalculateEditedFoodWithGemini(name, grams, meal) {
    const key = (appState.apiKey || '').trim();
    if (!key) throw new Error('Gemini не налаштований. Додай API-ключ у налаштуваннях.');
    const mealNames = { breakfast: 'сніданок', lunch: 'обід', dinner: 'вечеря', snack: 'перекус' };
    const extraInstruction = `Зараз потрібно ПЕРЕРАХУВАТИ КБЖВ ОДНІЄЇ конкретної страви після редагування її назви. Поверни рівно один елемент JSON-масиву. Вага вже є чистою їстівною вагою без посуду: ${grams} г. Не змінюй цю вагу і не віднімай тару. Прийом їжі: ${mealNames[meal] || 'перекус'}. Оціни калорії, білки, жири та вуглеводи саме для цієї кількості. Не додавай інші продукти, яких немає в назві. Формат: [{"name":${JSON.stringify(name)},"meal":"${meal}","grams":${grams},"kcal":0,"protein":0,"fat":0,"carb":0}].`;
    const model = appState.geminiModel || 'gemini-2.5-flash';
    const raw = await geminiRequest(
      model,
      key,
      buildGeminiSystemInstruction(null, extraInstruction),
      `Перерахуй КБЖВ для страви «${name}», чиста вага ${grams} г. Поверни лише JSON-масив з одним елементом.`
    );
    const parsed = parseGeminiFoodResponse(raw);
    if (!parsed.length) throw new Error('Gemini не повернув розрахунок.');
    return parsed[0];
  }

  async function recalculateEditedDishNames(changedItems, meal) {
    const key = (appState.apiKey || '').trim();
    if (!key) throw new Error('Gemini не налаштований. Додай API-ключ у налаштуваннях.');
    const model = appState.geminiModel || 'gemini-2.5-flash';
    const mealNames = { breakfast:'сніданок', lunch:'обід', dinner:'вечеря', snack:'перекус' };
    const descriptions = changedItems.map((item,index) => `${index+1}. ${item.name} — чиста вага ${item.grams} г`).join('\n');
    const instruction = `Перерахуй КБЖВ для кожного з перелічених інгредієнтів ОКРЕМО. Не об'єднуй їх в одну страву. Для кожного збережи точну назву та вказану чисту вагу. Прийом їжі: ${mealNames[meal] || 'перекус'}. Поверни JSON-масив рівно з ${changedItems.length} елементів у тому самому порядку, один елемент на кожен рядок. Не додавай жодних не зазначених інгредієнтів. Усі kcal/protein/fat/carb мають бути для вказаної ваги, а не на 100 г. Формат: [{"name":"...","meal":"${meal}","grams":100,"kcal":0,"protein":0,"fat":0,"carb":0}].`;
    const raw = await geminiRequest(model, key, buildGeminiSystemInstruction(null, instruction), `Перерахуй окремо такі інгредієнти:\n${descriptions}\nПоверни лише JSON-масив.`);
    const parsed = parseGeminiFoodResponse(raw);
    if (parsed.length !== changedItems.length) throw new Error(`Gemini повернув ${parsed.length} позицій замість ${changedItems.length}.`);
    return parsed;
  }

  async function saveEditingItem() {
    if (!editingItemState || editingItemState.isSaving) return;
    const allItems = appState.logs[selectedDateKey] || [];
    const state = editingItemState;
    const saveButton = document.querySelector('#editSheet button[onclick="saveEditingItem()"]');
    const previousButtonText = saveButton ? saveButton.textContent : 'Зберегти зміни';
    const time = document.getElementById('editItemTime').value || getCurrentTimeStr();
    const meal = state.meal;
    const plate = appState.plates.find(p => p.id === state.plateId);
    const newGrams = Math.max(state.isGroup ? state.items.length : 1, parseInt(dishEditorElement('editItemGrams').value, 10) || 1);
    const grossVal = plate ? (parseInt(dishEditorElement('editItemGrossGrams').value, 10) || newGrams + plate.weight) : null;

    if (state.isGroup) {
      if (!state.items.length) return;
      const liveItems = state.items.map(entry => ({
        ...entry,
        name: String(entry.name || '').trim() || entry.originalName,
        grams: Math.max(1, Math.round(Number(entry.grams) || 1))
      }));
      const changed = liveItems.filter(entry => entry.name.localeCompare(String(entry.originalName || ''), 'uk', { sensitivity:'base' }) !== 0);
      let recalculatedById = new Map();
      if (changed.length) {
        if (!(appState.apiKey || '').trim()) {
          showToast('Для перерахунку змінених інгредієнтів потрібен Gemini API-ключ', '⚠️');
          return;
        }
        state.isSaving = true;
        if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Gemini перераховує…'; saveButton.classList.add('opacity-60'); }
        try {
          const recalculated = await recalculateEditedDishNames(changed, meal);
          changed.forEach((entry,index) => recalculatedById.set(entry.id, recalculated[index]));
        } catch (error) {
          const message = String(error.message || 'Невідома помилка').replace(/\s+/g,' ').slice(0,180);
          showToast(`Не вдалося перерахувати: ${message}`, '⚠️');
          state.isSaving = false;
          if (saveButton) { saveButton.disabled = false; saveButton.textContent = previousButtonText; saveButton.classList.remove('opacity-60'); }
          return;
        }
      }

      const keepIds = new Set(liveItems.map(entry => entry.id));
      const originalGroup = allItems.filter(entry => entry.dishId === state.dishId);
      originalGroup.forEach(entry => { if (!keepIds.has(entry.id)) appState.tombstones[entry.id] = Date.now(); });
      appState.logs[selectedDateKey] = allItems.filter(entry => entry.dishId !== state.dishId || keepIds.has(entry.id));
      const currentLog = appState.logs[selectedDateKey];

      liveItems.forEach((entry,index) => {
        const recalculated = recalculatedById.get(entry.id);
        const grams = entry.grams;
        const nutrition = recalculated ? {
          kcal: Number(recalculated.kcal) || 0,
          protein: Number(recalculated.protein) || 0,
          fat: Number(recalculated.fat) || 0,
          carb: Number(recalculated.carb) || 0
        } : {
          kcal: Math.round(entry.perGram.kcal * grams),
          protein: Math.round(entry.perGram.protein * grams * 10) / 10,
          fat: Math.round(entry.perGram.fat * grams * 10) / 10,
          carb: Math.round(entry.perGram.carb * grams * 10) / 10
        };
        const originalIndex = currentLog.findIndex(original => original.id === entry.id);
        const updated = {
          ...entry,
          mod: Date.now(),
          name: entry.name,
          meal,
          time,
          grams,
          dishId: state.dishId,
          plateId: index === 0 && plate ? plate.id : null,
          grossGrams: index === 0 && plate ? grossVal : null,
          plateNote: index === 0 && plate ? `${grossVal} г − ${plate.weight} г тари` : null,
          ...nutrition
        };
        delete updated.originalName; delete updated.originalGrams; delete updated.perGram;
        if (originalIndex >= 0) currentLog[originalIndex] = updated;
      });
      state.isSaving = false;
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = previousButtonText; saveButton.classList.remove('opacity-60'); }
      persistState(); closeEditSheet(); renderDiary();
      showToast(changed.length ? 'Складник змінено, Gemini оновив КБЖВ' : 'Тарілку оновлено', changed.length ? '✨' : '✅');
      return;
    }

    const idx = allItems.findIndex(i => i.id === state.id);
    if (idx === -1) return;
    const newName = document.getElementById('editItemName').value.trim() || allItems[idx].name;
    const { perGram } = state;
    const nameChanged = newName.localeCompare(String(state.originalName || allItems[idx].name), 'uk', { sensitivity:'base' }) !== 0;
    let nutrition = {
      kcal: Math.round(perGram.kcal * newGrams),
      protein: Math.round(perGram.protein * newGrams * 10) / 10,
      fat: Math.round(perGram.fat * newGrams * 10) / 10,
      carb: Math.round(perGram.carb * newGrams * 10) / 10
    };
    if (nameChanged) {
      if (!(appState.apiKey || '').trim()) { showToast('Для перерахунку назви спочатку налаштуй Gemini у налаштуваннях', '⚠️'); return; }
      state.isSaving = true;
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Gemini перераховує…'; saveButton.classList.add('opacity-60'); }
      try {
        const recalculated = await recalculateEditedFoodWithGemini(newName, newGrams, meal);
        nutrition = { kcal:recalculated.kcal, protein:recalculated.protein, fat:recalculated.fat, carb:recalculated.carb };
      } catch (error) {
        const message = String(error.message || 'Невідома помилка').replace(/\s+/g, ' ').slice(0, 150);
        showToast(`Не вдалося перерахувати КБЖВ: ${message}`, '⚠️');
        state.isSaving = false;
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = previousButtonText; saveButton.classList.remove('opacity-60'); }
        return;
      }
    }
    allItems[idx] = {
      ...allItems[idx], mod:Date.now(), name:newName, meal, time, grams:newGrams,
      plateId:plate ? plate.id : null, grossGrams:grossVal,
      plateNote:plate ? `${grossVal}г − ${plate.weight}г` : null,
      ...nutrition
    };
    state.isSaving = false;
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = previousButtonText; saveButton.classList.remove('opacity-60'); }
    persistState(); closeEditSheet(); renderDiary();
    showToast(nameChanged ? 'Назву змінено, КБЖВ перераховано Gemini' : 'Запис оновлено', nameChanged ? '✨' : '✅');
  }

  function deleteEditingItem() {
    if (!editingItemState) return;
    const state = editingItemState;
    const allItems = appState.logs[selectedDateKey] || [];
    const removed = state.isGroup ? allItems.filter(item => item.dishId === state.dishId) : allItems.filter(item => item.id === state.id);
    removed.forEach(item => { appState.tombstones[item.id] = Date.now(); });
    appState.logs[selectedDateKey] = allItems.filter(item => state.isGroup ? item.dishId !== state.dishId : item.id !== state.id);
    persistState();
    closeEditSheet();
    renderDiary();
    showToast(state.isGroup ? 'Тарілку видалено' : 'Запис видалено', '🗑️');
  }
