// =====================================================================
//  WARUNG KITA 3D — Kalkulator Pantas (floating quick calculator)
//   • + − × ÷ with correct precedence (no eval)
//   • quick chips: tap a price from the current customer's order
//   • "➜ Daftar": send the result straight to the cash register
//   • draggable, remembers its position
// =====================================================================

const OPS = { '+': 1, '−': 1, '×': 2, '÷': 2 };
const POS_KEY = 'warungkita3d.calc.pos.v1';

function fmt(n) {
  if (!Number.isFinite(n)) return 'Ralat';
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
}

/** Evaluate a token list like ['4.5','+','2.5','×','2'] honouring × ÷ precedence. */
export function evaluate(tokens) {
  const t = tokens.slice();
  while (t.length && OPS[t[t.length - 1]]) t.pop(); // ignore a trailing operator
  if (!t.length) return 0;
  // pass 1: × ÷
  const stack = [Number(t[0])];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], v = Number(t[i + 1]);
    if (op === '×') stack[stack.length - 1] *= v;
    else if (op === '÷') stack[stack.length - 1] = v === 0 ? NaN : stack[stack.length - 1] / v;
    else stack.push(op === '−' ? -v : v);
  }
  // pass 2: + −
  return stack.reduce((a, b) => a + b, 0);
}

export class Calculator {
  /**
   * @param {HTMLElement} root  the #calc panel
   * @param {{quickItems:()=>Array<{label:string,price:number,qty:number}>, onSend:(cents:number)=>boolean, sound:()=>void}} opts
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    this.tokens = [];
    this.history = [];
    this.justEvaluated = false;
    this.exprEl = root.querySelector('.calc-expr');
    this.resEl = root.querySelector('.calc-result');
    this.histEl = root.querySelector('.calc-history');
    this.quickEl = root.querySelector('.calc-quick');
    this._buildKeys();
    root.querySelector('.calc-close').addEventListener('click', () => this.toggle(false));
    root.querySelector('.calc-send').addEventListener('click', () => this.send());
    this._initDrag(root.querySelector('.calc-head'));
    this.render();
  }

  get isOpen() { return !this.root.hidden; }

  toggle(force) {
    const open = force === undefined ? this.root.hidden : force;
    this.root.hidden = !open;
    if (open) { this._restorePos(); this.refreshQuick(); }
  }

  _buildKeys() {
    const keys = ['C', '⌫', '÷', '×', '7', '8', '9', '−', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];
    const grid = this.root.querySelector('.calc-keys');
    grid.innerHTML = '';
    for (const k of keys) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = k;
      b.className = `ck ${OPS[k] ? 'ck-op' : ''} ${k === '=' ? 'ck-eq' : ''} ${k === 'C' || k === '⌫' ? 'ck-fn' : ''} ${k === '0' ? 'ck-zero' : ''}`;
      b.addEventListener('click', () => { this.press(k); this.opts.sound && this.opts.sound(); });
      grid.appendChild(b);
    }
  }

  press(k) {
    const t = this.tokens;
    const last = t[t.length - 1];
    if (k === 'C') { this.tokens = []; this.justEvaluated = false; }
    else if (k === '⌫') {
      if (this.justEvaluated) { this.tokens = []; this.justEvaluated = false; }
      else if (last !== undefined) {
        if (OPS[last] || last.length <= 1) t.pop(); else t[t.length - 1] = last.slice(0, -1);
      }
    } else if (k === '=') {
      if (!t.length) return;
      const v = evaluate(t);
      this.history.unshift(`${this._exprText()} = ${fmt(v)}`);
      this.history.length = Math.min(this.history.length, 4);
      this.tokens = Number.isFinite(v) ? [fmt(v)] : [];
      this.justEvaluated = true;
    } else if (OPS[k]) {
      this.justEvaluated = false;
      if (!t.length) return;
      if (OPS[last]) t[t.length - 1] = k; else t.push(k);
    } else {
      // digit or '.'
      if (this.justEvaluated) { this.tokens = []; this.justEvaluated = false; }
      const cur = this.tokens;
      const l = cur[cur.length - 1];
      if (l === undefined || OPS[l]) cur.push(k === '.' ? '0.' : k);
      else {
        if (k === '.' && l.includes('.')) return;
        if (l.includes('.') && l.split('.')[1].length >= 2) return; // sen precision
        if (l.replace('.', '').length >= 8) return;
        cur[cur.length - 1] = l === '0' && k !== '.' ? k : l + k;
      }
    }
    this.render();
  }

  /** Append a price (in sen), optionally × quantity */
  addPrice(cents, qty = 1) {
    if (this.justEvaluated) { this.tokens = []; this.justEvaluated = false; }
    const t = this.tokens;
    if (t.length && !OPS[t[t.length - 1]]) t.push('+');
    t.push(fmt(cents / 100));
    if (qty > 1) t.push('×', String(qty));
    this.render();
  }

  addAll(items) {
    this.tokens = [];
    this.justEvaluated = false;
    for (const it of items) this.addPrice(it.price, it.qty);
  }

  value() { return evaluate(this.tokens); }

  send() {
    const v = this.value();
    if (!Number.isFinite(v) || v < 0) return;
    const cents = Math.round(v * 100);
    if (this.opts.onSend && this.opts.onSend(cents)) {
      this.root.classList.add('sent');
      setTimeout(() => this.root.classList.remove('sent'), 500);
    }
  }

  _exprText() { return this.tokens.join(' ') || '0'; }

  render() {
    this.exprEl.textContent = this._exprText();
    const v = this.value();
    this.resEl.textContent = this.tokens.length ? `= ${Number.isFinite(v) ? 'RM ' + (Math.round(v * 100) / 100).toFixed(2) : 'Ralat'}` : 'RM 0.00';
    this.histEl.innerHTML = this.history.map((h) => `<div>${h.replace(/[<>&]/g, '')}</div>`).join('');
  }

  /** Rebuild the quick-price chips from the current customer's order */
  refreshQuick() {
    if (!this.isOpen) return;
    const items = (this.opts.quickItems && this.opts.quickItems()) || [];
    const sig = JSON.stringify(items);
    if (sig === this._quickSig) return;
    this._quickSig = sig;
    this.quickEl.innerHTML = '';
    if (!items.length) {
      this.quickEl.innerHTML = '<span class="calc-hint">Harga pesanan pelanggan akan muncul di sini.</span>';
      return;
    }
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'calc-chip';
      b.textContent = `${it.qty > 1 ? it.qty + '× ' : ''}${it.label} ${(it.price / 100).toFixed(2)}`;
      b.title = 'Tambah ke kiraan';
      b.addEventListener('click', () => { this.addPrice(it.price, it.qty); this.opts.sound && this.opts.sound(); });
      this.quickEl.appendChild(b);
    }
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'calc-chip calc-chip-all';
    all.textContent = 'Σ Semua item';
    all.addEventListener('click', () => { this.addAll(items); this.opts.sound && this.opts.sound(); });
    this.quickEl.appendChild(all);
  }

  // ---------------- dragging ----------------
  _initDrag(handle) {
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = this.root.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      this._place(start.left + e.clientX - start.x, start.top + e.clientY - start.y);
    });
    const end = () => {
      if (!start) return;
      start = null;
      try { localStorage.setItem(POS_KEY, JSON.stringify({ left: this.root.offsetLeft, top: this.root.offsetTop })); } catch (e) { /* ignore */ }
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => { if (this.isOpen && this.root.style.left) this._place(this.root.offsetLeft, this.root.offsetTop); });
  }

  _place(left, top) {
    const w = this.root.offsetWidth, h = this.root.offsetHeight;
    this.root.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, left))}px`;
    this.root.style.top = `${Math.max(4, Math.min(window.innerHeight - h - 4, top))}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
  }

  _restorePos() {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p) requestAnimationFrame(() => this._place(p.left, p.top));
    } catch (e) { /* ignore */ }
  }
}
