/* ============ STATE ============ */
const SAVE_KEY = 'banana_tap_save_v1';

const defaultState = {
  balance: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  level: 1,
  multiTapLevel: 0,       // +1 к тапу за уровень
  energyLevel: 0,         // +500 к макс. энергии за уровень
  rechargeLevel: 0,       // скорость восстановления
  passiveLevel: 0,        // пассивный доход в час
  lastPassiveClaim: Date.now(),
  refCount: 0,
  completedTasks: [],
  boughtBoosts: [],
  invitedBy: null,
  userName: 'Игрок',
  userId: null,
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...JSON.parse(raw) };
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
  state.balance += 5000; // бонус новичку за вход по рефке
  save();
  toast('🎁 Бонус за вход по ссылке: +5000 🍌');
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
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ TOPBAR ============ */
function renderTopbar() {
  document.getElementById('balance').textContent = fmt(state.balance);
  document.getElementById('energy').textContent = `${Math.floor(state.energy)}/${state.maxEnergy}`;
  document.getElementById('level').textContent = state.level;
  document.getElementById('userName').textContent = state.userName;
  document.getElementById('userId').textContent = state.userId ? 'ID: ' + state.userId : 'Гость';
}

/* ============ NAVIGATION ============ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + btn.dataset.page);
    if (page) page.classList.add('active');
    if (btn.dataset.page === 'mine') renderMine();
    if (btn.dataset.page === 'boosts') renderBoosts();
    if (btn.dataset.page === 'tasks') renderTasks();
    if (btn.dataset.page === 'shop') renderShop();
    if (btn.dataset.page === 'friends') renderFriends();
  });
});

/* ============ TAP ============ */
const tapZone = document.getElementById('tapZone');
const banana = document.getElementById('banana');

function doTap(e) {
  if (state.energy < 1) { toast('⚡ Энергия кончилась! Подожди или купи буст'); return; }
  state.energy -= 1;
  state.balance += state.tapPower;
  renderTopbar();
  save();

  // floating "+N"
  const rect = banana.getBoundingClientRect();
  const el = document.createElement('div');
  el.textContent = '+' + state.tapPower;
  el.style.cssText = `position:fixed;left:${e.clientX || rect.left + rect.width/2}px;top:${e.clientY || rect.top + rect.height/2}px;color:#ffd93b;font-weight:700;pointer-events:none;z-index:999;transition:all 0.6s ease;font-size:18px;`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-60px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 600);
}

banana.addEventListener('touchstart', (e) => { e.preventDefault(); doTap(e.touches[0]); }, { passive: false });
banana.addEventListener('mousedown', doTap);

/* Energy regen: +1 каждые 2 сек (базово) */
setInterval(() => {
  const regen = 1 + state.rechargeLevel * 0.5;
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.maxEnergy, state.energy + regen);
    renderTopbar();
    save();
  }
}, 2000);

/* ============ BOOSTS ============ */
const BOOSTS = [
  { id: 'multitap', title: 'Мультитап', desc: '+1 к силе тапа', basePrice: 1000, priceMult: 2, apply: () => { state.tapPower += 1; state.multiTapLevel++; } },
  { id: 'energy', title: 'Энергия', desc: '+500 к макс. энергии', basePrice: 1500, priceMult: 2, apply: () => { state.maxEnergy += 500; state.energyLevel++; } },
  { id: 'recharge', title: 'Скорость восстановления', desc: '+0.5 энергии/2сек', basePrice: 2000, priceMult: 2.2, apply: () => { state.rechargeLevel++; } },
];

function boostPrice(b) {
  const lvl = state.boughtBoosts.filter(x => x === b.id).length;
  return Math.floor(b.basePrice * Math.pow(b.priceMult, lvl));
}

function renderBoosts() {
  const list = document.getElementById('boostList');
  list.innerHTML = '';
  BOOSTS.forEach(b => {
    const price = boostPrice(b);
    const lvl = state.boughtBoosts.filter(x => x === b.id).length;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-icon">
        <svg viewBox="0 0 24 24"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
      </div>
      <div class="card-body">
        <div class="card-title">${b.title} (ур. ${lvl})</div>
        <div class="card-desc">${b.desc}</div>
      </div>
      <button class="btn primary" data-id="${b.id}">${fmt(price)} 🍌</button>
    `;
    list.appendChild(card);
  });
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = BOOSTS.find(x => x.id === btn.dataset.id);
      const price = boostPrice(b);
      if (state.balance < price) { toast('❌ Недостаточно бананов'); return; }
      state.balance -= price;
      state.boughtBoosts.push(b.id);
      b.apply();
      save();
      renderBoosts();
      toast('✅ Куплено: ' + b.title);
    });
  });
}

/* ============ TASKS ============ */
const TASKS = [
  { id: 'tg_channel', title: 'Подписаться на канал', desc: '+2000 🍌', reward: 2000, url: 'https://t.me/telegram' },
  { id: 'invite_1', title: 'Пригласить 1 друга', desc: '+5000 🍌', reward: 5000, check: () => state.refCount >= 1 },
  { id: 'tap_100', title: 'Сделать 100 тапов', desc: '+1000 🍌', reward: 1000, check: () => state.balance >= 100 },
];

function renderTasks() {
  const list = document.getElementById('taskList');
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
      toast('🎉 Награда: +' + t.reward + ' 🍌');
    });
  });
}

/* ============ FRIENDS ============ */
function renderFriends() {
  const link = `https://t.me/your_bot?start=ref_${state.userId || 'guest'}`;
  document.getElementById('refLink').textContent = link;
  document.getElementById('refCount').textContent = state.refCount;
}

document.getElementById('inviteBtn').addEventListener('click', () => {
  const link = `https://t.me/your_bot?start=ref_${state.userId || 'guest'}`;
  if (navigator.share) {
    navigator.share({ title: 'Banana Tap', text: 'Тапай бананы и получай BANANA!', url: link }).catch(() => {});
  } else {
    navigator.clipboard.writeText(link).then(() => toast('📋 Ссылка скопирована'));
  }
});

/* ============ MINE / PASSIVE ============ */
const MINE_ITEMS = [
  { id: 'farm1', title: 'Банан-плантация', desc: '+50 🍌/час', price: 3000, rate: 50 },
  { id: 'farm2', title: 'Банановый завод', desc: '+200 🍌/час', price: 10000, rate: 200 },
  { id: 'farm3', title: 'Банановая империя', desc: '+1000 🍌/час', price: 40000, rate: 1000 },
];

function getPassiveRate() {
  return state.passiveLevel * 50; // упрощённо
}

function renderMine() {
  const list = document.getElementById('mineList');
  const now = Date.now();
  const hours = (now - state.lastPassiveClaim) / 3600000;
  const earned = Math.floor(getPassiveRate() * hours);
  list.innerHTML = `
    <div class="card">
      <div class="card-icon"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg></div>
      <div class="card-body">
        <div class="card-title">Накоплено</div>
        <div class="card-desc">${fmt(earned)} 🍌 за ${hours.toFixed(2)} ч</div>
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
      <button class="btn ${owned ? '' : 'primary'}" ${owned ? 'disabled' : ''}>${owned ? 'Куплено' : fmt(m.price) + ' 🍌'}</button>
    `;
    list.appendChild(card);
    if (!owned) {
      card.querySelector('button').addEventListener('click', () => {
        if (state.balance < m.price) { toast('❌ Недостаточно бананов'); return; }
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
      state.balance += earned;
      state.lastPassiveClaim = now;
      save();
      renderMine();
      toast('💰 Получено: +' + fmt(earned) + ' 🍌');
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
      <button class="btn primary">${fmt(s.price)} 🍌</button>
    `;
    list.appendChild(card);
    card.querySelector('button').addEventListener('click', () => {
      if (state.balance < s.price) { toast('❌ Недостаточно бананов'); return; }
      state.balance -= s.price;
      s.action();
      save();
      toast('✅ Куплено: ' + s.title);
    });
  });
}

/* ============ PROFILE ============ */
document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Сбросить весь прогресс?')) {
    localStorage.removeItem(SAVE_KEY);
    state = { ...defaultState };
    save();
    renderTopbar();
    renderBoosts();
    renderTasks();
    renderMine();
    renderShop();
    renderFriends();
    toast('🔄 Прогресс сброшен');
  }
});

/* ============ INIT ============ */
renderTopbar();
renderBoosts();
renderTasks();
renderMine();
renderShop();
renderFriends();
save();
