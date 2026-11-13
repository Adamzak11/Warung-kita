// =====================================================================
//  WARUNG KITA 3D — Characters
//   • Full-body photo upload processor (corner chroma-key background
//     removal, auto-crop, compression to a 256x384 DataURL)
//   • Procedural 3D Batik Character Generator (Lelaki / Perempuan
//     bertudung ayu, 4 Batik motifs, role & archetype accessories)
//   • Billboard sprite characters for uploaded images
//   • Lobby turntable preview
// =====================================================================
import { batikCanvas, BATIK_PATTERNS, BATIK_IDS, SKIN_TONES, HIJAB_COLORS } from './config.js';

const THREE = window.THREE;

export const SPRITE_W = 256;
export const SPRITE_H = 384;

// ---------------------------------------------------------------------
//  Image upload → background removal → 256x384 DataURL
// ---------------------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
    img.src = src;
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Fail tidak dapat dibaca'));
    fr.readAsDataURL(file);
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Smart corner chroma-key. Samples the four corners (plus the top edge
 * midpoint) to learn the background colour(s), then flood-fills inward
 * from the border so that only *connected* background is removed —
 * clothing of a similar colour inside the silhouette is preserved.
 */
export function removeBackground(imageData, tolerance = 44) {
  const { data, width: w, height: h } = imageData;
  const total = w * h;
  const alphaAt = (x, y) => data[(y * w + x) * 4 + 3];
  const cornerAlphas = [alphaAt(0, 0), alphaAt(w - 1, 0), alphaAt(0, h - 1), alphaAt(w - 1, h - 1)];
  if (cornerAlphas.filter((a) => a < 20).length >= 2) {
    return { skipped: true, ratio: 0 }; // already has a transparent background
  }

  const P = Math.max(3, Math.round(Math.min(w, h) * 0.03));
  const spots = [[0, 0], [w - P, 0], [0, h - P], [w - P, h - P], [Math.floor(w / 2 - P / 2), 0]];
  const keys = [];
  for (const [sx, sy] of spots) {
    let r = 0, g = 0, b = 0, n = 0;
    const px = [];
    for (let y = sy; y < sy + P; y++) {
      for (let x = sx; x < sx + P; x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        px.push(i);
      }
    }
    r /= n; g /= n; b /= n;
    let variance = 0;
    for (const i of px) variance += (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2;
    variance /= n;
    if (variance > 2400) continue; // busy patch, not a clean backdrop
    if (!keys.some((k) => (k[0] - r) ** 2 + (k[1] - g) ** 2 + (k[2] - b) ** 2 < 28 * 28)) keys.push([r, g, b]);
  }
  if (!keys.length) return { skipped: true, ratio: 0 };

  const tol2 = tolerance * tolerance;
  const loose2 = (tolerance * 1.9) ** 2;
  const step2 = (tolerance * 0.38) ** 2;
  const keyDist2 = (i) => {
    let best = Infinity;
    for (const k of keys) {
      const d = (data[i] - k[0]) ** 2 + (data[i + 1] - k[1]) ** 2 + (data[i + 2] - k[2]) ** 2;
      if (d < best) best = d;
    }
    return best;
  };

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const seed = (x, y) => {
    const p = y * w + x;
    if (visited[p]) return;
    if (keyDist2(p * 4) < tol2) { visited[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w, y = (p / w) | 0;
    const pi = p * 4;
    const nbrs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nbrs) {
      if (q < 0 || visited[q]) continue;
      const qi = q * 4;
      const kd = keyDist2(qi);
      // accept if close to a key colour, or a smooth gradient continuation of the backdrop
      const sd = (data[qi] - data[pi]) ** 2 + (data[qi + 1] - data[pi + 1]) ** 2 + (data[qi + 2] - data[pi + 2]) ** 2;
      if (kd < tol2 || (kd < loose2 && sd < step2)) { visited[q] = 1; queue[tail++] = q; }
    }
  }

  // clear background + feather the silhouette edge
  let removed = 0;
  for (let p = 0; p < total; p++) {
    if (visited[p]) { data[p * 4 + 3] = 0; removed++; }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (visited[p]) continue;
      if (!(visited[p - 1] || visited[p + 1] || visited[p - w] || visited[p + w])) continue;
      const i = p * 4;
      const d = Math.sqrt(keyDist2(i));
      const a = Math.min(1, Math.max(0.15, (d - tolerance * 0.6) / (tolerance * 1.4)));
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }
  return { skipped: false, ratio: removed / total, keys: keys.length };
}

function alphaBBox(imageData, threshold = 24) {
  const { data, width: w, height: h } = imageData;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Process a full-body character photo.
 * @returns {Promise<{dataURL:string, removedRatio:number, skipped:boolean, bytes:number}>}
 */
export async function processFullBodyImage(file, { tolerance = 44, removeBg = true } = {}) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Sila pilih fail gambar (PNG/JPG/WebP).');
  const src = await fileToDataURL(file);
  const img = await loadImage(src);

  const maxSide = 640;
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(8, Math.round((img.naturalWidth || img.width) * s));
  const h = Math.max(8, Math.round((img.naturalHeight || img.height) * s));
  const work = makeCanvas(w, h);
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(img, 0, 0, w, h);
  const id = wctx.getImageData(0, 0, w, h);
  const res = removeBg ? removeBackground(id, tolerance) : { skipped: true, ratio: 0 };
  wctx.putImageData(id, 0, 0);
  const bb = alphaBBox(id) || { x: 0, y: 0, w, h };

  const out = makeCanvas(SPRITE_W, SPRITE_H);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  const availW = SPRITE_W * 0.94;
  const availH = SPRITE_H * 0.96;
  const sc = Math.min(availW / bb.w, availH / bb.h);
  const dw = bb.w * sc, dh = bb.h * sc;
  const dx = (SPRITE_W - dw) / 2;
  const dy = SPRITE_H - dh - SPRITE_H * 0.01; // feet on the ground line
  octx.drawImage(work, bb.x, bb.y, bb.w, bb.h, dx, dy, dw, dh);

  let dataURL = out.toDataURL('image/webp', 0.85);
  if (!dataURL.startsWith('data:image/webp')) dataURL = out.toDataURL('image/png');
  return { dataURL, removedRatio: res.ratio || 0, skipped: !!res.skipped, bytes: Math.round(dataURL.length * 0.75) };
}

// ---------------------------------------------------------------------
//  Appearance helpers
// ---------------------------------------------------------------------
export function defaultAppearance() {
  return { type: 'batik', gender: 'female', pattern: 'bunga_raya', skin: 1, hijab: 0 };
}

export function randomBatikAppearance(rand = Math.random) {
  const gender = rand() < 0.5 ? 'male' : 'female';
  return {
    type: 'batik',
    gender,
    pattern: BATIK_IDS[Math.floor(rand() * BATIK_IDS.length)],
    skin: Math.floor(rand() * SKIN_TONES.length),
    hijab: Math.floor(rand() * HIJAB_COLORS.length),
  };
}

export function appearanceKey(a) {
  if (!a) return 'none';
  if (a.type === 'image' || a.type === 'gallery') return `${a.type}:${a.idx ?? (a.dataURL || '').length}`;
  return `batik:${a.gender}:${a.pattern}:${a.skin}:${a.hijab}`;
}

// ---------------------------------------------------------------------
//  Shared materials / textures
// ---------------------------------------------------------------------
const texCache = new Map();
function batikTexture(patternId, rx = 1, ry = 1) {
  const key = `${patternId}:${rx}:${ry}`;
  if (texCache.has(key)) return texCache.get(key);
  const tex = new THREE.CanvasTexture(batikCanvas(patternId, 256));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

const matCache = new Map();
function std(color, opts = {}) {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
  matCache.set(key, m);
  return m;
}

let towelTex = null;
function goodMorningTowelTexture() {
  if (towelTex) return towelTex;
  const c = makeCanvas(64, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#d32f2f'; g.fillRect(0, 10, 64, 6); g.fillRect(0, 112, 64, 6);
  g.fillStyle = '#c62828'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
  g.save(); g.translate(32, 64); g.rotate(-Math.PI / 2); g.fillText('GOOD MORNING', 0, 4); g.restore();
  towelTex = new THREE.CanvasTexture(c);
  return towelTex;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------
//  3D Batik Character Generator
// ---------------------------------------------------------------------
/**
 * @param {object} a  appearance: {gender, pattern, skin, hijab}
 * @param {object} o  options: {role, archetype}
 */
export function buildBatikCharacter(a = defaultAppearance(), o = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const female = a.gender === 'female';
  const pattern = BATIK_PATTERNS[a.pattern] ? a.pattern : 'bunga_raya';
  const palette = BATIK_PATTERNS[pattern].colors;
  const skinMat = std(SKIN_TONES[a.skin ?? 1] || SKIN_TONES[1], { roughness: 0.6 });
  const batikMat = new THREE.MeshStandardMaterial({ map: batikTexture(pattern, 2, 1.2), roughness: 0.8 });
  const batikSleeve = new THREE.MeshStandardMaterial({ map: batikTexture(pattern, 1, 1), roughness: 0.8 });
  const plainTop = std(palette[female ? 1 : 0], { roughness: 0.7 });
  const dark = std('#20242c');
  const role = o.role || null;
  const arch = o.archetype || null;

  // --- feet ---
  const shoeMat = std(arch === 'rider' ? '#f5f5f5' : '#2b2018', { roughness: 0.5 });
  body.add(mesh(new THREE.BoxGeometry(0.09, 0.05, 0.17), shoeMat, -0.08, 0.025, 0.03));
  body.add(mesh(new THREE.BoxGeometry(0.09, 0.05, 0.17), shoeMat, 0.08, 0.025, 0.03));

  // --- lower body ---
  if (female) {
    // kain (batik skirt)
    const kain = mesh(new THREE.CylinderGeometry(0.165, 0.215, 0.76, 28), batikMat, 0, 0.43, 0);
    body.add(kain);
  } else {
    const pants = std(arch === 'rider' ? '#30343c' : '#3a3f4b');
    body.add(mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.74, 14), pants, -0.08, 0.42, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.74, 14), pants, 0.08, 0.42, 0));
  }

  // --- torso ---
  let torsoMat = female ? plainTop : batikMat;
  if (arch === 'rider') torsoMat = std(a.gender === 'male' ? '#1fa64a' : '#e91e63');
  const torso = female
    ? mesh(new THREE.CylinderGeometry(0.165, 0.21, 0.62, 24), torsoMat, 0, 1.0, 0)
    : mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.56, 24), torsoMat, 0, 1.05, 0);
  body.add(torso);
  const shoulders = mesh(new THREE.SphereGeometry(0.19, 20, 12), torsoMat, 0, 1.3, 0);
  shoulders.scale.set(1, 0.45, 0.85);
  body.add(shoulders);

  // --- arms (pivot at shoulder) ---
  const arms = [];
  const sleeveMat = female ? plainTop : (arch === 'rider' ? torsoMat : batikSleeve);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.215, 1.28, 0);
    pivot.rotation.z = side * 0.12;
    const sleeve = mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.5, 12), sleeveMat, 0, -0.25, 0);
    const hand = mesh(new THREE.SphereGeometry(0.048, 12, 10), skinMat, 0, -0.52, 0);
    pivot.add(sleeve, hand);
    body.add(pivot);
    arms.push(pivot);
  }

  // --- head ---
  const headY = 1.53;
  const head = new THREE.Group();
  head.position.y = headY;
  body.add(head);
  if (!female) head.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skinMat, 0, -0.15, 0));
  const skull = mesh(new THREE.SphereGeometry(0.13, 28, 20), skinMat, 0, 0, 0);
  skull.scale.set(1, 1.08, 1);
  head.add(skull);

  // face
  const eyeMat = std('#1b1b1f', { roughness: 0.3 });
  const whiteMat = std('#ffffff', { roughness: 0.2, emissive: '#555555' });
  for (const side of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.017, 10, 8), eyeMat, side * 0.045, 0.012, 0.118));
    head.add(mesh(new THREE.SphereGeometry(0.006, 6, 6), whiteMat, side * 0.045 + 0.005, 0.019, 0.133));
    const brow = mesh(new THREE.BoxGeometry(0.035, 0.007, 0.01), std(female ? '#3a2a20' : '#1a120c'), side * 0.046, 0.045, 0.118);
    brow.rotation.z = side * -0.12;
    head.add(brow);
    const cheek = mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshBasicMaterial({ color: '#ff8a8a', transparent: true, opacity: 0.45 }), side * 0.076, -0.025, 0.107);
    cheek.rotation.y = side * 0.55;
    head.add(cheek);
  }
  const smile = mesh(new THREE.TorusGeometry(0.03, 0.0065, 6, 16, Math.PI), std('#7a2a2a'), 0, -0.048, 0.118);
  smile.rotation.z = Math.PI;
  head.add(smile);
  head.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), skinMat, 0, -0.01, 0.13));

  if (female) {
    buildHijab(head, body, a);
  } else if (arch === 'pesara' || (role === 'cashier' && (a.skin ?? 0) % 2 === 0)) {
    // kopiah / songkok
    const capMat = arch === 'pesara' ? std('#f4f4f0') : std('#151515', { roughness: 0.4 });
    head.add(mesh(new THREE.CylinderGeometry(0.128, 0.132, 0.085, 24), capMat, 0, 0.1, -0.01));
  } else {
    const hair = mesh(new THREE.SphereGeometry(0.138, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), std('#1b1410', { roughness: 0.9 }), 0, 0.012, -0.012);
    hair.scale.set(1.02, 1.1, 1.04);
    hair.rotation.x = -0.42;
    head.add(hair);
  }

  // --- role accessories ---
  if (role === 'chef') {
    const white = std('#ffffff', { roughness: 0.5 });
    const capY = female ? 0.185 : 0.17;
    head.add(mesh(new THREE.CylinderGeometry(0.105, 0.11, 0.12, 20), white, 0, capY, -0.01));
    const puff = mesh(new THREE.SphereGeometry(0.135, 20, 12), white, 0, capY + 0.1, -0.01);
    puff.scale.set(1, 0.62, 1);
    head.add(puff);
    const apron = mesh(new THREE.BoxGeometry(0.3, 0.62, 0.02), white, 0, 0.88, female ? 0.2 : 0.185);
    body.add(apron);
  } else if (role === 'cashier') {
    const tagY = female ? 1.06 : 1.16, tagZ = female ? 0.205 : 0.19;
    body.add(mesh(new THREE.BoxGeometry(0.07, 0.035, 0.012), std('#ffffff'), 0.09, tagY, tagZ));
    body.add(mesh(new THREE.BoxGeometry(0.07, 0.01, 0.014), std('#d62839'), 0.09, tagY + 0.02, tagZ));
    const lanyard = mesh(new THREE.TorusGeometry(0.11, 0.006, 6, 24, Math.PI), std('#d62839'), 0, 1.3, 0.1);
    lanyard.rotation.z = Math.PI;
    body.add(lanyard);
  } else if (role === 'drinks') {
    const apron = mesh(new THREE.BoxGeometry(0.3, 0.55, 0.02), std('#6d4c41'), 0, 0.86, female ? 0.2 : 0.185);
    body.add(apron);
    const towelMat = new THREE.MeshStandardMaterial({ map: goodMorningTowelTexture(), roughness: 0.9 });
    const towel = female
      ? mesh(new THREE.BoxGeometry(0.11, 0.3, 0.015), towelMat, -0.13, 0.86, 0.215)
      : mesh(new THREE.BoxGeometry(0.11, 0.015, 0.42), towelMat, -0.15, 1.34, 0.0);
    if (!female) towel.rotation.z = 0.35;
    body.add(towel);
  }

  // --- customer archetype accessories ---
  if (arch === 'pesara') {
    const frame = std('#3b2f2f', { roughness: 0.3, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.028, 0.005, 6, 16), frame, side * 0.046, 0.012, 0.128);
      head.add(ring);
    }
    head.add(mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), frame, 0, 0.015, 0.13));
  } else if (arch === 'pelajar') {
    const bag = mesh(new THREE.BoxGeometry(0.28, 0.34, 0.13), std(['#3949ab', '#00897b', '#f4511e', '#8e24aa'][(a.skin ?? 0) % 4]), 0, 1.05, -0.22);
    body.add(bag);
    if (!female) {
      const capMat = std('#263238');
      const cap = mesh(new THREE.SphereGeometry(0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat, 0, 0.03, 0);
      head.add(cap);
      const brim = mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), capMat, 0, 0.04, 0.15);
      head.add(brim);
    }
  } else if (arch === 'rider') {
    const helmetMat = std(a.gender === 'male' ? '#1fa64a' : '#ec407a', { roughness: 0.25, metalness: 0.2 });
    const helmet = mesh(new THREE.SphereGeometry(0.165, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), helmetMat, 0, 0.0, -0.005);
    head.add(helmet);
    const visor = mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), std('#1d1d1d', { roughness: 0.1, metalness: 0.5 }), 0, 0.075, 0.14);
    head.add(visor);
    const box = mesh(new THREE.BoxGeometry(0.34, 0.34, 0.26), helmetMat, 0, 1.08, -0.3);
    body.add(box);
  } else if (arch === 'vlogger') {
    const glasses = std('#111111', { roughness: 0.1, metalness: 0.6 });
    head.add(mesh(new THREE.BoxGeometry(0.17, 0.04, 0.012), glasses, 0, 0.012, 0.132));
    const phone = mesh(new THREE.BoxGeometry(0.05, 0.095, 0.01), std('#222', { metalness: 0.5, roughness: 0.3 }), 0, -0.6, 0.05);
    arms[1].add(phone);
    const ring = mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24), new THREE.MeshBasicMaterial({ color: '#fffbe6' }), 0, -0.6, 0.12);
    arms[1].add(ring);
    arms[1].rotation.x = -1.1;
  }

  group.userData = {
    kind: 'batik',
    headY: headY + (role === 'chef' ? 0.38 : 0.2),
    arms,
    body,
    head,
    vlogger: arch === 'vlogger',
    update(t, moving = false, busy = 0) {
      const phase = t * 9;
      if (moving) {
        body.position.y = Math.abs(Math.sin(phase)) * 0.035;
        arms[0].rotation.x = Math.sin(phase) * 0.55;
        if (!this.vlogger) arms[1].rotation.x = -Math.sin(phase) * 0.55;
      } else if (busy > 0) {
        body.position.y = Math.sin(t * 3) * 0.006;
        arms[0].rotation.x = -0.9 + Math.sin(t * 12) * 0.25 * busy;
        if (!this.vlogger) arms[1].rotation.x = -0.9 + Math.cos(t * 12) * 0.25 * busy;
        head.rotation.x = 0.18;
      } else {
        body.position.y = Math.sin(t * 2.2) * 0.008;
        arms[0].rotation.x *= 0.9;
        if (!this.vlogger) arms[1].rotation.x *= 0.9;
        head.rotation.x *= 0.9;
        head.rotation.y = Math.sin(t * 0.7) * 0.15;
      }
    },
  };
  return group;
}

/** Neat, graceful "ayu" tudung: cap + framed face + shoulder drape + brooch */
function buildHijab(head, body, a) {
  const color = HIJAB_COLORS[a.hijab ?? 0] || HIJAB_COLORS[0];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const innerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.82), roughness: 0.6, side: THREE.DoubleSide });
  const R = 0.146;
  // a) top cap down to the brow line
  const cap = mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.43), mat, 0, 0.004, 0);
  cap.scale.set(1, 1.08, 1);
  head.add(cap);
  // inner "anak tudung" band across the forehead
  const band = mesh(new THREE.TorusGeometry(0.128, 0.008, 6, 32, Math.PI * 0.62), innerMat, 0, 0.036, 0.0);
  band.rotation.x = Math.PI / 2 - 0.25;
  band.rotation.z = Math.PI * 0.19;
  head.add(band);
  // b) sides & back — open lune facing the camera (+z)
  const gap = Math.PI * 0.56;
  const sides = mesh(new THREE.SphereGeometry(R + 0.002, 32, 18, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, Math.PI * 0.25, Math.PI * 0.75), mat, 0, 0, 0);
  sides.scale.set(1, 1.08, 1);
  head.add(sides);
  // c) chin wrap
  const chin = mesh(new THREE.SphereGeometry(R + 0.001, 32, 8, 0, Math.PI * 2, Math.PI * 0.73, Math.PI * 0.27), mat, 0, -0.004, 0);
  chin.scale.set(1, 1.08, 1);
  head.add(chin);
  // d) graceful bell-shaped drape over the shoulders (smooth lathe profile)
  const prof = [
    [0.104, 0.0], [0.118, -0.03], [0.15, -0.07], [0.19, -0.11], [0.214, -0.16],
    [0.228, -0.22], [0.234, -0.27], [0.232, -0.295],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const drape = mesh(new THREE.LatheGeometry(prof, 40), mat, 0, 1.425, 0);
  drape.scale.set(1, 1, 0.92);
  body.add(drape);
  // soft hem trim
  const hem = mesh(new THREE.TorusGeometry(0.233, 0.006, 6, 40), innerMat, 0, 1.132, 0);
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.92, 1);
  body.add(hem);
  // f) gold brooch
  const brooch = mesh(new THREE.SphereGeometry(0.017, 12, 10), std('#e6b422', { metalness: 0.25, roughness: 0.3, emissive: '#3a2a00' }), 0.075, 1.4, 0.15);
  body.add(brooch);
}

// ---------------------------------------------------------------------
//  Sprite (uploaded image) characters
// ---------------------------------------------------------------------
const spriteTexCache = new Map();
function spriteTexture(dataURL) {
  if (spriteTexCache.has(dataURL)) return spriteTexCache.get(dataURL);
  const tex = new THREE.TextureLoader().load(dataURL);
  tex.anisotropy = 4;
  spriteTexCache.set(dataURL, tex);
  if (spriteTexCache.size > 40) {
    const firstKey = spriteTexCache.keys().next().value;
    spriteTexCache.get(firstKey).dispose();
    spriteTexCache.delete(firstKey);
  }
  return tex;
}

export function buildSpriteCharacter(dataURL, height = 1.62) {
  const group = new THREE.Group();
  const width = height * (SPRITE_W / SPRITE_H);
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: spriteTexture(dataURL), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(geo, mat);
  plane.castShadow = true;
  group.add(plane);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  group.add(shadow);
  group.userData = {
    kind: 'sprite',
    billboard: plane,
    spriteMaterial: mat,
    headY: height * 0.98,
    update(t, moving = false, busy = 0) {
      if (moving) {
        plane.position.y = Math.abs(Math.sin(t * 9)) * 0.045;
        plane.rotation.z = Math.sin(t * 9) * 0.035;
      } else if (busy > 0) {
        plane.position.y = Math.abs(Math.sin(t * 6)) * 0.015;
        plane.rotation.z = Math.sin(t * 6) * 0.02;
      } else {
        plane.position.y = 0;
        plane.rotation.z = 0;
        plane.scale.y = 1 + Math.sin(t * 2.2) * 0.006;
      }
    },
  };
  return group;
}

/**
 * Build any character from an appearance descriptor.
 *   {type:'batik', gender, pattern, skin, hijab}
 *   {type:'image', dataURL}
 */
export function buildCharacter(appearance, opts = {}) {
  if (appearance && (appearance.type === 'image' || appearance.type === 'gallery') && appearance.dataURL) {
    return buildSpriteCharacter(appearance.dataURL);
  }
  return buildBatikCharacter(appearance && appearance.type === 'batik' ? appearance : defaultAppearance(), opts);
}

// ---------------------------------------------------------------------
//  Lobby turntable preview (own small renderer)
// ---------------------------------------------------------------------
export class CharacterPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    this.camera.position.set(0, 1.05, 4.0);
    this.camera.lookAt(0, 0.86, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a2b, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(2, 3, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc27a, 0.5);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 40), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }));
    base.position.y = -0.03;
    this.scene.add(base);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.current = null;
    this.t = 0;
    this.drag = null;
    this.angle = 0.4;
    this._running = true;
    this._last = performance.now();
    const onDown = (e) => { this.drag = { x: e.clientX, a: this.angle }; };
    const onMove = (e) => { if (this.drag) this.angle = this.drag.a + (e.clientX - this.drag.x) * 0.012; };
    const onUp = () => { this.drag = null; };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this._cleanup = () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  setAppearance(appearance, opts = {}) {
    if (this.current) this.pivot.remove(this.current);
    this.current = buildCharacter(appearance, opts);
    this.pivot.add(this.current);
  }

  _resize() {
    const w = this.canvas.clientWidth || 200;
    const h = this.canvas.clientHeight || 260;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _loop(now) {
    if (!this._running) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;
    if (!this.drag) this.angle += dt * 0.6;
    if (this.current) {
      const ud = this.current.userData;
      if (ud.kind === 'sprite') {
        // sprites always face the camera; wobble a bit instead of rotating
        this.pivot.rotation.y = Math.sin(this.angle) * 0.25;
      } else {
        this.pivot.rotation.y = this.angle;
      }
      ud.update && ud.update(this.t, false, 0);
    }
    if (this.canvas.offsetParent !== null) {
      this._resize();
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this._loop);
  }

  dispose() {
    this._running = false;
    this._cleanup();
    try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch (e) { /* ignore */ }
  }
}
