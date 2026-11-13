// =====================================================================
//  WARUNG KITA 3D: KOPITIAM RUSH — Game configuration & data tables
// =====================================================================

export const GAME_TITLE = 'WARUNG KITA 3D: KOPITIAM RUSH';
export const VERSION = '1.0.0';

// ---------------------------------------------------------------------
//  Firebase (Realtime Database) — replace the placeholders to enable
//  online multiplayer. While these contain "YOUR_" the game falls back
//  to the local Demo Mode (same-browser tabs via BroadcastChannel).
// ---------------------------------------------------------------------
export const FIREBASE_CONFIG = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
export const FIREBASE_SDK_VERSION = '10.12.2';

export function isFirebaseConfigured() {
  const c = FIREBASE_CONFIG;
  if (!c || !c.apiKey || !c.databaseURL) return false;
  return !/YOUR_/i.test(JSON.stringify(c));
}

// ---------------------------------------------------------------------
//  Day / night cycle
// ---------------------------------------------------------------------
export const DAY_LENGTH_SEC = 600;       // 10 real minutes per in-game day
export const DAY_START_HOUR = 7;         // 07:00 AM
export const DAY_END_HOUR = 24;          // 12:00 AM (midnight)
export const LAST_ORDER_HOUR = 23.25;    // stop spawning new customers ("last order")

export function clockToHour(sec) {
  const f = Math.min(1, Math.max(0, sec / DAY_LENGTH_SEC));
  return DAY_START_HOUR + f * (DAY_END_HOUR - DAY_START_HOUR);
}

export function formatClock(sec) {
  const hour = clockToHour(sec);
  let h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function rm(cents) {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}RM ${(v / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------
//  Roles / workstations
// ---------------------------------------------------------------------
export const ROLES = {
  cashier: { id: 'cashier', label: 'Juruwang', icon: '💵', key: '1', desc: 'Kira bil & terima bayaran' },
  chef:    { id: 'chef',    label: 'Chef',     icon: '🍳', key: '2', desc: 'Susun bahan & masak' },
  drinks:  { id: 'drinks',  label: 'Pembancuh Air', icon: '🧋', key: '3', desc: 'Sukat & tarik minuman' },
};
export const ROLE_ORDER = ['cashier', 'chef', 'drinks'];

export const BOT_NAMES = {
  cashier: { name: 'Bot Kak Yah', gender: 'female', pattern: 'cengkih', skin: 1 },
  chef:    { name: 'Bot Abang Mamat', gender: 'male', pattern: 'pucuk_rebung', skin: 2 },
  drinks:  { name: 'Bot Ah Chong', gender: 'male', pattern: 'awan_larat', skin: 0 },
};

// ---------------------------------------------------------------------
//  Food ingredients (Chef station) — used for 3D stacking meshes
// ---------------------------------------------------------------------
export const FOOD_INGREDIENTS = {
  nasi:         { name: 'Nasi Lemak',   emoji: '🍚', color: 0xfbf7ec, shape: 'dome',     h: 0.075 },
  sambal:       { name: 'Sambal',       emoji: '🌶️', color: 0xc0261b, shape: 'blob',     h: 0.03 },
  telur:        { name: 'Telur',        emoji: '🥚', color: 0xfff6dc, shape: 'egg',      h: 0.035 },
  kacang_bilis: { name: 'Kacang Bilis', emoji: '🥜', color: 0xc99a5b, shape: 'pile',     h: 0.03 },
  ayam:         { name: 'Ayam Berempah',emoji: '🍗', color: 0x8a4316, shape: 'drumstick',h: 0.06 },
  timun:        { name: 'Timun',        emoji: '🥒', color: 0x7cb342, shape: 'slices',   h: 0.018 },
  doh:          { name: 'Doh Roti',     emoji: '🫓', color: 0xe9c27c, shape: 'flat',     h: 0.022 },
  dal:          { name: 'Kuah Dal',     emoji: '🟡', color: 0xf2b705, shape: 'bowl',     h: 0.04 },
  kari:         { name: 'Kuah Kari',    emoji: '🟠', color: 0xd2541a, shape: 'bowl',     h: 0.04 },
  cucuk:        { name: 'Cucuk Satay',  emoji: '🍢', color: 0x9b4f22, shape: 'skewer',   h: 0.022 },
  kuah_kacang:  { name: 'Kuah Kacang',  emoji: '🥣', color: 0xb5651d, shape: 'bowl',     h: 0.04 },
  ketupat:      { name: 'Ketupat',      emoji: '🟩', color: 0xa5c96a, shape: 'cube',     h: 0.05 },
  mee:          { name: 'Mee Kuning',   emoji: '🍜', color: 0xf0b82a, shape: 'noodles',  h: 0.05 },
  sayur:        { name: 'Sayur Sawi',   emoji: '🥬', color: 0x3f9a3a, shape: 'leaf',     h: 0.016 },
  tahu:         { name: 'Tahu Goreng',  emoji: '🧈', color: 0xe8c58a, shape: 'cube',     h: 0.035 },
};
export const FOOD_INGREDIENT_ORDER = [
  'nasi', 'sambal', 'telur', 'kacang_bilis', 'ayam',
  'timun', 'doh', 'dal', 'kari', 'cucuk',
  'kuah_kacang', 'ketupat', 'mee', 'sayur', 'tahu',
];

// ---------------------------------------------------------------------
//  Food menu — exact recipes (prices in sen)
//  cook.time = seconds for the heat needle to sweep 0 → 100%
//  cook.zone = [start, end] of the green PERFECT zone (fraction)
// ---------------------------------------------------------------------
export const FOOD_MENU = [
  { id: 'nl_biasa', name: 'Nasi Lemak Biasa', short: 'NL Biasa', price: 450, emoji: '🍛',
    recipe: { nasi: 1, sambal: 1, telur: 1, kacang_bilis: 1 },
    cook: { verb: 'Panaskan', time: 3.4, zone: [0.52, 0.68] } },
  { id: 'nl_ayam', name: 'Nasi Lemak Ayam Berempah', short: 'NL Ayam', price: 950, emoji: '🍗',
    recipe: { nasi: 1, sambal: 1, ayam: 1, timun: 1 },
    cook: { verb: 'Goreng Ayam', time: 3.0, zone: [0.62, 0.75] } },
  { id: 'roti_kosong', name: 'Roti Canai Kosong', short: 'Roti Kosong', price: 200, emoji: '🫓',
    recipe: { doh: 1, dal: 1, kari: 1 },
    cook: { verb: 'Tebar & Lipat', time: 2.8, zone: [0.45, 0.6] } },
  { id: 'roti_banjir', name: 'Roti Canai Banjir', short: 'Roti Banjir', price: 400, emoji: '🌊',
    recipe: { doh: 2, dal: 2, kari: 2, sambal: 1 },
    cook: { verb: 'Tebar & Banjirkan', time: 3.2, zone: [0.55, 0.68] } },
  { id: 'satay', name: 'Satay Ayam Set', short: 'Satay Set', price: 650, emoji: '🍢',
    recipe: { cucuk: 5, kuah_kacang: 1, ketupat: 1 },
    cook: { verb: 'Bakar Satay', time: 3.6, zone: [0.66, 0.78] } },
  { id: 'mee_mamak', name: 'Mee Goreng Mamak', short: 'Mee Mamak', price: 750, emoji: '🍜',
    recipe: { mee: 1, telur: 1, sayur: 1, tahu: 1 },
    cook: { verb: 'Goreng Kuali', time: 2.6, zone: [0.58, 0.7] } },
];

// ---------------------------------------------------------------------
//  Drinks
//  Sweetness: Biasa = 2 susu/gula, Kurang Manis = 1, Kosong = 0
//  Kaw = 2x powder (Teh Tarik only — Kopi O Kaw & Milo Dinosaur are
//  already double powder by definition)
// ---------------------------------------------------------------------
export const DRINK_INGREDIENTS = {
  teh:    { name: 'Serbuk Teh',  emoji: '🍂', color: 0x7a3e12 },
  kopi:   { name: 'Serbuk Kopi', emoji: '☕', color: 0x2a170c },
  milo:   { name: 'Serbuk Milo', emoji: '🍫', color: 0x5b3a22 },
  sirap:  { name: 'Sirap Ros',   emoji: '🌹', color: 0xe0245e },
  susu:   { name: 'Susu Pekat',  emoji: '🥛', color: 0xfff3d6 },
  gula:   { name: 'Gula',        emoji: '🧂', color: 0xffffff },
  cincau: { name: 'Cincau',      emoji: '⬛', color: 0x1d1d1d },
  ais:    { name: 'Ais',         emoji: '🧊', color: 0xd7f3ff },
};
export const DRINK_INGREDIENT_ORDER = ['teh', 'kopi', 'milo', 'sirap', 'susu', 'gula', 'cincau', 'ais'];

export const SWEETNESS = {
  biasa:  { id: 'biasa',  label: 'Biasa',        units: 2 },
  kurang: { id: 'kurang', label: 'Kurang Manis', units: 1 },
  kosong: { id: 'kosong', label: 'Kosong',       units: 0 },
};

export const DRINK_MENU = [
  { id: 'teh_tarik', name: 'Teh Tarik', short: 'Teh Tarik', price: 250, emoji: '🧋',
    powder: 'teh', powderBase: 1, sweetener: 'susu', extras: {}, kawable: true,
    liquid: 0xc58f5a, froth: true, pour: { speed: 0.34, zone: [0.7, 0.86] } },
  { id: 'kopi_o_kaw', name: 'Kopi O Kaw', short: 'Kopi O Kaw', price: 220, emoji: '☕',
    powder: 'kopi', powderBase: 2, sweetener: 'gula', extras: {}, kawable: false,
    liquid: 0x2b170b, froth: false, note: 'TANPA Susu Pekat!', pour: { speed: 0.38, zone: [0.72, 0.86] } },
  { id: 'sirap_bandung', name: 'Sirap Bandung Cincau', short: 'Bandung Cincau', price: 350, emoji: '🌸',
    powder: 'sirap', powderBase: 1, sweetener: 'susu', extras: { cincau: 1 }, kawable: false,
    liquid: 0xf49ac1, froth: false, pour: { speed: 0.36, zone: [0.68, 0.84] } },
  { id: 'milo_dino', name: 'Milo Ais Dinosaur', short: 'Milo Dino', price: 450, emoji: '🦖',
    powder: 'milo', powderBase: 2, sweetener: 'susu', extras: { ais: 1 }, kawable: false,
    liquid: 0x6b4430, froth: false, pour: { speed: 0.4, zone: [0.66, 0.8] } },
];

export const FOOD_BY_ID = Object.fromEntries(FOOD_MENU.map((m) => [m.id, m]));
export const DRINK_BY_ID = Object.fromEntries(DRINK_MENU.map((m) => [m.id, m]));

/** Exact ingredient counts required for a drink order line. */
export function drinkRecipe(drinkId, sweet = 'biasa', kaw = false) {
  const d = DRINK_BY_ID[drinkId];
  if (!d) return {};
  const r = {};
  r[d.powder] = d.powderBase * (kaw && d.kawable ? 2 : 1);
  const units = (SWEETNESS[sweet] || SWEETNESS.biasa).units;
  if (units > 0) r[d.sweetener] = units;
  for (const [k, v] of Object.entries(d.extras)) r[k] = v;
  return r;
}

export function foodRecipe(foodId) {
  return { ...(FOOD_BY_ID[foodId]?.recipe || {}) };
}

export function recipeMatches(required, actual) {
  const keys = new Set([...Object.keys(required), ...Object.keys(actual)]);
  for (const k of keys) {
    if ((required[k] || 0) !== (actual[k] || 0)) return false;
  }
  return true;
}

export function itemLabel(item) {
  if (item.kind === 'food') return FOOD_BY_ID[item.id]?.name || item.id;
  const d = DRINK_BY_ID[item.id];
  if (!d) return item.id;
  const parts = [d.name];
  if (item.kaw && d.kawable) parts.push('Kaw');
  if (item.sweet && item.sweet !== 'biasa') parts.push(SWEETNESS[item.sweet].label);
  return parts.join(' ');
}

export function itemPrice(item) {
  return item.kind === 'food' ? FOOD_BY_ID[item.id]?.price || 0 : DRINK_BY_ID[item.id]?.price || 0;
}

export function itemEmoji(item) {
  return item.kind === 'food' ? FOOD_BY_ID[item.id]?.emoji || '🍽️' : DRINK_BY_ID[item.id]?.emoji || '🥤';
}

// ---------------------------------------------------------------------
//  Customer archetypes
// ---------------------------------------------------------------------
export const ARCHETYPES = {
  pesara: {
    id: 'pesara', label: 'Pesara', emoji: '👴', color: '#8d6e63',
    patience: 80, waitPatience: 120, items: [1, 2], tipMult: 1.0,
    pay: { cash: 0.7, qr: 0.12, card: 0.18 },
    favorites: ['teh_tarik', 'kopi_o_kaw', 'nl_biasa', 'roti_kosong', 'roti_banjir'],
    sweetBias: { biasa: 0.3, kurang: 0.55, kosong: 0.15 },
    accessory: 'spectacles',
    greet: ['Assalamualaikum, pakcik nak order ya…', 'Macam biasa, dik.', 'Pagi-pagi kena ada kopi ni.'],
    happy: ['Sedap macam dulu-dulu!', 'Terima kasih nak, berkat!', 'Bagus servis kedai ni.'],
    angry: ['Lambat sungguh…', 'Zaman pakcik dulu tak macam ni!'],
  },
  pelajar: {
    id: 'pelajar', label: 'Pelajar Universiti', emoji: '🎓', color: '#5c6bc0',
    patience: 60, waitPatience: 95, items: [1, 2], tipMult: 0.4,
    pay: { cash: 0.3, qr: 0.6, card: 0.1 },
    favorites: ['roti_kosong', 'milo_dino', 'sirap_bandung', 'nl_biasa', 'mee_mamak'],
    sweetBias: { biasa: 0.7, kurang: 0.2, kosong: 0.1 },
    accessory: 'backpack',
    greet: ['Bang, budget student ya!', 'Esok ada exam, nak tenaga!', 'Kak, satu ni please.'],
    happy: ['Padu! Lepas ni study group sini.', 'Murah & sedap, 10/10!'],
    angry: ['Aduh, lambat la, kelas dah nak start!', 'Takpe la, makan maggi je.'],
  },
  rider: {
    id: 'rider', label: 'Rider / Pekerja Bergegas', emoji: '🛵', color: '#ef6c00',
    patience: 42, waitPatience: 70, items: [1, 3], tipMult: 0.8,
    pay: { cash: 0.2, qr: 0.5, card: 0.3 },
    favorites: ['nl_ayam', 'mee_mamak', 'kopi_o_kaw', 'teh_tarik', 'satay'],
    sweetBias: { biasa: 0.5, kurang: 0.35, kosong: 0.15 },
    accessory: 'helmet',
    greet: ['Cepat sikit boss, order banyak ni!', 'Bungkus ya, nak kejar masa!', 'Rush hour ni bro!'],
    happy: ['Laju! Rating 5 bintang!', 'Mantap, terus gerak!'],
    angry: ['Rating 1 bintang!', 'Customer aku dah marah, lambat!'],
  },
  vlogger: {
    id: 'vlogger', label: 'Food Vlogger VIP', emoji: '📸', color: '#d81b60',
    patience: 66, waitPatience: 105, items: [3, 5], tipMult: 2.5,
    pay: { cash: 0.1, qr: 0.4, card: 0.5 },
    favorites: ['nl_ayam', 'roti_banjir', 'satay', 'milo_dino', 'sirap_bandung', 'teh_tarik'],
    sweetBias: { biasa: 0.6, kurang: 0.3, kosong: 0.1 },
    accessory: 'phone',
    greet: ['Hai gais! Hari ni kita review warung viral!', 'Jangan lupa like & subscribe!', 'Okay kamera on, saya nak semua menu best!'],
    happy: ['Wajib datang gais! 🔥', 'Rasa dia… MasyaAllah padu!'],
    angry: ['Hmm, servis lambat, saya kena bagi review jujur…', 'Content gagal hari ni…'],
  },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);
// Base probability weights for archetypes (adjusted by time of day in game)
export const ARCHETYPE_WEIGHTS = { pesara: 0.3, pelajar: 0.3, rider: 0.28, vlogger: 0.12 };

export const CUSTOMER_NAMES = {
  male: ['Pak Ali', 'Uncle Lim', 'Raju', 'Abang Zul', 'Ah Kow', 'Faiz', 'Hafiz', 'Muthu', 'Dr. Kamal', 'Amir', 'Tok Leh', 'Daniel', 'Arif', 'Kumar'],
  female: ['Mak Som', 'Kak Ton', 'Siti', 'Mei Ling', 'Aisyah', 'Priya', 'Nurul', 'Auntie Wong', 'Farah', 'Liyana', 'Mak Jah', 'Hana', 'Sofea', 'Kavitha'],
};

// ---------------------------------------------------------------------
//  Payments — Malaysian Ringgit (sen values)
// ---------------------------------------------------------------------
export const CASH_DENOMS = [
  { v: 5000, label: 'RM50', type: 'note', color: '#1f8f8a', ink: '#0b4a47' },
  { v: 2000, label: 'RM20', type: 'note', color: '#f08a24', ink: '#7a3d00' },
  { v: 1000, label: 'RM10', type: 'note', color: '#d7263d', ink: '#6d0f1c' },
  { v: 500,  label: 'RM5',  type: 'note', color: '#3fa34d', ink: '#1a4d22' },
  { v: 100,  label: 'RM1',  type: 'note', color: '#3a6ea5', ink: '#163556' },
  { v: 50,   label: '50 sen', type: 'coin', color: '#d4af37', ink: '#6b5310' },
  { v: 20,   label: '20 sen', type: 'coin', color: '#e2c35c', ink: '#6b5310' },
  { v: 10,   label: '10 sen', type: 'coin', color: '#c9ced6', ink: '#4a4f57' },
];
export const PAYMENT_METHODS = {
  cash: { id: 'cash', label: 'Tunai', icon: '💵' },
  qr:   { id: 'qr',   label: 'DuitNow QR', icon: '📱' },
  card: { id: 'card', label: 'Kad PayWave', icon: '💳' },
};
export const QR_WRONG_CHANCE = 0.2;
export const DUITNOW_PINK = '#ED2E67';

// ---------------------------------------------------------------------
//  Difficulty scaling for endless days
// ---------------------------------------------------------------------
export function difficultyForDay(day) {
  const d = Math.max(1, day | 0);
  return {
    spawnInterval: Math.max(7.5, 17 - (d - 1) * 1.3),      // seconds between customers
    patienceMult: Math.max(0.6, 1 - (d - 1) * 0.06),
    bigOrderChance: Math.min(0.45, 0.12 + (d - 1) * 0.05),
    maxQueue: Math.min(7, 4 + Math.floor((d - 1) / 2)),
  };
}

export function rushMultiplier(hour) {
  if (hour >= 7.5 && hour < 9.2) return 0.7;   // sarapan
  if (hour >= 12 && hour < 14) return 0.6;     // makan tengah hari
  if (hour >= 19 && hour < 21) return 0.65;    // makan malam
  if (hour >= 22.5) return 1.35;               // lewat malam
  return 1;
}

export function rushLabel(hour) {
  if (hour >= 7.5 && hour < 9.2) return 'Waktu Sarapan';
  if (hour >= 12 && hour < 14) return 'Waktu Tengah Hari';
  if (hour >= 19 && hour < 21) return 'Waktu Makan Malam';
  return '';
}

// ---------------------------------------------------------------------
//  Restaurant name generator
// ---------------------------------------------------------------------
const NAME_PREFIX = ['Warung', 'Kedai Kopi', 'Restoran', 'Kopitiam', 'Gerai', 'Kafe', 'Medan Selera'];
const NAME_CORE = ['Pak Mat', 'Mak Jah', 'Kak Ros', 'Abang Long', 'Cik Siti', 'Ah Seng', 'Mamak Ali', 'Tok Wan', 'Pak Abu', 'Uncle Wong', 'Che Nah', 'Haji Din'];
const NAME_SUFFIX = ['', '', 'Corner', 'Bistro', 'Sentosa', 'Maju', 'Jaya', 'Selera Kampung', 'Bawah Pokok', 'Tepi Jalan', 'Sri Mesra', 'Rasa Sayang', 'Dan Anak-Anak'];

export function randomRestaurantName() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return [pick(NAME_PREFIX), pick(NAME_CORE), pick(NAME_SUFFIX)].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------
//  Quick chat (walkie-talkie)
// ---------------------------------------------------------------------
export const QUICK_CHAT = [
  '📢 Order masuk!',
  '✅ Siap! Ambil!',
  '⏱️ Cepat sikit!',
  '🙏 Terima kasih boss!',
  '🔥 Mantap!',
  '😵 Tolong saya!',
  '🧋 Air dah siap!',
  '🍳 Makanan on the way!',
];

// ---------------------------------------------------------------------
//  Skin tones for the 3D Batik character generator
// ---------------------------------------------------------------------
export const SKIN_TONES = ['#f3cfa8', '#dca779', '#b97a4f', '#8a5634'];
export const HIJAB_COLORS = ['#d98a9a', '#86a982', '#dcc39a', '#a48bc8', '#6d9fc6', '#d6a23a'];

// ---------------------------------------------------------------------
//  Batik motifs — drawn procedurally on <canvas> (used for 3D textures
//  and UI swatches). Each draw(ctx, s) paints one seamless tile.
// ---------------------------------------------------------------------
function petal(ctx, cx, cy, r, ang, w) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(r * w, -r * 0.35, r * w, -r * 0.95, 0, -r);
  ctx.bezierCurveTo(-r * w, -r * 0.95, -r * w, -r * 0.35, 0, 0);
  ctx.fill();
  ctx.restore();
}

function canting(ctx, s) {
  // fine "canting" wax-line dots typical of hand-drawn batik
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 70; i++) {
    const x = ((i * 37) % 97) / 97 * s;
    const y = ((i * 61) % 89) / 89 * s;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.006, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const BATIK_PATTERNS = {
  bunga_raya: {
    id: 'bunga_raya', label: 'Bunga Raya', colors: ['#14306b', '#d62839', '#f6c445', '#2f8f6b'],
    draw(ctx, s) {
      const [bg, red, gold, leaf] = this.colors;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1d3f86'; canting(ctx, s);
      const flowers = [[0.25, 0.25, 0.2], [0.75, 0.75, 0.2], [0.75, 0.2, 0.11], [0.2, 0.78, 0.11], [0, 0, 0.12], [1, 0, 0.12], [0, 1, 0.12], [1, 1, 0.12], [0.5, 0.5, 0.08]];
      for (const [fx, fy, fr] of flowers) {
        const cx = fx * s, cy = fy * s, r = fr * s;
        ctx.fillStyle = leaf;
        petal(ctx, cx, cy, r * 1.25, 0.8, 0.35);
        petal(ctx, cx, cy, r * 1.25, -2.3, 0.35);
        ctx.fillStyle = red;
        for (let i = 0; i < 5; i++) petal(ctx, cx, cy, r, (i / 5) * Math.PI * 2, 0.62);
        ctx.strokeStyle = gold; ctx.lineWidth = s * 0.008;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.6, cy - r * 0.75); ctx.stroke();
        ctx.fillStyle = gold;
        ctx.beginPath(); ctx.arc(cx + r * 0.62, cy - r * 0.78, s * 0.014, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  pucuk_rebung: {
    id: 'pucuk_rebung', label: 'Pucuk Rebung', colors: ['#6b1022', '#e2b23a', '#f7e7b4', '#3b0a14'],
    draw(ctx, s) {
      const [bg, gold, cream, dark] = this.colors;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
      const rows = 4, cols = 4, w = s / cols, h = s / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * w, y = r * h;
          ctx.fillStyle = gold;
          ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.05); ctx.lineTo(x + w * 0.95, y + h * 0.95); ctx.lineTo(x + w * 0.05, y + h * 0.95); ctx.closePath(); ctx.fill();
          ctx.fillStyle = dark;
          ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.3); ctx.lineTo(x + w * 0.78, y + h * 0.9); ctx.lineTo(x + w * 0.22, y + h * 0.9); ctx.closePath(); ctx.fill();
          ctx.fillStyle = cream;
          ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.5); ctx.lineTo(x + w * 0.62, y + h * 0.85); ctx.lineTo(x + w * 0.38, y + h * 0.85); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y + h * 0.5, w * 0.08, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = gold; ctx.lineWidth = s * 0.01;
      for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * h); ctx.lineTo(s, r * h); ctx.stroke(); }
    },
  },
  awan_larat: {
    id: 'awan_larat', label: 'Awan Larat', colors: ['#0f5e5c', '#7fd1b9', '#f4f1de', '#e07a5f'],
    draw(ctx, s) {
      const [bg, mint, cream, coral] = this.colors;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
      ctx.lineCap = 'round';
      const spiral = (cx, cy, r, dir, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = s * 0.022;
        ctx.beginPath();
        for (let t = 0; t < Math.PI * 3.2; t += 0.12) {
          const rr = r * (1 - t / (Math.PI * 3.6));
          const px = cx + Math.cos(t * dir) * rr, py = cy + Math.sin(t * dir) * rr;
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      for (let i = -1; i <= 2; i++) {
        const y = i * s * 0.5 + s * 0.25;
        ctx.strokeStyle = mint; ctx.lineWidth = s * 0.03;
        ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.25, y - s * 0.22, s * 0.5, y + s * 0.22, s, y); ctx.stroke();
        spiral(s * 0.3, y - s * 0.08, s * 0.12, 1, cream);
        spiral(s * 0.75, y + s * 0.1, s * 0.1, -1, cream);
      }
      ctx.fillStyle = coral;
      for (const [x, y] of [[0.12, 0.1], [0.55, 0.38], [0.9, 0.62], [0.35, 0.86]]) {
        for (let k = 0; k < 4; k++) petal(ctx, x * s, y * s, s * 0.05, k * Math.PI / 2, 0.6);
      }
    },
  },
  cengkih: {
    id: 'cengkih', label: 'Bunga Cengkih', colors: ['#4a2763', '#f28ab2', '#ffd6e8', '#c9a227'],
    draw(ctx, s) {
      const [bg, pink, light, gold] = this.colors;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
      const n = 4, step = s / n;
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
          const cx = i * step, cy = j * step;
          const odd = (i + j) % 2 === 0;
          ctx.fillStyle = odd ? pink : gold;
          for (let k = 0; k < 4; k++) petal(ctx, cx, cy, step * 0.42, k * Math.PI / 2 + Math.PI / 4, 0.55);
          ctx.fillStyle = light;
          ctx.beginPath(); ctx.arc(cx, cy, step * 0.08, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = light;
          ctx.beginPath(); ctx.arc(cx + step / 2, cy + step / 2, step * 0.045, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(255,214,232,0.35)'; ctx.lineWidth = s * 0.006;
      for (let i = 0; i < n * 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * step / 2, 0); ctx.lineTo(0, i * step / 2); ctx.stroke();
      }
    },
  },
};
export const BATIK_IDS = Object.keys(BATIK_PATTERNS);

/** Paint a batik tile to a new canvas (cached) */
const batikCache = new Map();
export function batikCanvas(patternId, size = 256) {
  const key = `${patternId}:${size}`;
  if (batikCache.has(key)) return batikCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  (BATIK_PATTERNS[patternId] || BATIK_PATTERNS.bunga_raya).draw(ctx, size);
  batikCache.set(key, c);
  return c;
}

export function batikDataURL(patternId, size = 96) {
  return batikCanvas(patternId, size).toDataURL('image/png');
}

/** Decorative inline-SVG batik border used in UI chrome */
export function batikBorderSVG(color = '#e2b23a', bg = 'transparent') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='16' viewBox='0 0 40 16'>
<rect width='40' height='16' fill='${bg}'/>
<path d='M0 8 L10 1 L20 8 L30 1 L40 8 M0 8 L10 15 L20 8 L30 15 L40 8' fill='none' stroke='${color}' stroke-width='1.6'/>
<circle cx='10' cy='8' r='2' fill='${color}'/><circle cx='30' cy='8' r='2' fill='${color}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const STORAGE_KEY = 'warungkita3d.profile.v1';
