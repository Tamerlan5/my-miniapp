/* ============ STATE ============ */
const SAVE_KEY = 'banana_tap_save_v2';

const defaultState = {
  balance: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  level: 1,
  xp: 0,
  totalTaps: 0,
  passiveRate: 0,          // реальная ставка в мёде/час
  lastPassiveClaim: Date.now(),
  refCount: 0,
  completedTasks: [],
  boughtBoosts: [],
  invitedBy: null,
  userName: 'Игрок',
  userId: null,
  inventory: [
    { id: 1, name: 'Яблоко', icon: '🍎', price: 100 },
    { id: 2, name: 'Банан', icon: '🍌', price: 500 },
    { id: 3, name: 'Мед', icon: '🍯', price: 1500 },
    { id: 4, name: 'Улей', icon: '🏠', price: 5000 },
    { id: 5, name: 'Бриллиант', icon: '💎', price: 15000 },
    { id: 6, name: 'Корона', icon: '👑', price: 50000 },
  ]
};

let state = load();
let lastSave = 0;
const SAVE_THROTTLE = 4000; // сохраняем не чаще чем раз в 4 секунды

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    // миграция со старой версии
    if (parsed.passiveLevel !== undefined && parsed.passiveRate === undefined) {
      parsed.passiveRate = (parsed.passiveLevel || 0) * 50;
      delete parsed.passiveLevel;
    }
    return { ...defaultState, ...parsed };
  } catch {
    return { ...defaultState };
  }
}

function save(force = false) {
  const now = Date.now();
  if (!force && now - lastSave < SAVE_THROTTLE) return;
  lastSave = now;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  renderTopbar();
}

/* ============ TELEGRAM ============ */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0a0908');
  tg.setBackgroundColor('#0a0908');

  try {
    const u = tg.initDataUnsafe?.user;
    if (u) {
      state.userName = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Игрок';
      state.userId = u.id;
      save(true);
    }
  } catch {}
}

// Рефералка из URL
const urlParams = new URLSearchParams(location.search);
const refParam = urlParams.get('ref') || (tg?.initDataUnsafe?.start_param || '').replace('ref_', '');
if (refParam && !state.invitedBy && String(refParam) !== String(state.userId)) {
  state.invitedBy = refParam;
  state.balance += 5000;
  save(true);
  toast('🎁 Бонус за вход по ссылке: +5000 🍯');
}

/* ============ HELPERS ============ */
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2300);
}

function haptic(type = 'light') {
  try {
    if (tg?.HapticFeedback) {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
      else tg.HapticFeedback.impactOccurred('light');
    }
  } catch {}
}

function addXP(amount) {
  state.xp += amount;
  const need = state.level * 100;
  if (state.xp >= need) {
    state.xp -= need;
    state.level += 1;
    state.tapPower += 1;
    toast(`🎉 Новый уровень ${state.level}! Сила тапа +1`);
    haptic('success');
  }
  renderTopbar();
}

/* ============ TOPBAR ============ */
function renderTopbar() {
  const balEl = document.getElementById('balance');
  const enEl = document.getElementById('energy');
  const userEl = document.getElementById('userName');
  const idEl = document.getElementById('userId');
  const levelEl = document.getElementById('levelNum');
  const xpEl = document.getElementById('xpText');

  if (balEl) balEl.textContent = fmt(state.balance);
  if (enEl) enEl.textContent = `${Math.floor(state.energy)}/${state.maxEnergy}`;
  if (userEl) userEl.textContent = state.userName;
  if (idEl) idEl.textContent = state.userId ? 'ID: ' + state.userId : 'Гость';
  if (levelEl) levelEl.textContent = state.level;
  if (xpEl) xpEl.textContent = `${state.xp}/${state.level * 100}`;
}

/* ============ NAVIGATION ============ */
function switchPage(pageName) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const page = document.getElementById('page-' + pageName);
  if (page) page.classList.add('active');

  const navBtn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (pageName === 'boosts') {
    document.body.classList.add('on-upgrader');
    document.body.classList.remove('panel-expanded');
    renderUpgrader();
    resetSlider();
    // сбрасываем панель в свёрнутое состояние
    if (glassPanel) {
      glassPanel.classList.remove('expanded');
      glassPanel.style.transform = '';
    }
  } else {
    document.body.classList.remove('on-upgrader', 'panel-expanded');
  }

  if (pageName === 'mine') renderMine();
  if (pageName === 'tasks') renderTasks();
  if (pageName === 'shop') renderShop();
  if (pageName === 'friends') renderFriends();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

/* ============ TAP ============ */
const banana = document.getElementById('banana');
let lastTapTime = 0;

function doTap(e) {
  const now = Date.now();
  if (now - lastTapTime < 40) return; // анти-спам
  lastTapTime = now;

  if (state.energy < 1) {
    toast('⚡ Энергия кончилась!');
    haptic('error');
    return;
  }

  state.energy -= 1;
  state.balance += state.tapPower;
  state.totalTaps += 1;
  addXP(1);
  renderTopbar();
  save();

  haptic('light');

  if (!banana) return;
  const rect = banana.getBoundingClientRect();
  const x = e?.clientX || rect.left + rect.width / 2;
  const y = e?.clientY || rect.top + rect.height / 2;

  const el = document.createElement('div');
  el.textContent = '+' + state.tapPower;
  el.style.cssText = `
    position:fixed; left:${x}px; top:${y}px;
    color:#ffd93b; font-weight:700; pointer-events:none; z-index:999;
    transition:all 0.55s ease; font-size:20px;
    text-shadow:0 2px 10px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-80px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 550);
}

if (banana) {
  banana.addEventListener('touchstart', (e) => {
    e.preventDefault();
    doTap(e.touches[0]);
  }, { passive: false });
  banana.addEventListener('mousedown', doTap);
}

// Реген энергии
setInterval(() => {
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.maxEnergy, state.energy + 1);
    renderTopbar();
    save();
  }
}, 2000);

/* ============ BOTTOM SHEET (панель апгрейдера) ============ */
const glassPanel = document.getElementById('glassPanel');
const dragHandle = document.getElementById('dragHandle');
let isDraggingPanel = false;
let startY = 0;
let startTransform = 0;

function getCollapsedOffset() {
  return window.innerHeight - 370;
}

if (glassPanel && dragHandle) {
  const onStart = (clientY) => {
    isDraggingPanel = true;
    startY = clientY;
    const style = window.getComputedStyle(glassPanel);
    const matrix = new DOMMatrix(style.transform);
    startTransform = matrix.m42; // translateY
    glassPanel.style.transition = 'none';
  };

  const onMove = (clientY) => {
    if (!isDraggingPanel) return;
    const delta = clientY - startY;
    let newY = startTransform + delta;

    // ограничения
    const maxY = getCollapsedOffset(); // свёрнуто
    const minY = 0;                     // полностью открыто

    if (newY < minY) newY = minY;
    if (newY > maxY) newY = maxY;

    glassPanel.style.transform = `translateY(${newY}px)`;
  };

  const onEnd = () => {
    if (!isDraggingPanel) return;
    isDraggingPanel = false;
    glassPanel.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';

    const style = window.getComputedStyle(glassPanel);
    const matrix = new DOMMatrix(style.transform);
    const currentY = matrix.m42;
    const mid = getCollapsedOffset() / 2;

    if (currentY < mid) {
      // открываем полностью
      glassPanel.style.transform = 'translateY(0px)';
      glassPanel.classList.add('expanded');
      document.body.classList.add('panel-expanded');
    } else {
      // сворачиваем
      glassPanel.style.transform = `translateY(${getCollapsedOffset()}px)`;
      glassPanel.classList.remove('expanded');
      document.body.classList.remove('panel-expanded');
    }
  };

  dragHandle.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
  dragHandle.addEventListener('mousedown', e => onStart(e.clientY));

  document.addEventListener('touchmove', e => {
    if (isDraggingPanel) {
      e.preventDefault();
      onMove(e.touches[0].clientY);
    }
  }, { passive: false });

  document.addEventListener('mousemove', e => {
    if (isDraggingPanel) onMove(e.clientY);
  });

  document.addEventListener('touchend', onEnd);
  document.addEventListener('mouseup', onEnd);

  // начальное положение
  glassPanel.style.transform = `translateY(${getCollapsedOffset()}px)`;
}

/* ============ SLIDER ============ */
const sliderContainer = document.getElementById('sliderContainer');
const sliderThumb = document.getElementById('sliderThumb');
const sliderFill = document.getElementById('sliderFill');
const sliderText = document.getElementById('sliderText');
let isDraggingSlider = false;
let isUpgrading = false;

function resetSlider() {
  if (!sliderThumb) return;
  sliderThumb.style.transition = 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
  sliderThumb.style.left = '4px';
  if (sliderFill) {
    sliderFill.style.transition = 'width 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
    sliderFill.style.width = '0%';
  }
  if (sliderText) sliderText.style.opacity = '1';
  setTimeout(() => {
    if (sliderThumb) sliderThumb.style.transition = 'none';
    if (sliderFill) sliderFill.style.transition = 'none';
  }, 300);
}

if (sliderThumb && sliderContainer) {
  const startDrag = (clientX) => {
    if (isUpgrading) return;
    isDraggingSlider = true;
    sliderThumb.style.transition = 'none';
    sliderFill.style.transition = 'none';
    if (sliderText) sliderText.style.opacity = '0';
  };

  const moveDrag = (clientX) => {
    if (!isDraggingSlider || isUpgrading) return;
    const rect = sliderContainer.getBoundingClientRect();
    let left = clientX - rect.left - 21;
    if (left < 4) left = 4;
    if (left > rect.width - 46) left = rect.width - 46;

    sliderThumb.style.left = left + 'px';
    const percent = ((left - 4) / (rect.width - 46)) * 100;
    sliderFill.style.width = percent + '%';

    if (left >= rect.width - 48) {
      isDraggingSlider = false;
      resetSlider();
      triggerUpgrade();
    }
  };

  const endDrag = () => {
    if (isDraggingSlider) {
      isDraggingSlider = false;
      resetSlider();
    }
  };

  sliderThumb.addEventListener('touchstart', e => startDrag(e.touches[0].clientX), { passive: true });
  sliderThumb.addEventListener('mousedown', e => startDrag(e.clientX));

  document.addEventListener('touchmove', e => {
    if (isDraggingSlider) moveDrag(e.touches[0].clientX);
  }, { passive: false });
  document.addEventListener('mousemove', e => {
    if (isDraggingSlider) moveDrag(e.clientX);
  });
  document.addEventListener('touchend', endDrag);
  document.addEventListener('mouseup', endDrag);
}

/* ============ UPGRADER ============ */
let selectedItem = state.inventory[0] || null;
let currentMult = 2;

const CHANCES = { 1.5: 70, 2: 50, 5: 20, 10: 10 };

function renderUpgrader() {
  const list = document.getElementById('inventoryList');
  if (!list) return;

  // защита от удалённого selectedItem
  if (!state.inventory.find(i => i.id === selectedItem?.id)) {
    selectedItem = state.inventory[0] || null;
  }

  if (state.inventory.length === 0) {
    state.inventory.push({ id: Date.now(), name: 'Базовый банан', icon: '🍌', price: 100 });
    selectedItem = state.inventory[0];
  }

  const wIcon = document.getElementById('wheelIcon');
  if (wIcon && selectedItem) wIcon.textContent = selectedItem.icon;

  const invCount = document.getElementById('invCount');
  if (invCount) invCount.textContent = `${state.inventory.length} предмет${state.inventory.length === 1 ? '' : state.inventory.length < 5 ? 'а' : 'ов'}`;

  list.innerHTML = '';
  state.inventory.forEach(item => {
    const el = document.createElement('div');
    el.className = `inv-item ${selectedItem?.id === item.id ? 'selected' : ''}`;
    el.innerHTML = `
      <div class="inv-item-icon">${item.icon}</div>
      <div class="inv-item-price">${fmt(item.price)}</div>
    `;
    el.addEventListener('click', () => {
      if (isUpgrading) return;
      selectedItem = item;
      if (wIcon) wIcon.textContent = item.icon;
      renderUpgrader();
      haptic('light');
    });
    list.appendChild(el);
  });
}

function updateChanceUI() {
  const chance = CHANCES[currentMult];
  const chanceText = document.getElementById('chanceText');
  if (chanceText) chanceText.textContent = chance + '%';

  const winSector = document.getElementById('winSector');
  if (winSector) {
    const circumference = 534;
    const sectorLength = (chance / 100) * circumference;
    winSector.setAttribute('stroke-dasharray', `${sectorLength} ${circumference}`);
  }

  document.querySelectorAll('.mult-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.mult) === currentMult);
  });
}

document.querySelectorAll('.mult-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isUpgrading) return;
    currentMult = parseFloat(btn.dataset.mult);
    updateChanceUI();
    haptic('light');
  });
});

function triggerUpgrade() {
  if (isUpgrading || !selectedItem || state.inventory.length === 0) return;

  isUpgrading = true;
  const chance = CHANCES[currentMult];
  const isWin = Math.random() * 100 < chance;

  let targetPercent;
  if (isWin) {
    targetPercent = Math.random() * (chance - 6) + 3;
  } else {
    targetPercent = chance + Math.random() * (100 - chance - 3) + 1;
  }

  const targetDegree = (targetPercent / 100) * 360;
  const totalRotation = 1800 + targetDegree;

  const arrow = document.getElementById('wheelArrow');
  if (!arrow) {
    isUpgrading = false;
    return;
  }

  arrow.classList.remove('spinning-arrow');
  arrow.style.transform = 'rotate(0deg)';

  setTimeout(() => {
    arrow.classList.add('spinning-arrow');
    arrow.style.transform = `rotate(${totalRotation}deg)`;

    setTimeout(() => {
      isUpgrading = false;

      if (isWin) {
        selectedItem.price = Math.floor(selectedItem.price * currentMult);
        toast(`🎉 Успех! ${selectedItem.name} теперь стоит ${fmt(selectedItem.price)}`);
        haptic('success');
      } else {
        toast(`💥 Провал! ${selectedItem.name} сгорел`);
        haptic('error');
        const index = state.inventory.findIndex(i => i.id === selectedItem.id);
        if (index > -1) state.inventory.splice(index, 1);

        if (state.inventory.length === 0) {
          state.inventory.push({ id: Date.now(), name: 'Базовый банан', icon: '🍌', price: 100 });
        }
        selectedItem = state.inventory[0];
      }

      save(true);
      renderUpgrader();

      arrow.classList.remove('spinning-arrow');
      arrow.style.transform = `rotate(${targetDegree}deg)`;
    }, 3500);
  }, 40);
}

/* ============ TASKS ============ */
const TASKS = [
  { id: 'tg_channel', title: 'Подписаться на канал', desc: '+2000 🍯', reward: 2000, url: 'https://t.me/telegram' },
  { id: 'invite_1', title: 'Пригласить 1 друга', desc: '+5000 🍯', reward: 5000, check: () => state.refCount >= 1 },
  { id: 'tap_100', title: 'Сделать 100 тапов', desc: '+1500 🍯', reward: 1500, check: () => state.totalTaps >= 100 },
  { id: 'tap_500', title: 'Сделать 500 тапов', desc: '+5000 🍯', reward: 5000, check: () => state.totalTaps >= 500 },
  { id: 'level_5', title: 'Достичь 5 уровня', desc: '+3000 🍯', reward: 3000, check: () => state.level >= 5 },
];

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';

  TASKS.forEach(t => {
    const done = state.completedTasks.includes(t.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-icon">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </div>
      <div class="card-body">
        <div class="card-title">${t.title}</div>
        <div class="card-desc">${t.desc}</div>
      </div>
      <button class="btn ${done ? '' : 'primary'}" data-id="${t.id}" ${done ? 'disabled' : ''}>
        ${done ? 'Готово' : 'Выполнить'}
      </button>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('button:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = TASKS.find(x => x.id === btn.dataset.id);
      if (!t) return;
      if (t.check && !t.check()) {
        toast('❌ Условие ещё не выполнено');
        haptic('error');
        return;
      }
      if (t.url) window.open(t.url, '_blank');
      state.balance += t.reward;
      state.completedTasks.push(t.id);
      save(true);
      renderTasks();
      toast('🎉 Награда: +' + fmt(t.reward) + ' 🍯');
      haptic('success');
    });
  });
}

/* ============ FRIENDS ============ */
function renderFriends() {
  const botUsername = 'your_bot'; // ← замени на имя своего бота
  const link = `https://t.me/${botUsername}?start=ref_${state.userId || 'guest'}`;
  const linkEl = document.getElementById('refLink');
  const countEl = document.getElementById('refCount');
  if (linkEl) linkEl.textContent = link;
  if (countEl) countEl.textContent = state.refCount;
}

const inviteBtn = document.getElementById('inviteBtn');
if (inviteBtn) {
  inviteBtn.addEventListener('click', () => {
    const botUsername = 'your_bot';
    const link = `https://t.me/${botUsername}?start=ref_${state.userId || 'guest'}`;
    if (navigator.share) {
      navigator.share({
        title: 'Bee Tap 🐝',
        text: 'Тапай мёд и прокачивай пасеку!',
        url: link
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link).then(() => toast('📋 Ссылка скопирована'));
    }
  });
}

/* ============ MINE / PASSIVE ============ */
const MINE_ITEMS = [
  { id: 'farm1', title: 'Медовая плантация', desc: '+50 🍯/час', price: 3000, rate: 50 },
  { id: 'farm2', title: 'Пчелиный завод', desc: '+200 🍯/час', price: 10000, rate: 200 },
  { id: 'farm3', title: 'Медовая империя', desc: '+1000 🍯/час', price: 40000, rate: 1000 },
];

function renderMine() {
  const list = document.getElementById('mineList');
  if (!list) return;

  const now = Date.now();
  const hours = (now - state.lastPassiveClaim) / 3600000;
  const earned = Math.floor(state.passiveRate * hours);

  list.innerHTML = `
    <div class="card">
      <div class="card-icon">
        <svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>
      </div>
      <div class="card-body">
        <div class="card-title">Накоплено меда</div>
        <div class="card-desc">${fmt(earned)} 🍯 за ${hours.toFixed(1)} ч • ${fmt(state.passiveRate)}/час</div>
      </div>
      <button class="btn primary" id="claimPassive">Забрать</button>
    </div>
  `;

  MINE_ITEMS.forEach(m => {
    const owned = state.boughtBoosts.includes(m.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-icon">
        <svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>
      </div>
      <div class="card-body">
        <div class="card-title">${m.title}</div>
        <div class="card-desc">${m.desc}</div>
      </div>
      <button class="btn ${owned ? '' : 'primary'}" ${owned ? 'disabled' : ''}>
        ${owned ? 'Куплено' : fmt(m.price) + ' 🍯'}
      </button>
    `;
    list.appendChild(card);

    if (!owned) {
      card.querySelector('button').addEventListener('click', () => {
        if (state.balance < m.price) {
          toast('❌ Недостаточно меда');
          haptic('error');
          return;
        }
        state.balance -= m.price;
        state.boughtBoosts.push(m.id);
        state.passiveRate += m.rate;
        save(true);
        renderMine();
        toast('✅ Куплено: ' + m.title);
        haptic('success');
      });
    }
  });

  const claimBtn = document.getElementById('claimPassive');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      if (earned < 1) {
        toast('🐝 Мед ещё не накопился');
        return;
      }
      state.balance += earned;
      state.lastPassiveClaim = now;
      save(true);
      renderMine();
      toast('💰 Получено: +' + fmt(earned) + ' 🍯');
      haptic('success');
    });
  }
}

/* ============ SHOP ============ */
const SHOP_ITEMS = [
  {
    id: 'energy_refill',
    title: 'Полный заряд энергии',
    desc: 'Мгновенно восстановить энергию',
    price: 500,
    action: () => { state.energy = state.maxEnergy; }
  },
  {
    id: 'tap_x2',
    title: 'x2 к тапу на 1 час',
    desc: 'Удвоение силы тапа',
    price: 2000,
    action: () => {
      const old = state.tapPower;
      state.tapPower *= 2;
      setTimeout(() => {
        state.tapPower = Math.max(1, Math.floor(state.tapPower / 2));
        save(true);
        toast('⏰ Бонус x2 закончился');
      }, 3600000);
    }
  },
];

function renderShop() {
  const list = document.getElementById('shopList');
  if (!list) return;
  list.innerHTML = '';

  SHOP_ITEMS.forEach(s => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-icon">
        <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1z"/></svg>
      </div>
      <div class="card-body">
        <div class="card-title">${s.title}</div>
        <div class="card-desc">${s.desc}</div>
      </div>
      <button class="btn primary">${fmt(s.price)} 🍯</button>
    `;
    list.appendChild(card);

    card.querySelector('button').addEventListener('click', () => {
      if (state.balance < s.price) {
        toast('❌ Недостаточно меда');
        haptic('error');
        return;
      }
      state.balance -= s.price;
      s.action();
      save(true);
      toast('✅ Куплено: ' + s.title);
      haptic('success');
    });
  });
}

/* ============ PROFILE ============ */
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (confirm('Точно сбросить весь прогресс? Это действие нельзя отменить.')) {
      localStorage.removeItem(SAVE_KEY);
      state = { ...defaultState };
      selectedItem = state.inventory[0];
      save(true);
      renderTopbar();
      renderTasks();
      renderMine();
      renderShop();
      renderFriends();
      renderUpgrader();
      switchPage('tap');
      toast('🔄 Прогресс сброшен');
    }
  });
}

/* ============ INIT ============ */
renderTopbar();
renderTasks();
renderMine();
renderShop();
renderFriends();
renderUpgrader();
updateChanceUI();

if (document.getElementById('wheelIcon') && selectedItem) {
  document.getElementById('wheelIcon').textContent = selectedItem.icon;
}

// принудительное сохранение при закрытии
window.addEventListener('beforeunload', () => save(true));
