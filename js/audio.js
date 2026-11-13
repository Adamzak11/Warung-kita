// =====================================================================
//  WARUNG KITA 3D — Procedural Web Audio synthesizer
//  SFX + dual-genre background music sequencer:
//    • 'gamelan' — Tradisional Melayu (Gamelan / Inang rhythm)
//    • 'jazz'    — Kopitiam Jazz Bossa
//    • 'mute'
// =====================================================================

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.genre = 'gamelan';
    this.musicPlaying = false;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.45;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this._loops = {};
    this._listeners = new Set();
    this._seed = 1;
  }

  // ------------------------------------------------------------------
  //  Setup
  // ------------------------------------------------------------------
  init() {
    if (this.ctx) { this.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch (e) {
      console.warn('[audio] AudioContext failed', e);
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    // gentle room reverb for music
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(1.8, 2.5);
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb).connect(wet).connect(this.master);

    // white noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.resume();
    return true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() { return !!this.ctx; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) { try { fn(this.genre); } catch (e) { /* ignore */ } } }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _rand() {
    // deterministic-ish PRNG for musical variation
    this._seed = (this._seed * 1664525 + 1013904223) % 4294967296;
    return this._seed / 4294967296;
  }

  // ------------------------------------------------------------------
  //  Primitive voices
  // ------------------------------------------------------------------
  tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, release = null, when = 0, freqEnd = null, dest = null, detune = 0, vibrato = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = when || ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    osc.detune.value = detune;
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    const rel = release == null ? dur : release;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + rel);
    osc.connect(g).connect(dest || this.sfxBus);
    osc.start(t);
    osc.stop(t + attack + rel + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, type = 'bandpass', freq = 2000, Q = 1, when = 0, attack = 0.002, dest = null, freqEnd = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = when || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g).connect(dest || this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + dur + 0.05);
  }

  /** Metallic bell / metallophone voice (inharmonic partials) */
  bell(freq, when, vol = 0.2, decay = 1.2, dest = null, partials = [1, 2.76, 5.4, 8.93]) {
    partials.forEach((p, i) => {
      this.tone({ freq: freq * p, type: 'sine', dur: decay / (1 + i * 0.9), vol: vol / (1 + i * 1.6), attack: 0.002, when, dest });
    });
  }

  // ------------------------------------------------------------------
  //  SFX
  // ------------------------------------------------------------------
  click() { this.tone({ freq: 1250, type: 'square', dur: 0.03, vol: 0.06 }); }
  tick() { this.tone({ freq: 2100, type: 'triangle', dur: 0.025, vol: 0.05 }); }

  keypad() { this.tone({ freq: 880 + Math.random() * 60, type: 'square', dur: 0.05, vol: 0.05 }); }

  scoop() {
    if (!this.ctx) return;
    const t = this.now;
    this.noise({ dur: 0.12, vol: 0.18, type: 'bandpass', freq: 3000, freqEnd: 900, Q: 1.2, when: t });
    this.tone({ freq: 220, freqEnd: 120, type: 'sine', dur: 0.1, vol: 0.18, when: t + 0.02 });
  }

  plop() {
    this.tone({ freq: 520, freqEnd: 180, type: 'sine', dur: 0.12, vol: 0.2 });
  }

  coin() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ freq: 2637, type: 'sine', dur: 0.25, vol: 0.12, when: t });
    this.tone({ freq: 3520, type: 'sine', dur: 0.3, vol: 0.08, when: t + 0.04 });
  }

  note() {
    if (!this.ctx) return;
    this.noise({ dur: 0.09, vol: 0.12, type: 'highpass', freq: 3500, Q: 0.5 });
  }

  /** Cash drawer "KA-CHING!" */
  kaching() {
    if (!this.ctx) return;
    const t = this.now;
    // drawer slide-out
    this.noise({ dur: 0.18, vol: 0.25, type: 'lowpass', freq: 600, freqEnd: 2400, Q: 2, when: t });
    this.tone({ freq: 90, freqEnd: 60, type: 'triangle', dur: 0.12, vol: 0.3, when: t + 0.16 });
    // the bell
    this.bell(1568, t + 0.17, 0.22, 1.4, null, [1, 2.0, 2.76, 4.1]);
    this.bell(2093, t + 0.21, 0.18, 1.6, null, [1, 2.0, 3.1]);
    // coin jingle
    for (let i = 0; i < 6; i++) {
      this.tone({ freq: 3000 + Math.random() * 2500, type: 'sine', dur: 0.08, vol: 0.05, when: t + 0.25 + i * 0.035 });
    }
  }

  /** DuitNow QR success chime */
  qrChime() {
    if (!this.ctx) return;
    const t = this.now;
    [76, 79, 84, 88].forEach((n, i) => this.tone({ freq: midi(n), type: 'sine', dur: 0.35, vol: 0.18, when: t + i * 0.09 }));
    this.tone({ freq: midi(96), type: 'triangle', dur: 0.5, vol: 0.06, when: t + 0.36 });
  }

  /** Contactless PayWave beep */
  payWave() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ freq: 1760, type: 'square', dur: 0.09, vol: 0.09, when: t });
    this.tone({ freq: 1760, type: 'sine', dur: 0.32, vol: 0.2, when: t + 0.14, attack: 0.003 });
  }

  /** Low-pitched error buzzer */
  buzzer() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ freq: 110, type: 'sawtooth', dur: 0.38, vol: 0.18, when: t });
    this.tone({ freq: 116, type: 'square', dur: 0.38, vol: 0.1, when: t });
  }

  success() {
    if (!this.ctx) return;
    const t = this.now;
    [72, 76, 79, 84].forEach((n, i) => this.tone({ freq: midi(n), type: 'triangle', dur: 0.22, vol: 0.14, when: t + i * 0.07 }));
  }

  perfect() {
    if (!this.ctx) return;
    const t = this.now;
    [79, 83, 86, 91].forEach((n, i) => this.bell(midi(n), t + i * 0.06, 0.12, 0.7));
  }

  ding() {
    if (!this.ctx) return;
    this.bell(midi(88), this.now, 0.2, 1.0);
  }

  doorbell() {
    if (!this.ctx) return;
    const t = this.now;
    this.bell(midi(81), t, 0.12, 0.9);
    this.bell(midi(76), t + 0.22, 0.12, 1.1);
  }

  angry() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ freq: 330, freqEnd: 150, type: 'sawtooth', dur: 0.45, vol: 0.09, when: t });
  }

  spill() {
    if (!this.ctx) return;
    const t = this.now;
    this.noise({ dur: 0.5, vol: 0.3, type: 'lowpass', freq: 3000, freqEnd: 300, Q: 0.8, when: t });
    this.tone({ freq: 300, freqEnd: 90, type: 'sine', dur: 0.3, vol: 0.15, when: t + 0.05 });
  }

  whoosh() {
    if (!this.ctx) return;
    this.noise({ dur: 0.3, vol: 0.12, type: 'bandpass', freq: 400, freqEnd: 2500, Q: 0.7 });
  }

  chatBlip() {
    if (!this.ctx) return;
    const t = this.now;
    // walkie-talkie squelch
    this.noise({ dur: 0.06, vol: 0.06, type: 'bandpass', freq: 1800, Q: 3, when: t });
    this.tone({ freq: 1400, type: 'square', dur: 0.05, vol: 0.04, when: t + 0.06 });
  }

  /** Midnight grandfather-clock chime (Westminster quarters + bongs) */
  midnightChime() {
    if (!this.ctx) return;
    const t = this.now;
    const seq = [64, 68, 66, 59, 64, 66, 68, 64];
    seq.forEach((n, i) => this.bell(midi(n), t + i * 0.42, 0.16, 1.8, null, [1, 2.0, 3.0, 4.2]));
    for (let i = 0; i < 4; i++) this.bell(midi(40), t + 3.6 + i * 1.0, 0.28, 2.6, null, [1, 2.0, 2.4, 3.0]);
  }

  // ------------------------------------------------------------------
  //  Continuous loops (sizzle / pour)
  // ------------------------------------------------------------------
  _loop(name, build) {
    if (!this.ctx) return null;
    if (!this._loops[name]) this._loops[name] = build();
    return this._loops[name];
  }

  setSizzle(on, intensity = 1) {
    if (!this.ctx) return;
    const L = this._loop('sizzle', () => {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 5200; pk.gain.value = 8;
      const g = ctx.createGain(); g.gain.value = 0;
      // crackle amplitude modulation (separate stage so "off" is truly silent)
      const crackle = ctx.createGain(); crackle.gain.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 13;
      const lg = ctx.createGain(); lg.gain.value = 0.3;
      lfo.connect(lg).connect(crackle.gain);
      src.connect(hp).connect(pk).connect(crackle).connect(g).connect(this.sfxBus);
      src.start(); lfo.start();
      return { g, lfo };
    });
    const target = on ? 0.09 + 0.12 * Math.min(1, intensity) : 0;
    L.g.gain.cancelScheduledValues(this.now);
    L.g.gain.setTargetAtTime(target, this.now, on ? 0.05 : 0.12);
    L.lfo.frequency.setTargetAtTime(9 + Math.random() * 9, this.now, 0.1);
  }

  setPour(on, rate = 1) {
    if (!this.ctx) return;
    const L = this._loop('pour', () => {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
      const lg = ctx.createGain(); lg.gain.value = 380;
      lfo.connect(lg).connect(bp.frequency);
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp).connect(g).connect(this.sfxBus);
      src.start(); lfo.start();
      return { g, bp, lfo };
    });
    L.g.gain.cancelScheduledValues(this.now);
    L.g.gain.setTargetAtTime(on ? 0.28 : 0, this.now, on ? 0.03 : 0.08);
    L.bp.frequency.setTargetAtTime(700 + rate * 500, this.now, 0.1);
  }

  stopLoops() {
    this.setSizzle(false);
    this.setPour(false);
  }

  // ------------------------------------------------------------------
  //  Music sequencer
  // ------------------------------------------------------------------
  setGenre(genre) {
    this.genre = genre;
    if (genre === 'mute') this.stopMusic();
    else if (this.ctx) this.startMusic(genre);
    this._emit();
  }

  cycleGenre() {
    const order = ['gamelan', 'jazz', 'mute'];
    this.setGenre(order[(order.indexOf(this.genre) + 1) % order.length]);
    return this.genre;
  }

  startMusic(genre = this.genre) {
    if (!this.ctx) return;
    this.stopMusic();
    this.genre = genre;
    if (genre === 'mute') return;
    this.musicPlaying = true;
    this._step = 0;
    this._seed = 7;
    this._nextTime = this.ctx.currentTime + 0.12;
    this.musicBus.gain.cancelScheduledValues(this.now);
    this.musicBus.gain.setValueAtTime(0.0001, this.now);
    this.musicBus.gain.exponentialRampToValueAtTime(this.musicVolume, this.now + 1.2);
    this._timer = setInterval(() => this._schedule(), 25);
  }

  stopMusic() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.musicPlaying = false;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.now, 0.1);
  }

  _schedule() {
    if (!this.ctx || !this.musicPlaying) return;
    const bpm = this.genre === 'jazz' ? 132 : 104;
    const sixteenth = 60 / bpm / 4;
    while (this._nextTime < this.ctx.currentTime + 0.15) {
      if (this.genre === 'jazz') this._jazzStep(this._step, this._nextTime, sixteenth);
      else this._gamelanStep(this._step, this._nextTime, sixteenth);
      this._nextTime += sixteenth;
      this._step++;
    }
  }

  // --- Tradisional Melayu: Gamelan + Inang gendang --------------------
  _gamelanStep(step, t, s16) {
    const bus = this.musicBus;
    const bar = Math.floor(step / 16) % 8;
    const pos = step % 16;
    // Malay-flavoured pentatonic (D E F# A B) with an occasional C (asli flavour)
    const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81];
    const progression = [0, 0, 3, 3, 1, 1, 4, 0]; // degrees over 8 bars
    const root = scale[progression[bar]];

    // Gong ageng at the start of every 2 bars, kenong on beat 3
    if (pos === 0 && bar % 2 === 0) {
      this.tone({ freq: midi(root - 24), type: 'sine', dur: 3.2, vol: 0.32, attack: 0.01, when: t, dest: bus, vibrato: 0.6 });
      this.tone({ freq: midi(root - 24) * 1.007, type: 'sine', dur: 3.0, vol: 0.18, attack: 0.01, when: t, dest: bus });
    }
    if (pos === 8) this.bell(midi(root - 12), t, 0.12, 0.9, bus, [1, 2.0, 3.0]);

    // Inang gendang pattern: dum . tak dum | . tak . tak
    const dum = [0, 3, 6, 11];
    const tak = [4, 10, 12, 14];
    if (dum.includes(pos)) this.tone({ freq: 110, freqEnd: 58, type: 'sine', dur: 0.22, vol: 0.38, when: t, dest: bus });
    if (tak.includes(pos)) this.noise({ dur: 0.07, vol: 0.16, type: 'bandpass', freq: 2400, Q: 1.8, when: t, dest: bus });
    if (pos % 2 === 1) this.noise({ dur: 0.03, vol: 0.04, type: 'highpass', freq: 7000, Q: 0.5, when: t, dest: bus });

    // Bonang / saron interlocking ostinato (8th notes)
    if (pos % 2 === 0) {
      const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
      const idx = progression[bar] + pattern[(pos / 2) % 8];
      const n = scale[Math.min(scale.length - 1, idx)];
      this.bell(midi(n), t, 0.07, 0.45, bus, [1, 2.76, 5.4]);
    }

    // Seruling melody (bamboo flute) — call & response, 2-bar phrases
    if (pos % 4 === 0 && this._rand() < 0.72) {
      const deg = progression[bar] + Math.floor(this._rand() * 4);
      const n = scale[Math.min(scale.length - 1, deg)] + 12;
      const len = s16 * (this._rand() < 0.4 ? 6 : 3.5);
      this.tone({ freq: midi(n), type: 'triangle', dur: len, vol: 0.06, attack: 0.04, when: t, dest: bus, vibrato: 4 });
      this.tone({ freq: midi(n) * 2, type: 'sine', dur: len * 0.8, vol: 0.015, attack: 0.05, when: t, dest: bus });
    }
  }

  // --- Kopitiam Jazz Bossa ------------------------------------------------
  _jazzStep(step, t, s16) {
    const bus = this.musicBus;
    const bar = Math.floor(step / 16) % 4;
    const pos = step % 16;
    // ii - V - I - VI7  in C : Dm9 G13 Cmaj9 A7(b9)
    const chords = [
      { root: 50, notes: [65, 69, 72, 76] },   // Dm9   (F A C E)
      { root: 43, notes: [65, 69, 71, 76] },   // G13   (F A B E)
      { root: 48, notes: [64, 67, 71, 74] },   // Cmaj9 (E G B D)
      { root: 45, notes: [61, 64, 67, 70] },   // A7b9  (C# E G Bb)
    ];
    const ch = chords[bar];

    // Bossa clave (3-2) → rim clicks
    const clave = [0, 3, 6, 10, 13];
    if (clave.includes(pos)) this.noise({ dur: 0.04, vol: 0.12, type: 'bandpass', freq: 1700, Q: 6, when: t, dest: bus });
    // Shaker 16ths with accent
    this.noise({ dur: 0.035, vol: pos % 4 === 2 ? 0.05 : 0.025, type: 'highpass', freq: 6500, Q: 0.6, when: t, dest: bus });
    // Soft kick on 1 & 3-and
    if (pos === 0 || pos === 6 || pos === 8 || pos === 14) {
      this.tone({ freq: 80, freqEnd: 45, type: 'sine', dur: 0.18, vol: pos === 0 || pos === 8 ? 0.3 : 0.16, when: t, dest: bus });
    }

    // Upright bass: root – fifth bossa pattern
    if (pos === 0) this.tone({ freq: midi(ch.root), type: 'triangle', dur: s16 * 5, vol: 0.32, when: t, dest: bus, attack: 0.01 });
    if (pos === 6) this.tone({ freq: midi(ch.root + 7), type: 'triangle', dur: s16 * 2, vol: 0.26, when: t, dest: bus, attack: 0.01 });
    if (pos === 8) this.tone({ freq: midi(ch.root), type: 'triangle', dur: s16 * 5, vol: 0.3, when: t, dest: bus, attack: 0.01 });
    if (pos === 14) this.tone({ freq: midi(ch.root + 7), type: 'triangle', dur: s16 * 2, vol: 0.24, when: t, dest: bus, attack: 0.01 });

    // Rhodes comping on syncopated hits
    const comp = [0, 3, 6, 10, 12];
    if (comp.includes(pos)) {
      const len = pos === 12 ? s16 * 4 : s16 * 2.2;
      ch.notes.forEach((n, i) => {
        this.tone({ freq: midi(n), type: 'sine', dur: len, vol: 0.05, attack: 0.008, when: t + i * 0.006, dest: bus });
        this.tone({ freq: midi(n) * 2, type: 'triangle', dur: len * 0.4, vol: 0.012, attack: 0.004, when: t, dest: bus });
      });
    }

    // Vibraphone melody: random walk on chord tones
    if ((pos === 2 || pos === 7 || pos === 9 || pos === 14) && this._rand() < 0.65) {
      const n = ch.notes[Math.floor(this._rand() * ch.notes.length)] + 12;
      this.bell(midi(n), t, 0.06, 0.9, bus, [1, 4.0, 10.0]);
    }
  }
}

export const audio = new AudioEngine();
export default audio;
