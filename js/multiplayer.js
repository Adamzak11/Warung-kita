// =====================================================================
//  WARUNG KITA 3D — Multiplayer
//   • FirebaseAdapter : Firebase v10 Realtime Database (modular SDK,
//                       loaded lazily from gstatic only when configured)
//   • LocalAdapter    : in-memory store, optionally mirrored across
//                       browser tabs with BroadcastChannel (Demo Mode)
//   Both expose the same tiny path-based API so the game code doesn't
//   care which backend is active.
//
//   Room layout  rooms/{code}/
//     meta     {restaurantName, hostId, phase, day, clock, rushUntil, ...}
//     players  {pid: {name, role, character, joinedAt, online}}
//     orders   {oid: {...}}
//     stats    {sales, tips, served, lost, ...}
//     chat     {pushId: {pid, name, role, text, t}}
//     gallery  [dataURL, ...]           (custom customer sprites)
// =====================================================================
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION, isFirebaseConfigured } from './config.js';

const split = (p) => String(p || '').split('/').filter(Boolean);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function getAt(root, parts) {
  let cur = root;
  for (const k of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function setAt(root, parts, value) {
  if (!parts.length) return;
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') {
      if (value === null || value === undefined) return;
      cur[k] = {};
    }
    cur = cur[k];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) {
    if (Array.isArray(cur)) cur[last] = null; else delete cur[last];
  } else {
    cur[last] = value;
  }
}

function overlaps(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

// automatic cleanup (no server needed — the players' browsers do it)
export const ROOM_STALE_MS = 30 * 60 * 1000;   // a room silent for 30 min is abandoned
const HEARTBEAT_MS = 2 * 60 * 1000;            // every client marks its room alive every 2 min
const CHAT_KEEP = 40;                          // the host keeps only the latest chat messages
const SWEEP_BATCH = 20;

let pushCounter = 0;
export function makeId(prefix = '') {
  pushCounter = (pushCounter + 1) % 1296;
  return prefix + Date.now().toString(36) + pushCounter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------
//  Local adapter (solo + demo multiplayer across tabs)
// ---------------------------------------------------------------------
class LocalAdapter {
  constructor(room, { broadcast = false } = {}) {
    this.kind = 'local';
    this.room = room;
    this.root = {};
    this.subs = new Set();
    this.clientId = makeId('c');
    this.disconnectOps = [];
    this.channel = null;
    if (broadcast && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`warungkita3d-room-${room}`);
      this.channel.onmessage = (ev) => this._onMessage(ev.data);
    }
    this._pagehide = () => this._runDisconnect();
    window.addEventListener('pagehide', this._pagehide);
  }

  async connect() {
    if (!this.channel) return false;
    // ask other tabs for a snapshot of the room
    return new Promise((resolve) => {
      let done = false;
      this._snapshotResolve = (ok) => { if (!done) { done = true; resolve(ok); } };
      this.channel.postMessage({ type: 'hello', from: this.clientId });
      setTimeout(() => this._snapshotResolve(false), 450);
    });
  }

  _onMessage(msg) {
    if (!msg || msg.from === this.clientId) return;
    if (msg.type === 'hello') {
      if (this.root && this.root.meta) this.channel.postMessage({ type: 'snapshot', from: this.clientId, to: msg.from, root: this.root });
    } else if (msg.type === 'snapshot' && msg.to === this.clientId) {
      if (!this.root.meta) {
        this.root = msg.root || {};
        this._notify([]);
      }
      this._snapshotResolve && this._snapshotResolve(!!(msg.root && msg.root.meta));
    } else if (msg.type === 'op') {
      this._apply(msg.op, false);
    }
  }

  _apply(op, broadcast = true) {
    const parts = split(op.path);
    const changed = [];
    if (op.k === 'set') {
      if (!parts.length) this.root = clone(op.v) || {};
      else setAt(this.root, parts, clone(op.v));
      changed.push(parts);
    } else if (op.k === 'update') {
      for (const [k, v] of Object.entries(op.v || {})) {
        const p = parts.concat(split(k));
        setAt(this.root, p, clone(v));
        changed.push(p);
      }
    } else if (op.k === 'inc') {
      const cur = Number(getAt(this.root, parts)) || 0;
      setAt(this.root, parts, cur + op.v);
      changed.push(parts);
    }
    if (broadcast && this.channel) this.channel.postMessage({ type: 'op', from: this.clientId, op });
    this._notify(changed);
  }

  _notify(changedPaths) {
    for (const s of this.subs) {
      const hit = !changedPaths.length || changedPaths.some((p) => overlaps(p, s.parts));
      if (!hit) continue;
      try {
        if (s.type === 'value') s.cb(clone(getAt(this.root, s.parts)) ?? null);
        else this._childCheck(s);
      } catch (e) { console.error('[local-db] subscriber error', e); }
    }
  }

  _childCheck(s) {
    const obj = getAt(this.root, s.parts) || {};
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
      if (!s.known.has(k)) { s.known.add(k); s.cb(k, clone(obj[k])); }
    }
  }

  set(path, v) { this._apply({ k: 'set', path, v }); return Promise.resolve(); }
  update(path, v) { this._apply({ k: 'update', path, v }); return Promise.resolve(); }
  remove(path) { this._apply({ k: 'set', path, v: null }); return Promise.resolve(); }
  inc(path, n) { this._apply({ k: 'inc', path, v: n }); return Promise.resolve(); }
  push(path, v) {
    const key = makeId('m');
    this.set(`${path}/${key}`, v);
    return key;
  }
  async get(path) { return clone(getAt(this.root, split(path))) ?? null; }

  subscribe(path, cb) {
    const s = { type: 'value', parts: split(path), cb };
    this.subs.add(s);
    cb(clone(getAt(this.root, s.parts)) ?? null);
    return () => this.subs.delete(s);
  }

  onChildAdded(path, cb, limit = 30) {
    const s = { type: 'child', parts: split(path), cb, known: new Set() };
    const obj = getAt(this.root, s.parts) || {};
    const keys = Object.keys(obj).sort();
    keys.slice(0, Math.max(0, keys.length - limit)).forEach((k) => s.known.add(k));
    this.subs.add(s);
    this._childCheck(s);
    return () => this.subs.delete(s);
  }

  onDisconnectRemove(path) { this.disconnectOps.push({ k: 'set', path, v: null }); }
  onDisconnectUpdate(path, v) { this.disconnectOps.push({ k: 'update', path, v }); }
  serverTime() { return Date.now(); }
  async staleRooms() { return []; } // demo rooms live only in open tabs
  async removeRoom() { /* n/a */ }

  _runDisconnect() {
    for (const op of this.disconnectOps) {
      try { this._apply(op, true); } catch (e) { /* ignore */ }
    }
    this.disconnectOps = [];
  }

  destroy() {
    this._runDisconnect();
    window.removeEventListener('pagehide', this._pagehide);
    if (this.channel) this.channel.close();
    this.subs.clear();
  }
}

// ---------------------------------------------------------------------
//  Firebase v10 Realtime Database adapter
// ---------------------------------------------------------------------
let fbModules = null;
async function loadFirebase() {
  if (fbModules) return fbModules;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [app, db] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-database.js`)]);
  fbModules = { app, db };
  return fbModules;
}

class FirebaseAdapter {
  constructor(room) {
    this.kind = 'firebase';
    this.room = room;
    this.unsubs = [];
  }

  async connect() {
    const { app, db } = await loadFirebase();
    this.m = db;
    const existing = app.getApps().find((a) => a.name === 'warungkita3d');
    this.app = existing || app.initializeApp(FIREBASE_CONFIG, 'warungkita3d');
    this.db = db.getDatabase(this.app);
    const snap = await db.get(this.r('meta'));
    return snap.exists();
  }

  r(path) {
    const p = split(path).join('/');
    return this.m.ref(this.db, `rooms/${this.room}${p ? '/' + p : ''}`);
  }

  set(path, v) { return this.m.set(this.r(path), v === undefined ? null : v); }
  update(path, v) { return this.m.update(this.r(path), v); }
  remove(path) { return this.m.remove(this.r(path)); }
  inc(path, n) { return this.m.set(this.r(path), this.m.increment(n)); }
  push(path, v) {
    const ref = this.m.push(this.r(path));
    this.m.set(ref, v);
    return ref.key;
  }
  async get(path) { const s = await this.m.get(this.r(path)); return s.exists() ? s.val() : null; }

  subscribe(path, cb) {
    const off = this.m.onValue(this.r(path), (snap) => cb(snap.val()));
    this.unsubs.push(off);
    return off;
  }

  onChildAdded(path, cb, limit = 30) {
    const q = this.m.query(this.r(path), this.m.limitToLast(limit));
    const off = this.m.onChildAdded(q, (snap) => cb(snap.key, snap.val()));
    this.unsubs.push(off);
    return off;
  }

  onDisconnectRemove(path) { this.m.onDisconnect(this.r(path)).remove(); }
  onDisconnectUpdate(path, v) { this.m.onDisconnect(this.r(path)).update(v); }
  serverTime() { return this.m.serverTimestamp(); }

  /** Codes of rooms whose last heartbeat is older than `cutoff` (or that have none) */
  async staleRooms(cutoff, limit = SWEEP_BATCH) {
    const m = this.m;
    const q = m.query(m.ref(this.db, 'rooms'), m.orderByChild('meta/lastActive'), m.endAt(cutoff), m.limitToFirst(limit));
    const snap = await m.get(q);
    const out = [];
    snap.forEach((child) => { out.push(child.key); });
    return out;
  }

  removeRoom(code) { return this.m.remove(this.m.ref(this.db, `rooms/${code}`)); }

  destroy() {
    for (const off of this.unsubs) { try { off(); } catch (e) { /* ignore */ } }
    this.unsubs = [];
  }
}

// ---------------------------------------------------------------------
//  Multiplayer facade
// ---------------------------------------------------------------------
export class Multiplayer {
  constructor() {
    this.adapter = null;
    this.room = null;
    this.pid = makeId('p');
    this.isHost = false;
    this.solo = false;
    this.meta = {};
    this.players = {};
    this._hostCbs = new Set();
  }

  static get onlineAvailable() { return isFirebaseConfigured(); }
  get mode() { return this.adapter ? this.adapter.kind : 'none'; }
  get isDemo() { return !this.solo && this.mode === 'local'; }

  _makeAdapter(code, solo) {
    if (!solo && isFirebaseConfigured()) return new FirebaseAdapter(code);
    return new LocalAdapter(code, { broadcast: !solo });
  }

  /** Create a room. Solo games use a private local room. */
  async createRoom({ restaurantName, player, solo = false, gallery = [] }) {
    this.solo = solo;
    let code = solo ? `SOLO-${this.pid.slice(-4)}` : null;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (!solo) code = String(Math.floor(1000 + Math.random() * 9000));
      const adapter = this._makeAdapter(code, solo);
      let exists = false;
      try {
        exists = await adapter.connect();
      } catch (e) {
        if (adapter.kind === 'firebase') {
          console.warn('[mp] Firebase unavailable, falling back to demo mode', e);
          adapter.destroy();
          const local = new LocalAdapter(code, { broadcast: true });
          exists = await local.connect();
          if (!exists) { this.adapter = local; break; }
          local.destroy();
          continue;
        }
        throw e;
      }
      if (!exists || solo) { this.adapter = adapter; break; }
      adapter.destroy();
    }
    if (!this.adapter) throw new Error('Tidak dapat mencipta bilik. Cuba lagi.');
    this.room = code;
    this.isHost = true;
    await this.adapter.set('', {
      meta: { restaurantName, hostId: this.pid, phase: 'lobby', day: 1, clock: 0, createdAt: Date.now(), lastActive: this.adapter.serverTime(), rushUntil: 0, totals: { sales: 0, tips: 0, served: 0, days: 0 } },
      gallery: gallery.slice(0, 8),
      stats: {},
    });
    await this._join(player);
    if (!solo) this.sweepStaleRooms(); // tidy up abandoned rooms in the background
    return code;
  }

  /**
   * Delete rooms nobody has touched for ROOM_STALE_MS. Runs from the creator's
   * browser; needs the read rule on /rooms described in the README. Never throws.
   */
  async sweepStaleRooms() {
    const a = this.adapter;
    if (!a || a.kind !== 'firebase') return 0;
    try {
      const cutoff = Date.now() - ROOM_STALE_MS;
      const codes = (await a.staleRooms(cutoff)).filter((c) => c !== this.room);
      await Promise.all(codes.map((c) => a.removeRoom(c)));
      if (codes.length) console.info(`[mp] cleaned ${codes.length} abandoned room(s)`);
      return codes.length;
    } catch (e) {
      console.info('[mp] room sweep skipped:', e && e.message);
      return 0;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    if (this.solo) return;
    const beat = async () => {
      if (!this.adapter) return;
      try {
        await this.adapter.update('meta', { lastActive: this.adapter.serverTime() });
        if (this.isHost) await this._trimChat();
      } catch (e) { /* offline for a moment — next beat will retry */ }
    };
    beat();
    this._hb = setInterval(beat, HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    if (this._hb) clearInterval(this._hb);
    this._hb = null;
  }

  async _trimChat() {
    const chat = (await this.adapter.get('chat')) || {};
    const keys = Object.keys(chat).sort();
    if (keys.length <= CHAT_KEEP) return;
    const patch = {};
    for (const k of keys.slice(0, keys.length - CHAT_KEEP)) patch[k] = null;
    await this.adapter.update('chat', patch);
  }

  async joinRoom(code, player) {
    code = String(code || '').trim();
    if (!/^\d{4}$/.test(code)) throw new Error('Kod bilik mesti 4 digit.');
    this.solo = false;
    let adapter = this._makeAdapter(code, false);
    let exists = false;
    try {
      exists = await adapter.connect();
    } catch (e) {
      if (adapter.kind !== 'firebase') throw e;
      adapter.destroy();
      adapter = new LocalAdapter(code, { broadcast: true });
      exists = await adapter.connect();
    }
    if (!exists) {
      adapter.destroy();
      throw new Error(isFirebaseConfigured()
        ? `Bilik ${code} tidak dijumpai.`
        : `Bilik ${code} tidak dijumpai. (Mod Demo: bilik mesti dibuka di tab lain pada pelayar yang sama.)`);
    }
    this.adapter = adapter;
    this.room = code;
    this.isHost = false;
    await this._join(player);
    return code;
  }

  async _join(player) {
    const me = { ...player, joinedAt: Date.now(), online: true };
    await this.adapter.set(`players/${this.pid}`, me);
    this.adapter.onDisconnectRemove(`players/${this.pid}`);
    this.adapter.subscribe('meta', (m) => {
      this.meta = m || {};
      this._checkHost();
    });
    this.adapter.subscribe('players', (p) => {
      this.players = p || {};
      this._checkHost();
    });
    this._startHeartbeat();
  }

  /** Host migration: if the host vanished, the earliest-joined remaining human takes over */
  _checkHost() {
    if (!this.meta || !this.meta.hostId) return;
    const ids = Object.keys(this.players);
    if (!ids.length) return;
    const wasHost = this.isHost;
    if (!this.players[this.meta.hostId]) {
      const next = ids.sort((a, b) => (this.players[a].joinedAt || 0) - (this.players[b].joinedAt || 0))[0];
      if (next === this.pid) this.adapter.update('meta', { hostId: this.pid });
    }
    this.isHost = this.meta.hostId === this.pid;
    if (this.isHost !== wasHost) for (const cb of this._hostCbs) cb(this.isHost);
  }

  onHostChange(cb) { this._hostCbs.add(cb); return () => this._hostCbs.delete(cb); }

  // pass-through data API
  set(p, v) { return this.adapter.set(p, v); }
  update(p, v) { return this.adapter.update(p, v); }
  remove(p) { return this.adapter.remove(p); }
  inc(p, n) { return this.adapter.inc(p, n); }
  push(p, v) { return this.adapter.push(p, v); }
  get(p) { return this.adapter.get(p); }
  subscribe(p, cb) { return this.adapter.subscribe(p, cb); }

  updateMe(patch) { return this.adapter.update(`players/${this.pid}`, patch); }

  sendChat(text, extra = {}) {
    const me = this.players[this.pid] || {};
    const msg = { pid: this.pid, name: me.name || 'Pemain', role: me.role || 'all', text: String(text).slice(0, 120), t: Date.now(), ...extra };
    return this.adapter.push('chat', msg);
  }

  /** Bots & system messages */
  sendSystemChat(name, role, text, extra = {}) {
    return this.adapter.push('chat', { pid: `bot-${role}`, name, role, text: String(text).slice(0, 120), t: Date.now(), bot: true, ...extra });
  }

  onChat(cb) { return this.adapter.onChildAdded('chat', (k, v) => cb(v, k), 25); }

  leave() {
    this._stopHeartbeat();
    try {
      if (this.adapter) {
        const others = Object.keys(this.players || {}).filter((pid) => pid !== this.pid);
        // last player out: delete the whole room instead of leaving an empty shell behind
        if (!this.solo && others.length === 0) this.adapter.remove('');
        else this.adapter.remove(`players/${this.pid}`);
        this.adapter.destroy();
      }
    } catch (e) { /* ignore */ }
    this.adapter = null;
    this.room = null;
    this.isHost = false;
    this.players = {};
    this.meta = {};
    this._hostCbs.clear();
  }
}
