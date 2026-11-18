/* ============ STATE ============ */
const SAVE_KEY = 'banana_tap_save_v1';

const defaultState = {
  balance: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  level: 1,
  multiTapLevel: 0,
  energyLevel: 0,
  rechargeLevel: 0,
  passiveLevel: 0,
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

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch { return { ...defaultState }; }
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  renderTopbar();
}

/* ============ TELEGRAM INIT ============ */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    const u = tg.initDataUnsafe?.user;
    if (u) {
      state.userName = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Игрок';
      state.userId = u.id;
      save();
    }
  } catch {}
}

// Referral from URL
const urlParams = new URLSearchParams(location.search);
const refParam = urlParams.get('ref');
if (refParam && !state.invitedBy && String(refParam) !== String(state.userId)) {
  state.invitedBy = refParam;
  state.balance += 5000;
  save();
  toast('🎁 Бонус за вход по ссылке: +5000 🍯');
}

/* ============ HELPERS ============ */
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return Math.floor(n).toString();
}

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ TOPBAR ============ */
function renderTopbar() {
  const balEl = document.getElementById('balance');
  const enEl = document.getElementById('energy');
  const userEl = document.getElementById('userName');
  const idEl = document.getElementById('userId');

  if (balEl) balEl.textContent = fmt(state.balance);
  if (enEl) enEl.textContent = `${Math.floor(state.energy)}/${state.maxEnergy}`;
  if (userEl) userEl.textContent = state.userName;
  if (idEl) idEl.textContent = state.userId ? 'ID: ' + state.userId : 'Гость';
}

/* ============ NAVIGATION ============ */
function switchPage(pageName) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  const page = document.getElementById('page-' + pageName);
  if (page) page.classList.add('active');

  const navBtn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (pageName === 'mine') renderMine();
  if (pageName === 'boosts') renderUpgrader();
  if (pageName === 'tasks') renderTasks();
  if (pageName === 'shop') renderShop();
  if (pageName === 'friends') renderFriends();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

/* ============ TAP ============ */
const tapZone = document.getElementById('tapZone');
const banana = document.getElementById('banana');

function doTap(e) {
  if (state.energy < 1) { toast('⚡ Энергия кончилась!'); return; }
  state.energy -= 1;
  state.balance += state.tapPower;
  renderTopbar();
  save();

  if (!banana) return;
  const rect = banana.getBoundingClientRect();
  const el = document.createElement('div');
  el.textContent = '+' + state.tapPower;
  el.style.cssText = `position:fixed;left:${e.clientX || rect.left + rect.width/2}px;top:${e.clientY || rect.top + rect.height/2}px;color:#ffd93b;font-weight:700;pointer-events:none;z-index:999;transition:all 0.6s ease;font-size:20px; text-shadow: 0 2px 10px rgba(0,0,0,0.5);`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-80px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 600);
}

if (banana) {
  banana.addEventListener('touchstart', (e) => { e.preventDefault(); doTap(e.touches[0]); }, { passive: false });
  banana.addEventListener('mousedown', doTap);
}

setInterval(() => {
  const regen = 1 + state.rechargeLevel * 0.5;
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.maxEnergy, state.energy + regen);
    renderTopbar();
    save();
  }
}, 2000);

/* ============ UPGRADER LOGIC ============ */
let selectedItem = state.inventory[0];
let currentMult = 2;
let isUpgrading = false;

const CHANCES = { 1.5: 70, 2: 50, 5: 20, 10: 10 };

function renderUpgrader() {
  const list = document.getElementById('inventoryList');
  if (!list) return;

  if (!state.inventory.find(i => i.id === selectedItem.id) && state.inventory.length > 0) {
    selectedItem = state.inventory[0];
  }
  if (state.inventory.length === 0) {
    state.inventory.push({ id: Date.now(), name: 'Базовый банан', icon: '🍌', price: 100 });
    selectedItem = state.inventory[0];
  }

  document.getElementById('wheelIcon').textContent = selectedItem.icon;

  list.innerHTML = '';
  state.inventory.forEach(item => {
    const el = document.createElement('div');
    el.className = `inv-item ${selectedItem.id === item.id ? 'selected' : ''}`;
    el.innerHTML = `
      <div class="inv-item-icon">${item.icon}</div>
      <div class="inv-item-price">${fmt(item.price)}</div>
    `;
    el.addEventListener('click', () => {
      if (isUpgrading) return;
      selectedItem = item;
      document.getElementById('wheelIcon').textContent = item.icon;
      renderUpgrader();
    });
    list.appendChild(el);
  });
}

function updateChanceUI() {
  const chance = CHANCES[currentMult];
  document.getElementById('chanceText').textContent = chance + '%';
  
  const winSector = document.getElementById('winSector');
  if (winSector) {
    const circumference = 534;
    const sectorLength = (chance / 100) * circumference;
    winSector.setAttribute('stroke-dasharray', `${sectorLength} ${circumference}`);
    winSector.setAttribute('stroke', chance < 30 ? 'url(#gradRed)' : 'url(#gradYellow)');
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
  });
});

const upgradeBtn = document.getElementById('upgradeBtn');
if (upgradeBtn) {
  upgradeBtn.addEventListener('click', () => {
    if (isUpgrading || state.inventory.length === 0) return;
    
    isUpgrading = true;
    const chance = CHANCES[currentMult];
    const isWin = Math.random() * 100 < chance;
    
    let targetPercent;
    if (isWin) {
      targetPercent = Math.random() * (chance - 4) + 2; 
    } else {
      targetPercent = chance + Math.random() * (100 - chance - 2) + 1;
    }
    
    const targetDegree = (targetPercent / 100) * 360;
    const totalRotation = 1800 + targetDegree;
    
    const arrow = document.getElementById('wheelArrow');
    
    arrow.classList.remove('spinning-arrow');
    arrow.style.transform = `rotate(0deg)`;
    
    setTimeout(() => {
      arrow.classList.add('spinning-arrow');
      arrow.style.transform = `rotate(${totalRotation}deg)`;
      
      setTimeout(() => {
        isUpgrading = false;
        
        if (isWin) {
          selectedItem.price = Math.floor(selectedItem.price * currentMult);
          toast(`🎉 Успех! Теперь ${selectedItem.name} стоит ${fmt(selectedItem.price)}`);
        } else {
          toast(`💥 Провал! Предмет сгорел.`);
          const index = state.inventory.findIndex(i => i.id === selectedItem.id);
          if (index > -1) state.inventory.splice(index, 1);
          
          if (state.inventory.length === 0) {
            state.inventory.push({ id: Date.now(), name: 'Базовый банан', icon: '🍌', price: 100 });
          }
          if (!state.inventory.find(i => i.id === selectedItem.id)) {
            selectedItem = state.inventory[0];
          }
        }
        
        save();
        renderUpgrader();
        
        arrow.classList.remove('spinning-arrow');
        arrow.style.transform = `rotate(${targetDegree}deg)`;
        
      }, 3000);
    }, 50);
  });
}

/* ============ TASKS ============ */
const TASKS = [
  { id: 'tg_channel', title: 'Подписаться на канал', desc: '+2000 🍯', reward: 2000, url: 'https://t.me/telegram' },
  { id: 'invite_1', title: 'Пригласить 1 друга', desc: '+5000 🍯', reward: 5000, check: () => state.refCount >= 1 },
  { id: 'tap_100', title: 'Сделать 100 тапов', desc: '+1000 🍯', reward: 1000, check: () => state.balance >= 100 },
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
      <button class="btn ${done ? '' : 'primary'}" data-id="${t.id}" ${done ? 'disabled' : ''}>${done ? 'Готово' : 'Выполнить'}</button>
    `;
    list.appendChild(card);
  });
  list.querySelectorAll('button:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = TASKS.find(x => x.id === btn.dataset.id);
      if (t.check && !t.check()) { toast('❌ Условие не выполнено'); return; }
      if (t.url) window.open(t.url, '_blank');
      state.balance += t.reward;
      state.completedTasks.push(t.id);
      save();
      renderTasks();
      toast('🎉 Награда: +' + t.reward + ' 🍯');
    });
  });
}

/* ============ FRIENDS ============ */
function renderFriends() {
  const link = `https://t.me/your_bot?start=ref_${state.userId || 'guest'}`;
  const linkEl = document.getElementById('refLink');
  const countEl = document.getElementById('refCount');
  if (linkEl) linkEl.textContent = link;
  if (countEl) countEl.textContent = state.refCount;
}

const inviteBtn = document.getElementById('inviteBtn');
if (inviteBtn) {
  inviteBtn.addEventListener('click', () => {
    const link = `https://t.me/your_bot?start=ref_${state.userId || 'guest'}`;
    if (navigator.share) {
      navigator.share({ title: 'Bee Tap', text: 'Тапай мед и получай награды!', url: link }).catch(() => {});
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

function getPassiveRate() {
  return state.passiveLevel * 50; 
}

function renderMine() {
  const list = document.getElementById('mineList');
  if (!list) return;
  const now = Date.now();
  const hours = (now - state.lastPassiveClaim) / 3600000;
  const earned = Math.floor(getPassiveRate() * hours);
  
  list.innerHTML = `
    <div class="card">
      <div class="card-icon"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg></div>
      <div class="card-body">
        <div class="card-title">Накоплено меда</div>
        <div class="card-desc">${fmt(earned)} 🍯 за ${hours.toFixed(2)} ч</div>
      </div>
      <button class="btn primary" id="claimPassive">Забрать</button>
    </div>
  `;

  MINE_ITEMS.forEach(m => {
    const owned = state.boughtBoosts.includes(m.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-icon"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg></div>
      <div class="card-body">
        <div class="card-title">${m.title}</div>
        <div class="card-desc">${m.desc}</div>
      </div>
      <button class="btn ${owned ? '' : 'primary'}" ${owned ? 'disabled' : ''}>${owned ? 'Куплено' : fmt(m.price) + ' 🍯'}</button>
    `;
    list.appendChild(card);
    if (!owned) {
      card.querySelector('button').addEventListener('click', () => {
        if (state.balance < m.price) { toast('❌ Недостаточно меда'); return; }
        state.balance -= m.price;
        state.boughtBoosts.push(m.id);
        state.passiveLevel += m.rate / 50;
        save();
        renderMine();
        toast('✅ Куплено: ' + m.title);
      });
    }
  });

  const claimBtn = document.getElementById('claimPassive');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      if (earned < 1) { toast('🐝 Мед еще не накопился'); return; }
      state.balance += earned;
      state.lastPassiveClaim = now;
      save();
      renderMine();
      toast('💰 Получено: +' + fmt(earned) + ' 🍯');
    });
  }
}

/* ============ SHOP ============ */
const SHOP_ITEMS = [
  { id: 'energy_refill', title: 'Полный заряд энергии', desc: 'Мгновенно восстановить энергию', price: 500, action: () => { state.energy = state.maxEnergy; } },
  { id: 'tap_x2', title: 'x2 к тапу на 1 час', desc: 'Удвоение силы тапа', price: 2000, action: () => { state.tapPower *= 2; setTimeout(() => { state.tapPower = Math.max(1, Math.floor(state.tapPower / 2)); save(); }, 3600000); } },
];

function renderShop() {
  const list = document.getElementById('shopList');
  if (!list) return;
  list.innerHTML = '';
  SHOP_ITEMS.forEach(s => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-icon"><svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1z"/></svg></div>
      <div class="card-body">
        <div class="card-title">${s.title}</div>
        <div class="card-desc">${s.desc}</div>
      </div>
      <button class="btn primary">${fmt(s.price)} 🍯</button>
    `;
    list.appendChild(card);
    card.querySelector('button').addEventListener('click', () => {
      if (state.balance < s.price) { toast('❌ Недостаточно меда'); return; }
      state.balance -= s.price;
      s.action();
      save();
      toast('✅ Куплено: ' + s.title);
    });
  });
}

/* ============ PROFILE RESET ============ */
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (confirm('Сбросить весь прогресс?')) {
      localStorage.removeItem(SAVE_KEY);
      state = { ...defaultState };
      save();
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
if (document.getElementById('wheelIcon')) {
  document.getElementById('wheelIcon').textContent = selectedItem.icon;
}
save();
