// =====================================================================
//  WARUNG KITA 3D — Bandar raya ala Kuala Lumpur di luar kedai
//   • Deretan rumah kedai berwarna-warni di seberang jalan + papan tanda
//   • Kereta & teksi lalu-lalang, LRT bertingkat yang bergerak
//   • Skyline: menara berkembar, menara TV, pencakar langit bertirus,
//     ratusan bangunan pejabat & pangsapuri (InstancedMesh)
//   • Masjid berkubah, pokok, lampu jalan
//   • Tingkap & lampu menyala bila malam (setNight)
// =====================================================================
const THREE = window.THREE;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Window-grid facade: returns {map (daytime glass), glow (night emissive)} */
function facadeTextures(seed, cols = 6, rows = 12, style = 'office') {
  const r = seeded(seed);
  const lit = [];
  for (let i = 0; i < cols * rows; i++) lit.push(r() < 0.55);
  const draw = (night) => (g, w, h) => {
    g.fillStyle = night ? '#000' : style === 'office' ? '#9fb3c4' : '#d9cdb8';
    g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const on = lit[y * cols + x];
        if (night) g.fillStyle = on ? (r() < 0.25 ? '#bfe3ff' : '#ffd98a') : '#000';
        else g.fillStyle = style === 'office' ? (on ? '#3d5a73' : '#2f4659') : (on ? '#4a5d6b' : '#6b7c88');
        const pad = style === 'office' ? 0.12 : 0.24;
        g.fillRect(x * cw + cw * pad, y * rh + rh * pad, cw * (1 - pad * 2), rh * (1 - pad * 1.6));
      }
    }
    if (!night && style !== 'office') {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < rows; y += 1) g.fillRect(0, y * rh + rh * 0.9, w, rh * 0.1);
    }
  };
  return { map: canvasTex(128, 256, draw(false)), glow: canvasTex(128, 256, draw(true)) };
}

const SHOP_SIGNS = [
  ['KEDAI RUNCIT', '#c62828'], ['FARMASI', '#2e7d32'], ['RESTORAN MAMAK 24 JAM', '#1565c0'], ['KEDAI GUNTING', '#6a1b9a'],
  ['KEDAI EMAS', '#b8860b'], ['BENGKEL MOTOR', '#37474f'], ['KEDAI KAIN', '#ad1457'], ['PASAR MINI', '#ef6c00'],
  ['KEDAI BUKU', '#00695c'], ['KEDAI TELEFON', '#283593'], ['KLINIK', '#d32f2f'], ['DOBI', '#0277bd'],
  ['KEDAI ROTI', '#8d6e63'], ['KEDAI PERABOT', '#5d4037'],
];
const SHOP_COLORS = ['#f2c14e', '#8fc0a9', '#f78154', '#b4a7d6', '#9ad1d4', '#f4a6a6', '#e9d8a6', '#a3c4f3', '#ffd6a5', '#cdeac0'];

function shophouseTexture(i) {
  const [sign, signCol] = SHOP_SIGNS[i % SHOP_SIGNS.length];
  const wall = SHOP_COLORS[i % SHOP_COLORS.length];
  return canvasTex(256, 384, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    // upper floors: shuttered windows with pastel frames
    for (let f = 0; f < 2; f++) {
      const y = 22 + f * 92;
      for (let k = 0; k < 3; k++) {
        const x = 18 + k * 78;
        g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 4, 66, 74);
        g.fillStyle = '#3b4a54'; g.fillRect(x, y, 58, 66);
        g.fillStyle = '#7fb3a8'; g.fillRect(x, y, 28, 66); g.fillRect(x + 30, y, 28, 66);
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
        for (let s = y + 6; s < y + 64; s += 7) { g.beginPath(); g.moveTo(x, s); g.lineTo(x + 58, s); g.stroke(); }
      }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y + 74, w, 6);
    }
    // signboard
    g.fillStyle = signCol; g.fillRect(8, 210, w - 16, 44);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(12, 214, w - 24, 36);
    g.fillStyle = '#fff';
    let size = 26;
    g.font = `700 ${size}px Fredoka, sans-serif`;
    while (g.measureText(sign).width > w - 36 && size > 12) { size -= 2; g.font = `700 ${size}px Fredoka, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sign, w / 2, 233);
    // ground floor: roller shutter / open shop front
    g.fillStyle = '#2b2b2b'; g.fillRect(14, 262, w - 28, h - 262);
    g.fillStyle = i % 3 === 0 ? '#b0b7bd' : '#ffe9b0';
    g.fillRect(22, 270, w - 44, h - 270);
    if (i % 3 === 0) {
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let s = 274; s < h; s += 6) { g.beginPath(); g.moveTo(22, s); g.lineTo(w - 22, s); g.stroke(); }
    } else {
      const rr = seeded(i * 31 + 7);
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `hsl(${Math.floor(rr() * 360)},60%,55%)`;
        g.fillRect(30 + rr() * (w - 80), 290 + rr() * 70, 14 + rr() * 22, 10 + rr() * 18);
      }
    }
  });
}

/**
 * Bake static meshes that share a material into one geometry each, so the
 * whole city costs a few dozen draw calls instead of several hundred.
 */
function mergeStatic(root, skip) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || Array.isArray(o.material)) return;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  });
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      return g;
    });
    const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let off = 0;
    for (const g of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      off += n;
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    for (const m of meshes) { m.parent.remove(m); }
    root.add(new THREE.Mesh(merged, mat));
  }
}

// ---------------------------------------------------------------------
export function buildCity(scene, { envMap = null, lowQuality = false } = {}) {
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);
  const glowMats = [];           // emissive strength follows night
  const movers = [];             // cars + LRT
  const rnd = seeded(2024);

  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...opts });
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // -------- ground: city concrete + opposite sidewalk ----------------
  const ground = add(new THREE.PlaneGeometry(900, 900), std({ color: 0x8b8e86, roughness: 1 }), 0, -0.03, 0);
  ground.rotation.x = -Math.PI / 2;
  const walk = add(new THREE.PlaneGeometry(300, 2.4), std({ color: 0xb9b2a5 }), 0, 0.012, 15.5);
  walk.rotation.x = -Math.PI / 2;
  const curbMat = std({ color: 0xd8d2c4 });
  for (const z of [7.3, 14.3]) add(new THREE.BoxGeometry(300, 0.12, 0.2), curbMat, 0, 0.06, z);

  // -------- shophouse row across the street (facing the warung) -------
  const row = new THREE.Group();
  root.add(row);
  const shopW = 6;
  for (let i = 0; i < 16; i++) {
    const x = -45 + i * shopW;
    const floors = 3 + (i % 4 === 1 ? 1 : 0);
    const h = floors * 3.4;
    const faceMat = std({ map: shophouseTexture(i) });
    const sideMat = std({ color: SHOP_COLORS[i % SHOP_COLORS.length] });
    const body = add(new THREE.BoxGeometry(shopW - 0.1, h, 9), [sideMat, sideMat, std({ color: 0x8d4b3a }), sideMat, sideMat, faceMat], x, h / 2, 21.5, row);
    void body; // material slot 5 is the -z face: the facade already looks toward the warung
    // five-foot way canopy & pillars
    add(new THREE.BoxGeometry(shopW, 0.25, 2.2), std({ color: 0xece3cf }), x, 3.4, 16.0, row);
    add(new THREE.BoxGeometry(0.3, 3.4, 0.3), std({ color: 0xf2ead8 }), x - shopW / 2 + 0.2, 1.7, 15.1, row);
    // aircon units
    if (i % 2 === 0) add(new THREE.BoxGeometry(0.8, 0.55, 0.35), std({ color: 0xe9e9e9 }), x + 1.5, 5.6, 16.75, row);
    // night shop glow (lit ground floor)
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0 });
    glowMats.push({ mat: glow, kind: 'opacity', max: 0.55 });
    const g = add(new THREE.PlaneGeometry(shopW - 1, 2.6), glow, x, 1.4, 16.95, row);
    g.rotation.y = Math.PI;
    // pitched clay roof
    const roof = add(new THREE.CylinderGeometry(5.2, 5.2, shopW - 0.1, 3, 1, false, Math.PI / 2), std({ color: 0xa0442c }), x, h + 0.91, 21.5, row);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(0.35, 1, 1);
  }

  // -------- street furniture: lamps & trees along both sides ----------
  const poleMat = std({ color: 0x37474f, metalness: 0.5, roughness: 0.4, envMap });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb36b, emissiveIntensity: 0 });
  glowMats.push({ mat: lampHeadMat, kind: 'emissive', max: 2.2 });
  for (let x = -60; x <= 60; x += 15) {
    for (const [z, dir] of [[7.6, 1], [14.0, -1]]) {
      if (Math.abs(x + 4) < 3 && z < 8) continue; // existing lamp in front of the warung
      add(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), poleMat, x, 3, z);
      add(new THREE.BoxGeometry(1.2, 0.08, 0.08), poleMat, x, 5.95, z + dir * 0.55);
      add(new THREE.BoxGeometry(0.5, 0.12, 0.25), lampHeadMat, x, 5.85, z + dir * 1.1);
    }
  }
  const trunkMat = std({ color: 0x7b5b3a });
  const leafMats = [std({ color: 0x2e7d32 }), std({ color: 0x388e3c }), std({ color: 0x1b5e20 })];
  const tree = (x, z, s = 1) => {
    add(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 3 * s, 7), trunkMat, x, 1.5 * s, z);
    const crown = add(new THREE.IcosahedronGeometry(1.6 * s, 0), leafMats[Math.floor(rnd() * 3)], x, 3.6 * s, z);
    crown.scale.y = 0.8;
  };
  for (let x = -55; x <= 55; x += 11) { if (Math.abs(x) > 9) tree(x + 2, 6.4, 0.9 + rnd() * 0.3); }

  // -------- traffic -----------------------------------------------------
  const carColors = [0xd32f2f, 0xffffff, 0x1565c0, 0x212121, 0xb0bec5, 0xf9a825, 0x2e7d32, 0x8e24aa];
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 0 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0000, emissive: 0xff2222, emissiveIntensity: 0 });
  glowMats.push({ mat: headMat, kind: 'emissive', max: 2 }, { mat: tailMat, kind: 'emissive', max: 1.5 });
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 12);
  const wheelMat = std({ color: 0x151515 });
  const glassMat = std({ color: 0x223344, metalness: 0.6, roughness: 0.15, envMap });
  const makeCar = (i) => {
    const car = new THREE.Group();
    const taxi = i % 5 === 2;
    const bus = i % 7 === 4;
    const color = taxi ? 0xc62828 : carColors[i % carColors.length];
    const paint = std({ color, metalness: 0.4, roughness: 0.35, envMap });
    if (bus) {
      add(new THREE.BoxGeometry(9, 2.6, 2.4), paint, 0, 1.7, 0, car);
      add(new THREE.BoxGeometry(8.6, 0.8, 2.45), glassMat, 0, 2.2, 0, car);
      add(new THREE.BoxGeometry(9.02, 0.3, 2.42), std({ color: 0xffffff }), 0, 1.1, 0, car);
    } else {
      add(new THREE.BoxGeometry(4.2, 0.8, 1.8), paint, 0, 0.75, 0, car);
      add(new THREE.BoxGeometry(2.3, 0.7, 1.6), glassMat, -0.2, 1.45, 0, car);
      if (taxi) add(new THREE.BoxGeometry(2.1, 0.06, 1.62), std({ color: 0xffffff }), -0.2, 1.1, 0, car);
    }
    const len = bus ? 4.4 : 2.05;
    for (const sx of [-len * 0.7, len * 0.7]) for (const sz of [-0.85, 0.85]) {
      const w = add(wheelGeo, wheelMat, sx, 0.33, sz * (bus ? 1.25 : 1), car);
      w.rotation.x = Math.PI / 2;
    }
    for (const sz of [-0.55, 0.55]) {
      add(new THREE.BoxGeometry(0.06, 0.18, 0.35), headMat, len + 0.03, bus ? 1.0 : 0.85, sz, car);
      add(new THREE.BoxGeometry(0.06, 0.18, 0.35), tailMat, -len - 0.03, bus ? 1.0 : 0.85, sz, car);
    }
    return car;
  };
  const nCars = lowQuality ? 7 : 12;
  for (let i = 0; i < nCars; i++) {
    const car = makeCar(i);
    const dir = i % 2 === 0 ? 1 : -1;
    car.position.set(-90 + rnd() * 180, 0, dir > 0 ? 9.2 : 12.4);
    car.rotation.y = dir > 0 ? 0 : Math.PI;
    root.add(car);
    movers.push({ obj: car, axis: 'x', dir, speed: 6 + rnd() * 6, min: -95, max: 95 });
  }

  // -------- elevated LRT --------------------------------------------------
  const lrtZ = 32, lrtY = 9;
  const concrete = std({ color: 0xcfcac0 });
  add(new THREE.BoxGeometry(400, 0.8, 3.2), concrete, 0, lrtY, lrtZ);
  for (let x = -150; x <= 150; x += 18) {
    add(new THREE.CylinderGeometry(0.7, 0.8, lrtY, 10), concrete, x, lrtY / 2, lrtZ);
    add(new THREE.BoxGeometry(3.6, 0.6, 1.4), concrete, x, lrtY - 0.6, lrtZ);
  }
  const train = new THREE.Group();
  const trainBody = std({ color: 0xf5f5f5, metalness: 0.3, roughness: 0.4, envMap });
  const stripe = std({ color: 0x1565c0 });
  const trainWin = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xfff1c9, emissiveIntensity: 0 });
  glowMats.push({ mat: trainWin, kind: 'emissive', max: 1.4 });
  for (let c = 0; c < 4; c++) {
    const cx = c * 13;
    add(new THREE.BoxGeometry(12.6, 3, 2.8), trainBody, cx, lrtY + 1.9, 0, train);
    add(new THREE.BoxGeometry(12.62, 0.35, 2.82), stripe, cx, lrtY + 1.0, 0, train);
    add(new THREE.BoxGeometry(11.5, 0.9, 2.84), trainWin, cx, lrtY + 2.4, 0, train);
  }
  train.position.set(-150, 0, lrtZ);
  root.add(train);
  movers.push({ obj: train, axis: 'x', dir: 1, speed: 14, min: -200, max: 200 });

  // -------- skyline: instanced office / apartment blocks -------------------
  const classes = [
    { name: 'tower', w: [9, 16], h: [45, 85], style: 'office', cols: 6, rows: 18, count: lowQuality ? 26 : 46, r: [90, 240] },
    { name: 'mid', w: [12, 22], h: [18, 40], style: 'office', cols: 7, rows: 10, count: lowQuality ? 36 : 75, r: [65, 210] },
    { name: 'flat', w: [14, 26], h: [10, 22], style: 'flat', cols: 8, rows: 6, count: lowQuality ? 36 : 70, r: [42, 150] },
  ];
  const blocked = (x, z, half) =>
    (Math.abs(z - 10.8) < 8 + half) ||                              // the main road
    (z > 14 && z < 27 + half && Math.abs(x) < 52 + half) ||          // shophouse row
    (Math.abs(z - lrtZ) < 3 + half) ||                               // LRT line
    (Math.hypot(x, z) < 20 + half) ||                                // the warung itself
    (Math.hypot(x - 70, z + 30) < 18 + half) ||                      // mosque
    (Math.hypot(x + 35, z + 150) < 30 + half) || (Math.hypot(x - 55, z + 135) < 18 + half) || (Math.hypot(x - 5, z + 200) < 22 + half); // landmarks
  const roofMat = std({ color: 0x6f7378 });
  const tint = new THREE.Color();
  const m4 = new THREE.Matrix4();
  for (const cls of classes) {
    const tex = facadeTextures(cls.name.length * 977, cls.cols, cls.rows, cls.style);
    const side = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6, metalness: cls.style === 'office' ? 0.2 : 0, envMap: cls.style === 'office' ? envMap : null });
    glowMats.push({ mat: side, kind: 'emissive', max: 1.0 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, [side, side, roofMat, roofMat, side, side], cls.count);
    let placed = 0, guard = 0;
    while (placed < cls.count && guard++ < cls.count * 60) {
      const ang = rnd() * Math.PI * 2;
      const rad = cls.r[0] + rnd() * (cls.r[1] - cls.r[0]);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const w = cls.w[0] + rnd() * (cls.w[1] - cls.w[0]);
      const d = w * (0.7 + rnd() * 0.5);
      if (blocked(x, z, Math.max(w, d) / 2)) continue;
      const h = cls.h[0] + rnd() * (cls.h[1] - cls.h[0]);
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(rnd() * 3) * (Math.PI / 2) + (rnd() - 0.5) * 0.3), new THREE.Vector3(w, h, d));
      inst.setMatrixAt(placed, m4);
      const hues = cls.style === 'office' ? [0.56, 0.58, 0.52, 0.1] : [0.08, 0.12, 0.55, 0.0, 0.3];
      tint.setHSL(hues[Math.floor(rnd() * hues.length)], cls.style === 'office' ? 0.15 + rnd() * 0.15 : 0.25 + rnd() * 0.25, 0.75 + rnd() * 0.2);
      inst.setColorAt(placed, tint);
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    root.add(inst);
  }

  // -------- landmarks -------------------------------------------------------
  const steel = new THREE.MeshStandardMaterial({ color: 0xd6dde3, metalness: 0.85, roughness: 0.25, envMap, emissive: 0x9fb6ff, emissiveIntensity: 0 });
  glowMats.push({ mat: steel, kind: 'emissive', max: 0.45 });
  // Twin towers with a skybridge
  const twin = new THREE.Group();
  const tiers = [[7.5, 60], [6.6, 20], [5.6, 14], [4.4, 10], [3.0, 8], [1.6, 6]];
  for (const sx of [-12, 12]) {
    let y = 0;
    for (const [rad, h] of tiers) {
      add(new THREE.CylinderGeometry(rad * 0.94, rad, h, 16), steel, sx, y + h / 2, 0, twin);
      // ring bands
      add(new THREE.TorusGeometry(rad * 0.97, 0.18, 4, 16), steel, sx, y + h, 0, twin).rotation.x = Math.PI / 2;
      y += h;
    }
    add(new THREE.CylinderGeometry(0.15, 0.6, 26, 8), steel, sx, y + 13, 0, twin);
  }
  add(new THREE.BoxGeometry(17, 2.2, 3), steel, 0, 58, 0, twin);
  add(new THREE.BoxGeometry(0.6, 10, 0.6), steel, -6, 53, 0, twin).rotation.z = 0.7;
  add(new THREE.BoxGeometry(0.6, 10, 0.6), steel, 6, 53, 0, twin).rotation.z = -0.7;
  twin.position.set(-35, 0, -150);
  root.add(twin);
  // Telecom tower (menara TV) on a little hill
  const tvTower = new THREE.Group();
  const hill = add(new THREE.SphereGeometry(16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x3f7d3a }), 0, 0, 0, tvTower);
  hill.scale.y = 0.45;
  const towerMat = std({ color: 0xe8e4dc, roughness: 0.6 });
  add(new THREE.CylinderGeometry(1.6, 2.6, 78, 14), towerMat, 0, 39 + 6, 0, tvTower);
  const podMat = new THREE.MeshStandardMaterial({ color: 0xbfd7ea, metalness: 0.5, roughness: 0.3, envMap, emissive: 0x88ccff, emissiveIntensity: 0 });
  glowMats.push({ mat: podMat, kind: 'emissive', max: 0.8 });
  const pod = add(new THREE.SphereGeometry(7, 20, 12), podMat, 0, 84, 0, tvTower);
  pod.scale.y = 0.75;
  add(new THREE.CylinderGeometry(7.4, 7.4, 1.2, 20), towerMat, 0, 84, 0, tvTower);
  add(new THREE.CylinderGeometry(0.25, 0.8, 22, 8), steel, 0, 100, 0, tvTower);
  tvTower.position.set(55, 0, -135);
  root.add(tvTower);
  // Tapering supertall with a faceted spire
  const tall = new THREE.Group();
  const glassMat2 = new THREE.MeshStandardMaterial({ color: 0x8fb4cf, metalness: 0.75, roughness: 0.2, envMap, emissive: 0x7fb0ff, emissiveIntensity: 0 });
  glowMats.push({ mat: glassMat2, kind: 'emissive', max: 0.35 });
  let ty = 0;
  for (let k = 0; k < 7; k++) {
    const rad = 11 - k * 1.25, h = 18 - k;
    add(new THREE.CylinderGeometry(rad * 0.9, rad, h, 6), glassMat2, 0, ty + h / 2, 0, tall).rotation.y = k * 0.12;
    ty += h;
  }
  add(new THREE.ConeGeometry(2.2, 40, 6), steel, 0, ty + 20, 0, tall);
  tall.position.set(5, 0, -200);
  root.add(tall);
  // Mosque with a dome & minaret
  const mosque = new THREE.Group();
  const white = std({ color: 0xf5f1e8 });
  const domeMat = std({ color: 0x1e88e5, metalness: 0.3, roughness: 0.35, envMap });
  add(new THREE.BoxGeometry(20, 8, 20), white, 0, 4, 0, mosque);
  add(new THREE.CylinderGeometry(7, 7, 2, 24), white, 0, 9, 0, mosque);
  add(new THREE.SphereGeometry(7, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 10, 0, mosque);
  add(new THREE.ConeGeometry(0.4, 3, 8), std({ color: 0xd4af37, metalness: 0.6, envMap }), 0, 18.4, 0, mosque);
  for (const [mx, mz] of [[11, 11], [-11, 11]]) {
    add(new THREE.CylinderGeometry(1, 1.2, 26, 10), white, mx, 13, mz, mosque);
    add(new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, mx, 26, mz, mosque);
  }
  const mosqueGlow = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe6a0, emissiveIntensity: 0 });
  glowMats.push({ mat: mosqueGlow, kind: 'emissive', max: 1.2 });
  for (let k = -2; k <= 2; k++) add(new THREE.PlaneGeometry(2, 3.4), mosqueGlow, k * 3.6, 3.5, -10.05, mosque).rotation.y = Math.PI;
  mosque.position.set(70, 0, -30);
  mosque.rotation.y = -0.4;
  root.add(mosque);

  // aircraft warning lights on top of the tallest landmarks
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const beacons = [];
  for (const [x, y, z] of [[-47, 144, -150], [-23, 144, -150], [55, 112, -135], [5, 158, -200]]) {
    const b = add(new THREE.SphereGeometry(0.9, 8, 6), redMat, x, y, z);
    beacons.push(b);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  const dynamic = new Set(beacons);
  for (const m of movers) m.obj.traverse((o) => dynamic.add(o));
  mergeStatic(root, dynamic);

  // ---------------------------------------------------------------------
  return {
    group: root,
    setNight(n) {
      for (const g of glowMats) {
        if (g.kind === 'opacity') g.mat.opacity = n * g.max;
        else g.mat.emissiveIntensity = n * g.max;
      }
    },
    update(dt, t) {
      for (const m of movers) {
        m.obj.position[m.axis] += m.dir * m.speed * dt;
        if (m.obj.position[m.axis] > m.max) m.obj.position[m.axis] = m.min;
        if (m.obj.position[m.axis] < m.min) m.obj.position[m.axis] = m.max;
      }
      const blink = Math.sin(t * 3) > 0.2;
      for (const b of beacons) b.visible = blink;
    },
  };
}
