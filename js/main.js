// =====================================================================
//  WARUNG KITA 3D: KOPITIAM RUSH — main game controller
// =====================================================================
import * as C from './config.js';
import { audio } from './audio.js';
import { processFullBodyImage, CharacterPreview, defaultAppearance, randomBatikAppearance, appearanceKey } from './characters.js';
import { Scene3D } from './scene3d.js';
import { Multiplayer, makeId } from './multiplayer.js';
import { Calculator } from './calculator.js';

// ---------------------------------------------------------------------
//  Utilities
// ---------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function weighted(obj) {
  const entries = Object.entries(obj).filter(([, w]) => w > 0);
  let r = Math.random() * sum(entries.map(([, w]) => w));
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

function show(el, on = true) { if (typeof el === 'string') el = $(el); if (el) el.hidden = !on; }

// ---------------------------------------------------------------------
//  Global state
// ---------------------------------------------------------------------
const S = {
  scene: null,
  preview: null,
  profile: null,
  gallery: [],
  lastBatik: null,
  mode: 'solo',
  soloRole: 'all',
  mp: null,
  unsubs: [],
  inGame: false,
  myRole: 'all',
  station: 'cashier',
  meta: {},
  players: {},
  orders: {},
  stats: {},
  roomGallery: [],
  clock: 0,
  paused: false,
  host: null,
  cashier: null,
  chef: null,
  drinks: null,
  bubbles: [],
  last: performance.now(),
  todTimer: 0,
  uiTimer: 0,
  renderQueued: false,
  rushCooldownUntil: 0,
  joinedAt: Date.now(),
  chatUnread: 0,
  prevPhase: null,
};

// ---------------------------------------------------------------------
//  Persistence
// ---------------------------------------------------------------------
function loadProfile() {
  try {
    const raw = localStorage.getItem(C.STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveProfile() {
  const data = {
    restaurantName: S.profile.restaurantName,
    playerName: S.profile.playerName,
    character: S.profile.character,
    gallery: S.gallery,
    genre: audio.genre,
    soloRole: S.soloRole,
  };
  try {
    localStorage.setItem(C.STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify({ ...data, gallery: [] })); } catch (e2) { /* storage unavailable */ }
  }
}

// ---------------------------------------------------------------------
//  Toasts, floating text, speech bubbles
// ---------------------------------------------------------------------
function toast(text, type = 'info', ms = 2200) {
  const layer = $('#toast-layer');
  if (!layer) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = text;
  layer.appendChild(t);
  while (layer.children.length > 4) layer.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}

function floatText(text, anchorEl, cls = '') {
  const layer = $('#float-layer');
  const r = (anchorEl || $('#hud-money')).getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float-text ${cls}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.bottom + 4}px`;
  layer.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

function addBubble(anchorFn, text, cls = '') {
  const layer = $('#bubble-layer');
  const b = document.createElement('div');
  b.className = `bubble ${cls}`;
  b.textContent = text;
  layer.appendChild(b);
  const item = { el: b, anchorFn, until: performance.now() + 4200 };
  S.bubbles.push(item);
  if (S.bubbles.length > 8) { const old = S.bubbles.shift(); old.el.remove(); }
}

function updateBubbles() {
  const now = performance.now();
  const occupied = [];
  for (let i = S.bubbles.length - 1; i >= 0; i--) {
    const b = S.bubbles[i];
    if (now > b.until) { b.el.remove(); S.bubbles.splice(i, 1); continue; }
    const p = S.scene.project(b.anchorFn());
    if (!p || !p.visible) { b.el.style.opacity = '0'; continue; }
    let y = p.y;
    const x = clamp(p.x, 90, window.innerWidth - 90);
    for (const o of occupied) if (Math.abs(o.x - x) < 140 && Math.abs(o.y - y) < 40) y = o.y - 42;
    y = Math.max(y, (S.inGame ? 56 : 8) + b.el.offsetHeight + 10);
    occupied.push({ x, y });
    b.el.style.opacity = now > b.until - 400 ? String((b.until - now) / 400) : '1';
    b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

function sayCustomer(orderId, text) {
  if (!text) return;
  addBubble(() => S.scene.customerAnchor(orderId), text, 'bubble-customer');
}

function sayWorker(role, text, bot = false) {
  addBubble(() => S.scene.workerAnchor(role), text, bot ? 'bubble-bot' : 'bubble-worker');
}

// =====================================================================
//  BOOT
// =====================================================================
function boot() {
  const q = new URLSearchParams(location.search).get('quality');
  S.scene = new Scene3D($('#game-canvas'), { quality: ['low', 'high'].includes(q) ? q : 'auto' });
  S.scene.setView('overview', true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => S.scene.refreshTextures());

  initLobby();
  initHUD();
  initStations();
  initChat();
  initModals();
  initKeyboard();

  const unlock = () => {
    if (!audio.ready) {
      audio.init();
      if (audio.genre !== 'mute') audio.startMusic(audio.genre);
      updateMusicButtons();
    } else {
      audio.resume();
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  document.body.classList.add('booted');
  requestAnimationFrame(loop);
}

// =====================================================================
//  LOBBY
// =====================================================================
function initLobby() {
  const p = loadProfile();
  S.profile = {
    restaurantName: p?.restaurantName || C.randomRestaurantName(),
    playerName: p?.playerName || '',
    character: p?.character || defaultAppearance(),
  };
  S.gallery = Array.isArray(p?.gallery) ? p.gallery.filter((g) => typeof g === 'string').slice(0, 8) : [];
  S.soloRole = p?.soloRole || 'all';
  if (p?.genre && ['gamelan', 'jazz', 'mute'].includes(p.genre)) audio.genre = p.genre;
  S.lastBatik = S.profile.character.type === 'batik' ? { ...S.profile.character } : defaultAppearance();

  $('#in-restaurant').value = S.profile.restaurantName;
  $('#in-player').value = S.profile.playerName;
  $('#in-restaurant').addEventListener('input', (e) => {
    S.profile.restaurantName = e.target.value.trim() || 'Warung Kita';
    S.scene.setRestaurantName(S.profile.restaurantName);
  });
  $('#in-player').addEventListener('input', (e) => { S.profile.playerName = e.target.value.trim(); });
  $('#btn-random-name').addEventListener('click', () => {
    audio.click();
    const n = C.randomRestaurantName();
    $('#in-restaurant').value = n;
    S.profile.restaurantName = n;
    S.scene.setRestaurantName(n);
  });
  S.scene.setRestaurantName(S.profile.restaurantName);

  // ---- character preview + customizer ----
  try {
    S.preview = new CharacterPreview($('#preview-canvas'));
  } catch (e) {
    console.warn('Preview renderer unavailable', e);
  }
  buildCustomizer();
  updatePreview();

  // ---- worker upload ----
  $('#in-worker').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('#upload-status');
    status.textContent = '⏳ Memproses gambar & membuang latar belakang…';
    try {
      const res = await processFullBodyImage(file, { removeBg: $('#chk-bgremove').checked });
      S.profile.character = { type: 'image', dataURL: res.dataURL };
      status.innerHTML = res.skipped
        ? `✔ Gambar dimuat naik (256×384, ${Math.round(res.bytes / 1024)} KB). Latar belakang dikekalkan.`
        : `✔ Latar belakang dibuang (${Math.round(res.removedRatio * 100)}%) • 256×384 • ${Math.round(res.bytes / 1024)} KB`;
      updatePreview();
      saveProfile();
      audio.success();
    } catch (err) {
      status.textContent = `✖ ${err.message || err}`;
      audio.buzzer();
    }
  });
  $('#btn-clear-upload').addEventListener('click', () => {
    S.profile.character = { ...S.lastBatik };
    $('#upload-status').textContent = 'Kembali ke watak Batik 3D.';
    setCharTab('batik');
    updatePreview();
    saveProfile();
  });
  $$('[data-ctab]').forEach((b) => b.addEventListener('click', () => { audio.click(); setCharTab(b.dataset.ctab); }));
  setCharTab(S.profile.character.type === 'image' ? 'upload' : 'batik');

  // ---- customer gallery ----
  $('#in-gallery').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      if (S.gallery.length >= 8) { toastLobby('Galeri penuh (maks 8 watak).'); break; }
      try {
        const res = await processFullBodyImage(f, { removeBg: $('#chk-bgremove').checked });
        S.gallery.push(res.dataURL);
      } catch (err) {
        toastLobby(`✖ ${err.message}`);
      }
    }
    renderGallery();
    saveProfile();
  });
  renderGallery();

  // ---- mode selection ----
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    audio.click();
    $$('[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
    show('#mode-solo', b.dataset.mode === 'solo');
    show('#mode-multi', b.dataset.mode === 'multi');
  }));
  $$('[data-solorole]').forEach((b) => {
    b.classList.toggle('active', b.dataset.solorole === S.soloRole);
    b.addEventListener('click', () => {
      audio.click();
      S.soloRole = b.dataset.solorole;
      $$('[data-solorole]').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  $('#btn-start-solo').addEventListener('click', () => startSolo());
  $('#btn-create-room').addEventListener('click', () => createRoomFlow());
  $('#btn-join-room').addEventListener('click', () => joinRoomFlow());
  $('#in-room-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoomFlow(); });

  $('#mp-status').innerHTML = Multiplayer.onlineAvailable
    ? '🟢 <b>Online</b> — Kongsi kod 4-digit dengan rakan.'
    : '🟡 <b>Mod Demo</b> — Buka tab lain di pelayar ini untuk sertai bilik yang sama. Bot akan mengisi peranan kosong.';
}

function toastLobby(text) {
  const st = $('#lobby-toast');
  st.textContent = text;
  st.classList.add('show');
  clearTimeout(st._t);
  st._t = setTimeout(() => st.classList.remove('show'), 2600);
}

function setCharTab(tab) {
  $$('[data-ctab]').forEach((b) => b.classList.toggle('active', b.dataset.ctab === tab));
  show('#ctab-batik', tab === 'batik');
  show('#ctab-upload', tab === 'upload');
}

function buildCustomizer() {
  const sw = $('#batik-swatches');
  sw.innerHTML = '';
  for (const id of C.BATIK_IDS) {
    const b = document.createElement('button');
    b.className = 'swatch batik-swatch';
    b.dataset.pattern = id;
    b.style.backgroundImage = `url(${C.batikDataURL(id, 96)})`;
    b.title = C.BATIK_PATTERNS[id].label;
    b.innerHTML = `<span>${C.BATIK_PATTERNS[id].label}</span>`;
    b.addEventListener('click', () => { audio.click(); setBatik({ pattern: id }); });
    sw.appendChild(b);
  }
  const sk = $('#skin-swatches');
  sk.innerHTML = '';
  C.SKIN_TONES.forEach((col, i) => {
    const b = document.createElement('button');
    b.className = 'swatch dot';
    b.style.background = col;
    b.dataset.skin = i;
    b.addEventListener('click', () => { audio.click(); setBatik({ skin: i }); });
    sk.appendChild(b);
  });
  const hj = $('#hijab-swatches');
  hj.innerHTML = '';
  C.HIJAB_COLORS.forEach((col, i) => {
    const b = document.createElement('button');
    b.className = 'swatch dot';
    b.style.background = col;
    b.dataset.hijab = i;
    b.addEventListener('click', () => { audio.click(); setBatik({ hijab: i }); });
    hj.appendChild(b);
  });
  $$('[data-gender]').forEach((b) => b.addEventListener('click', () => { audio.click(); setBatik({ gender: b.dataset.gender }); }));
  $('#btn-random-look').addEventListener('click', () => { audio.click(); setBatik(randomBatikAppearance()); });
}

function setBatik(patch) {
  const base = S.profile.character.type === 'batik' ? S.profile.character : S.lastBatik;
  S.profile.character = { ...defaultAppearance(), ...base, ...patch, type: 'batik' };
  S.lastBatik = { ...S.profile.character };
  updatePreview();
  saveProfile();
}

function updatePreview() {
  const ch = S.profile.character;
  const batik = ch.type === 'batik' ? ch : S.lastBatik;
  $$('[data-gender]').forEach((b) => b.classList.toggle('active', b.dataset.gender === batik.gender));
  $$('[data-pattern]').forEach((b) => b.classList.toggle('active', b.dataset.pattern === batik.pattern));
  $$('[data-skin]').forEach((b) => b.classList.toggle('active', Number(b.dataset.skin) === batik.skin));
  $$('[data-hijab]').forEach((b) => b.classList.toggle('active', Number(b.dataset.hijab) === batik.hijab));
  show('#hijab-row', batik.gender === 'female');
  $('#preview-badge').textContent = ch.type === 'image' ? '📷 Watak Muat Naik' : `🎨 ${batik.gender === 'female' ? 'Perempuan (Bertudung)' : 'Lelaki'} • ${C.BATIK_PATTERNS[batik.pattern]?.label || ''}`;
  if (S.preview) S.preview.setAppearance(ch, { role: S.soloRole !== 'all' ? S.soloRole : 'cashier' });
}

function renderGallery() {
  const list = $('#gallery-list');
  list.innerHTML = '';
  if (!S.gallery.length) {
    list.innerHTML = '<div class="gallery-empty">Tiada watak lagi — pelanggan Batik 3D akan digunakan.</div>';
  }
  S.gallery.forEach((url, i) => {
    const d = document.createElement('div');
    d.className = 'gallery-item';
    d.innerHTML = `<img src="${url}" alt="Pelanggan ${i + 1}"><button title="Buang">✕</button>`;
    d.querySelector('button').addEventListener('click', () => {
      S.gallery.splice(i, 1);
      renderGallery();
      saveProfile();
    });
    list.appendChild(d);
  });
  $('#gallery-count').textContent = `${S.gallery.length}/8`;
}

function readLobby() {
  S.profile.restaurantName = ($('#in-restaurant').value || '').trim().slice(0, 32) || 'Warung Kita';
  S.profile.playerName = ($('#in-player').value || '').trim().slice(0, 16) || 'Pekerja';
  saveProfile();
}

function playerPayload(role) {
  return { name: S.profile.playerName || 'Pekerja', role, character: S.profile.character };
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.innerHTML = label || '⏳'; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
}

async function startSolo() {
  audio.init();
  readLobby();
  const btn = $('#btn-start-solo');
  setBusy(btn, true, '⏳ Membuka kedai…');
  try {
    const mp = new Multiplayer();
    await mp.createRoom({ restaurantName: S.profile.restaurantName, player: playerPayload(S.soloRole), solo: true, gallery: S.gallery });
    S.mode = 'solo';
    S.mp = mp;
    attachSession();
    await mp.update('meta', { phase: 'playing', day: 1, clock: 0, rep: 3 });
  } catch (e) {
    console.error(e);
    toastLobby(`✖ ${e.message || e}`);
  } finally {
    setBusy(btn, false);
  }
}

async function createRoomFlow() {
  audio.init();
  readLobby();
  const btn = $('#btn-create-room');
  setBusy(btn, true, '⏳ Mencipta bilik…');
  try {
    const mp = new Multiplayer();
    await mp.createRoom({ restaurantName: S.profile.restaurantName, player: playerPayload('cashier'), solo: false, gallery: S.gallery });
    S.mode = 'multi';
    S.mp = mp;
    attachSession();
    showRoom();
  } catch (e) {
    console.error(e);
    toastLobby(`✖ ${e.message || e}`);
  } finally {
    setBusy(btn, false);
  }
}

async function joinRoomFlow() {
  audio.init();
  readLobby();
  const code = $('#in-room-code').value.trim();
  const btn = $('#btn-join-room');
  setBusy(btn, true, '⏳');
  try {
    const mp = new Multiplayer();
    await mp.joinRoom(code, playerPayload('chef'));
    S.mode = 'multi';
    S.mp = mp;
    attachSession();
    // grab a free role (read the room's players directly: online they arrive asynchronously)
    const roster = (await mp.get('players')) || {};
    const taken = new Set(Object.entries(roster).filter(([pid]) => pid !== mp.pid).map(([, p]) => p && p.role));
    const free = C.ROLE_ORDER.find((r) => !taken.has(r)) || 'chef';
    await mp.updateMe({ role: free });
    if (S.meta.phase !== 'playing') showRoom();
  } catch (e) {
    console.error(e);
    toastLobby(`✖ ${e.message || e}`);
  } finally {
    setBusy(btn, false);
  }
}

// =====================================================================
//  SESSION (shared by solo & multiplayer)
// =====================================================================
function attachSession() {
  const mp = S.mp;
  S.joinedAt = Date.now();
  S.orders = {};
  S.players = {};
  S.meta = {};
  S.stats = {};
  S.prevPhase = null;
  $('#chat-log').innerHTML = '';
  S.chatUnread = 0;
  updateUnread();
  S.unsubs.push(mp.subscribe('players', (p) => onPlayers(p || {})));
  S.unsubs.push(mp.subscribe('gallery', (g) => { S.roomGallery = arr(g).filter(Boolean); }));
  S.unsubs.push(mp.subscribe('stats', (s) => { S.stats = s || {}; renderHUD(); }));
  S.unsubs.push(mp.subscribe('orders', (o) => onOrders(o || {})));
  S.unsubs.push(mp.subscribe('meta', (m) => onMeta(m || {})));
  S.unsubs.push(mp.onChat(onChatMessage));
  mp.onHostChange((isHost) => {
    if (isHost) {
      initHostState();
      if (S.inGame) toast('👑 Anda kini hos bilik ini.', 'info');
    }
    renderRoom();
  });
  if (mp.isHost) initHostState();
  show('#chat-panel', true);
}

function detachSession() {
  for (const u of S.unsubs) { try { u && u(); } catch (e) { /* ignore */ } }
  S.unsubs = [];
  if (S.mp) S.mp.leave();
  S.mp = null;
  S.host = null;
}

function me() { return (S.mp && S.players[S.mp.pid]) || null; }

function humanRoles() {
  const set = new Set();
  for (const p of Object.values(S.players)) {
    if (!p) continue;
    if (p.role === 'all') C.ROLE_ORDER.forEach((r) => set.add(r));
    else if (p.role) set.add(p.role);
  }
  return set;
}

function botActive(role) {
  if (S.mode === 'solo' && S.soloRole === 'all') return false;
  return !humanRoles().has(role);
}

function anyBots() { return C.ROLE_ORDER.some((r) => botActive(r)); }

function claimValid(claim) {
  if (!claim) return false;
  if (claim === 'bot') return true;
  return !!S.players[claim];
}

function onMeta(m) {
  const prev = S.meta || {};
  S.meta = m;
  if (S.mp && !S.mp.isHost && typeof m.clock === 'number') {
    if (Math.abs(S.clock - m.clock) > 1.2 || m.clock < S.clock - 0.2) S.clock = m.clock;
  }
  if (m.restaurantName && m.restaurantName !== prev.restaurantName) S.scene.setRestaurantName(m.restaurantName);
  if (S.host && typeof m.rep === 'number' && S.host.rep == null) S.host.rep = m.rep;

  const phase = m.phase;
  if (phase !== S.prevPhase) {
    const was = S.prevPhase;
    S.prevPhase = phase;
    if (phase === 'playing') {
      if (!S.inGame) enterGame();
      else if (was === 'report') startNewDayLocal();
    } else if (phase === 'report') {
      if (!S.inGame) enterGame();
      showReport();
    } else if (phase === 'ended') {
      showFinal();
    } else if (phase === 'lobby') {
      renderRoom();
    }
  }
  renderHUD();
  renderRoom();
}

function onPlayers(p) {
  S.players = p;
  renderRoom();
  if (S.inGame) {
    const mine = me();
    if (mine && mine.role !== S.myRole && S.mode === 'multi') {
      S.myRole = mine.role;
      renderStationTabs();
      setStation(S.myRole);
    }
    refreshWorkers();
    renderHUD();
  }
}

function onOrders(o) {
  const prev = S.orders || {};
  for (const [id, ord] of Object.entries(o)) {
    if (!ord) continue;
    const old = prev[id];
    if (!old) {
      if (ord.status === 'queue' && S.inGame) {
        audio.doorbell();
        setTimeout(() => sayCustomer(id, ord.greet), 1400);
      }
    } else if (old.status !== ord.status) {
      if (ord.status === 'served') {
        sayCustomer(id, ord.happy || 'Terima kasih!');
        audio.coin();
        if (ord.tip) floatText(`+${C.rm(ord.tip)} tip`, $('#hud-money'), 'gain');
      } else if (ord.status === 'left') {
        sayCustomer(id, ord.angry || 'Lambat!');
        audio.angry();
        toast(`😠 ${esc(ord.name)} beredar${ord.refunded ? ` — refund ${C.rm(ord.total)}` : ''}!`, 'bad');
      } else if (ord.status === 'paid' && ord.paidBy === 'bot') {
        sayWorker('cashier', `Terima kasih ${ord.name}!`, true);
      }
    } else {
      // item completions by teammates → small cue
      const a = arr(old.items), b = arr(ord.items);
      b.forEach((it, i) => {
        if (it && it.done && a[i] && !a[i].done && it.by !== S.mp?.pid) audio.ding();
      });
    }
  }
  S.orders = o;
  queueRender();
}

function queueRender() {
  if (S.renderQueued) return;
  S.renderQueued = true;
  requestAnimationFrame(() => {
    S.renderQueued = false;
    if (!S.inGame) return;
    renderTickets();
    renderCashier();
    renderChefTasks();
    renderDrinkTasks();
    syncScene();
    renderHUD();
  });
}

function sortedOrders(filter) {
  return Object.values(S.orders || {}).filter((o) => o && o.id && (!filter || filter(o))).sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

// =====================================================================
//  ROOM LOBBY (multiplayer waiting room)
// =====================================================================
function showRoom() {
  show('#lobby', false);
  show('#room', true);
  renderRoom();
}

function initRoom() {
  $$('#room-roles [data-role]').forEach((b) => b.addEventListener('click', () => {
    audio.click();
    if (S.mp) S.mp.updateMe({ role: b.dataset.role });
  }));
  $('#btn-room-start').addEventListener('click', async () => {
    if (!S.mp || !S.mp.isHost) return;
    audio.init();
    await S.mp.update('meta', { phase: 'playing', day: 1, clock: 0, rep: 3 });
  });
  $('#btn-room-leave').addEventListener('click', () => leaveToLobby());
  $('#btn-copy-code').addEventListener('click', () => {
    const code = S.mp?.room || '';
    try { navigator.clipboard.writeText(code); toastLobby(`Kod ${code} disalin!`); } catch (e) { /* ignore */ }
  });
}

function renderRoom() {
  if (!S.mp || S.inGame || S.mode !== 'multi') return;
  $('#room-code').textContent = S.mp.room;
  $('#room-restaurant').textContent = `🏪 ${S.meta.restaurantName || ''}`;
  $('#room-mode-note').innerHTML = S.mp.isDemo
    ? '🟡 Mod Demo Tempatan — buka tab baharu, pilih Multiplayer & masukkan kod ini untuk sertai.'
    : '🟢 Online — kongsi kod bilik ini dengan rakan.';
  const mine = me();
  $$('#room-roles [data-role]').forEach((b) => {
    b.classList.toggle('active', mine && mine.role === b.dataset.role);
    const n = Object.values(S.players).filter((p) => p && p.role === b.dataset.role).length;
    b.querySelector('.cnt').textContent = n ? `${n} pemain` : '🤖 bot';
  });
  const ul = $('#room-players');
  ul.innerHTML = '';
  const entries = Object.entries(S.players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  for (const [pid, p] of entries) {
    const li = document.createElement('li');
    const r = C.ROLES[p.role];
    li.innerHTML = `<span class="pl-role">${r ? r.icon : '⚡'}</span><b>${esc(p.name)}</b> <small>${r ? r.label : 'Semua'}</small>${pid === S.meta.hostId ? ' <span class="tag">👑 Hos</span>' : ''}${pid === S.mp.pid ? ' <span class="tag tag-me">Anda</span>' : ''}${p.character?.type === 'image' ? ' <span class="tag">📷</span>' : ''}`;
    ul.appendChild(li);
  }
  for (const role of C.ROLE_ORDER) {
    if (!botActive(role)) continue;
    const li = document.createElement('li');
    li.className = 'bot';
    li.innerHTML = `<span class="pl-role">${C.ROLES[role].icon}</span><b>🤖 ${C.BOT_NAMES[role].name}</b> <small>${C.ROLES[role].label} (auto)</small>`;
    ul.appendChild(li);
  }
  show('#btn-room-start', S.mp.isHost);
  show('#room-wait', !S.mp.isHost);
}

function leaveToLobby() {
  audio.stopLoops();
  detachSession();
  S.inGame = false;
  S.paused = false;
  S.orders = {};
  S.players = {};
  S.meta = {};
  S.stats = {};
  S.scene.clearCustomers();
  S.scene.plateClear();
  S.scene.mugReset();
  S.scene.setWorkers({ cashier: null, chef: null, drinks: null });
  S.scene.setView('overview');
  S.scene.setRestaurantName(S.profile.restaurantName);
  for (const b of S.bubbles) b.el.remove();
  S.bubbles = [];
  if (S.calc) toggleCalc(false);
  ['#hud', '#room', '#chat-panel', '#modal-report', '#modal-final', '#modal-pause'].forEach((s) => show(s, false));
  show('#lobby', true);
  document.body.classList.remove('in-game');
}

// =====================================================================
//  GAME ENTRY / DAY FLOW
// =====================================================================
function enterGame() {
  S.inGame = true;
  show('#lobby', false);
  show('#room', false);
  show('#hud', true);
  document.body.classList.add('in-game');
  const mine = me();
  S.myRole = mine ? mine.role : 'all';
  S.clock = S.meta.clock || 0;
  resetStations();
  setStation(S.myRole === 'all' ? 'cashier' : S.myRole, false);
  refreshWorkers();
  renderStationTabs();
  queueRender();
  audio.init();
  if (audio.genre !== 'mute' && !audio.musicPlaying) audio.startMusic(audio.genre);
  updateMusicButtons();
  toast(`🌅 <b>Hari ${S.meta.day || 1}</b> — Selamat berniaga di <b>${esc(S.meta.restaurantName)}</b>!`, 'good', 3200);
  tryFullscreenLandscape();
  if (S.mode === 'solo') {
    setTimeout(() => {
      if (S.myRole === 'all') sayWorker(S.station, 'Tekan 1, 2, 3 untuk tukar stesen!');
      else S.mp && S.mp.sendSystemChat(C.BOT_NAMES[C.ROLE_ORDER.find((r) => r !== S.myRole)].name, C.ROLE_ORDER.find((r) => r !== S.myRole), '👋 Bot sedia membantu! Tekan "Gesa Bot!" kalau nak laju.');
    }, 1500);
  }
}

function tryFullscreenLandscape() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (!mobile) return;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen() : null;
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
  } catch (e) { /* ignore */ }
}

function startNewDayLocal() {
  hideModal('#modal-report');
  resetStations();
  S.scene.clearCustomers();
  S.clock = 0;
  toast(`🌅 <b>Hari ${S.meta.day}</b> bermula! Pelanggan makin ramai…`, 'good', 3000);
  queueRender();
}

function resetStations() {
  S.cashier = { orderId: null, step: 'total', input: '', change: [], qrFixed: false, qrShown: false, busy: false };
  if (S.chef && S.chef.cooking) audio.setSizzle(false);
  S.chef = { task: null, plate: {}, cooking: false, heat: 0, zone: [0.5, 0.65], speed: 0.3 };
  S.drinks = { task: null, mug: {}, validated: false, pouring: false, level: 0, zone: [0.7, 0.85], speed: 0.35 };
  audio.setPour(false);
  if (S.scene) {
    S.scene.plateClear();
    S.scene.mugReset();
    S.scene.setRegisterDisplay('RM 0.00');
  }
}

function setStation(st, sound = true) {
  if (!C.ROLES[st]) st = 'cashier';
  if (S.drinks && S.drinks.pouring) releaseTarik();
  S.station = st;
  S.scene.setView(st);
  for (const r of C.ROLE_ORDER) show(`#panel-${r}`, r === st);
  $$('#station-tabs [data-station]').forEach((b) => b.classList.toggle('active', b.dataset.station === st));
  if (S.myRole === 'all') refreshWorkers();
  if (sound) audio.whoosh();
  queueRender();
}

function canSwitchStations() { return S.myRole === 'all'; }

function refreshWorkers() {
  if (!S.inGame) return;
  const workers = { cashier: null, chef: null, drinks: null };
  const humans = Object.entries(S.players).filter(([, p]) => p).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  for (const [pid, p] of humans) {
    const entry = { appearance: p.character || defaultAppearance(), name: p.name || 'Pekerja', isBot: false };
    if (p.role === 'all') {
      if (pid === S.mp.pid) workers[S.station] = entry;
    } else if (C.ROLES[p.role] && !workers[p.role]) {
      workers[p.role] = entry;
    }
  }
  for (const role of C.ROLE_ORDER) {
    if (!workers[role] && botActive(role)) {
      const b = C.BOT_NAMES[role];
      workers[role] = { appearance: { type: 'batik', gender: b.gender, pattern: b.pattern, skin: b.skin, hijab: 3 }, name: b.name, isBot: true };
    }
  }
  S.scene.setWorkers(workers);
}

// =====================================================================
//  HOST SIMULATION (clock, customers, patience, bots, day end)
// =====================================================================
function initHostState() {
  S.host = {
    lastClockWrite: -1,
    nextSpawn: (S.clock || 0) + 3,
    lastLook: null,
    lastSig: null,
    bots: {},
    removeAt: {},
    handled: new Set(),
    rep: typeof S.meta.rep === 'number' ? S.meta.rep : 3,
  };
  for (const o of sortedOrders()) {
    if (o.claim === 'bot') S.mp.update(`orders/${o.id}`, { claim: null });
    arr(o.items).forEach((it, i) => {
      if (it && it.claim === 'bot' && !it.done) S.mp.update(`orders/${o.id}/items/${i}`, { claim: null });
    });
  }
}

function hostTick(dt) {
  const mp = S.mp;
  if (!mp || !mp.isHost || !S.host || S.meta.phase !== 'playing' || S.paused) return;
  S.clock += dt;
  if (S.clock >= C.DAY_LENGTH_SEC) {
    S.clock = C.DAY_LENGTH_SEC;
    endDay();
    return;
  }
  if (S.clock - S.host.lastClockWrite >= 1) {
    S.host.lastClockWrite = S.clock;
    mp.update('meta', { clock: Math.round(S.clock * 10) / 10 });
  }
  hostSpawn();
  hostCheckOrders();
  hostBots();
}

function soloAllFactor() { return S.mode === 'solo' && S.soloRole === 'all' ? 1 : 0; }

function hostSpawn() {
  const day = S.meta.day || 1;
  const diff = C.difficultyForDay(day);
  const hour = C.clockToHour(S.clock);
  if (hour >= C.LAST_ORDER_HOUR) return;
  if (S.clock < S.host.nextSpawn) return;
  const humans = Math.max(1, Object.keys(S.players).length);
  let interval = diff.spawnInterval * C.rushMultiplier(hour);
  if (soloAllFactor()) interval *= 1.75;
  else if (S.mode === 'multi') interval *= humans >= 3 ? 0.85 : 1;
  S.host.nextSpawn = S.clock + interval * rand(0.75, 1.25);
  const queued = sortedOrders((o) => o.status === 'queue').length;
  const active = sortedOrders((o) => o.status === 'queue' || o.status === 'paid').length;
  const maxQ = soloAllFactor() ? Math.min(diff.maxQueue, 4) : diff.maxQueue;
  if (queued >= maxQ || active >= 10) return;
  createCustomerOrder(day, hour, diff);
}

function pickArchetype(hour) {
  const w = { ...C.ARCHETYPE_WEIGHTS };
  if (hour < 10) w.pesara *= 1.8;
  if (hour >= 11.5 && hour < 14.5) w.rider *= 1.9;
  if (hour >= 15 && hour < 18) w.pelajar *= 1.6;
  if (hour >= 19 && hour < 22) { w.pelajar *= 1.5; w.vlogger *= 1.6; }
  if (hour >= 22) { w.rider *= 1.4; w.pelajar *= 1.3; }
  return weighted(w);
}

function makeItem(A) {
  const useFav = Math.random() < 0.72;
  let id;
  if (useFav) id = pick(A.favorites);
  else id = pick([...C.FOOD_MENU.map((m) => m.id), ...C.DRINK_MENU.map((d) => d.id)]);
  if (C.FOOD_BY_ID[id]) return { kind: 'food', id, done: false };
  const d = C.DRINK_BY_ID[id];
  const sweet = weighted(A.sweetBias);
  return { kind: 'drink', id, sweet, kaw: d.kawable && Math.random() < 0.3, done: false };
}

function orderSignature(items) {
  return items.map((it) => `${it.id}:${it.sweet || ''}:${it.kaw ? 1 : 0}`).sort().join('|');
}

function breakNotes(v) {
  const out = [];
  for (const n of [10000, 5000, 2000, 1000, 500, 100]) while (v >= n) { out.push(n); v -= n; }
  for (const c of [50, 20, 10]) while (v >= c) { out.push(c); v -= c; }
  return out;
}

function cashGiven(total) {
  const options = [];
  for (const n of [500, 1000, 2000, 5000, 10000]) if (n >= total) { options.push([n]); break; }
  const up1 = Math.ceil(total / 100) * 100;
  if (up1 !== total) options.push(breakNotes(up1));
  options.push(breakNotes(Math.ceil((total + 1) / 500) * 500));
  options.push(breakNotes(Math.ceil((total + 1) / 1000) * 1000));
  if (total < 2500 && Math.random() < 0.3) options.push(breakNotes(total));
  if (total < 1500) options.push([2000]);
  const valid = options.filter((o) => sum(o) >= total);
  return pick(valid.length ? valid : [[Math.max(total, 10000)]]);
}

function wrongQrAmount(total) {
  const s = (total / 100).toFixed(2).replace('.', '');
  if (Math.random() < 0.4 && s.length >= 3) {
    const a = s.split('');
    const i = a.length - 3;
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
    const v = Number(a.join(''));
    if (v !== total && v > 0) return v;
  }
  const deltas = [10, 20, 50, 100, 200, 500].filter((d) => d < total);
  return total - (deltas.length ? pick(deltas) : 10);
}

function createCustomerOrder(day, hour, diff) {
  const mp = S.mp;
  const archId = pickArchetype(hour);
  const A = C.ARCHETYPES[archId];
  const gender = Math.random() < 0.5 ? 'male' : 'female';
  // --- non-repeating appearance ---
  let look = null;
  for (let tries = 0; tries < 10; tries++) {
    if (S.roomGallery.length && Math.random() < 0.55) {
      look = { type: 'gallery', idx: randInt(0, S.roomGallery.length - 1) };
    } else {
      look = { ...randomBatikAppearance(), gender };
    }
    if (appearanceKey(look) !== S.host.lastLook) break;
  }
  S.host.lastLook = appearanceKey(look);
  // --- non-repeating order ---
  let items = [];
  for (let tries = 0; tries < 8; tries++) {
    let n = randInt(A.items[0], A.items[1]);
    if (Math.random() < diff.bigOrderChance) n++;
    if (soloAllFactor()) n = Math.min(n, 3);
    n = clamp(n, 1, 5);
    items = [];
    for (let i = 0; i < n; i++) items.push(makeItem(A));
    if (orderSignature(items) !== S.host.lastSig) break;
  }
  S.host.lastSig = orderSignature(items);
  items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'food' ? -1 : 1));
  const total = sum(items.map(C.itemPrice));
  const method = weighted(A.pay);
  const pay = { method };
  if (method === 'cash') pay.given = cashGiven(total);
  if (method === 'qr') {
    pay.qrWrong = Math.random() < C.QR_WRONG_CHANCE;
    pay.qrAmount = pay.qrWrong ? wrongQrAmount(total) : total;
  }
  const allMult = soloAllFactor() ? 1.45 : 1;
  const patience = Math.round(A.patience * diff.patienceMult * allMult + items.length * 6);
  const waitTotal = Math.round(A.waitPatience * diff.patienceMult * allMult + items.length * 14);
  const seq = (S.meta.seq || 0) + 1;
  const id = makeId('o');
  const nameList = C.CUSTOMER_NAMES[look.gender || gender] || C.CUSTOMER_NAMES.male;
  const order = {
    id, seq, arch: archId, name: pick(nameList), look, items, total, pay,
    status: 'queue', createdAt: S.clock, patienceTotal: patience, patienceEnd: S.clock + patience, waitTotal,
    greet: pick(A.greet), happy: pick(A.happy), angry: pick(A.angry),
  };
  mp.update('meta', { seq });
  S.meta.seq = seq;
  mp.set(`orders/${id}`, order);
}

function adjustRep(delta) {
  S.host.rep = clamp((S.host.rep ?? 3) + delta, 0, 5);
  S.mp.update('meta', { rep: Math.round(S.host.rep * 100) / 100 });
}

function hostCheckOrders() {
  const mp = S.mp;
  for (const o of sortedOrders()) {
    const H = S.host;
    if (o.status === 'queue' && S.clock > o.patienceEnd && !H.handled.has(`${o.id}:left`)) {
      H.handled.add(`${o.id}:left`);
      mp.update(`orders/${o.id}`, { status: 'left', leftAt: S.clock });
      mp.inc('stats/lost', 1);
      adjustRep(-0.25);
    } else if (o.status === 'paid') {
      const items = arr(o.items).filter(Boolean);
      if (items.length && items.every((it) => it.done)) {
        if (!H.handled.has(`${o.id}:served`)) {
          H.handled.add(`${o.id}:served`);
          completeOrder(o, items);
        }
      } else if (S.clock > o.waitEnd && !H.handled.has(`${o.id}:left`)) {
        H.handled.add(`${o.id}:left`);
        mp.update(`orders/${o.id}`, { status: 'left', leftAt: S.clock, refunded: true });
        mp.inc('stats/lost', 1);
        mp.inc('stats/refunds', o.total);
        adjustRep(-0.4);
      }
    } else if (o.status === 'served' || o.status === 'left') {
      if (!H.removeAt[o.id]) H.removeAt[o.id] = S.clock + 5;
      else if (S.clock > H.removeAt[o.id]) {
        delete H.removeAt[o.id];
        mp.remove(`orders/${o.id}`);
      }
    }
  }
}

function completeOrder(o, items) {
  const A = C.ARCHETYPES[o.arch] || C.ARCHETYPES.pesara;
  const perfect = items.filter((it) => it.quality === 'perfect').length;
  const waitFrac = clamp((o.waitEnd - S.clock) / (o.waitTotal || 1), 0, 1);
  const tip = Math.round(((20 + 30 * perfect + 70 * waitFrac) * A.tipMult) / 10) * 10;
  S.mp.update(`orders/${o.id}`, { status: 'served', servedAt: S.clock, tip });
  S.mp.inc('stats/served', 1);
  S.mp.inc('stats/tips', tip);
  if (perfect) S.mp.inc('stats/perfect', perfect);
  adjustRep(0.1 + (perfect === items.length ? 0.08 : 0) + waitFrac * 0.05);
}

/** Shared by human & bot cashiers */
function payOrder(o, received, method, by) {
  S.mp.update(`orders/${o.id}`, { status: 'paid', paidAt: S.clock, waitEnd: S.clock + (o.waitTotal || 90), claim: null, paidBy: by, received });
  S.mp.inc('stats/sales', received);
  S.mp.inc(`stats/pay_${method}`, 1);
  for (const it of arr(o.items)) if (it) S.mp.inc(`stats/items/${it.id}`, 1);
}

// --- bots ---------------------------------------------------------------
function findBotTask(role) {
  if (role === 'cashier') {
    const o = sortedOrders((x) => x.status === 'queue' && !claimValid(x.claim))[0];
    return o ? { orderId: o.id, idx: -1 } : null;
  }
  const kind = role === 'chef' ? 'food' : 'drink';
  for (const o of sortedOrders((x) => x.status === 'paid')) {
    const items = arr(o.items);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.kind === kind && !it.done && !claimValid(it.claim)) return { orderId: o.id, idx: i };
    }
  }
  return null;
}

function botTaskValid(role, t) {
  const o = S.orders[t.orderId];
  if (!o) return false;
  if (role === 'cashier') return o.status === 'queue';
  const it = arr(o.items)[t.idx];
  return o.status === 'paid' && it && !it.done;
}

function botDuration(role, t) {
  const o = S.orders[t.orderId];
  if (role === 'cashier') return rand(4.5, 7) + arr(o?.items).length * 0.6;
  if (role === 'chef') return rand(6, 9.5);
  return rand(4.5, 7.5);
}

function releaseBotClaim(t) {
  if (!t) return;
  const o = S.orders[t.orderId];
  if (!o) return;
  if (t.idx < 0) { if (o.claim === 'bot') S.mp.update(`orders/${o.id}`, { claim: null }); }
  else { const it = arr(o.items)[t.idx]; if (it && it.claim === 'bot') S.mp.update(`orders/${o.id}/items/${t.idx}`, { claim: null }); }
}

function hostBots() {
  const rush = (S.meta.rushUntil || 0) > S.clock;
  for (const role of C.ROLE_ORDER) {
    const H = S.host;
    if (!botActive(role)) {
      if (H.bots[role]) { releaseBotClaim(H.bots[role].task); delete H.bots[role]; }
      continue;
    }
    const b = H.bots[role] || (H.bots[role] = { task: null, doneAt: 0 });
    if (b.task) {
      if (!botTaskValid(role, b.task)) { b.task = null; continue; }
      if (rush && !b.rushed) { b.doneAt = S.clock + (b.doneAt - S.clock) * 0.45; b.rushed = true; }
      if (S.clock >= b.doneAt) finishBotTask(role, b);
    } else {
      const t = findBotTask(role);
      if (t) {
        b.task = t;
        b.rushed = rush;
        b.doneAt = S.clock + botDuration(role, t) * (rush ? 0.45 : 1);
        if (t.idx < 0) S.mp.update(`orders/${t.orderId}`, { claim: 'bot' });
        else S.mp.update(`orders/${t.orderId}/items/${t.idx}`, { claim: 'bot' });
      }
    }
  }
}

function finishBotTask(role, b) {
  const t = b.task;
  const o = S.orders[t.orderId];
  const botName = C.BOT_NAMES[role].name;
  if (Math.random() < 0.07 && !b.retried) {
    b.retried = true;
    b.doneAt = S.clock + 3;
    S.mp.sendSystemChat(botName, role, pick(['😅 Alamak, tersilap! Buat semula…', '🙈 Oops, tumpah sikit. Kejap ya!']));
    return;
  }
  b.retried = false;
  b.task = null;
  if (!o) return;
  if (role === 'cashier') {
    const method = o.pay?.method || 'cash';
    payOrder(o, o.total, method, 'bot');
    if (Math.random() < 0.3) S.mp.sendSystemChat(botName, role, `📢 Order #${o.seq} masuk! (${arr(o.items).length} item)`);
  } else {
    const quality = Math.random() < 0.3 ? 'perfect' : 'ok';
    S.mp.update(`orders/${o.id}/items/${t.idx}`, { done: true, quality, claim: null, by: 'bot' });
    const it = arr(o.items)[t.idx];
    if (Math.random() < 0.25 && it) S.mp.sendSystemChat(botName, role, `✅ Siap! ${C.itemLabel(it)} untuk #${o.seq}`);
  }
}

function endDay() {
  const mp = S.mp;
  const st = S.stats || {};
  const report = buildReport(st, S.meta);
  const tot = S.meta.totals || {};
  const totals = {
    sales: (tot.sales || 0) + (st.sales || 0),
    tips: (tot.tips || 0) + (st.tips || 0),
    net: (tot.net || 0) + report.net,
    served: (tot.served || 0) + (st.served || 0),
    lost: (tot.lost || 0) + (st.lost || 0),
    days: (tot.days || 0) + 1,
    bestDay: Math.max(tot.bestDay || 0, report.net),
  };
  mp.update('meta', { phase: 'report', clock: C.DAY_LENGTH_SEC, report, totals });
}

async function hostNextDay() {
  const mp = S.mp;
  if (!mp || !mp.isHost) return;
  const day = (S.meta.day || 1) + 1;
  await mp.set('orders', null);
  await mp.set('stats', null);
  S.clock = 0;
  S.host.nextSpawn = 3;
  S.host.lastClockWrite = -1;
  S.host.handled = new Set();
  S.host.removeAt = {};
  S.host.bots = {};
  await mp.update('meta', { phase: 'playing', day, clock: 0, report: null, rushUntil: 0 });
}

function buildReport(st, meta) {
  const sales = st.sales || 0, tips = st.tips || 0, refunds = st.refunds || 0, waste = st.waste || 0, losses = st.losses || 0;
  const served = st.served || 0, lost = st.lost || 0;
  const items = st.items || {};
  let best = null;
  for (const [id, n] of Object.entries(items)) if (!best || n > best.n) best = { id, n };
  const bestName = best ? (C.FOOD_BY_ID[best.id]?.name || C.DRINK_BY_ID[best.id]?.name || best.id) : '-';
  return {
    day: meta.day || 1,
    restaurantName: meta.restaurantName || '',
    sales, tips, refunds, waste, losses,
    net: sales + tips - refunds - waste,
    served, lost,
    accuracy: served + lost ? Math.round((served / (served + lost)) * 100) : 100,
    mistakes: st.mistakes || 0,
    perfect: st.perfect || 0,
    catches: st.catches || 0,
    cash: st.pay_cash || 0, qr: st.pay_qr || 0, card: st.pay_card || 0,
    best: bestName, bestCount: best ? best.n : 0,
    rep: meta.rep ?? 3,
  };
}

// =====================================================================
//  HUD
// =====================================================================
function initHUD() {
  renderStationTabs();
  $('#btn-recipes').addEventListener('click', () => openRecipes());
  $('#btn-music').addEventListener('click', () => { audio.init(); audio.cycleGenre(); updateMusicButtons(); saveProfile(); });
  $('#btn-music-lobby').addEventListener('click', () => { audio.init(); audio.cycleGenre(); updateMusicButtons(); saveProfile(); });
  $('#btn-pause').addEventListener('click', () => togglePause());
  $('#btn-rush').addEventListener('click', () => rushBots());
  S.calc = new Calculator($('#calc'), {
    sound: () => audio.keypad(),
    quickItems: calcQuickItems,
    onSend: sendCalcToRegister,
  });
  $('#btn-calc').addEventListener('click', () => toggleCalc());
  $('#btn-fpv').addEventListener('click', () => toggleFirstPerson());
  let fpv = false;
  try { fpv = localStorage.getItem('warungkita3d.fpv') === '1'; } catch (e) { /* ignore */ }
  S.scene.setFirstPerson(fpv);
  $('#btn-fpv').classList.toggle('active', fpv);
  audio.onChange(updateMusicButtons);
  updateMusicButtons();
}

// ---------------------------------------------------------------------
//  First-person (POV) camera
// ---------------------------------------------------------------------
function toggleFirstPerson(force) {
  const on = force === undefined ? !S.scene.fp : force;
  S.scene.setFirstPerson(on);
  $('#btn-fpv').classList.toggle('active', on);
  try { localStorage.setItem('warungkita3d.fpv', on ? '1' : '0'); } catch (e) { /* ignore */ }
  audio.whoosh();
  if (S.inGame) toast(on ? '👁️ Pandangan Orang Pertama — seret skrin untuk menoleh, klik dua kali untuk tengah semula' : '🎥 Pandangan kamera stesen', 'info', 2200);
}

// ---------------------------------------------------------------------
//  Kalkulator Pantas
// ---------------------------------------------------------------------
function toggleCalc(force) {
  if (!S.calc) return;
  S.calc.toggle(force);
  $('#btn-calc').classList.toggle('active', S.calc.isOpen);
  audio.click();
}

/** Prices of the customer currently at the counter, grouped by line */
function calcQuickItems() {
  if (!S.inGame || !S.cashier) return [];
  const o = S.cashier.orderId && S.orders[S.cashier.orderId];
  if (!o) return [];
  return groupLines(arr(o.items)).map((g) => ({ label: C.itemEmoji(g.it), price: C.itemPrice(g.it), qty: g.n }));
}

/** Put the calculator result into the register / PayWave keypad */
function sendCalcToRegister(cents) {
  const cs = S.cashier;
  if (!S.inGame || !cs || !myRoleCovers('cashier')) { toast('🧮 Hanya juruwang boleh guna mesin daftar.', 'info'); return false; }
  const o = currentCashierOrder();
  if (!o || !(cs.step === 'total' || cs.step === 'card-amount')) { toast('🧮 Mesin daftar belum sedia untuk jumlah baharu.', 'info'); return false; }
  if (S.station !== 'cashier') setStation('cashier');
  claimCashier(o);
  cs.input = String(Math.min(cents, 999999)).replace(/^0+/, '');
  const txt = C.rm(cents);
  $('#reg-amount').textContent = txt;
  if (cs.step === 'total') S.scene.setRegisterDisplay(txt);
  audio.keypad();
  toast(`🧮 ${txt} dimasukkan — tekan ✔ Sahkan`, 'info', 1500);
  return true;
}

function updateMusicButtons() {
  const label = { gamelan: '🪘 Gamelan', jazz: '🎷 Jazz', mute: '🔇 Senyap' }[audio.genre] || '🎵';
  $('#btn-music').innerHTML = label;
  $('#btn-music-lobby').innerHTML = `${label}`;
  $('#btn-music').title = 'Muzik: Tradisional Melayu (Gamelan/Inang) → Kopitiam Jazz Bossa → Senyap';
}

function renderStationTabs() {
  const wrap = $('#station-tabs');
  wrap.innerHTML = '';
  const roles = S.myRole === 'all' ? C.ROLE_ORDER : [S.myRole];
  for (const r of roles) {
    const R = C.ROLES[r];
    if (!R) continue;
    const b = document.createElement('button');
    b.className = 'station-tab';
    b.dataset.station = r;
    b.innerHTML = `${S.myRole === 'all' ? `<kbd>${R.key}</kbd>` : ''}${R.icon} <span>${R.label}</span>`;
    b.classList.toggle('active', r === S.station);
    if (S.myRole === 'all') b.addEventListener('click', () => setStation(r));
    wrap.appendChild(b);
  }
}

function renderHUD() {
  if (!S.inGame) return;
  const st = S.stats || {};
  const net = (st.sales || 0) + (st.tips || 0) - (st.refunds || 0) - (st.waste || 0);
  $('#hud-day').textContent = `📅 Hari ${S.meta.day || 1}`;
  $('#hud-money').textContent = C.rm(net);
  $('#hud-served').textContent = `🍽️ ${st.served || 0}  😠 ${st.lost || 0}`;
  const rep = S.meta.rep ?? 3;
  const full = Math.floor(rep), half = rep - full >= 0.5;
  $('#hud-rating').innerHTML = '★'.repeat(full) + (half ? '½' : '') + `<span class="dim">${'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}</span>`;
  const bots = anyBots();
  show('#btn-rush', bots);
  show('#btn-pause', S.mode === 'solo');
  updateClockHUD();
  if (S.mode === 'multi' && S.mp) $('#hud-room').textContent = `🔑 ${S.mp.room}`;
  show('#hud-room', S.mode === 'multi');
}

function updateClockHUD() {
  const hour = C.clockToHour(S.clock);
  const icon = hour < 18.5 ? '☀️' : hour < 19.7 ? '🌇' : '🌙';
  $('#hud-clock').textContent = `${icon} ${C.formatClock(S.clock)}`;
  $('#day-progress-fill').style.width = `${clamp(S.clock / C.DAY_LENGTH_SEC, 0, 1) * 100}%`;
  const rl = C.rushLabel(hour);
  const rushEl = $('#hud-rush');
  if (hour >= C.LAST_ORDER_HOUR) { rushEl.textContent = '🔔 Last Order!'; show(rushEl, true); }
  else if (rl) { rushEl.textContent = `🔥 ${rl}`; show(rushEl, true); }
  else show(rushEl, false);
  const rb = $('#btn-rush');
  const cd = Math.max(0, Math.ceil((S.rushCooldownUntil - performance.now()) / 1000));
  const active = (S.meta.rushUntil || 0) > S.clock;
  rb.disabled = cd > 0;
  rb.innerHTML = active ? '💨 Bot Laju!' : cd > 0 ? `📣 Gesa Bot (${cd})` : '📣 Gesa Bot! (Rush)';
  rb.classList.toggle('active', active);
}

function rushBots() {
  if (!S.mp || performance.now() < S.rushCooldownUntil) return;
  S.rushCooldownUntil = performance.now() + 40000;
  S.mp.update('meta', { rushUntil: S.clock + 15 });
  S.mp.sendChat('📣 GESA BOT! Laju sikit, pelanggan ramai!');
  audio.whoosh();
  setTimeout(() => {
    for (const r of C.ROLE_ORDER) if (botActive(r)) sayWorker(r, pick(['💨 Baik boss!', '🔥 Laju ni!', '👍 On it!']), true);
  }, 700);
}

// --- order tickets rail -----------------------------------------------------
function patienceFrac(o) {
  if (o.status === 'queue') return clamp((o.patienceEnd - S.clock) / (o.patienceTotal || 1), 0, 1);
  if (o.status === 'paid') return clamp((o.waitEnd - S.clock) / (o.waitTotal || 1), 0, 1);
  return 1;
}

function groupLines(items) {
  const map = new Map();
  for (const it of items) {
    if (!it) continue;
    const key = `${it.kind}:${it.id}:${it.sweet || ''}:${it.kaw ? 1 : 0}`;
    if (!map.has(key)) map.set(key, { it, n: 0, done: 0 });
    const g = map.get(key);
    g.n++;
    if (it.done) g.done++;
  }
  return [...map.values()];
}

function renderTickets() {
  const list = $('#ticket-list');
  const orders = sortedOrders((o) => o.status === 'queue' || o.status === 'paid' || o.status === 'served');
  let empty = list.querySelector('.ticket-empty');
  if (!orders.length) {
    list.querySelectorAll('.ticket').forEach((t) => t.remove());
    if (!empty) list.innerHTML = '<div class="ticket-empty">Tiada pesanan… ☕<br><small>Pelanggan akan datang!</small></div>';
    return;
  }
  if (empty) empty.remove();
  const keep = new Set();
  let prev = null;
  for (const o of orders) {
    keep.add(o.id);
    const A = C.ARCHETYPES[o.arch] || {};
    const lines = groupLines(arr(o.items)).map((g) => `<li class="${g.done === g.n ? 'done' : ''}">${C.itemEmoji(g.it)} ${g.n > 1 ? `${g.n}× ` : ''}${esc(C.itemLabel(g.it))}${g.done && g.done < g.n ? ` <small>(${g.done}/${g.n})</small>` : ''}</li>`).join('');
    const status = o.status === 'queue' ? '🧍 Beratur' : o.status === 'paid' ? '🍳 Disediakan' : '✅ Siap!';
    const pm = C.PAYMENT_METHODS[o.pay?.method];
    const html = `<div class="t-head"><b>#${o.seq}</b> <span>${A.emoji || ''} ${esc(o.name)}</span>${A.id === 'vlogger' ? '<span class="vip">VIP</span>' : ''}<span class="t-pay">${o.status === 'queue' ? '' : pm ? pm.icon : ''}</span></div>
      <ul>${lines}</ul>
      ${o.status !== 'served' ? '<div class="pbar"><i></i></div>' : ''}
      <div class="t-status">${status}</div>`;
    let el = list.querySelector(`.ticket[data-oid="${o.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.oid = o.id;
      el.className = `ticket ticket-${o.status} fresh`;
    }
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
      el.className = `ticket ticket-${o.status}${el.classList.contains('fresh') ? ' fresh' : ''}`;
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (want !== el) list.insertBefore(el, want);
    const bar = el.querySelector('.pbar i');
    if (bar) {
      const frac = patienceFrac(o);
      bar.style.width = `${(frac * 100).toFixed(0)}%`;
      bar.style.background = frac > 0.5 ? '#3fbf6b' : frac > 0.25 ? '#f2b705' : '#e5484d';
    }
    prev = el;
  }
  list.querySelectorAll('.ticket').forEach((t) => { if (!keep.has(t.dataset.oid)) t.remove(); });
}

// =====================================================================
//  STATIONS
// =====================================================================
function initStations() {
  initRoom();
  // keypad
  const keys = ['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '00', '0', 'OK'];
  const kp = $('#keypad');
  kp.innerHTML = '';
  for (const k of keys) {
    const b = document.createElement('button');
    b.className = `key ${k === 'OK' ? 'key-ok' : ''} ${k === '0' ? 'key-wide' : ''} ${k === 'OK' ? 'key-wide' : ''} ${k === '⌫' || k === 'C' ? 'key-fn' : ''}`;
    b.textContent = k === 'OK' ? '✔ Sahkan' : k;
    b.addEventListener('click', () => keypadPress(k));
    kp.appendChild(b);
  }
  // chef ingredients
  const ci = $('#chef-ings');
  ci.innerHTML = '';
  for (const id of C.FOOD_INGREDIENT_ORDER) ci.appendChild(ingredientCell(id, C.FOOD_INGREDIENTS[id], 'chef'));
  $('#btn-cook').addEventListener('click', () => startCooking());
  $('#btn-lift').addEventListener('click', () => liftDish());
  $('#btn-plate-clear').addEventListener('click', () => clearPlate(true));
  // drinks ingredients
  const di = $('#drink-ings');
  di.innerHTML = '';
  for (const id of C.DRINK_INGREDIENT_ORDER) di.appendChild(ingredientCell(id, C.DRINK_INGREDIENTS[id], 'drinks'));
  const tb = $('#btn-tarik');
  const down = (e) => { e.preventDefault(); pressTarik(); };
  const up = (e) => { e.preventDefault(); releaseTarik(); };
  tb.addEventListener('pointerdown', down);
  tb.addEventListener('pointerup', up);
  tb.addEventListener('pointerleave', () => { if (S.drinks?.pouring) releaseTarik(); });
  tb.addEventListener('pointercancel', up);
  tb.addEventListener('contextmenu', (e) => e.preventDefault());
  $('#btn-mug-clear').addEventListener('click', () => clearMug(true));
}

function ingredientCell(id, def, station) {
  const d = document.createElement('div');
  d.className = 'ing';
  d.dataset.ing = id;
  d.innerHTML = `<button class="ing-add" title="Tambah ${esc(def.name)}"><span class="emo">${def.emoji}</span><span class="nm">${esc(def.name)}</span></button><button class="ing-sub" title="Kurang">−</button><b class="ing-count">0</b>`;
  d.querySelector('.ing-add').addEventListener('click', () => (station === 'chef' ? plateAdd(id) : mugAdd(id)));
  d.querySelector('.ing-sub').addEventListener('click', () => (station === 'chef' ? plateSub(id) : mugSub(id)));
  return d;
}

function myRoleCovers(st) { return S.myRole === 'all' || S.myRole === st; }

// ---------------------------------------------------------------------
//  CASHIER
// ---------------------------------------------------------------------
function currentCashierOrder() {
  const cs = S.cashier;
  let o = cs.orderId ? S.orders[cs.orderId] : null;
  if (o && o.status === 'queue' && (!claimValid(o.claim) || o.claim === S.mp.pid)) return o;
  // pick the next customer at the counter
  o = sortedOrders((x) => x.status === 'queue' && (!claimValid(x.claim) || x.claim === S.mp.pid))[0] || null;
  if ((o ? o.id : null) !== cs.orderId) {
    S.cashier = { orderId: o ? o.id : null, step: 'total', input: '', change: [], qrFixed: false, qrShown: false, busy: false };
    S.scene.setRegisterDisplay('RM 0.00');
  }
  return o;
}

function claimCashier(o) {
  if (S.mode === 'multi' && o && o.claim !== S.mp.pid) S.mp.update(`orders/${o.id}`, { claim: S.mp.pid });
}

function renderCashier() {
  if (!S.inGame || !S.cashier) return;
  const o = currentCashierOrder();
  if (S.calc) S.calc.refreshQuick();
  const cs = S.cashier;
  const cust = $('#cash-customer');
  const pay = $('#pay-area');
  const regCol = $('#reg-col');
  const cardMode = cs.step === 'card-amount';
  regCol.classList.toggle('paywave', cardMode);
  $('#reg-step').textContent = cardMode ? '💳 TERMINAL PAYWAVE' : cs.step === 'total' ? 'JUMLAH BIL' : 'BIL DISAHKAN';
  const shownAmount = cs.step === 'total' || cs.step === 'card-amount' || !o ? Number(cs.input || 0) : o.total;
  $('#reg-amount').textContent = C.rm(shownAmount);
  regCol.classList.toggle('locked', !(cs.step === 'total' || cs.step === 'card-amount') || !o);
  if (!o) {
    const waiting = sortedOrders((x) => x.status === 'queue').length;
    cust.innerHTML = `<div class="empty-counter">☕ ${waiting ? 'Juruwang lain sedang melayan pelanggan…' : 'Tiada pelanggan di kaunter.'}<br><small>Sementara menunggu, semak 📖 Buku Resipi!</small></div>`;
    pay.innerHTML = '';
    return;
  }
  const A = C.ARCHETYPES[o.arch] || {};
  const frac = patienceFrac(o);
  const lines = groupLines(arr(o.items)).map((g) => `<li><span>${g.n}× ${C.itemEmoji(g.it)} ${esc(C.itemLabel(g.it))}</span><span class="mono">@ ${C.rm(C.itemPrice(g.it))}</span></li>`).join('');
  const pm = C.PAYMENT_METHODS[o.pay?.method];
  cust.innerHTML = `
    <div class="cust-head">
      <span class="avatar" style="background:${A.color || '#888'}">${A.emoji || '🙂'}</span>
      <div class="cust-name"><b>${esc(o.name)}</b><small>${esc(A.label || '')}${A.id === 'vlogger' ? ' • VIP ⭐' : ''}</small></div>
      <span class="pay-badge">${cs.step === 'total' ? '❔ Bayaran' : `${pm.icon} ${pm.label}`}</span>
    </div>
    <div class="say">“${esc(o.greet)}”</div>
    <ul class="order-lines">${lines}</ul>
    <div class="pbar"><i style="width:${(frac * 100).toFixed(0)}%;background:${frac > 0.5 ? '#3fbf6b' : frac > 0.25 ? '#f2b705' : '#e5484d'}"></i></div>`;
  renderPayArea(o);
}

function renderPayArea(o) {
  const cs = S.cashier;
  const pay = $('#pay-area');
  if (cs.step === 'total') {
    pay.innerHTML = `<div class="pay-hint"><div class="big">🧮</div><b>Kira jumlah bil</b><p>Campurkan harga semua item & taip di mesin daftar (cth: 1250 = RM 12.50). Tekan <kbd>Enter</kbd> / ✔ Sahkan.</p></div>`;
    return;
  }
  if (cs.step === 'cash') {
    const given = o.pay.given || [];
    const givenSum = sum(given);
    const changeSum = sum(cs.change);
    const noteChip = (v) => {
      const d = C.CASH_DENOMS.find((x) => x.v === v) || { label: `RM${v / 100}`, color: '#7b5ea7', ink: '#2d1e45', type: 'note' };
      return `<span class="money ${d.type}" style="--c:${d.color};--ink:${d.ink}">${d.label}</span>`;
    };
    const trayCounts = {};
    for (const v of cs.change) trayCounts[v] = (trayCounts[v] || 0) + 1;
    pay.innerHTML = `
      <div class="given"><span>Pelanggan beri:</span><div class="notes">${given.map(noteChip).join('')}</div><b class="mono">${C.rm(givenSum)}</b></div>
      <div class="drawer">${C.CASH_DENOMS.map((d) => `<button class="money ${d.type}" data-denom="${d.v}" style="--c:${d.color};--ink:${d.ink}">${d.label}</button>`).join('')}</div>
      <div class="tray"><span>Baki diberi:</span><b class="mono">${C.rm(changeSum)}</b><div class="tray-chips">${Object.entries(trayCounts).sort((a, b) => b[0] - a[0]).map(([v, n]) => `${noteChip(Number(v))}<small>×${n}</small>`).join(' ') || '<small class="dim">(kosong — tekan ✔ jika tiada baki)</small>'}</div></div>
      <div class="row"><button class="btn-sm" id="btn-change-undo">↶ Undo</button><button class="btn-sm" id="btn-change-clear">Kosongkan</button><button class="btn-ok" id="btn-change-give">💵 Beri Baki</button></div>`;
    pay.querySelectorAll('[data-denom]').forEach((b) => b.addEventListener('click', () => {
      const v = Number(b.dataset.denom);
      cs.change.push(v);
      v >= 100 ? audio.note() : audio.coin();
      renderPayArea(o);
    }));
    $('#btn-change-undo').addEventListener('click', () => { cs.change.pop(); audio.click(); renderPayArea(o); });
    $('#btn-change-clear').addEventListener('click', () => { cs.change = []; audio.click(); renderPayArea(o); });
    $('#btn-change-give').addEventListener('click', () => giveChange(o));
    return;
  }
  if (cs.step === 'qr') {
    const amount = cs.qrFixed ? o.total : o.pay.qrAmount;
    const name = S.meta.restaurantName || '';
    const time = C.formatClock(S.clock);
    if (!cs.qrShown) {
      pay.innerHTML = `<div class="phone"><div class="phone-screen scanning"><div class="scanline"></div><div>📱 Pelanggan sedang imbas DuitNow QR…</div></div></div>`;
      clearTimeout(cs.qrTimer);
      cs.qrTimer = setTimeout(() => {
        if (S.cashier !== cs || cs.step !== 'qr') return;
        cs.qrShown = true;
        audio.qrChime();
        renderPayArea(o);
      }, 900);
      return;
    }
    pay.innerHTML = `
      <div class="qr-wrap">
        <div class="phone"><div class="phone-screen duitnow">
          <div class="dn-head">DuitNow <small>QR</small></div>
          <div class="dn-ok">✔ Pembayaran Berjaya</div>
          <div class="dn-amt mono">${C.rm(amount)}</div>
          <div class="dn-to">kepada <b>${esc(name)}</b></div>
          <div class="dn-ref mono">Ruj: ${String(o.seq * 7919 + 100000).slice(0, 8)} • ${time}</div>
        </div></div>
        <div class="qr-actions">
          <p>Semak jumlah pada skrin telefon pelanggan!</p>
          <button class="btn-ok" id="btn-qr-ok">✔ Sahkan Terima</button>
          <button class="btn-bad" id="btn-qr-bad">✖ Jumlah Salah!</button>
        </div>
      </div>`;
    $('#btn-qr-ok').addEventListener('click', () => qrDecision(o, true));
    $('#btn-qr-bad').addEventListener('click', () => qrDecision(o, false));
    return;
  }
  if (cs.step === 'card-amount') {
    pay.innerHTML = `<div class="pay-hint"><div class="big">💳</div><b>Pelanggan bayar dengan kad</b><p>Masukkan jumlah bil pada <b>terminal PayWave</b> (keypad hijau), kemudian ✔ Sahkan.</p></div>`;
    return;
  }
  if (cs.step === 'card-tap') {
    pay.innerHTML = `
      <div class="terminal">
        <div class="term-screen"><div class="mono">${C.rm(o.total)}</div><div class="term-msg">${cs.busy ? 'MEMPROSES…' : 'SILA TAP KAD'}</div></div>
        <div class="contactless">${cs.busy ? '⏳' : '📶'}</div>
      </div>
      <button class="btn-ok btn-tap" id="btn-tap" ${cs.busy ? 'disabled' : ''}>📶 Tap Kad (PayWave)</button>`;
    $('#btn-tap').addEventListener('click', () => tapCard(o));
  }
}

function keypadPress(k) {
  if (!S.inGame || S.station !== 'cashier' || !myRoleCovers('cashier')) return;
  const cs = S.cashier;
  const o = currentCashierOrder();
  if (!o || !(cs.step === 'total' || cs.step === 'card-amount')) return;
  claimCashier(o);
  if (k === 'OK') return confirmAmount(o);
  if (k === 'C') cs.input = '';
  else if (k === '⌫') cs.input = cs.input.slice(0, -1);
  else if (cs.input.length < 6) cs.input = (cs.input + k).replace(/^0+/, '');
  audio.keypad();
  const txt = C.rm(Number(cs.input || 0));
  $('#reg-amount').textContent = txt;
  if (cs.step === 'total') S.scene.setRegisterDisplay(txt);
}

function recordMistake(o, patiencePenalty = 4, msg = '') {
  S.mp.inc('stats/mistakes', 1);
  if (o && o.status === 'queue' && patiencePenalty) S.mp.update(`orders/${o.id}`, { patienceEnd: (o.patienceEnd || 0) - patiencePenalty });
  audio.buzzer();
  if (msg) toast(msg, 'bad');
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
}

function confirmAmount(o) {
  const cs = S.cashier;
  const val = Number(cs.input || 0);
  if (val !== o.total) {
    cs.input = '';
    recordMistake(o, 4, cs.step === 'total' ? '✖ Jumlah bil salah! Kira semula 🧮' : '✖ Jumlah di terminal salah!');
    renderCashier();
    return;
  }
  audio.success();
  if (cs.step === 'total') {
    S.scene.setRegisterDisplay(C.rm(o.total));
    const method = o.pay?.method || 'cash';
    cs.input = '';
    cs.step = method === 'card' ? 'card-amount' : method;
    toast(`✔ Betul! ${C.rm(o.total)} — ${C.PAYMENT_METHODS[method].icon} ${C.PAYMENT_METHODS[method].label}`, 'good', 1600);
  } else if (cs.step === 'card-amount') {
    cs.step = 'card-tap';
    cs.input = '';
    S.scene.terminalFlash(0xffd54f);
  }
  renderCashier();
}

function finishPayment(o, received, method, extraMsg = '') {
  payOrder(o, received, method, S.mp.pid);
  S.scene.openDrawer();
  S.scene.burst('cashier', 0x9ff2c4);
  floatText(`+${C.rm(received)}`, $('#hud-money'), 'gain');
  toast(`💰 Bayaran diterima: <b>${C.rm(received)}</b>${extraMsg}`, 'good', 1600);
  sayCustomer(o.id, pick(['Terima kasih!', 'Cepat sikit ya makanan!', 'Okay, saya tunggu kat meja.']));
  S.cashier = { orderId: null, step: 'total', input: '', change: [], qrFixed: false, qrShown: false, busy: false };
  setTimeout(() => S.scene.setRegisterDisplay('RM 0.00'), 1200);
  if (S.mode === 'multi' && Math.random() < 0.5) S.mp.sendChat(`📢 Order #${o.seq} masuk! (${arr(o.items).length} item)`);
  queueRender();
}

function giveChange(o) {
  const cs = S.cashier;
  const need = sum(o.pay.given || []) - o.total;
  const given = sum(cs.change);
  if (given !== need) {
    cs.change = [];
    recordMistake(o, 4, given > need ? '✖ Baki terlebih! Kedai rugi…' : '✖ Baki tak cukup! Pelanggan protes 😤');
    renderPayArea(o);
    return;
  }
  audio.kaching();
  finishPayment(o, o.total, 'cash', need ? ` • baki ${C.rm(need)}` : '');
}

function qrDecision(o, accept) {
  const cs = S.cashier;
  const wrongNow = o.pay.qrWrong && !cs.qrFixed;
  if (accept) {
    if (wrongNow) {
      const loss = o.total - o.pay.qrAmount;
      if (loss > 0) S.mp.inc('stats/losses', loss);
      S.mp.inc('stats/mistakes', 1);
      audio.buzzer();
      toast(`😱 Alamak! Jumlah QR salah — ${loss > 0 ? `rugi ${C.rm(loss)}` : 'tak sepadan dengan bil'}!`, 'bad', 2600);
      finishPayment(o, o.pay.qrAmount, 'qr');
    } else {
      audio.qrChime();
      finishPayment(o, o.total, 'qr', ' • DuitNow ✔');
    }
  } else if (wrongNow) {
    cs.qrFixed = true;
    cs.qrShown = false;
    S.mp.inc('stats/catches', 1);
    audio.perfect();
    toast('🕵️ Mata helang! Pelanggan imbas semula dengan jumlah betul.', 'good', 2200);
    renderPayArea(o);
  } else {
    recordMistake(o, 6, '✖ Jumlah itu betul! Pelanggan tak puas hati 😒');
  }
}

function tapCard(o) {
  const cs = S.cashier;
  if (cs.busy) return;
  cs.busy = true;
  renderPayArea(o);
  S.scene.terminalFlash(0x4fc3ff);
  setTimeout(() => {
    if (S.cashier !== cs) return;
    audio.payWave();
    S.scene.terminalFlash(0x39ff6a);
    finishPayment(o, o.total, 'card', ' • PayWave LULUS ✔');
  }, 750);
}

// ---------------------------------------------------------------------
//  CHEF
// ---------------------------------------------------------------------
function foodTasks() {
  const tasks = [];
  for (const o of sortedOrders((x) => x.status === 'paid')) {
    arr(o.items).forEach((it, i) => {
      if (it && it.kind === 'food' && !it.done) tasks.push({ o, it, idx: i, key: `${o.id}:${i}` });
    });
  }
  return tasks;
}

function drinkTasks() {
  const tasks = [];
  for (const o of sortedOrders((x) => x.status === 'paid')) {
    arr(o.items).forEach((it, i) => {
      if (it && it.kind === 'drink' && !it.done) tasks.push({ o, it, idx: i, key: `${o.id}:${i}` });
    });
  }
  return tasks;
}

function taskClaimable(t) { return !claimValid(t.it.claim) || t.it.claim === S.mp.pid; }

function claimTask(t, prevKey) {
  if (prevKey && prevKey !== t.key) releaseTaskClaim(prevKey);
  if (S.mode === 'multi' || anyBots()) {
    if (t.it.claim !== S.mp.pid) S.mp.update(`orders/${t.o.id}/items/${t.idx}`, { claim: S.mp.pid });
  }
}

function releaseTaskClaim(key) {
  if (!key) return;
  const [oid, idx] = key.split(':');
  const o = S.orders[oid];
  const it = o && arr(o.items)[Number(idx)];
  if (it && !it.done && it.claim === S.mp.pid) S.mp.update(`orders/${oid}/items/${idx}`, { claim: null });
}

function renderTaskList(container, tasks, selectedKey, onSelect) {
  if (!tasks.length) {
    container.innerHTML = '<div class="task-empty">Tiada tiket. Tunggu juruwang hantar pesanan… ⏳</div>';
    return;
  }
  container.innerHTML = '';
  for (const t of tasks) {
    const b = document.createElement('button');
    const mine = t.key === selectedKey;
    const locked = !taskClaimable(t);
    const frac = patienceFrac(t.o);
    b.className = `task ${mine ? 'active' : ''} ${locked ? 'locked' : ''}`;
    const who = locked ? (t.it.claim === 'bot' ? '🤖' : `🔒 ${esc(S.players[t.it.claim]?.name || '')}`) : '';
    b.innerHTML = `<span class="tn">#${t.o.seq}</span><span class="te">${C.itemEmoji(t.it)}</span><span class="tl">${esc(C.itemLabel(t.it))}</span><span class="tw">${who}</span><i class="tp" style="width:${(frac * 100).toFixed(0)}%;background:${frac > 0.5 ? '#3fbf6b' : frac > 0.25 ? '#f2b705' : '#e5484d'}"></i>`;
    if (!locked) b.addEventListener('click', () => onSelect(t));
    container.appendChild(b);
  }
}

function renderChefTasks() {
  if (!S.inGame || !S.chef) return;
  const tasks = foodTasks();
  const ch = S.chef;
  let cur = tasks.find((t) => t.key === ch.task);
  if (!cur && !ch.cooking) {
    cur = tasks.find(taskClaimable) || null;
    if (cur && myRoleCovers('chef')) { claimTask(cur, ch.task); ch.task = cur.key; }
    else ch.task = cur ? cur.key : null;
  }
  renderTaskList($('#chef-tasks'), tasks, ch.task, (t) => {
    if (ch.cooking) { toast('🔥 Sedang memasak — Angkat dulu!', 'info'); return; }
    audio.click();
    claimTask(t, ch.task);
    ch.task = t.key;
    renderChefTasks();
  });
  const target = cur ? `${C.itemEmoji(cur.it)} <b>${esc(C.itemLabel(cur.it))}</b> <small>#${cur.o.seq}</small>` : '<span class="dim">Pilih tiket…</span>';
  $('#chef-target').innerHTML = target;
  $$('#chef-ings .ing').forEach((cell) => {
    const n = ch.plate[cell.dataset.ing] || 0;
    cell.querySelector('.ing-count').textContent = n;
    cell.classList.toggle('has', n > 0);
  });
  $('#btn-cook').disabled = ch.cooking;
  $('#btn-lift').disabled = !ch.cooking;
  const zone = $('#heat-zone');
  zone.style.left = `${ch.zone[0] * 100}%`;
  zone.style.width = `${(ch.zone[1] - ch.zone[0]) * 100}%`;
  const ok = $('#heat-zone-ok');
  ok.style.left = `${Math.max(0, ch.zone[0] - 0.08) * 100}%`;
  ok.style.width = `${(Math.min(1, ch.zone[1] + 0.08) - Math.max(0, ch.zone[0] - 0.08)) * 100}%`;
}

function currentChefTask() {
  return foodTasks().find((t) => t.key === S.chef.task) || null;
}

function plateAdd(id) {
  const ch = S.chef;
  if (!myRoleCovers('chef')) return;
  if (ch.cooking) { toast('🔥 Sedang memasak!', 'info'); return; }
  if ((ch.plate[id] || 0) >= 9) return;
  ch.plate[id] = (ch.plate[id] || 0) + 1;
  S.scene.plateAdd(id);
  audio.plop();
  renderChefTasks();
}

function plateSub(id) {
  const ch = S.chef;
  if (ch.cooking || !(ch.plate[id] > 0)) return;
  ch.plate[id]--;
  if (!ch.plate[id]) delete ch.plate[id];
  S.scene.plateRemove(id);
  audio.click();
  renderChefTasks();
}

function clearPlate(sound) {
  const ch = S.chef;
  if (ch.cooking) { ch.cooking = false; audio.setSizzle(false); }
  ch.plate = {};
  ch.heat = 0;
  S.scene.plateClear();
  if (sound) audio.whoosh();
  renderChefTasks();
  updateHeatUI();
}

function startCooking() {
  const ch = S.chef;
  if (!myRoleCovers('chef') || ch.cooking) return;
  const t = currentChefTask();
  if (!t) { toast('Tiada tiket makanan untuk dimasak.', 'info'); return; }
  const recipe = C.foodRecipe(t.it.id);
  if (!sum(Object.values(ch.plate))) { toast('🍽️ Pinggan kosong! Susun bahan dulu.', 'info'); return; }
  if (!C.recipeMatches(recipe, ch.plate)) {
    recordMistake(null, 0, `✖ Bahan tak tepat untuk <b>${esc(C.itemLabel(t.it))}</b>! Semak 📖 Buku Resipi.`);
    $('#chef-status').innerHTML = '<span class="bad">Bahan salah!</span>';
    return;
  }
  const m = C.FOOD_BY_ID[t.it.id];
  const w = m.cook.zone[1] - m.cook.zone[0];
  const shift = rand(-0.1, 0.12);
  const z0 = clamp(m.cook.zone[0] + shift, 0.3, 0.85 - w);
  ch.zone = [z0, z0 + w];
  ch.speed = (1 / m.cook.time) * (1 + ((S.meta.day || 1) - 1) * 0.05);
  ch.heat = 0;
  ch.lastT = performance.now();
  ch.cooking = true;
  audio.setSizzle(true, 0.4);
  $('#chef-status').innerHTML = `🔥 ${esc(m.cook.verb)}… tekan <b>Angkat!</b> dalam zon hijau (<kbd>Space</kbd>)`;
  renderChefTasks();
}

function updateHeatUI() {
  const ch = S.chef;
  if (!ch) return;
  $('#heat-needle').style.left = `${clamp(ch.heat, 0, 1) * 100}%`;
  $('#heat-meter').classList.toggle('active', ch.cooking);
}

function updateChef(dt) {
  const ch = S.chef;
  if (!ch || !ch.cooking || S.paused) return;
  ch.heat += dt * ch.speed;
  ch.lastT = performance.now();
  S.scene.setCooking(true, ch.heat);
  audio.setSizzle(true, ch.heat);
  updateHeatUI();
  if (ch.heat >= 1) {
    ch.cooking = false;
    audio.setSizzle(false);
    S.mp.inc('stats/waste', 50);
    recordMistake(null, 0, '🔥 HANGUS! Makanan terbakar — mula semula.');
    $('#chef-status').innerHTML = '<span class="bad">Hangus! 🔥</span>';
    clearPlate(false);
  }
}

function liftDish() {
  const ch = S.chef;
  if (!ch.cooking) return;
  const t = currentChefTask();
  // judge at the exact moment of input, not the last rendered frame
  if (ch.lastT && !S.paused) ch.heat += Math.min(0.25, (performance.now() - ch.lastT) / 1000) * ch.speed;
  ch.cooking = false;
  audio.setSizzle(false);
  const h = ch.heat;
  const [a, b] = ch.zone;
  let quality = null;
  if (h >= a && h <= b) quality = 'perfect';
  else if (h >= a - 0.08 && h <= b + 0.08) quality = 'ok';
  if (!t) { clearPlate(false); return; }
  if (!quality) {
    S.mp.inc('stats/waste', 50);
    recordMistake(null, 0, h < a ? '🥶 Mentah! Masak tak cukup.' : '😖 Terlebih masak!');
    $('#chef-status').innerHTML = `<span class="bad">${h < a ? 'Mentah!' : 'Terlebih masak!'}</span>`;
    clearPlate(false);
    return;
  }
  if (quality === 'perfect') audio.perfect(); else audio.success();
  S.scene.plateServe();
  ch.plate = {};
  ch.heat = 0;
  S.mp.update(`orders/${t.o.id}/items/${t.idx}`, { done: true, quality, claim: null, by: S.mp.pid });
  $('#chef-status').innerHTML = quality === 'perfect' ? '<span class="good">✨ PERFECT! Sedap!</span>' : '<span class="ok">👍 Boleh la!</span>';
  floatText(quality === 'perfect' ? '✨ PERFECT!' : '👍 OK', $('#btn-lift'), quality === 'perfect' ? 'perfect' : '');
  sayWorker('chef', quality === 'perfect' ? `Siap! ${C.FOOD_BY_ID[t.it.id].short} ✨` : `Siap ${C.FOOD_BY_ID[t.it.id].short}!`);
  ch.task = null;
  updateHeatUI();
  queueRender();
}

// ---------------------------------------------------------------------
//  PEMBANCUH AIR (drinks)
// ---------------------------------------------------------------------
function currentDrinkTask() {
  return drinkTasks().find((t) => t.key === S.drinks.task) || null;
}

function renderDrinkTasks() {
  if (!S.inGame || !S.drinks) return;
  const tasks = drinkTasks();
  const dr = S.drinks;
  let cur = tasks.find((t) => t.key === dr.task);
  if (!cur && !dr.pouring && dr.level <= 0) {
    cur = tasks.find(taskClaimable) || null;
    if (cur && myRoleCovers('drinks')) { claimTask(cur, dr.task); dr.task = cur.key; }
    else dr.task = cur ? cur.key : null;
    if (cur) S.scene.mugSetContents(dr.mug, cur.it.id);
  }
  renderTaskList($('#drink-tasks'), tasks, dr.task, (t) => {
    if (dr.level > 0 || dr.pouring) { toast('🧋 Habiskan tarikan dulu (atau 🗑️ Buang).', 'info'); return; }
    audio.click();
    claimTask(t, dr.task);
    dr.task = t.key;
    dr.validated = false;
    S.scene.mugSetContents(dr.mug, t.it.id);
    renderDrinkTasks();
  });
  $('#drink-target').innerHTML = cur ? `${C.itemEmoji(cur.it)} <b>${esc(C.itemLabel(cur.it))}</b> <small>#${cur.o.seq}</small>` : '<span class="dim">Pilih tiket…</span>';
  $$('#drink-ings .ing').forEach((cell) => {
    const n = dr.mug[cell.dataset.ing] || 0;
    cell.querySelector('.ing-count').textContent = n;
    cell.classList.toggle('has', n > 0);
  });
  updatePourUI();
}

function mugAdd(id) {
  const dr = S.drinks;
  if (!myRoleCovers('drinks')) return;
  if (dr.level > 0 || dr.pouring) { toast('Dah mula tarik! 🗑️ Buang untuk ubah sukatan.', 'info'); return; }
  if ((dr.mug[id] || 0) >= 6) return;
  dr.mug[id] = (dr.mug[id] || 0) + 1;
  dr.validated = false;
  const t = currentDrinkTask();
  S.scene.mugSetContents(dr.mug, t ? t.it.id : null);
  audio.scoop();
  renderDrinkTasks();
}

function mugSub(id) {
  const dr = S.drinks;
  if (dr.level > 0 || dr.pouring || !(dr.mug[id] > 0)) return;
  dr.mug[id]--;
  if (!dr.mug[id]) delete dr.mug[id];
  dr.validated = false;
  const t = currentDrinkTask();
  S.scene.mugSetContents(dr.mug, t ? t.it.id : null);
  audio.click();
  renderDrinkTasks();
}

function clearMug(sound) {
  const dr = S.drinks;
  if (dr.pouring) { dr.pouring = false; audio.setPour(false); }
  if (dr.level > 0) S.mp.inc('stats/waste', 30);
  dr.mug = {};
  dr.level = 0;
  dr.validated = false;
  S.scene.mugReset();
  if (sound) audio.whoosh();
  renderDrinkTasks();
}

function pressTarik() {
  const dr = S.drinks;
  if (!S.inGame || !myRoleCovers('drinks') || S.station !== 'drinks' || dr.pouring || S.paused) return;
  const t = currentDrinkTask();
  if (!t) { toast('Tiada tiket minuman.', 'info'); return; }
  if (!dr.validated) {
    if (!sum(Object.values(dr.mug))) { toast('🥄 Mug kosong! Sukat bahan dulu.', 'info'); return; }
    const recipe = C.drinkRecipe(t.it.id, t.it.sweet, t.it.kaw);
    if (!C.recipeMatches(recipe, dr.mug)) {
      recordMistake(null, 0, `✖ Sukatan salah untuk <b>${esc(C.itemLabel(t.it))}</b>! Ingat: Biasa=2, Kurang Manis=1, Kosong=0, Kaw=2× serbuk.`);
      $('#drink-status').innerHTML = '<span class="bad">Sukatan salah!</span>';
      return;
    }
    const d = C.DRINK_BY_ID[t.it.id];
    const w = d.pour.zone[1] - d.pour.zone[0];
    const z0 = clamp(d.pour.zone[0] + rand(-0.08, 0.06), 0.5, 0.95 - w);
    dr.zone = [z0, z0 + w];
    dr.speed = d.pour.speed * (1 + ((S.meta.day || 1) - 1) * 0.04);
    dr.validated = true;
    S.scene.mugSetZone(dr.zone);
    S.scene.mugSetContents(dr.mug, t.it.id);
  }
  dr.pouring = true;
  dr.lastT = performance.now();
  audio.setPour(true, 1);
  $('#btn-tarik').classList.add('pressed');
  $('#drink-status').innerHTML = '🫖 Tarik… lepaskan dalam <b class="gold">zon emas</b>!';
}

function releaseTarik() {
  const dr = S.drinks;
  if (!dr || !dr.pouring) return;
  if (dr.lastT) dr.level += Math.min(0.25, (performance.now() - dr.lastT) / 1000) * dr.speed * (1 + dr.level * 0.6);
  dr.pouring = false;
  audio.setPour(false);
  $('#btn-tarik').classList.remove('pressed');
  S.scene.mugPour(false, dr.level);
  const t = currentDrinkTask();
  const [a, b] = dr.zone;
  if (dr.level < a) {
    $('#drink-status').innerHTML = `Belum cukup — <b>tarik lagi!</b> (${Math.round(dr.level * 100)}%)`;
    return;
  }
  if (dr.level > b) {
    spillDrink('😖 Terlebih penuh — melimpah!');
    return;
  }
  if (!t) { clearMug(false); return; }
  const center = (a + b) / 2;
  const quality = Math.abs(dr.level - center) <= (b - a) * 0.22 ? 'perfect' : 'ok';
  if (quality === 'perfect') audio.perfect(); else audio.success();
  S.scene.mugServe();
  S.mp.update(`orders/${t.o.id}/items/${t.idx}`, { done: true, quality, claim: null, by: S.mp.pid });
  $('#drink-status').innerHTML = quality === 'perfect' ? '<span class="good">✨ PERFECT! Buih cantik!</span>' : '<span class="ok">👍 Boleh la!</span>';
  floatText(quality === 'perfect' ? '✨ PERFECT!' : '👍 OK', $('#btn-tarik'), quality === 'perfect' ? 'perfect' : '');
  sayWorker('drinks', quality === 'perfect' ? `${C.DRINK_BY_ID[t.it.id].short} siap! ✨` : `${C.DRINK_BY_ID[t.it.id].short} siap!`);
  dr.mug = {};
  dr.level = 0;
  dr.validated = false;
  dr.task = null;
  queueRender();
}

function spillDrink(msg) {
  const dr = S.drinks;
  dr.pouring = false;
  audio.setPour(false);
  audio.spill();
  $('#btn-tarik').classList.remove('pressed');
  S.scene.mugSpill();
  S.mp.inc('stats/waste', 30);
  recordMistake(null, 0, msg);
  $('#drink-status').innerHTML = '<span class="bad">Tumpah! 💦</span>';
  dr.mug = {};
  dr.level = 0;
  dr.validated = false;
  renderDrinkTasks();
}

function updateDrinks(dt) {
  const dr = S.drinks;
  if (!dr || S.paused) return;
  if (dr.pouring) {
    dr.level += dt * dr.speed * (1 + dr.level * 0.6);
    dr.lastT = performance.now();
    S.scene.mugPour(true, dr.level);
    if (dr.level >= 1) spillDrink('💦 TUMPAH! Air melimpah dari mug.');
  }
  updatePourUI();
}

function updatePourUI() {
  const dr = S.drinks;
  if (!dr) return;
  $('#pour-fill').style.height = `${clamp(dr.level, 0, 1) * 100}%`;
  const z = $('#pour-zone');
  z.style.bottom = `${dr.zone[0] * 100}%`;
  z.style.height = `${(dr.zone[1] - dr.zone[0]) * 100}%`;
  z.classList.toggle('show', dr.validated);
  const inZone = dr.level >= dr.zone[0] && dr.level <= dr.zone[1];
  $('#pour-meter').classList.toggle('in-zone', dr.validated && inZone);
}

// ---------------------------------------------------------------------
//  Scene sync (customers, workers busy)
// ---------------------------------------------------------------------
function resolveLook(look) {
  if (look && look.type === 'gallery') {
    const url = S.roomGallery[look.idx];
    if (url) return { type: 'gallery', idx: look.idx, dataURL: url };
    return { type: 'batik', gender: 'female', pattern: 'cengkih', skin: 1, hijab: look.idx % 6 };
  }
  return look;
}

function syncScene() {
  const list = [];
  let qi = 0;
  for (const o of sortedOrders()) {
    let state, mood;
    const frac = patienceFrac(o);
    if (o.status === 'queue') { state = 'queue'; mood = frac > 0.5 ? 'happy' : frac > 0.25 ? 'meh' : 'angry'; }
    else if (o.status === 'paid') { state = 'waiting'; mood = frac > 0.45 ? 'wait' : frac > 0.2 ? 'meh' : 'angry'; }
    else if (o.status === 'served') { state = 'leaving'; mood = arr(o.items).every((it) => it?.quality === 'perfect') ? 'love' : 'happy'; }
    else { state = 'leaving'; mood = 'angry'; }
    list.push({ id: o.id, appearance: resolveLook(o.look), archetype: o.arch, state, index: state === 'queue' ? qi++ : 0, mood });
  }
  S.scene.syncCustomers(list);
  // worker busy animation (bots via claims, me via activity)
  const busy = { cashier: 0, chef: 0, drinks: 0 };
  for (const o of sortedOrders()) {
    if (o.status === 'queue' && o.claim) busy.cashier = 1;
    for (const it of arr(o.items)) if (it && it.claim && !it.done) busy[it.kind === 'food' ? 'chef' : 'drinks'] = 1;
  }
  if (S.chef?.cooking) busy.chef = 1.4;
  if (S.drinks?.pouring) busy.drinks = 1.4;
  const rush = (S.meta.rushUntil || 0) > S.clock;
  for (const r of C.ROLE_ORDER) S.scene.setWorkerBusy(r, busy[r] * (rush ? 1.6 : 1));
}

// =====================================================================
//  CHAT (walkie-talkie)
// =====================================================================
function initChat() {
  const qc = $('#quick-chat');
  qc.innerHTML = '';
  for (const msg of C.QUICK_CHAT) {
    const b = document.createElement('button');
    b.textContent = msg;
    b.addEventListener('click', () => { if (S.mp) { S.mp.sendChat(msg); audio.chatBlip(); } });
    qc.appendChild(b);
  }
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const text = inp.value.trim();
    if (!text || !S.mp) return;
    S.mp.sendChat(text);
    inp.value = '';
    audio.chatBlip();
  });
  $('#chat-toggle').addEventListener('click', () => toggleChat());
}

function toggleChat(force) {
  const p = $('#chat-panel');
  const collapsed = force === undefined ? !p.classList.contains('collapsed') : !force;
  p.classList.toggle('collapsed', collapsed);
  if (!collapsed) {
    S.chatUnread = 0;
    updateUnread();
    const log = $('#chat-log');
    log.scrollTop = log.scrollHeight;
  }
  audio.click();
}

function updateUnread() {
  const u = $('#chat-unread');
  u.textContent = S.chatUnread;
  show(u, S.chatUnread > 0);
}

function onChatMessage(msg) {
  if (!msg) return;
  const log = $('#chat-log');
  const mine = S.mp && msg.pid === S.mp.pid;
  const R = C.ROLES[msg.role];
  const line = document.createElement('div');
  line.className = `chat-line ${mine ? 'mine' : ''} ${msg.bot ? 'bot' : ''}`;
  line.innerHTML = `<span class="who">${R ? R.icon : '⚡'} ${esc(msg.name)}</span><span class="txt">${esc(msg.text)}</span>`;
  log.appendChild(line);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  const fresh = (msg.t || 0) > S.joinedAt - 3000;
  if (!fresh || !S.inGame) return;
  let role = msg.role;
  if (role === 'all') role = mine ? S.station : 'cashier';
  if (C.ROLES[role]) sayWorker(role, msg.text, !!msg.bot);
  if (!mine) {
    audio.chatBlip();
    if ($('#chat-panel').classList.contains('collapsed')) { S.chatUnread++; updateUnread(); }
  }
}

// =====================================================================
//  MODALS: recipes, how-to, pause, report, final
// =====================================================================
function openModal(sel) { show(sel, true); audio.click(); }
function hideModal(sel) { show(sel, false); }

function initModals() {
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => { hideModal(`#${b.dataset.close}`); if (b.dataset.close === 'modal-pause') setPaused(false); }));
  $$('.modal').forEach((m) => m.addEventListener('pointerdown', (e) => {
    if (e.target === m && m.dataset.dismiss !== 'no') { hideModal(`#${m.id}`); if (m.id === 'modal-pause') setPaused(false); }
  }));
  $('#btn-recipes-lobby').addEventListener('click', () => openRecipes());
  $('#btn-howto').addEventListener('click', () => openModal('#modal-howto'));
  $$('[data-rtab]').forEach((b) => b.addEventListener('click', () => { audio.click(); renderRecipes(b.dataset.rtab); }));
  $('#btn-next-day').addEventListener('click', () => { audio.click(); hostNextDay(); });
  $('#btn-end-game').addEventListener('click', () => { audio.click(); if (S.mp?.isHost) S.mp.update('meta', { phase: 'ended' }); });
  $('#btn-back-lobby').addEventListener('click', () => { hideModal('#modal-final'); leaveToLobby(); });
  $('#btn-resume').addEventListener('click', () => { hideModal('#modal-pause'); setPaused(false); });
  $('#btn-pause-music').addEventListener('click', () => { audio.init(); audio.cycleGenre(); updateMusicButtons(); $('#btn-pause-music').innerHTML = $('#btn-music').innerHTML; saveProfile(); });
  $('#btn-quit').addEventListener('click', () => { hideModal('#modal-pause'); leaveToLobby(); });
  $('#btn-leave-game').addEventListener('click', () => { if (confirm('Keluar dari permainan ke lobi?')) leaveToLobby(); });
  renderRecipes('food');
}

function openRecipes() {
  renderRecipes(S.station === 'drinks' && S.inGame ? 'drinks' : 'food');
  openModal('#modal-recipes');
}

function renderRecipes(tab) {
  $$('[data-rtab]').forEach((b) => b.classList.toggle('active', b.dataset.rtab === tab));
  const box = $('#recipe-content');
  if (tab === 'food') {
    box.innerHTML = `<div class="recipe-grid">${C.FOOD_MENU.map((m) => `
      <div class="recipe-card">
        <div class="rc-head"><span class="rc-emoji">${m.emoji}</span><div><b>${esc(m.name)}</b><span class="price mono">${C.rm(m.price)}</span></div></div>
        <div class="chips">${Object.entries(m.recipe).map(([k, n]) => `<span class="chip">${n}× ${C.FOOD_INGREDIENTS[k].emoji} ${esc(C.FOOD_INGREDIENTS[k].name)}</span>`).join('')}</div>
        <small class="dim">🔥 ${esc(m.cook.verb)} — Angkat dalam zon hijau</small>
      </div>`).join('')}</div>`;
  } else if (tab === 'drinks') {
    const rows = C.DRINK_MENU.map((d) => {
      const variants = ['biasa', 'kurang', 'kosong'].map((sw) => {
        const r = C.drinkRecipe(d.id, sw, false);
        return `<td>${Object.entries(r).map(([k, n]) => `${n}× ${C.DRINK_INGREDIENTS[k].emoji}`).join(' ')}</td>`;
      }).join('');
      const kaw = d.kawable ? `<div class="chip chip-kaw">Kaw = ${C.drinkRecipe(d.id, 'biasa', true)[d.powder]}× ${C.DRINK_INGREDIENTS[d.powder].name}</div>` : '';
      return `<tr><th>${d.emoji} ${esc(d.name)}<br><span class="price mono">${C.rm(d.price)}</span>${d.note ? `<div class="warn">⚠ ${esc(d.note)}</div>` : ''}${kaw}</th>${variants}</tr>`;
    }).join('');
    box.innerHTML = `
      <div class="rule-box">🍬 <b>Biasa</b> = 2 susu/gula • <b>Kurang Manis</b> = 1 • <b>Kosong</b> = 0 • 💪 <b>Kaw</b> = 2× serbuk</div>
      <table class="drink-table"><thead><tr><th>Minuman</th><th>Biasa</th><th>Kurang Manis</th><th>Kosong</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="legend">${C.DRINK_INGREDIENT_ORDER.map((k) => `<span>${C.DRINK_INGREDIENTS[k].emoji} ${esc(C.DRINK_INGREDIENTS[k].name)}</span>`).join('')}</div>
      <p class="dim">Selepas sukatan betul, <b>tahan TARIK AIR!</b> (atau Spacebar) dan lepaskan bila paras dalam <b class="gold">zon emas</b>. Lepas di tengah zon = PERFECT ✨</p>`;
  } else if (tab === 'pay') {
    box.innerHTML = `
      <div class="pay-guide">
        <div><h4>💵 Tunai</h4><p>Taip jumlah bil → kira <b>baki</b> = wang diberi − bil. Klik not/syiling dari laci (RM50, RM20, RM10, RM5, RM1, 50/20/10 sen) → <b>Beri Baki</b>.</p></div>
        <div><h4>📱 DuitNow QR</h4><p>Semak jumlah pada skrin pelanggan. <b>20%</b> pelanggan tersalah jumlah! Tekan <b>✖ Jumlah Salah!</b> untuk minta imbas semula. Terima jumlah salah = rugi.</p></div>
        <div><h4>💳 Kad PayWave</h4><p>Taip jumlah bil, kemudian taip semula pada <b>terminal PayWave</b> → minta pelanggan <b>Tap Kad</b>. Bip! Lulus.</p></div>
      </div>
      <h4>Senarai Harga</h4>
      <div class="price-list">${[...C.FOOD_MENU, ...C.DRINK_MENU].map((m) => `<span>${m.emoji} ${esc(m.name)} <b class="mono">${C.rm(m.price)}</b></span>`).join('')}</div>`;
  } else {
    box.innerHTML = `
      <div class="pay-guide">
        <div><h4>⌨️ Papan Kekunci</h4><p><kbd>1</kbd> Juruwang • <kbd>2</kbd> Chef • <kbd>3</kbd> Pembancuh (mod Semua Stesen)<br><kbd>Numpad</kbd> keypad juruwang • <kbd>Enter</kbd> sahkan • <kbd>Backspace</kbd> padam<br><kbd>Space</kbd> Angkat! (chef) / tahan untuk TARIK AIR!<br><kbd>C</kbd> / <kbd>Delete</kbd> kosongkan keypad • <kbd>R</kbd> Buku Resipi • <kbd>T</kbd> Walkie-Talkie • <kbd>K</kbd> Kalkulator • <kbd>V</kbd> POV orang pertama • <kbd>Esc</kbd> jeda (solo)</p></div>
        <div><h4>⭐ Rating & Tip</h4><p>Layan pantas & PERFECT untuk tip lebih. Pelanggan yang lari menurunkan rating. <b>Food Vlogger VIP</b> memberi tip paling besar!</p></div>
        <div><h4>🌙 Kitaran Hari</h4><p>Setiap hari = 10 minit (07:00 AM → 12:00 AM). Waktu sarapan, tengah hari & malam lebih sibuk. Tengah malam → Laporan Jualan Harian.</p></div>
      </div>`;
  }
}

function setPaused(p) {
  if (S.mode !== 'solo') return;
  S.paused = p;
  if (p) { audio.setPour(false); audio.setSizzle(false); if (S.drinks?.pouring) releaseTarik(); }
  else if (S.chef?.cooking) audio.setSizzle(true, S.chef.heat);
}

function togglePause() {
  if (S.mode !== 'solo' || !S.inGame || S.meta.phase !== 'playing') return;
  if (S.paused) { hideModal('#modal-pause'); setPaused(false); }
  else { setPaused(true); $('#btn-pause-music').innerHTML = $('#btn-music').innerHTML; openModal('#modal-pause'); }
}

function stars(rep) {
  const full = Math.floor(rep), half = rep - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
}

function showReport() {
  audio.stopLoops();
  audio.midnightChime();
  if (S.chef?.cooking) { S.chef.cooking = false; }
  if (S.drinks?.pouring) releaseTarik();
  const r = S.meta.report || buildReport(S.stats, S.meta);
  const row = (label, val, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="mono">${val}</td></tr>`;
  $('#report-content').innerHTML = `
    <div class="report-head">
      <div class="moon">🌙</div>
      <div><h2>Laporan Jualan Harian</h2><div class="sub">${esc(r.restaurantName)} • <b>Hari ${r.day}</b> • 07:00 AM – 12:00 AM</div></div>
    </div>
    <div class="report-cols">
      <table class="report-table">
        ${row('💰 Jualan Kasar', C.rm(r.sales))}
        ${row('🎁 Tip Pelanggan', `+${C.rm(r.tips)}`, 'good')}
        ${row('↩️ Refund (pelanggan lari)', `-${C.rm(r.refunds)}`, 'bad')}
        ${row('🗑️ Bahan Terbuang', `-${C.rm(r.waste)}`, 'bad')}
        ${r.losses ? row('📱 Rugi QR (kurang bayar)', `-${C.rm(r.losses)} <small>(termasuk)</small>`, 'bad') : ''}
        ${row('<b>📈 Untung Bersih</b>', `<b>${C.rm(r.net)}</b>`, 'total')}
      </table>
      <table class="report-table">
        ${row('🍽️ Pelanggan Dilayan', r.served)}
        ${row('😠 Pelanggan Lari', r.lost)}
        ${row('🎯 Ketepatan Servis', `${r.accuracy}%`)}
        ${row('✨ Hidangan PERFECT', r.perfect)}
        ${row('❌ Kesilapan', r.mistakes)}
        ${row('🕵️ QR Salah Dikesan', r.catches)}
        ${row('💵/📱/💳 Bayaran', `${r.cash} / ${r.qr} / ${r.card}`)}
        ${row('🏆 Menu Terlaris', `${esc(r.best)} ${r.bestCount ? `(${r.bestCount})` : ''}`)}
      </table>
    </div>
    <div class="report-stars">${stars(r.rep)} <small>${r.rep.toFixed(1)} / 5</small></div>`;
  const host = S.mp?.isHost;
  show('#btn-next-day', host);
  show('#btn-end-game', host);
  show('#report-wait', !host);
  $('#btn-next-day').innerHTML = `🌅 Buka Kedai: Hari Seterusnya (Day +1)<small>→ Hari ${r.day + 1}</small>`;
  show('#modal-report', true);
}

function showFinal() {
  hideModal('#modal-report');
  audio.stopLoops();
  const t = S.meta.totals || {};
  $('#final-content').innerHTML = `
    <h2>🏁 Tamat Permainan</h2>
    <div class="sub">${esc(S.meta.restaurantName)}</div>
    <div class="final-grid">
      <div><span>📅 Hari Berniaga</span><b>${t.days || S.meta.day || 1}</b></div>
      <div><span>📈 Jumlah Untung Bersih</span><b class="mono">${C.rm(t.net || 0)}</b></div>
      <div><span>💰 Jumlah Jualan</span><b class="mono">${C.rm(t.sales || 0)}</b></div>
      <div><span>🎁 Jumlah Tip</span><b class="mono">${C.rm(t.tips || 0)}</b></div>
      <div><span>🍽️ Pelanggan Dilayan</span><b>${t.served || 0}</b></div>
      <div><span>🏆 Hari Terbaik</span><b class="mono">${C.rm(t.bestDay || 0)}</b></div>
    </div>
    <div class="report-stars">${stars(S.meta.rep ?? 3)}</div>
    <p class="dim">Terima kasih kerana berniaga bersama Warung Kita! 🇲🇾</p>`;
  show('#modal-final', true);
}

// =====================================================================
//  KEYBOARD
// =====================================================================
function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === 'Escape') {
      const open = $$('.modal').find((m) => !m.hidden && m.dataset.dismiss !== 'no');
      if (open) { hideModal(`#${open.id}`); if (open.id === 'modal-pause') setPaused(false); return; }
      togglePause();
      return;
    }
    if (!S.inGame || S.meta.phase !== 'playing') return;
    if (e.key === 'r' || e.key === 'R') { $('#modal-recipes').hidden ? openRecipes() : hideModal('#modal-recipes'); return; }
    if (e.key === 't' || e.key === 'T') { toggleChat(); return; }
    if (e.key === 'k' || e.key === 'K') { toggleCalc(); return; }
    if (e.key === 'v' || e.key === 'V') { toggleFirstPerson(); return; }
    if (S.paused) return;
    if (/^Digit[123]$/.test(e.code) && canSwitchStations()) {
      setStation(C.ROLE_ORDER[Number(e.code.slice(-1)) - 1]);
      return;
    }
    if (S.station === 'cashier') {
      const m = e.code.match(/^(?:Numpad|Digit)(\d)$/);
      if (m && (e.code.startsWith('Numpad') || !canSwitchStations())) { keypadPress(m[1]); e.preventDefault(); return; }
      if (e.key === 'Backspace') { keypadPress('⌫'); e.preventDefault(); return; }
      if (e.key === 'Enter' || e.code === 'NumpadEnter') { keypadPress('OK'); e.preventDefault(); return; }
      if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') { keypadPress('C'); return; }
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (S.station === 'drinks') pressTarik();
      else if (S.station === 'chef') { if (S.chef.cooking) liftDish(); else startCooking(); }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && S.inGame && S.station === 'drinks') { e.preventDefault(); releaseTarik(); }
  });
  window.addEventListener('blur', () => { if (S.drinks?.pouring) releaseTarik(); });
}

// =====================================================================
//  MAIN LOOP
// =====================================================================
function loop(now) {
  // simulation uses (lightly clamped) real time so a day lasts 10 real minutes even
  // on slow devices; animation uses a tighter clamp to avoid visual jumps
  const realDt = Math.min(0.25, Math.max(0, (now - S.last) / 1000));
  const dt = Math.min(0.05, realDt);
  S.last = now;
  try {
    if (S.inGame) {
      if (S.mp && S.mp.isHost) hostTick(realDt);
      else if (S.meta.phase === 'playing') S.clock = Math.min(S.clock + realDt, (S.meta.clock || 0) + 2);
      updateChef(realDt);
      updateDrinks(realDt);
      S.todTimer -= realDt;
      if (S.todTimer <= 0) {
        S.todTimer = 0.2;
        S.scene.setTimeOfDay(C.clockToHour(S.clock));
        updateClockHUD();
      }
      S.uiTimer -= realDt;
      if (S.uiTimer <= 0) {
        S.uiTimer = 0.33;
        renderTickets();
        syncScene();
        if (S.station === 'cashier') {
          const o = S.cashier && S.cashier.orderId && S.orders[S.cashier.orderId];
          const bar = $('#cash-customer .pbar i');
          if (o && bar) { const f = patienceFrac(o); bar.style.width = `${(f * 100).toFixed(0)}%`; bar.style.background = f > 0.5 ? '#3fbf6b' : f > 0.25 ? '#f2b705' : '#e5484d'; }
        }
      }
    } else {
      // lobby: gently cycle the day to show off the lighting
      S.todTimer -= dt;
      if (S.todTimer <= 0) {
        S.todTimer = 0.1;
        const t = (now / 1000) % 80;
        S.scene.setTimeOfDay(7 + (t / 80) * 17);
      }
    }
    S.scene.update(dt);
    S.scene.render();
    updateBubbles();
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(loop);
}

// expose a tiny debug hook (useful for automated checks)
window.__warungKita = { S, C, audio };

boot();
