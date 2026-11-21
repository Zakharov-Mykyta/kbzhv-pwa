  // ==================== CONSTANTS & HISTORICAL DATA ====================
  const APP_VERSION = '18.2.7';
  let TODAY_KEY = toDateKey(new Date());

  const DEFAULT_GEMINI_PROMPT = `Ти — уважний шеф для щоденного обліку харчування. Проаналізуй повідомлення користувача українською мовою та, якщо додано фото, саме фото разом із текстом. Перетвори дані на список з'їдених або випитих позицій.

Правила:
1. Розбий повідомлення на окремі продукти/інгредієнти. Усі продукти, перелічені в одному запиті, вважай складниками ОДНІЄЇ страви на ОДНІЙ тарілці, якщо користувач явно не описав кілька окремих прийомів їжі.
2. Для кожної позиції оціни їстівну кількість у грамах. Для напоїв мілілітри можна приблизно прирівнювати до грамів. Якщо кількість не вказана, оціни реалістичну порцію.
3. Оціни калорійність, білки, жири та вуглеводи для вказаної кількості, а не на 100 г.
4. Не вигадуй додаткові інгредієнти, олію, цукор чи соуси, якщо їх не згадано. Якщо спосіб приготування суттєво впливає на КБЖВ, обери найбільш звичайний варіант і врахуй невизначеність.
5. Якщо користувач указав вагу всієї страви, не призначай повну вагу кожному інгредієнту. Розподіли її між позиціями логічно.
6. Визнач прийом їжі: breakfast, lunch, dinner або snack. Якщо вказівки немає, орієнтуйся на контекст повідомлення.
7. Якщо є фото, використовуй його для визначення видимих продуктів, способу подачі та приблизного розміру порції. Не вигадуй приховані інгредієнти; текст користувача має пріоритет щодо складу та ваги. Якщо фото і текст суперечать одне одному, орієнтуйся на текст.
8. Якщо користувач указав загальну вагу кількох позицій, сума grams у всіх елементах має дорівнювати цій вазі; розподіли її між позиціями пропорційно реалістичній порції.
9. Відповідай виключно коректним JSON-масивом без Markdown, пояснень чи тексту до/після JSON.

Кожен елемент JSON-масиву — окремий інгредієнт спільної страви. Застосунок об'єднає всі елементи одного запиту в одну картку-тарілку, але збереже окремі назву, грами й КБЖВ кожного інгредієнта. Формат кожного елемента: {"name":"назва","meal":"breakfast|lunch|dinner|snack","grams":100,"kcal":150,"protein":5,"fat":4,"carb":20}. Усі числові значення мають бути невід'ємними числами. Не повертай одиниці вимірювання всередині чисел.`;

  const MEAL_META = [
    { id: 'breakfast', title: 'Сніданок', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M5 13a7 7 0 0 1 14 0M12 3v2M4.9 6.1l1.4 1.4M19.1 6.1l-1.4 1.4"/></svg>' },
    { id: 'lunch', title: 'Обід', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
    { id: 'dinner', title: 'Вечеря', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.7 8.7 0 1 0 20.5 15.5Z"/><path d="M16.5 4.5v3M15 6h3"/></svg>' },
    { id: 'snack', title: 'Перекуси', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c-1 1 .8 1.4 0 2.7M12 3c-1 1 .8 1.4 0 2.7"/></svg>' }
  ];

  const UK_MONTHS_GEN = [
    'січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.',
    'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'
  ];

  const UK_MONTHS_NOM = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];

  const UK_WEEKDAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
  const WEEK_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];


  const DEFAULT_DATA = {
    targets: { kcal: 1800, protein: 115, fat: 65, carb: 170 },
    calorieDisplayMode: 'remaining',
    apiKey: '',
    geminiModel: '',
    geminiPrompt: DEFAULT_GEMINI_PROMPT,
    gdrive: { clientId: '', connected: false, autoSync: true, lastSync: '', needsAuth: false },
    tombstones: {},
    settingsMod: 0,
    plates: [
      { id: 'p1', name: 'Біла глибока', weight: 420 },
      { id: 'p2', name: 'Плоска велика', weight: 510 },
      { id: 'p3', name: 'Піала для сніданку', weight: 240 }
    ],
    selectedPlateId: null,
    logs: {}
  };

  let appState = loadState();
  let selectedDateKey = TODAY_KEY;
  let calendarViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let statPeriod = '7d';
  let statMacro = 'kcal';
  let editingItemState = null;
  let pendingFoodRequest = null;
  let pendingFoodImage = null;
  let barcodeScannerInstance = null;
  let barcodeScannerStarting = false;
  let barcodeStartPromise = null;
  let barcodeStopPromise = null;
  let barcodeActiveStream = null;
  let barcodeSessionId = 0;
  let barcodeResumePending = false;
  let barcodeResultHandled = false;
  let scannedProduct = null;
  let barcodeLibraryPromise = null;
  let geminiAvailableModels = [];
  let isParsingFood = false;
  let targetsInputsDirty = false;
  let geminiInputsDirty = false;
  let assistantMessages = loadAssistantMessages();
  let assistantBusy = false;
  let assistantPendingCounter = 0;
  let assistantActionActiveMessageId = null;
  let assistantActionModalSession = 0;

  // One shared diary-editor DOM contract is used by both the diary sheet and the
  // assistant confirmation sheet. Only the IDs differ; classes and layout stay identical.
  function dishEditorElement(id) {
    const state = editingItemState;
    if (state?.context !== 'assistant') return document.getElementById(id);
    const messageId = state.messageId;
    const ids = {
      editDishEditor: `assistantAction_editDishEditor_${messageId}`,
      dishPieSvg: `assistantAction_dishPieSvg_${messageId}`,
      dishSelectedTitle: `assistantAction_dishSelectedTitle_${messageId}`,
      dishSelectedMeta: `assistantAction_dishSelectedMeta_${messageId}`,
      dishShareValue: `assistantAction_dishShareValue_${messageId}`,
      dishShareSlider: `assistantAction_dishShareSlider_${messageId}`,
      dishIngredientCount: `assistantAction_dishIngredientCount_${messageId}`,
      dishIngredientsList: `assistantAction_dishIngredientsList_${messageId}`,
      editItemPlateSelect: `assistantAction_editItemPlateSelect_${messageId}`,
      editGrossRow: `assistantAction_editGrossRow_${messageId}`,
      editItemGrossGrams: `assistantAction_editItemGrossGrams_${messageId}`,
      editItemGrams: `assistantAction_editItemGrams_${messageId}`,
      editItemSlider: `assistantAction_editItemSlider_${messageId}`,
      editTareFormulaHint: `assistantAction_editTareFormulaHint_${messageId}`,
      previewKcal: `assistantAction_previewKcal_${messageId}`,
      previewProtein: `assistantAction_previewProtein_${messageId}`,
      previewFat: `assistantAction_previewFat_${messageId}`,
      previewCarb: `assistantAction_previewCarb_${messageId}`,
      editMealSelector: `assistantAction_editMealSelector_${messageId}`,
      editItemTime: `assistantAction_editItemTime_${messageId}`
    };
    return document.getElementById(ids[id] || id);
  }

  function loadAssistantMessages() {
    try {
      const raw = localStorage.getItem('foodnoms_assistant_chat_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(m => m && ['user', 'assistant'].includes(m.role)).slice(-40) : [];
    } catch (e) { return []; }
  }

  function persistAssistantMessages() {
    assistantMessages = assistantMessages.slice(-40);
    try { localStorage.setItem('foodnoms_assistant_chat_v1', JSON.stringify(assistantMessages)); } catch (e) {}
  }

  const VOICE_SAMPLES = [
    'На вечерю гречка із вареним філе 840 г',
    'На обід борщ 350 г і два шматочки хліба',
    'Сніданок сир кисломолочний 200 г з медом 15 г'
  ];
  let voiceSampleCursor = 0;

  // ==================== STORAGE & HELPERS ====================
  function loadState() {
    try {
      const saved = localStorage.getItem('foodnoms_ua_v5');
      if (saved) {
        const parsed = JSON.parse(saved);
        const { reminders: legacyReminders, ...savedData } = parsed;
        return {
          ...JSON.parse(JSON.stringify(DEFAULT_DATA)),
          ...savedData,
          gdrive: { ...DEFAULT_DATA.gdrive, ...(savedData.gdrive || {}) }
        };
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  let _settingsHash = null;
  const settingsHash = () => JSON.stringify([appState.targets, appState.plates, appState.calorieDisplayMode]);
  function persistState(skipSync) {
    const h = settingsHash();
    if (h !== _settingsHash) { if (_settingsHash !== null) appState.settingsMod = Date.now(); _settingsHash = h; }
    try {
      localStorage.setItem('foodnoms_ua_v5', JSON.stringify(appState));
    } catch (e) {}
    if (!skipSync) scheduleSync();
  }

  function toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function shiftKey(key, days) {
    const d = parseDateKey(key); d.setDate(d.getDate() + days); return toDateKey(d);
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatSpacedInt(num) {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function formatOneDecimal(num) {
    return (Math.round(num * 10) / 10).toFixed(1).replace(/\.0$/, '');
  }

  function updateMacroRing(ringId, valueId, targetId, current, target, color, unit, isCalories = false) {
    const ring = document.getElementById(ringId);
    const value = document.getElementById(valueId);
    const targetLabel = document.getElementById(targetId);
    const safeCurrent = Math.max(0, Number(current) || 0);
    const safeTarget = Math.max(1, Number(target) || 1);
    const circumference = 2 * Math.PI * 32;
    const ratio = Math.min(1, safeCurrent / safeTarget);
    if (ring) {
      ring.style.strokeDasharray = circumference.toFixed(2);
      ring.style.strokeDashoffset = (circumference * (1 - ratio)).toFixed(2);
      ring.style.stroke = safeCurrent > safeTarget ? '#FF9F0A' : color;
    }
    if (value) {
      value.textContent = isCalories ? formatSpacedInt(safeCurrent).replace(/\s/g, '') : formatOneDecimal(safeCurrent);
      value.setAttribute('aria-label', `${formatOneDecimal(safeCurrent)} ${unit} спожито`);
    }
    if (targetLabel) targetLabel.textContent = `ціль ${formatSpacedInt(safeTarget)} ${unit}`;
  }

  function getCurrentTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function showToast(text, icon = '✅') {
    const toast = document.getElementById('iosToast');
    document.getElementById('toastText').textContent = text;
    document.getElementById('toastIcon').textContent = icon;
    toast.classList.add('show');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ==================== CLOSE ALL POPOVERS & SHEETS ====================
  function closeAllOverlays() {
    const periodMenu = document.getElementById('periodDropdownMenu');
    if (periodMenu) periodMenu.classList.add('hidden');
    closeAssistantActionModal();
    closeFoodRequestSheet();
    closeEditSheet();
    closeCalendarSheet();
    if (document.getElementById('barcodeSheet')?.classList.contains('open')) closeBarcodeSheet();
  }

  document.addEventListener('click', (e) => {
    const plateWrap = document.getElementById('plateSelectorWrapper');
    if (plateWrap && !plateWrap.contains(e.target)) {
      document.getElementById('plateDropdownMenu').classList.add('hidden');
    }
    const periodWrap = document.getElementById('periodDropdownWrapper');
    if (periodWrap && !periodWrap.contains(e.target)) {
      document.getElementById('periodDropdownMenu').classList.add('hidden');
    }
  });

  // ==================== CALORIE DISPLAY MODE ====================
  function setCalorieDisplayMode(mode) {
    appState.calorieDisplayMode = mode;
    persistState();
    renderDiary();
  }

  function toggleCalorieDisplayMode() {
    setCalorieDisplayMode(appState.calorieDisplayMode === 'remaining' ? 'consumed' : 'remaining');
  }
