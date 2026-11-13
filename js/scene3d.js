// =====================================================================
//  WARUNG KITA 3D — Three.js (r128) scene
//   Malaysian warung / kopitiam environment, day–night cycle,
//   wooden signboard, DuitNow standee, 3 workstations with smooth
//   camera transitions, 3D food stacking, steel-mug Teh Tarik pouring,
//   animated customers & workers.
// =====================================================================
import {
  FOOD_INGREDIENTS, DRINK_INGREDIENTS, FOOD_MENU, DRINK_MENU, DUITNOW_PINK, rm,
} from './config.js';
import { buildCharacter } from './characters.js';
import { buildCity } from './city.js';

const THREE = window.THREE;

// ---------------------------------------------------------------------
//  Layout (metres)
// ---------------------------------------------------------------------
export const STATION_LAYOUT = {
  cashier: {
    counter: new THREE.Vector3(-3.3, 0, 0.55),
    worker: new THREE.Vector3(-3.75, 0, -0.1),
    cam: { pos: new THREE.Vector3(-0.65, 2.7, 2.85), look: new THREE.Vector3(-3.6, 0.4, 0.3) },
    fp: { eye: new THREE.Vector3(-3.66, 1.6, 0.02), look: new THREE.Vector3(-3.35, 1.18, 1.6) },
  },
  chef: {
    counter: new THREE.Vector3(0, 0, -1.85),
    worker: new THREE.Vector3(-0.15, 0, -2.75),
    cam: { pos: new THREE.Vector3(0.1, 2.05, 0.05), look: new THREE.Vector3(0.0, 0.5, -1.95) },
    fp: { eye: new THREE.Vector3(-0.12, 1.62, -2.6), look: new THREE.Vector3(0.0, 0.42, -1.55) },
  },
  drinks: {
    counter: new THREE.Vector3(3.3, 0, -1.85),
    worker: new THREE.Vector3(3.0, 0, -2.75),
    cam: { pos: new THREE.Vector3(3.42, 2.05, 0.0), look: new THREE.Vector3(3.3, 0.55, -1.95) },
    fp: { eye: new THREE.Vector3(3.22, 1.62, -2.6), look: new THREE.Vector3(3.2, 0.45, -1.5) },
  },
  overview: {
    cam: { pos: new THREE.Vector3(7.6, 5.4, 10.5), look: new THREE.Vector3(0, 0.9, -0.5) },
  },
};

const QUEUE_ORIGIN = new THREE.Vector3(-3.3, 0, 1.5);
const QUEUE_DIR = new THREE.Vector3(-0.62, 0, 0.78); // queue snakes away toward the side wall
const STREET_SPAWN = new THREE.Vector3(-1.2, 0, 9.5);
const PICKUP = new THREE.Vector3(1.65, 1.05, -1.45);

const TABLES = [
  new THREE.Vector3(0.4, 0, 1.4),
  new THREE.Vector3(2.7, 0, 1.25),
  new THREE.Vector3(4.9, 0, 1.5),
  new THREE.Vector3(1.4, 0, 3.4),
  new THREE.Vector3(3.9, 0, 3.4),
];
const SEATS = [];
TABLES.forEach((t) => {
  SEATS.push(new THREE.Vector3(t.x - 0.62, 0, t.z), new THREE.Vector3(t.x + 0.62, 0, t.z));
});

// ---------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.userData = { canvas: c };
  return t;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seeded(seed) {
  let s = seed || 1;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

// ---------------------------------------------------------------------
//  Procedural textures
// ---------------------------------------------------------------------
function teakTexture(rep = [1, 1], tone = '#8a5a2b') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = tone; g.fillRect(0, 0, w, h);
    const r = seeded(42);
    for (let y = 0; y < h; y += 2) {
      const off = Math.sin(y * 0.05) * 8 + Math.sin(y * 0.21) * 3;
      g.strokeStyle = `rgba(${40 + r() * 30},${20 + r() * 15},${5},${0.08 + r() * 0.18})`;
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath();
      g.moveTo(0, y + off * 0.2);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + y * 0.1) * 1.5 + off * 0.2);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(50,25,8,0.25)';
      g.beginPath();
      g.ellipse(r() * w, r() * h, 6 + r() * 10, 2 + r() * 4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,220,170,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }, rep);
}

function marbleTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
    const r = seeded(7);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(120,120,130,${0.12 + r() * 0.25})`;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath();
      let x = r() * w, y = r() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        const nx = x + (r() - 0.3) * 90, ny = y + (r() - 0.5) * 60;
        g.quadraticCurveTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 50, nx, ny);
        x = nx; y = ny;
      }
      g.stroke();
    }
  });
}

function mosaicTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const border = i === 0 || j === 0;
        const diamond = (Math.abs(i - 3.5) + Math.abs(j - 3.5)) < 2.6;
        g.fillStyle = border ? '#7a2e22' : diamond ? '#2f6f5e' : ((i + j) % 2 ? '#efe6d2' : '#e5d9bf');
        g.fillRect(i * s, j * s, s, s);
        g.strokeStyle = 'rgba(90,80,60,0.45)';
        g.lineWidth = 2;
        g.strokeRect(i * s + 1, j * s + 1, s - 2, s - 2);
      }
    }
  }, [7, 5]);
}

function wallTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#f2e3c2'; g.fillRect(0, 0, w, h);
    const tileTop = h * 0.62;
    g.fillStyle = '#3e8f78'; g.fillRect(0, tileTop, w, h - tileTop);
    const tw = 32, th = 16;
    g.strokeStyle = 'rgba(230,245,235,0.65)'; g.lineWidth = 2;
    for (let y = tileTop; y < h; y += th) {
      const row = Math.round((y - tileTop) / th);
      for (let x = (row % 2) * -tw / 2; x < w; x += tw) g.strokeRect(x, y, tw, th);
    }
    g.fillStyle = '#7a2e22'; g.fillRect(0, tileTop - 10, w, 10);
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * tileTop, 2, 2);
  }, [3, 1]);
}

function asphaltTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3a3d42'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      const v = 40 + Math.random() * 50;
      g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }, [12, 3]);
}

function softDotTexture() {
  return canvasTexture(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, w);
  });
}

function emojiTexture(emoji, size = 128) {
  return canvasTexture(size, size, (g, w) => {
    g.font = `${w * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, w / 2, w / 2 + w * 0.05);
  });
}

// ---------------------------------------------------------------------
//  Sky keyframes (hour → colours & light levels)
// ---------------------------------------------------------------------
const SKY_KEYS = [
  { h: 7.0,  top: 0x6b8fc9, bottom: 0xffc59a, sun: 0.55, hemi: 0.55, lamp: 0.35, sunColor: 0xffc58a },
  { h: 8.5,  top: 0x4a8fe0, bottom: 0xcfe9ff, sun: 0.95, hemi: 0.72, lamp: 0.12, sunColor: 0xfff1d6 },
  { h: 13.0, top: 0x3a86e8, bottom: 0xbfe2ff, sun: 1.1,  hemi: 0.8,  lamp: 0.08, sunColor: 0xffffff },
  { h: 16.5, top: 0x4b88d6, bottom: 0xffe2b0, sun: 0.95, hemi: 0.7,  lamp: 0.15, sunColor: 0xffe2b0 },
  { h: 18.6, top: 0x3c5a9a, bottom: 0xff8f5a, sun: 0.55, hemi: 0.5,  lamp: 0.65, sunColor: 0xff9a5a },
  { h: 19.6, top: 0x251f4f, bottom: 0xb2557a, sun: 0.12, hemi: 0.32, lamp: 1.0,  sunColor: 0xff7a6a },
  { h: 21.0, top: 0x0b1030, bottom: 0x2c2b5a, sun: 0.0,  hemi: 0.22, lamp: 1.15, sunColor: 0x8899ff },
  { h: 24.0, top: 0x04061a, bottom: 0x131938, sun: 0.0,  hemi: 0.17, lamp: 1.2,  sunColor: 0x8899ff },
];

function sampleSky(hour) {
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (hour >= SKY_KEYS[i].h && hour <= SKY_KEYS[i + 1].h) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  if (hour < SKY_KEYS[0].h) { a = b = SKY_KEYS[0]; }
  const t = a === b ? 0 : (hour - a.h) / (b.h - a.h);
  const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return {
    top: c(a.top, b.top), bottom: c(a.bottom, b.bottom), sunColor: c(a.sunColor, b.sunColor),
    sun: lerp(a.sun, b.sun, t), hemi: lerp(a.hemi, b.hemi, t), lamp: lerp(a.lamp, b.lamp, t),
  };
}

// =====================================================================
//  Scene3D
// =====================================================================
export class Scene3D {
  constructor(canvas, { quality = 'auto' } = {}) {
    this.canvas = canvas;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 500;
    this.lowQuality = quality === 'low' || (quality === 'auto' && mobile);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowQuality ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 900);
    this.camPos = STATION_LAYOUT.overview.cam.pos.clone();
    this.camLook = STATION_LAYOUT.overview.cam.look.clone();
    this.camTarget = { pos: this.camPos.clone(), look: this.camLook.clone() };
    this.view = 'overview';
    this.fp = false;      // first-person (POV) mode
    this.fpYaw = 0;
    this.fpPitch = 0;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.time = 0;
    this.hour = 7;
    this.lampLevel = 0.3;
    this.spriteTint = new THREE.Color(1, 1, 1);
    this.dotTex = softDotTexture();
    this.particles = [];
    this.tweens = [];
    this.customers = new Map();
    this.seatOwner = new Array(SEATS.length).fill(null);
    this.workers = {};
    this.workerKeys = {};
    this.bumps = [];
    this.flames = [];
    this.fans = [];
    this.lampMats = [];
    this.moodTex = {};

    this._buildSky();
    this._buildLights();
    this._buildBuilding();
    this._buildStreet();
    this._buildFurniture();
    this._buildCashier();
    this._buildChef();
    this._buildDrinks();
    this._applyMetalEnv();
    this.setRestaurantName('Warung Kita');
    this.setTimeOfDay(7);

    this._initLookDrag();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  // ------------------------------------------------------------------
  //  Environment
  // ------------------------------------------------------------------
  /** Procedural studio environment so stainless steel actually looks like steel */
  _applyMetalEnv() {
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const geo = new THREE.SphereGeometry(10, 32, 16);
      const pos = geo.attributes.position;
      const colors = [];
      const lo = new THREE.Color(0x3b2a1c), mid = new THREE.Color(0x9fb3bd), hi = new THREE.Color(0xfff6e6);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 10;
        const c = y < 0 ? lo.clone().lerp(mid, y + 1) : mid.clone().lerp(hi, y);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      envScene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      for (const [x, y, z, ry] of [[0, 7, 0, 0], [-7, 3, 2, Math.PI / 2], [6, 4, -3, -Math.PI / 2]]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), panelMat);
        p.position.set(x, y, z);
        if (y > 6) p.rotation.x = Math.PI / 2; else p.rotation.y = ry;
        envScene.add(p);
      }
      this.envMap = pmrem.fromScene(envScene, 0.035).texture;
      pmrem.dispose();
      this.scene.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          if (m && m.isMeshStandardMaterial && m.metalness >= 0.3 && !m.envMap) { m.envMap = this.envMap; m.envMapIntensity = 0.9; m.needsUpdate = true; }
        }
      });
    } catch (e) {
      console.warn('[scene] env map unavailable', e);
    }
  }

  _buildSky() {
    const uniforms = {
      topColor: { value: new THREE.Color(0x4a8fe0) },
      bottomColor: { value: new THREE.Color(0xcfe9ff) },
      offset: { value: 4 },
      exponent: { value: 0.7 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec3 vWorldPosition;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent;
        varying vec3 vWorldPosition;
        void main(){ float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0); }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 16), mat);
    this.skyUniforms = uniforms;
    this.scene.add(this.sky);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    const r = seeded(99);
    for (let i = 0; i < 500; i++) {
      const th = r() * Math.PI * 2, ph = r() * Math.PI * 0.45;
      pts.push(400 * Math.cos(th) * Math.sin(ph), 400 * Math.cos(ph) + 10, 400 * Math.sin(th) * Math.sin(ph));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);

    // sun & moon discs
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color: 0xfff2c0, fog: false, depthWrite: false }));
    this.sunDisc.scale.set(46, 46, 1);
    this.scene.add(this.sunDisc);
    this.moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color: 0xdfe8ff, fog: false, depthWrite: false, transparent: true }));
    this.moonDisc.scale.set(26, 26, 1);
    this.scene.add(this.moonDisc);

    this.scene.fog = new THREE.Fog(0xcfe9ff, 70, 430);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6b5434, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.position.set(10, 15, 10);
    this.sun.castShadow = !this.lowQuality;
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera;
      sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 60;
      this.sun.shadow.bias = -0.0008;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0xfff0dd, 0.18);
    this.scene.add(this.ambient);

    this.interiorLights = [];
    for (const p of [[-3.2, 2.9, 0.4], [0, 2.9, -1.6], [3.3, 2.9, -1.6], [2.5, 2.9, 2.4]]) {
      const l = new THREE.PointLight(0xffd59a, 0.5, 8, 1.6);
      l.position.set(p[0], p[1], p[2]);
      this.scene.add(l);
      this.interiorLights.push(l);
    }
    this.streetLight = new THREE.PointLight(0xffb36b, 0, 14, 1.5);
    this.streetLight.position.set(-4, 4.2, 7.2);
    this.scene.add(this.streetLight);
  }

  _box(w, h, d, mat, x, y, z, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = receive;
    this.scene.add(m);
    return m;
  }

  _buildBuilding() {
    const floorMat = new THREE.MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.55 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 9.2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.5);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
    this._box(13, 3.6, 0.2, wallMat, 0, 1.8, -4.15);
    const sideTex = wallTexture(); sideTex.repeat.set(2, 1);
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9 });
    this._box(0.2, 3.6, 9.2, sideMat, -6.6, 1.8, 0.5);
    this._box(0.2, 3.6, 9.2, sideMat, 6.6, 1.8, 0.5);

    // exposed ceiling beams (cut-away roof so the overview camera can see inside)
    const beamMat = new THREE.MeshStandardMaterial({ map: teakTexture([4, 1], '#5d3a1a'), roughness: 0.8 });
    for (const z of [-3.2, -0.8, 1.6, 4.0]) this._box(13.2, 0.18, 0.16, beamMat, 0, 3.55, z, { cast: false });

    // five-foot-way pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf0e3c4, roughness: 0.85 });
    for (const x of [-6.45, -2.15, 2.15, 6.45]) {
      this._box(0.4, 3.6, 0.4, pillarMat, x, 1.8, 5.0);
      this._box(0.5, 0.25, 0.5, new THREE.MeshStandardMaterial({ color: 0x7a2e22 }), x, 0.12, 5.0);
    }
    // front fascia beam + zinc awning
    this._box(13.4, 0.35, 0.45, pillarMat, 0, 3.55, 5.0);
    // signboard (front & a smaller one visible inside)
    this.signTex = canvasTexture(1024, 192, () => {});
    const signMat = new THREE.MeshStandardMaterial({ map: this.signTex, roughness: 0.6 });
    const frameMat = new THREE.MeshStandardMaterial({ map: teakTexture([2, 1], '#4a2a10'), roughness: 0.7 });
    const sign = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.05, 0.12), [frameMat, frameMat, frameMat, frameMat, signMat, frameMat]);
    board.castShadow = true;
    sign.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.85, 1.25, 0.08), frameMat);
    frame.position.z = -0.06;
    sign.add(frame);
    sign.position.set(0, 4.45, 5.2);
    this.scene.add(sign);
    this.signboard = sign;
    // inside sign above the back wall
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.68), signMat);
    inner.position.set(1.6, 3.05, -4.03);
    this.scene.add(inner);

    // menu chalkboard
    this.menuTex = canvasTexture(1024, 640, (g, w, h) => this._drawMenuBoard(g, w, h));
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: this.menuTex, roughness: 0.9 }));
    menu.position.set(-1.75, 2.35, -4.03);
    this.scene.add(menu);
    this._box(2.52, 1.62, 0.04, frameMat, -1.75, 2.35, -4.06, { cast: false });
    // menu board near the cashier (customers' side) too
    const menu2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map: this.menuTex, roughness: 0.9 }));
    menu2.position.set(-6.48, 2.2, 0.6);
    menu2.rotation.y = Math.PI / 2;
    this.scene.add(menu2);

    // fluorescent tubes + hanging lamps
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 0.4 });
    this.lampMats.push(tubeMat);
    for (const x of [-4.5, 4.5]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), tubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(x, 3.0, -4.0);
      this.scene.add(tube);
    }
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2f6f5e, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    for (const l of this.interiorLights) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      cord.position.set(l.position.x, 3.3, l.position.z);
      this.scene.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 20, 1, true), shadeMat);
      shade.position.set(l.position.x, 3.0, l.position.z);
      this.scene.add(shade);
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffd27a, emissiveIntensity: 0.5 });
      this.lampMats.push(bulbMat);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bulbMat);
      bulb.position.set(l.position.x, 2.9, l.position.z);
      this.scene.add(bulb);
    }

    // ceiling fans
    const fanMat = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.6 });
    for (const [x, z] of [[-3.2, 2.2], [1.6, 0.2], [4.2, 2.6]]) {
      const fan = new THREE.Group();
      fan.position.set(x, 3.2, z);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), fanMat);
      rod.position.y = 0.2;
      fan.add(rod);
      fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 16), fanMat));
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.13), fanMat);
        blade.position.set(Math.cos(i * 2.094) * 0.36, -0.02, Math.sin(i * 2.094) * 0.36);
        blade.rotation.y = -i * 2.094;
        fan.add(blade);
      }
      this.scene.add(fan);
      this.fans.push(fan);
    }

    // shelves with tins behind the drinks station
    const shelfMat = new THREE.MeshStandardMaterial({ map: teakTexture([2, 1]), roughness: 0.7 });
    for (const y of [1.55, 2.05]) this._box(2.4, 0.05, 0.3, shelfMat, 3.3, y, -3.9, { cast: false });
    const tinColors = [0x2e7d32, 0xc62828, 0xf9a825, 0x6d4c41, 0x1565c0, 0xef6c00];
    const r = seeded(5);
    for (const y of [1.58, 2.08]) {
      for (let i = 0; i < 7; i++) {
        const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2 + r() * 0.08, 14), new THREE.MeshStandardMaterial({ color: tinColors[Math.floor(r() * tinColors.length)], roughness: 0.4, metalness: 0.3 }));
        tin.position.set(2.3 + i * 0.32, y + 0.12, -3.9);
        this.scene.add(tin);
      }
    }
    // potted plants
    for (const [x, z] of [[-6.0, 4.3], [6.0, 4.3], [-0.8, -3.7]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 14), new THREE.MeshStandardMaterial({ color: 0xa0522d }));
      pot.position.set(x, 0.2, z);
      this.scene.add(pot);
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 }));
        leaf.scale.set(0.5, 1.4, 0.25);
        leaf.position.set(x + Math.cos(i) * 0.12, 0.65, z + Math.sin(i) * 0.12);
        leaf.rotation.z = Math.cos(i) * 0.5;
        leaf.rotation.x = Math.sin(i) * 0.5;
        this.scene.add(leaf);
      }
    }
  }

  _buildStreet() {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(300, 2.2), new THREE.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.95 }));
    side.rotation.x = -Math.PI / 2;
    side.position.set(0, 0.01, 6.2);
    side.receiveShadow = true;
    this.scene.add(side);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 7), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 10.8);
    road.material.map.repeat.set(80, 1.6);
    road.receiveShadow = true;
    this.scene.add(road);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf6d04d });
    for (let x = -150; x < 150; x += 4) {
      if (Math.abs(x) < 3) continue; // keep the zebra crossing outside the warung clean
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), lineMat);
      ln.rotation.x = -Math.PI / 2;
      ln.position.set(x, 0.02, 10.8);
      this.scene.add(ln);
    }
    // palm trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6b45, roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.8, side: THREE.DoubleSide });
    for (const [x, z] of [[-14, 6], [14, 5], [-9, 6.3], [9, 6.3]]) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 5, 8), trunkMat);
      trunk.position.y = 2.5;
      trunk.rotation.z = 0.08;
      tree.add(trunk);
      for (let i = 0; i < 7; i++) {
        const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4), frondMat);
        frond.position.set(0.2, 5, 0);
        frond.rotation.set(-1.0, (i / 7) * Math.PI * 2, 0, 'YXZ');
        frond.translateY(1.0);
        tree.add(frond);
      }
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    }
    // the surrounding Kuala Lumpur-style city (shophouses, traffic, LRT, skyline)
    this.city = buildCity(this.scene, { lowQuality: this.lowQuality });
    // street lamp
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.5, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8), poleMat);
    pole.position.set(-4, 2.2, 6.5);   // on the pavement, not the road
    this.scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), poleMat);
    arm.position.set(-4, 4.4, 6.9);
    this.scene.add(arm);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb36b, emissiveIntensity: 0 });
    this.lampMats.push(headMat);
    this.streetHeadMat = headMat;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), headMat);
    head.position.set(-4, 4.32, 7.3);
    this.scene.add(head);
  }

  _buildFurniture() {
    const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.25 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 });
    const stoolMat = new THREE.MeshStandardMaterial({ map: teakTexture([1, 1], '#7b4a22'), roughness: 0.6 });
    for (const t of TABLES) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 32), marble);
      top.position.set(t.x, 0.76, t.z);
      top.castShadow = top.receiveShadow = true;
      this.scene.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.74, 10), iron);
      leg.position.set(t.x, 0.37, t.z);
      this.scene.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 18), iron);
      foot.position.set(t.x, 0.015, t.z);
      this.scene.add(foot);
      // cups on table
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      cup.position.set(t.x + 0.12, 0.82, t.z - 0.08);
      this.scene.add(cup);
      for (const dx of [-0.62, 0.62]) {
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), stoolMat);
        seat.position.set(t.x + dx, 0.46, t.z + 0.2);
        seat.castShadow = true;
        this.scene.add(seat);
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), iron);
        sl.position.set(t.x + dx, 0.22, t.z + 0.2);
        this.scene.add(sl);
      }
    }
  }

  // ------------------------------------------------------------------
  //  Cashier station
  // ------------------------------------------------------------------
  _buildCashier() {
    const c = STATION_LAYOUT.cashier.counter;
    const teak = new THREE.MeshStandardMaterial({ map: teakTexture([2, 1]), roughness: 0.65 });
    const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.25 });
    this._box(1.9, 0.95, 0.7, teak, c.x, 0.475, c.z);
    this._box(2.0, 0.05, 0.8, marble, c.x, 0.975, c.z);
    // glass display case with kuih
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.25, roughness: 0.05 });
    const caseM = this._box(0.6, 0.35, 0.45, glass, c.x - 0.55, 1.18, c.z + 0.05, { cast: false });
    caseM.renderOrder = 2;
    const kuihCols = [0x4caf50, 0xe91e63, 0xffeb3b, 0x8d6e63];
    for (let i = 0; i < 8; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: kuihCols[i % 4] }));
      k.position.set(c.x - 0.75 + (i % 4) * 0.13, 1.03, c.z - 0.05 + Math.floor(i / 4) * 0.15);
      this.scene.add(k);
    }

    // cash register
    const reg = new THREE.Group();
    reg.position.set(c.x + 0.35, 1.0, c.z - 0.12);
    const regMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.4, metalness: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.4), regMat);
    base.position.y = 0.06;
    reg.add(base);
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: 0x263238 }));
    drawer.position.set(0, 0.04, -0.03);
    reg.add(drawer);
    this.drawer = drawer;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.22), regMat);
    top.position.set(0, 0.19, 0.04);
    top.rotation.x = -0.35;
    reg.add(top);
    this.registerScreenTex = canvasTexture(256, 96, (g, w, h) => this._drawRegisterScreen(g, w, h, 'RM 0.00'));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: this.registerScreenTex }));
    screen.position.set(0, 0.32, -0.04);
    screen.rotation.y = Math.PI;
    screen.rotation.x = 0.2;
    reg.add(screen);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6), regMat);
    pole.position.set(0, 0.26, -0.02);
    reg.add(pole);
    this.scene.add(reg);
    this.register = reg;

    // DuitNow QR standee (faces the customer)
    this.qrTex = canvasTexture(256, 384, () => {});
    const standee = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.012), [
      new THREE.MeshStandardMaterial({ color: DUITNOW_PINK }), new THREE.MeshStandardMaterial({ color: DUITNOW_PINK }),
      new THREE.MeshStandardMaterial({ color: DUITNOW_PINK }), new THREE.MeshStandardMaterial({ color: DUITNOW_PINK }),
      new THREE.MeshStandardMaterial({ map: this.qrTex, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: this.qrTex, roughness: 0.5 }),
    ]);
    plate.position.y = 0.2;
    plate.rotation.x = -0.12;
    standee.add(plate);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    standee.add(foot);
    standee.position.set(c.x - 0.15, 1.0, c.z + 0.26);
    standee.rotation.y = 0.55;
    this.scene.add(standee);
    this.qrStandee = standee;

    // PayWave terminal
    const term = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.18), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4 }));
    term.add(tb);
    this.termLedMat = new THREE.MeshBasicMaterial({ color: 0x225522 });
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.05), this.termLedMat);
    led.rotation.x = -Math.PI / 2;
    led.position.set(0, 0.017, -0.04);
    term.add(led);
    term.position.set(c.x + 0.8, 1.02, c.z + 0.12);
    term.rotation.y = 0.3;
    this.scene.add(term);
    this.terminal = term;

    // little "Terima Kasih" mat + napkin holder
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0xd32f2f }));
    holder.position.set(c.x - 0.9, 1.05, c.z + 0.2);
    this.scene.add(holder);
  }

  _drawRegisterScreen(g, w, h, text) {
    g.fillStyle = '#0b2614'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5dff8a';
    g.font = 'bold 44px "JetBrains Mono", monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(text, w - 14, h / 2 + 2);
  }

  setRegisterDisplay(text) {
    const tex = this.registerScreenTex;
    const c = tex.userData.canvas;
    this._drawRegisterScreen(c.getContext('2d'), c.width, c.height, text);
    tex.needsUpdate = true;
  }

  openDrawer() {
    const d = this.drawer;
    this._tween(0.25, (t) => { d.position.z = -0.03 + easeOutBack(t) * 0.26; }, () => {
      setTimeout(() => this._tween(0.35, (t) => { d.position.z = 0.23 - t * 0.26; }), 900);
    });
  }

  terminalFlash(color = 0x39ff6a) {
    this.termLedMat.color.setHex(color);
    setTimeout(() => this.termLedMat.color.setHex(0x225522), 900);
  }

  // ------------------------------------------------------------------
  //  Chef station
  // ------------------------------------------------------------------
  _buildChef() {
    const c = STATION_LAYOUT.chef.counter;
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8c2c8, roughness: 0.35, metalness: 0.6 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.5 });
    this._box(2.3, 0.9, 0.85, steel, c.x, 0.45, c.z);
    // stove block (with flame slots)
    this._box(0.95, 0.1, 0.62, darkSteel, c.x, 0.95, c.z);
    // griddle / tawa
    const griddle = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 36), new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.35, metalness: 0.6 }));
    griddle.position.set(c.x, 1.0125, c.z);
    griddle.receiveShadow = true;
    this.scene.add(griddle);
    this.griddleGlowMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.37, 36), this.griddleGlowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(c.x, 1.027, c.z);
    this.scene.add(glow);

    // flames peeking around the griddle
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const flameCore = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 8), i % 2 ? flameMat : flameCore);
      f.position.set(c.x + Math.cos(a) * 0.4, 1.02, c.z + Math.sin(a) * 0.29);
      f.userData.phase = Math.random() * 6;
      this.scene.add(f);
      this.flames.push(f);
    }
    // wok on second burner
    const wok = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
    wok.position.set(c.x - 0.82, 1.15, c.z - 0.05);
    this.scene.add(wok);
    const wokFlame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 10), flameMat);
    wokFlame.position.set(c.x - 0.82, 0.96, c.z - 0.05);
    wokFlame.userData.phase = 1;
    this.scene.add(wokFlame);
    this.flames.push(wokFlame);
    // exhaust hood
    this._box(1.6, 0.35, 0.8, steel, c.x - 0.2, 2.75, c.z - 0.2, { cast: false });
    // ingredient trays (gastronorm pans) along the back
    const r = seeded(11);
    const ingIds = Object.keys(FOOD_INGREDIENTS);
    for (let i = 0; i < 8; i++) {
      const id = ingIds[(i * 2) % ingIds.length];
      const pan = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.16), steel);
      pan.position.set(c.x + 0.6 + (i % 3) * 0.2, 0.94, c.z - 0.25 + Math.floor(i / 3) * 0.18);
      if (pan.position.x > c.x + 1.08) continue;
      this.scene.add(pan);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: FOOD_INGREDIENTS[id].color, roughness: 0.8 }));
      fill.position.copy(pan.position);
      fill.position.y += 0.025 + r() * 0.005;
      this.scene.add(fill);
    }
    // the serving plate (sits on the griddle while cooking)
    this.plateGroup = new THREE.Group();
    this.plateBase = new THREE.Vector3(c.x, 1.03, c.z + 0.02);
    this.plateGroup.position.copy(this.plateBase);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.025, 36), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    plate.position.y = 0.012;
    plate.castShadow = plate.receiveShadow = true;
    this.plateGroup.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.008, 6, 36), new THREE.MeshStandardMaterial({ color: 0x2f6f5e }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.025;
    this.plateGroup.add(rim);
    this.stackGroup = new THREE.Group();
    this.stackGroup.position.y = 0.026;
    this.plateGroup.add(this.stackGroup);
    this.scene.add(this.plateGroup);
    this.stack = [];
    this.cookHeat = 0;
    this.cookActive = false;

    // pickup pass shelf
    this._box(0.8, 0.05, 0.4, new THREE.MeshStandardMaterial({ map: teakTexture([1, 1]), roughness: 0.6 }), PICKUP.x, PICKUP.y - 0.05, PICKUP.z);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.25 }));
    bell.position.set(PICKUP.x + 0.3, PICKUP.y - 0.02, PICKUP.z);
    this.scene.add(bell);
    this._box(0.1, 1.0, 0.1, steel, PICKUP.x - 0.4, 0.5, PICKUP.z, { cast: false });
    this._box(0.1, 1.0, 0.1, steel, PICKUP.x + 0.4, 0.5, PICKUP.z, { cast: false });
  }

  _ingredientMesh(id) {
    const def = FOOD_INGREDIENTS[id];
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
    const g = new THREE.Group();
    const add = (geo, m = mat, x = 0, y = 0, z = 0) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.castShadow = true; g.add(mm); return mm; };
    switch (def.shape) {
      case 'dome': {
        const d = add(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
        d.scale.y = 0.75;
        add(new THREE.ConeGeometry(0.035, 0.05, 6), new THREE.MeshStandardMaterial({ color: 0x3b8f3a }), 0.0, 0.085, 0);
        break;
      }
      case 'blob': { const b = add(new THREE.SphereGeometry(0.05, 14, 10)); b.scale.set(1.1, 0.45, 0.9); b.position.y = 0.015; break; }
      case 'egg': {
        add(new THREE.CylinderGeometry(0.07, 0.075, 0.012, 20), mat, 0, 0.006, 0);
        const y = add(new THREE.SphereGeometry(0.026, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffb300, roughness: 0.4 }), 0.01, 0.015, 0);
        y.scale.y = 0.6;
        break;
      }
      case 'pile': {
        const m2 = new THREE.MeshStandardMaterial({ color: 0xd8b48a });
        for (let i = 0; i < 9; i++) add(new THREE.SphereGeometry(0.012 + (i % 3) * 0.003, 6, 5), i % 2 ? mat : m2, Math.cos(i * 1.7) * 0.03, 0.012 + (i % 3) * 0.008, Math.sin(i * 1.7) * 0.03);
        break;
      }
      case 'drumstick': {
        const m = add(new THREE.SphereGeometry(0.045, 14, 10), mat, 0, 0.03, 0);
        m.scale.set(1.5, 0.75, 0.9);
        const bone = add(new THREE.CylinderGeometry(0.009, 0.009, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0xf5ecd8 }), 0.085, 0.035, 0);
        bone.rotation.z = Math.PI / 2;
        break;
      }
      case 'slices': {
        const rimM = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
        for (let i = 0; i < 3; i++) {
          const s = add(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 14), new THREE.MeshStandardMaterial({ color: 0xd8efb0 }), -0.035 + i * 0.035, 0.006 + i * 0.003, 0);
          s.rotation.z = 0.15;
          const rr = add(new THREE.TorusGeometry(0.026, 0.004, 4, 14), rimM, s.position.x, s.position.y, 0);
          rr.rotation.x = Math.PI / 2;
        }
        break;
      }
      case 'flat': {
        add(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 24), mat, 0, 0.009, 0);
        const spotM = new THREE.MeshStandardMaterial({ color: 0xa8742e });
        for (let i = 0; i < 6; i++) add(new THREE.CircleGeometry(0.012, 8), spotM, Math.cos(i * 2.1) * 0.06, 0.0185, Math.sin(i * 2.1) * 0.06).rotation.x = -Math.PI / 2;
        break;
      }
      case 'bowl': {
        add(new THREE.CylinderGeometry(0.045, 0.032, 0.035, 16), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.6, roughness: 0.3 }), 0, 0.0175, 0);
        const top = add(new THREE.CircleGeometry(0.041, 16), mat, 0, 0.036, 0);
        top.rotation.x = -Math.PI / 2;
        break;
      }
      case 'skewer': {
        const stick = add(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 5), new THREE.MeshStandardMaterial({ color: 0xd7b98e }), 0, 0.012, 0);
        stick.rotation.z = Math.PI / 2;
        for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.014, 8, 6), mat, -0.045 + i * 0.026, 0.012, 0).scale.set(1.2, 0.9, 0.9);
        break;
      }
      case 'cube': {
        const b = add(new THREE.BoxGeometry(0.06, def.h, 0.06), mat, 0, def.h / 2, 0);
        if (id === 'ketupat') {
          b.rotation.y = Math.PI / 4;
          const weave = add(new THREE.BoxGeometry(0.062, 0.006, 0.062), new THREE.MeshStandardMaterial({ color: 0x6b8f3a }), 0, def.h * 0.5, 0);
          weave.rotation.y = Math.PI / 4;
        }
        break;
      }
      case 'noodles': {
        const n = add(new THREE.TorusKnotGeometry(0.045, 0.011, 80, 6, 3, 5), mat, 0, 0.03, 0);
        n.scale.y = 0.5;
        break;
      }
      case 'leaf': {
        for (let i = 0; i < 3; i++) {
          const l = add(new THREE.SphereGeometry(0.03, 10, 6), mat, Math.cos(i * 2) * 0.03, 0.008, Math.sin(i * 2) * 0.03);
          l.scale.set(1.4, 0.25, 0.8);
          l.rotation.y = i;
        }
        break;
      }
      default:
        add(new THREE.BoxGeometry(0.05, 0.03, 0.05));
    }
    g.userData = { id, h: def.h, mats: [] };
    g.traverse((o) => { if (o.isMesh) g.userData.mats.push(o.material); });
    return g;
  }

  _layoutStack(animateLastFrom = null) {
    let y = 0;
    this.stack.forEach((p, i) => {
      const spread = 0.05;
      const ang = i * 2.39996;
      const target = new THREE.Vector3(Math.cos(ang) * spread * (i % 3 === 0 ? 0 : 1), y, Math.sin(ang) * spread * (i % 3 === 0 ? 0 : 1));
      p.userData.target = target;
      if (animateLastFrom !== null && i === this.stack.length - 1) {
        p.position.set(target.x, target.y + animateLastFrom, target.z);
        p.userData.drop = 0;
      } else if (p.userData.drop === undefined) {
        p.position.copy(target);
      }
      y += p.userData.h * 0.75;
    });
  }

  plateAdd(id) {
    if (!FOOD_INGREDIENTS[id]) return;
    const m = this._ingredientMesh(id);
    m.rotation.y = Math.random() * Math.PI * 2;
    this.stackGroup.add(m);
    this.stack.push(m);
    this._layoutStack(0.35);
  }

  plateRemove(id) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].userData.id === id) {
        const [m] = this.stack.splice(i, 1);
        this.stackGroup.remove(m);
        this._disposeTree(m);
        this.stack.forEach((p) => { p.userData.drop = 1; });
        this._layoutStack();
        return;
      }
    }
  }

  plateClear() {
    for (const m of this.stack) { this.stackGroup.remove(m); this._disposeTree(m); }
    this.stack = [];
    this.setCooking(false, 0);
  }

  setCooking(active, heat = 0) {
    this.cookActive = active;
    this.cookHeat = heat;
    const burn = clamp01((heat - 0.75) / 0.25);
    const warm = clamp01(heat / 0.75);
    for (const p of this.stack) {
      for (const mat of p.userData.mats) {
        if (!mat.emissive) continue;
        mat.emissive.setRGB(0.35 * warm * (1 - burn), 0.12 * warm * (1 - burn), 0);
        if (!mat.userData.base) mat.userData.base = mat.color.clone();
        mat.color.copy(mat.userData.base).lerp(new THREE.Color(0x1a0d05), burn * 0.85);
      }
    }
    this.griddleGlowMat.opacity = active ? 0.25 + heat * 0.6 : 0;
  }

  /** Fly the finished plate to the pickup pass */
  plateServe(onDone) {
    const pieces = this.stack.slice();
    this.stack = [];
    const holder = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.025, 30), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    holder.add(plate);
    for (const p of pieces) { this.stackGroup.remove(p); p.position.y += 0.02; holder.add(p); }
    holder.position.copy(this.plateBase);
    this.scene.add(holder);
    this.setCooking(false, 0);
    const from = this.plateBase.clone();
    const to = PICKUP.clone().add(new THREE.Vector3(-0.15 + Math.random() * 0.2, 0, 0));
    this._tween(0.7, (t) => {
      holder.position.lerpVectors(from, to, t);
      holder.position.y += Math.sin(t * Math.PI) * 0.45;
      holder.rotation.y = t * Math.PI;
    }, () => {
      this._sparkle(to, 0xfff1a8);
      setTimeout(() => this._tween(0.4, (t) => holder.scale.setScalar(1 - t), () => { this.scene.remove(holder); this._disposeTree(holder); }), 1300);
      onDone && onDone();
    });
  }

  // ------------------------------------------------------------------
  //  Drinks station — steel mugs & Teh Tarik
  // ------------------------------------------------------------------
  _mugGeometry(r, h) {
    const pts = [
      new THREE.Vector2(0.001, 0), new THREE.Vector2(r * 0.92, 0), new THREE.Vector2(r, 0.01),
      new THREE.Vector2(r * 1.04, h), new THREE.Vector2(r * 0.97, h), new THREE.Vector2(r * 0.9, 0.016), new THREE.Vector2(0.001, 0.016),
    ];
    return new THREE.LatheGeometry(pts, 32);
  }

  _buildDrinks() {
    const c = STATION_LAYOUT.drinks.counter;
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8c2c8, roughness: 0.35, metalness: 0.6 });
    this._box(2.3, 0.9, 0.85, steel, c.x, 0.45, c.z);
    // hot water urn
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 24), new THREE.MeshStandardMaterial({ color: 0xd7dde0, metalness: 0.7, roughness: 0.2 }));
    urn.position.set(c.x - 0.85, 1.18, c.z - 0.18);
    urn.castShadow = true;
    this.scene.add(urn);
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    tap.rotation.x = Math.PI / 2;
    tap.position.set(c.x - 0.85, 1.0, c.z + 0.05);
    this.scene.add(tap);
    // ingredient jars (labelled colours)
    const ids = Object.keys(DRINK_INGREDIENTS);
    ids.forEach((id, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 }));
      const x = c.x + 0.45 + (i % 4) * 0.15, z = c.z - 0.28 + Math.floor(i / 4) * 0.16;
      jar.position.set(x, 0.97, z);
      this.scene.add(jar);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.09, 14), new THREE.MeshStandardMaterial({ color: DRINK_INGREDIENTS[id].color, roughness: 0.8 }));
      fill.position.set(x, 0.95, z);
      this.scene.add(fill);
    });

    const R = 0.105, H = 0.24;
    this.mugR = R; this.mugH = H;
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xd2dade, roughness: 0.2, metalness: 0.85, side: THREE.DoubleSide });
    const makeMug = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this._mugGeometry(R, H), mugMat);
      body.castShadow = true;
      g.add(body);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI), mugMat);
      handle.position.set(R + 0.005, H * 0.55, 0);
      handle.rotation.z = -Math.PI / 2;
      g.add(handle);
      return g;
    };
    // mug B (receiver — the one being prepared)
    this.mugB = makeMug();
    this.mugBBase = new THREE.Vector3(c.x - 0.12, 0.9, c.z + 0.08);
    this.mugB.position.copy(this.mugBBase);
    this.mugB.rotation.y = Math.PI * 0.85;
    this.scene.add(this.mugB);
    // liquid inside B
    const liqGeo = new THREE.CylinderGeometry(R * 0.93, R * 0.88, 1, 28);
    liqGeo.translate(0, 0.5, 0);
    this.liquidMat = new THREE.MeshStandardMaterial({ color: 0xc58f5a, roughness: 0.55 });
    this.liquid = new THREE.Mesh(liqGeo, this.liquidMat);
    this.liquid.position.set(this.mugBBase.x, this.mugBBase.y + 0.016, this.mugBBase.z);
    this.liquid.scale.y = 0.0001;
    this.liquid.visible = false;
    this.scene.add(this.liquid);
    this.froth = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.93, 0.018, 28), new THREE.MeshStandardMaterial({ color: 0xf3e3c6, roughness: 0.9 }));
    this.froth.visible = false;
    this.scene.add(this.froth);
    // gold target zone inside B
    const zoneGeo = new THREE.CylinderGeometry(R * 0.965, R * 0.965, 1, 28, 1, true);
    zoneGeo.translate(0, 0.5, 0);
    this.zoneMat = new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.zoneBand = new THREE.Mesh(zoneGeo, this.zoneMat);
    this.zoneBand.visible = false;
    this.scene.add(this.zoneBand);
    this.zoneRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.06, 0.006, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
    this.zoneRing.rotation.x = Math.PI / 2;
    this.zoneRing.visible = false;
    this.scene.add(this.zoneRing);

    // mug A (pourer)
    this.mugA = makeMug();
    this.mugARest = new THREE.Vector3(c.x + 0.25, 0.9, c.z - 0.02);
    this.mugA.position.copy(this.mugARest);
    this.mugA.rotation.y = 0;
    this.scene.add(this.mugA);
    // tea stream
    const sg = new THREE.CylinderGeometry(0.011, 0.016, 1, 10, 1, true);
    sg.translate(0, -0.5, 0);
    this.streamMat = new THREE.MeshStandardMaterial({ color: 0xc58f5a, roughness: 0.2, transparent: true, opacity: 0.92 });
    this.stream = new THREE.Mesh(sg, this.streamMat);
    this.stream.visible = false;
    this.scene.add(this.stream);

    this.drink = { baseLevel: 0, level: 0, pouring: false, tarikT: 0, color: new THREE.Color(0xc58f5a), froth: false, zone: null };
  }

  /** Update mug B contents from scoops. counts: {teh:1, susu:2,...} */
  mugSetContents(counts = {}, drinkId = null) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const col = new THREE.Color(0, 0, 0);
    let w = 0;
    for (const [id, n] of Object.entries(counts)) {
      if (!n || !DRINK_INGREDIENTS[id]) continue;
      const weight = id === 'susu' ? 1.2 : id === 'ais' ? 0.3 : id === 'gula' ? 0.2 : 1.5;
      col.add(new THREE.Color(DRINK_INGREDIENTS[id].color).multiplyScalar(weight * n));
      w += weight * n;
    }
    if (w > 0) col.multiplyScalar(1 / w);
    const def = DRINK_MENU.find((d) => d.id === drinkId);
    this.drink.target = def ? new THREE.Color(def.liquid) : col.clone();
    this.drink.color.copy(w > 0 ? col : new THREE.Color(0xdddddd));
    this.drink.froth = !!(def && def.froth);
    this.drink.baseLevel = Math.min(0.28, total * 0.035);
    this._applyLiquid();
  }

  mugSetZone(zone) {
    this.drink.zone = zone;
    const show = !!zone;
    this.zoneBand.visible = show;
    this.zoneRing.visible = show;
    if (!show) return;
    const innerH = this.mugH - 0.02;
    const y0 = this.mugBBase.y + 0.016 + zone[0] * innerH;
    const y1 = this.mugBBase.y + 0.016 + zone[1] * innerH;
    this.zoneBand.position.set(this.mugBBase.x, y0, this.mugBBase.z);
    this.zoneBand.scale.y = y1 - y0;
    this.zoneRing.position.set(this.mugBBase.x, y1, this.mugBBase.z);
  }

  /** level: 0..1 fill fraction while pouring (tarik progress) */
  mugPour(active, level = 0) {
    this.drink.pouring = active;
    this.drink.level = level;
    this._applyLiquid();
  }

  _applyLiquid() {
    const d = this.drink;
    const lvl = Math.max(d.baseLevel, d.level);
    const innerH = this.mugH - 0.02;
    this.liquid.visible = lvl > 0.005;
    this.liquid.scale.y = Math.max(0.0001, lvl * innerH);
    // as tea is "pulled" the colour converges to the proper drink colour
    const mix = d.target ? new THREE.Color().copy(d.color).lerp(d.target, clamp01(d.level * 1.4)) : d.color;
    this.liquidMat.color.copy(mix);
    this.streamMat.color.copy(mix);
    this.froth.visible = d.froth && d.level > 0.15;
    this.froth.position.set(this.mugBBase.x, this.mugBBase.y + 0.016 + lvl * innerH + 0.006, this.mugBBase.z);
  }

  mugSpill() {
    const p = this.mugBBase.clone(); p.y += this.mugH;
    for (let i = 0; i < 26; i++) {
      this._particle(p, new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.2) * 1.2), this.drink.color.getHex(), 0.9, 0.05, -4);
    }
    this.mugReset();
  }

  mugReset() {
    this.drink.baseLevel = 0;
    this.drink.level = 0;
    this.drink.pouring = false;
    this.drink.target = null;
    this.mugSetZone(null);
    this._applyLiquid();
  }

  /** Transfer the finished drink to a glass & send to pickup */
  mugServe(onDone) {
    const color = this.liquidMat.color.clone();
    const froth = this.drink.froth;
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }));
    glass.position.y = 0.08;
    g.add(glass);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.047, 0.13, 18), new THREE.MeshStandardMaterial({ color, roughness: 0.3 }));
    liq.position.y = 0.068;
    g.add(liq);
    if (froth) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.055, 0.02, 18), new THREE.MeshStandardMaterial({ color: 0xf3e3c6 }));
      f.position.y = 0.14;
      g.add(f);
    }
    const from = this.mugBBase.clone().add(new THREE.Vector3(-0.25, 0, 0.1));
    g.position.copy(from);
    this.scene.add(g);
    this.mugReset();
    const to = PICKUP.clone().add(new THREE.Vector3(0.2 + Math.random() * 0.1, -0.03, 0.05));
    this._tween(0.8, (t) => {
      g.position.lerpVectors(from, to, t);
      g.position.y += Math.sin(t * Math.PI) * 0.5;
    }, () => {
      this._sparkle(to, 0xffe082);
      setTimeout(() => this._tween(0.4, (t) => g.scale.setScalar(1 - t), () => { this.scene.remove(g); this._disposeTree(g); }), 1300);
      onDone && onDone();
    });
  }

  _updateMugs(dt) {
    const d = this.drink;
    const A = this.mugA;
    if (d.pouring) {
      d.tarikT += dt;
      const innerH = this.mugH - 0.02;
      const surfaceY = this.mugBBase.y + 0.016 + Math.max(d.baseLevel, d.level) * innerH;
      const pull = 0.28 + (Math.sin(d.tarikT * 2.6) * 0.5 + 0.5) * 0.42; // the "tarik" pull height
      A.rotation.set(0, 0, 1.95);
      A.position.set(this.mugBBase.x + 0.2, surfaceY + pull, this.mugBBase.z);
      A.updateMatrixWorld(true);
      const lip = new THREE.Vector3(-this.mugR, this.mugH, 0).applyMatrix4(A.matrixWorld);
      A.position.x += this.mugBBase.x - lip.x + 0.01;
      A.position.z += this.mugBBase.z - lip.z;
      A.updateMatrixWorld(true);
      lip.set(-this.mugR, this.mugH, 0).applyMatrix4(A.matrixWorld);
      this.stream.visible = true;
      this.stream.position.copy(lip);
      this.stream.scale.set(1 + Math.sin(this.time * 30) * 0.12, Math.max(0.01, lip.y - surfaceY), 1);
      if (Math.random() < 0.5) {
        this._particle(new THREE.Vector3(this.mugBBase.x, surfaceY + 0.01, this.mugBBase.z), new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4), 0xf6ead2, 0.35, 0.025, -1.5);
      }
    } else {
      this.stream.visible = false;
      A.position.lerp(this.mugARest, Math.min(1, dt * 8));
      A.rotation.z *= Math.max(0, 1 - dt * 10);
    }
  }

  // ------------------------------------------------------------------
  //  Signboard / QR / menu textures
  // ------------------------------------------------------------------
  setRestaurantName(name) {
    this.restaurantName = name || 'Warung Kita';
    const c = this.signTex.userData.canvas;
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    // teak background
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#7a4a1d'); grad.addColorStop(0.5, '#93602c'); grad.addColorStop(1, '#6a3d16');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(50,25,8,0.35)'; g.lineWidth = 2;
    for (let y = 6; y < h; y += 9) {
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 2);
      g.stroke();
    }
    // gold border + batik triangles
    g.strokeStyle = '#e2b23a'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#e2b23a';
    for (let x = 30; x < w - 20; x += 36) {
      g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 12, 34); g.lineTo(x + 24, 20); g.fill();
      g.beginPath(); g.moveTo(x, h - 20); g.lineTo(x + 12, h - 34); g.lineTo(x + 24, h - 20); g.fill();
    }
    // name
    let size = 92;
    g.font = `700 ${size}px Fredoka, "Plus Jakarta Sans", sans-serif`;
    const text = this.restaurantName.toUpperCase();
    while (g.measureText(text).width > w - 140 && size > 34) { size -= 4; g.font = `700 ${size}px Fredoka, "Plus Jakarta Sans", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#3b1f08';
    g.strokeText(text, w / 2, h / 2 - 6);
    g.fillStyle = '#fff3d1';
    g.fillText(text, w / 2, h / 2 - 6);
    g.font = '600 22px "Plus Jakarta Sans", sans-serif';
    g.fillStyle = '#ffd77a';
    g.fillText('☕ KOPITIAM • NASI LEMAK • ROTI CANAI • TEH TARIK ☕', w / 2, h - 44);
    this.signTex.needsUpdate = true;
    this._drawQR();
    this.menuTex.needsUpdate = true;
  }

  _drawQR() {
    const c = this.qrTex.userData.canvas;
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    g.fillStyle = DUITNOW_PINK; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = '700 30px Fredoka, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('DuitNow QR', w / 2, 34);
    // QR body
    const qx = 28, qy = 62, qs = 200;
    g.fillStyle = '#ffffff'; g.fillRect(qx, qy, qs, qs);
    const n = 25, cell = (qs - 16) / n;
    const rnd = seeded(hashStr(this.restaurantName || 'warung'));
    g.fillStyle = '#1a1a1a';
    const finder = (fx, fy) => {
      g.fillStyle = '#1a1a1a'; g.fillRect(qx + 8 + fx * cell, qy + 8 + fy * cell, cell * 7, cell * 7);
      g.fillStyle = '#ffffff'; g.fillRect(qx + 8 + (fx + 1) * cell, qy + 8 + (fy + 1) * cell, cell * 5, cell * 5);
      g.fillStyle = '#1a1a1a'; g.fillRect(qx + 8 + (fx + 2) * cell, qy + 8 + (fy + 2) * cell, cell * 3, cell * 3);
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const inFinder = (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9);
        if (inFinder) continue;
        if (rnd() < 0.48) { g.fillStyle = '#1a1a1a'; g.fillRect(qx + 8 + i * cell, qy + 8 + j * cell, cell + 0.4, cell + 0.4); }
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    // centre logo
    g.fillStyle = DUITNOW_PINK;
    g.beginPath(); g.arc(qx + qs / 2, qy + qs / 2, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '700 16px Fredoka, sans-serif'; g.fillText('DN', qx + qs / 2, qy + qs / 2 + 1);
    // merchant name
    g.fillStyle = '#ffffff';
    let size = 24;
    const name = this.restaurantName || '';
    g.font = `700 ${size}px Fredoka, sans-serif`;
    while (g.measureText(name).width > w - 24 && size > 12) { size -= 2; g.font = `700 ${size}px Fredoka, sans-serif`; }
    g.fillText(name, w / 2, 300);
    g.font = '500 16px "Plus Jakarta Sans", sans-serif';
    g.fillText('Imbas untuk bayar', w / 2, 332);
    g.font = '600 13px "Plus Jakarta Sans", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillText('Diterima oleh semua bank', w / 2, 358);
    this.qrTex.needsUpdate = true;
  }

  _drawMenuBoard(g, w, h) {
    g.fillStyle = '#1f2a24'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 60; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
    g.fillStyle = '#ffe9a8';
    g.font = '700 64px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText('~ MENU ~', w / 2, 76);
    g.textAlign = 'left';
    g.font = '500 30px Fredoka, sans-serif';
    let y = 140;
    g.fillStyle = '#ffffff';
    for (const m of FOOD_MENU) {
      g.fillText(m.name, 40, y);
      g.textAlign = 'right'; g.fillStyle = '#9ff2c4'; g.fillText(rm(m.price), w / 2 - 20, y); g.textAlign = 'left'; g.fillStyle = '#ffffff';
      y += 72;
    }
    y = 140;
    for (const d of DRINK_MENU) {
      g.fillText(d.name, w / 2 + 30, y);
      g.textAlign = 'right'; g.fillStyle = '#9ff2c4'; g.fillText(rm(d.price), w - 36, y); g.textAlign = 'left'; g.fillStyle = '#ffffff';
      y += 72;
    }
    g.fillStyle = '#ffb3c7';
    g.font = '500 24px Fredoka, sans-serif';
    g.fillText('Biasa = 2 • Kurang Manis = 1 • Kosong = 0 • Kaw = 2x serbuk', w / 2 + 30, y + 20);
  }

  refreshTextures() {
    // call after web fonts load
    const c = this.menuTex.userData.canvas;
    this._drawMenuBoard(c.getContext('2d'), c.width, c.height);
    this.menuTex.needsUpdate = true;
    this.setRestaurantName(this.restaurantName);
  }

  // ------------------------------------------------------------------
  //  Characters: workers & customers
  // ------------------------------------------------------------------
  _label(text, color = '#ffffff', bg = 'rgba(30,20,10,0.75)') {
    const tex = canvasTexture(320, 72, (g, w, h) => {
      g.font = '600 30px Fredoka, "Plus Jakarta Sans", sans-serif';
      const tw = Math.min(w - 8, g.measureText(text).width + 36);
      g.fillStyle = bg;
      const x = (w - tw) / 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, 8, tw, h - 16, 24); else g.rect(x, 8, tw, h - 16);
      g.fill();
      g.fillStyle = color;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 1, w - 20);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(0.62, 0.14, 1);
    s.renderOrder = 10;
    return s;
  }

  /**
   * workers: { cashier: {appearance, name, isBot} | null, chef: ..., drinks: ... }
   */
  setWorkers(workers) {
    for (const role of ['cashier', 'chef', 'drinks']) {
      const w = workers[role];
      const key = w ? `${w.name}|${w.isBot}|${JSON.stringify(w.appearance).length}|${w.appearance?.type}|${w.appearance?.gender}|${w.appearance?.pattern}|${w.appearance?.skin}|${w.appearance?.hijab}` : 'none';
      if (this.workerKeys[role] === key) continue;
      this.workerKeys[role] = key;
      const old = this.workers[role];
      if (old) { this.scene.remove(old.obj); this._disposeTree(old.obj, true); }
      this.workers[role] = null;
      if (!w) continue;
      const obj = buildCharacter(w.appearance, { role });
      const pos = STATION_LAYOUT[role].worker;
      obj.position.copy(pos);
      obj.rotation.y = role === 'cashier' ? 0.6 : 0;
      obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const label = this._label(`${w.isBot ? '🤖 ' : ''}${w.name}`, w.isBot ? '#ffe28a' : '#ffffff');
      label.position.set(0, obj.userData.headY + 0.22, 0);
      obj.add(label);
      this.scene.add(obj);
      this.workers[role] = { obj, busy: 0, data: w };
    }
    this._applyFpHide();
  }

  setWorkerBusy(role, busy) {
    if (this.workers[role]) this.workers[role].busy = busy;
  }

  _moodTexture(mood) {
    const map = { happy: '😊', ok: '🙂', meh: '😐', angry: '😠', love: '😍', wait: '⏳', pay: '💳' };
    const e = map[mood] || '🙂';
    if (!this.moodTex[e]) this.moodTex[e] = emojiTexture(e);
    return this.moodTex[e];
  }

  /**
   * list: [{id, appearance, archetype, state:'queue'|'waiting'|'leaving', index, mood}]
   */
  syncCustomers(list) {
    const seen = new Set();
    for (const c of list) {
      seen.add(c.id);
      let e = this.customers.get(c.id);
      if (!e) {
        const obj = buildCharacter(c.appearance, { archetype: c.archetype });
        obj.position.copy(STREET_SPAWN).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, 0));
        const mood = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._moodTexture(c.mood), depthTest: false, transparent: true }));
        mood.scale.set(0.26, 0.26, 1);
        mood.position.y = obj.userData.headY + 0.22;
        mood.renderOrder = 11;
        obj.add(mood);
        this.scene.add(obj);
        e = { obj, mood, moodKey: c.mood, state: null, seat: -1, target: new THREE.Vector3(), moving: false };
        this.customers.set(c.id, e);
      }
      if (e.moodKey !== c.mood) {
        e.moodKey = c.mood;
        e.mood.material.map = this._moodTexture(c.mood);
        e.mood.material.needsUpdate = true;
      }
      if (c.state === 'queue') {
        if (e.seat >= 0) { this.seatOwner[e.seat] = null; e.seat = -1; }
        const qi = Math.min(c.index, 6);
        e.target.set(QUEUE_ORIGIN.x + QUEUE_DIR.x * qi * 0.8, 0, QUEUE_ORIGIN.z + QUEUE_DIR.z * qi * 0.8);
        if (qi >= 4) e.target.set(QUEUE_ORIGIN.x - 2.0 + (qi - 4) * 0.15, 0, QUEUE_ORIGIN.z + 2.5 + (qi - 4) * 0.8);
        e.face = Math.PI; // face the counter (-z)
      } else if (c.state === 'waiting') {
        if (e.seat < 0) {
          let free = this.seatOwner.findIndex((o) => o === null);
          if (free < 0) free = Math.floor(Math.random() * SEATS.length);
          this.seatOwner[free] = c.id;
          e.seat = free;
        }
        const s = SEATS[e.seat];
        e.target.set(s.x, 0, s.z + 0.55);
        e.face = Math.PI;
      } else if (c.state === 'leaving') {
        if (e.seat >= 0) { this.seatOwner[e.seat] = null; e.seat = -1; }
        e.target.set(STREET_SPAWN.x + (Math.random() - 0.5) * 6, 0, STREET_SPAWN.z + 1);
        e.leaving = true;
      }
      e.state = c.state;
    }
    for (const [id, e] of this.customers) {
      if (!seen.has(id) && !e.leaving) {
        if (e.seat >= 0) { this.seatOwner[e.seat] = null; e.seat = -1; }
        e.target.set(STREET_SPAWN.x + (Math.random() - 0.5) * 6, 0, STREET_SPAWN.z + 1);
        e.leaving = true;
      }
    }
  }

  clearCustomers() {
    for (const [, e] of this.customers) { this.scene.remove(e.obj); this._disposeTree(e.obj, true); }
    this.customers.clear();
    this.seatOwner.fill(null);
  }

  _updateCharacters(dt) {
    const camPos = this.camera.position;
    const tmp = new THREE.Vector3();
    for (const [id, e] of this.customers) {
      const o = e.obj;
      tmp.copy(e.target).sub(o.position);
      tmp.y = 0;
      const dist = tmp.length();
      const speed = e.leaving ? 2.4 : 1.9;
      e.moving = dist > 0.05;
      if (e.moving) {
        tmp.normalize().multiplyScalar(Math.min(dist, speed * dt));
        o.position.add(tmp);
        const ang = Math.atan2(tmp.x, tmp.z);
        o.rotation.y = this._angLerp(o.rotation.y, ang, Math.min(1, dt * 10));
      } else if (e.face !== undefined) {
        o.rotation.y = this._angLerp(o.rotation.y, e.face, Math.min(1, dt * 6));
      }
      o.userData.update && o.userData.update(this.time + id.length, e.moving, 0);
      if (e.leaving && dist < 0.2) {
        this.scene.remove(o);
        this._disposeTree(o, true);
        this.customers.delete(id);
      }
      this._billboard(o, camPos);
    }
    for (const role of Object.keys(this.workers)) {
      const w = this.workers[role];
      if (!w) continue;
      w.obj.userData.update && w.obj.userData.update(this.time + role.length, false, w.busy);
      this._billboard(w.obj, camPos);
    }
  }

  _billboard(obj, camPos) {
    const bb = obj.userData.billboard;
    if (!bb) return;
    const dx = camPos.x - obj.position.x;
    const dz = camPos.z - obj.position.z;
    bb.rotation.y = Math.atan2(dx, dz) - obj.rotation.y;
    if (obj.userData.spriteMaterial) obj.userData.spriteMaterial.color.copy(this.spriteTint);
  }

  _angLerp(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // ------------------------------------------------------------------
  //  Anchors for DOM speech bubbles
  // ------------------------------------------------------------------
  workerAnchor(role) {
    const w = this.workers[role];
    if (!w) return null;
    return w.obj.position.clone().add(new THREE.Vector3(0, w.obj.userData.headY + 0.45, 0));
  }

  customerAnchor(id) {
    const e = this.customers.get(id);
    if (!e) return null;
    return e.obj.position.clone().add(new THREE.Vector3(0, e.obj.userData.headY + 0.45, 0));
  }

  project(v) {
    if (!v) return null;
    const p = v.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    const behind = p.z > 1;
    return { x: (p.x * 0.5 + 0.5) * rect.width + rect.left, y: (-p.y * 0.5 + 0.5) * rect.height + rect.top, visible: !behind && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15 };
  }

  // ------------------------------------------------------------------
  //  Camera
  // ------------------------------------------------------------------
  setView(name, instant = false) {
    const L = STATION_LAYOUT[name] || STATION_LAYOUT.overview;
    this.view = name;
    this.fpYaw = 0;
    this.fpPitch = 0;
    const fp = this.fp && L.fp;
    this.camTarget.pos.copy(fp ? L.fp.eye : L.cam.pos);
    this.camTarget.look.copy(fp ? L.fp.look : L.cam.look);
    if (instant) { this.camPos.copy(this.camTarget.pos); this.camLook.copy(this.camTarget.look); }
    this._applyFpHide();
    this.resize();
  }

  /** Toggle first-person (POV) camera at the current station */
  setFirstPerson(on) {
    this.fp = !!on;
    this.setView(this.view);
  }

  get isFirstPerson() { return this.fp && !!(STATION_LAYOUT[this.view] && STATION_LAYOUT[this.view].fp); }

  /** Hide the worker whose eyes we are looking through */
  _applyFpHide() {
    for (const role of Object.keys(this.workers)) {
      const w = this.workers[role];
      if (w) w.obj.visible = !(this.isFirstPerson && role === this.view);
    }
  }

  /** Drag on the 3D view (mouse or finger) to look around in POV mode; double-click recentres */
  _initLookDrag() {
    let drag = null;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { if (this.isFirstPerson) { drag = { x: e.clientX, y: e.clientY, yaw: this.fpYaw, pitch: this.fpPitch }; c.setPointerCapture(e.pointerId); } });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.fpYaw = Math.max(-1.3, Math.min(1.3, drag.yaw - (e.clientX - drag.x) * 0.005));
      this.fpPitch = Math.max(-0.7, Math.min(0.7, drag.pitch - (e.clientY - drag.y) * 0.004));
    });
    const end = () => { drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => { this.fpYaw = 0; this.fpPitch = 0; });
  }

  _updateCamera(dt) {
    if (this.view === 'overview') {
      const a = this.time * 0.06;
      const base = STATION_LAYOUT.overview.cam.pos;
      const r = Math.hypot(base.x, base.z);
      this.camTarget.pos.set(Math.sin(a + 0.6) * r * 0.75, base.y, Math.cos(a + 0.6) * r * 0.85 + 1);
    }
    if (this.isFirstPerson) {
      // eye stays put; drag rotates the gaze (yaw around Y, pitch around the right axis)
      const L = STATION_LAYOUT[this.view].fp;
      const dir = L.look.clone().sub(L.eye);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.fpYaw);
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      dir.applyAxisAngle(right, this.fpPitch);
      this.camTarget.pos.copy(L.eye);
      this.camTarget.look.copy(L.eye).add(dir);
    }
    const k = 1 - Math.exp(-dt * (this.isFirstPerson ? 7 : 4.2));
    this.camPos.lerp(this.camTarget.pos, k);
    this.camLook.lerp(this.camTarget.look, k);
    const sway = this.view === 'overview' ? 0 : this.isFirstPerson ? 0.006 : 0.012;
    this.camera.position.set(this.camPos.x + Math.sin(this.time * 0.5) * sway, this.camPos.y + Math.sin(this.time * 0.7) * sway * 0.5, this.camPos.z);
    this.camera.lookAt(this.camLook);
  }

  // ------------------------------------------------------------------
  //  Day / night
  // ------------------------------------------------------------------
  setTimeOfDay(hour) {
    this.hour = hour;
    const s = sampleSky(hour);
    this.skyUniforms.topColor.value.copy(s.top);
    this.skyUniforms.bottomColor.value.copy(s.bottom);
    this.scene.fog.color.copy(s.bottom).lerp(s.top, 0.3);
    this.hemi.intensity = s.hemi;
    this.hemi.color.copy(s.top).lerp(new THREE.Color(0xffffff), 0.5);
    this.sun.intensity = s.sun;
    this.sun.color.copy(s.sunColor);
    const ang = clamp01((hour - 6.5) / 13) * Math.PI;
    const sx = Math.cos(ang) * 30, sy = Math.max(1.5, Math.sin(ang) * 26), sz = 14;
    this.sun.position.set(sx, sy, sz);
    this.sun.target.position.set(0, 0, 0);
    this.sunDisc.position.set(sx, Math.sin(ang) * 26 - 3, sz).normalize().multiplyScalar(400);
    this.sunDisc.material.color.copy(s.sunColor);
    this.sunDisc.visible = hour < 19.6;
    const night = clamp01((hour - 19) / 2);
    this.stars.material.opacity = night * 0.9;
    this.moonDisc.visible = night > 0.05;
    this.moonDisc.material.opacity = night;
    const mAng = clamp01((hour - 18.5) / 7) * Math.PI * 0.8 + 0.3;
    this.moonDisc.position.set(-Math.cos(mAng) * 60, Math.sin(mAng) * 45, 55).normalize().multiplyScalar(400);
    this.lampLevel = s.lamp;
    for (const l of this.interiorLights) l.intensity = 0.25 + s.lamp * 0.85;
    for (const m of this.lampMats) m.emissiveIntensity = 0.15 + s.lamp * 1.1;
    this.streetLight.intensity = night * 1.4;
    if (this.city) this.city.setNight(clamp01((hour - 18.4) / 1.4));
    this.streetHeadMat.emissiveIntensity = night * 2;
    this.ambient.intensity = 0.12 + s.lamp * 0.12;
    const tint = clamp01(0.55 + s.hemi * 0.5 + s.lamp * 0.15);
    this.spriteTint.setRGB(tint, tint * 0.98, tint * (0.95 + s.hemi * 0.05));
  }

  // ------------------------------------------------------------------
  //  Particles & tweens
  // ------------------------------------------------------------------
  _particle(pos, vel, color, life = 0.8, size = 0.04, gravity = -2) {
    if (this.particles.length > 140) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color, transparent: true, depthWrite: false }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.particles.push({ s, vel, life, max: life, size, gravity });
  }

  _sparkle(pos, color = 0xffffff) {
    for (let i = 0; i < 18; i++) {
      this._particle(pos.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6), color, 0.7, 0.05, -2.5);
    }
  }

  burst(where, color = 0xffd54f) {
    const map = {
      cashier: STATION_LAYOUT.cashier.counter.clone().add(new THREE.Vector3(0.35, 1.25, -0.1)),
      chef: this.plateBase.clone().add(new THREE.Vector3(0, 0.15, 0)),
      drinks: this.mugBBase.clone().add(new THREE.Vector3(0, 0.3, 0)),
    };
    this._sparkle(map[where] || PICKUP, color);
  }

  _tween(dur, onUpdate, onDone) {
    this.tweens.push({ t: 0, dur, onUpdate, onDone });
  }

  _updateFX(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.s.material.opacity = k;
      p.s.scale.setScalar(p.size * (1.4 - k * 0.4));
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.onUpdate(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.onDone && tw.onDone(); }
    }
    // dropping stack pieces
    for (const p of this.stack) {
      const tg = p.userData.target;
      if (!tg) continue;
      if (p.userData.drop !== undefined) {
        p.userData.drop = Math.min(1, p.userData.drop + dt * 4);
        p.position.lerp(tg, Math.min(1, dt * 14));
        if (p.position.distanceTo(tg) < 0.002) delete p.userData.drop;
      }
    }
    // flames
    const cookBoost = this.cookActive ? 0.7 + this.cookHeat * 1.4 : 0.35;
    for (const f of this.flames) {
      const flick = 0.75 + Math.sin(this.time * 18 + f.userData.phase) * 0.18 + Math.random() * 0.12;
      f.scale.set(1, flick * cookBoost, 1);
      f.position.y = (f.userData.baseY ?? (f.userData.baseY = f.position.y)) + 0.07 * flick * cookBoost - 0.035;
    }
    if (this.cookActive && Math.random() < 0.35 + this.cookHeat * 0.4) {
      const top = this.plateBase.clone();
      top.y += 0.08;
      const smoky = this.cookHeat > 0.85;
      this._particle(top.add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2)), new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.35 + Math.random() * 0.3, 0), smoky ? 0x333333 : 0xffffff, 1.1, smoky ? 0.12 : 0.08, 0.1);
    }
    for (const fan of this.fans) fan.rotation.y += dt * 5;
  }

  _disposeTree(obj, keepShared = false) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (!keepShared && o.material && !Array.isArray(o.material) && !o.material.map) o.material.dispose();
    });
  }

  // ------------------------------------------------------------------
  //  Main update / render
  // ------------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // narrower screens need a wider FOV to keep the station in frame
    this.camera.fov = this.isFirstPerson ? (this.camera.aspect < 1.5 ? 78 : 70) : this.camera.aspect < 1.5 ? 62 : 55;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    if (this.city) this.city.update(dt, this.time);
    this._updateCamera(dt);
    this._updateCharacters(dt);
    this._updateMugs(dt);
    this._updateFX(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
