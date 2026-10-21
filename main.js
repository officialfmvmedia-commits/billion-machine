// BILLION MACHINE — scroll-driven 3D product sequence.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/addons/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/addons/RoundedBoxGeometry.js';
import Lenis from './vendor/lenis.mjs';
import { initUI, LIVE, FLOORS } from './ui.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth < 720;
const MOBILE0 = mobile();

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const range = (x, a, b) => clamp((x - a) / (b - a));
const ss = (x) => x * x * (3 - 2 * x);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eo = (x) => 1 - Math.pow(1 - x, 3);
const ei = (x) => x * x * x;
const lerp = (a, b, t) => a + (b - a) * t;
const fract = (x) => x - Math.floor(x);
const rand = (() => { let s = 1337; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// ── loader ──
const ldFill = document.getElementById('ld-fill'), ldPct = document.getElementById('ld-pct');
const setLD = (v) => { ldFill.style.width = v + '%'; ldPct.textContent = Math.round(v) + '%'; };
setLD(28);

// ── renderer ──
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE0 ? 1.6 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true;
renderer.setClearColor(0xe4e6e6, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 200);
scene.add(camera);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.95;
const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-3, 6, 7); scene.add(key);
const rim = new THREE.DirectionalLight(0xe8f0ff, 0.6); rim.position.set(5, 1, -2); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb7bcba, 0.45));
setLD(48);

// ── canvas texture helpers ──
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

// backdrop (studio sweep)
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
  toneMapped: false, depthWrite: false,
  map: canvasTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.45, w * 0.75);
    gr.addColorStop(0, '#f0f2f1'); gr.addColorStop(0.55, '#e7e9e9'); gr.addColorStop(1, '#e1e3e3');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
}));
backdrop.position.z = -80; backdrop.renderOrder = -10; camera.add(backdrop);

// soft shadow textures
const shadowRect = canvasTex(256, 192, (g, w, h) => { g.filter = 'blur(14px)'; g.fillStyle = '#000'; roundRect(g, 34, 34, w - 68, h - 68, 16); g.fill(); });
const shadowBlob = canvasTex(256, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.5, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.setTransform(1, 0, 0, h / w, 0, h / 2 - (h / w) * h / 2 * 0); g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

// ── foil textures (knurled diamond emboss + crinkle) ──
function makeFoil() {
  const N = 512, P = 16, h = new Float32Array(N * N), cr = new Float32Array(N * N), TAU = Math.PI * 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + y) / P, v = (x - y + N) / P;
    const d = 1 - 2 * Math.max(Math.abs(fract(u) - 0.5), Math.abs(fract(v) - 0.5));
    const X = x / N, Y = y / N;
    const c = Math.sin(TAU * (3 * X + 0.4 * Math.sin(TAU * 2 * Y))) * 0.5 + Math.sin(TAU * (5 * Y + X)) * 0.35 + Math.sin(TAU * (7 * X - 4 * Y)) * 0.2;
    h[y * N + x] = Math.pow(d, 0.8); cr[y * N + x] = c;
  }
  const nc = document.createElement('canvas'); nc.width = nc.height = N;
  const cc = document.createElement('canvas'); cc.width = cc.height = N;
  const nd = nc.getContext('2d').createImageData(N, N), cd = cc.getContext('2d').createImageData(N, N);
  const at = (a, x, y) => a[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(h, x + 1, y) - at(h, x - 1, y)) * 1.6 + (at(cr, x + 4, y) - at(cr, x - 4, y)) * 0.9;
    const dy = (at(h, x, y + 1) - at(h, x, y - 1)) * 1.6 + (at(cr, x, y + 4) - at(cr, x, y - 4)) * 0.9;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4;
    nd.data[i] = (nx * 0.5 + 0.5) * 255; nd.data[i + 1] = (ny * 0.5 + 0.5) * 255; nd.data[i + 2] = (nz * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const g = 200 + at(cr, x, y) * 7 + at(h, x, y) * 26;
    cd.data[i] = g; cd.data[i + 1] = g + 2; cd.data[i + 2] = g + 4; cd.data[i + 3] = 255;
  }
  nc.getContext('2d').putImageData(nd, 0, 0); cc.getContext('2d').putImageData(cd, 0, 0);
  const n = new THREE.CanvasTexture(nc), c = new THREE.CanvasTexture(cc);
  c.colorSpace = THREE.SRGBColorSpace;
  for (const t of [n, c]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { n, c };
}
const foil = makeFoil();
const TILE = 2.6; // world units per texture tile
foil.n.repeat.set(1 / TILE, 1 / TILE); foil.c.repeat.set(1 / TILE, 1 / TILE);
const foilMat = new THREE.MeshStandardMaterial({ color: 0xe6e9eb, map: foil.c, normalMap: foil.n, normalScale: new THREE.Vector2(0.7, 0.7), metalness: 1, roughness: 0.4, envMapIntensity: 1.2 });
const crumpleMat = new THREE.MeshStandardMaterial({ color: 0xeef0f2, metalness: 1, roughness: 0.28, flatShading: true, side: THREE.DoubleSide, envMapIntensity: 1.3 });
setLD(64);

// ── PACK ──
const root = new THREE.Group(); scene.add(root);
const pack = new THREE.Group(); root.add(pack);
const CW = 4.6, CH = 3.1, BY = 0.2; // card size, bubble center y
{
  const s = new THREE.Shape(); const r = 0.2, w = CW / 2, h = CH / 2;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.042);
  const card = new THREE.Mesh(g, foilMat); pack.add(card);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.25, CH * 1.3), new THREE.MeshBasicMaterial({ map: shadowRect, transparent: true, opacity: 0.32, depthWrite: false, color: 0x000000 }));
  sh.material.alphaMap = shadowRect; sh.position.set(0.1, -0.16, -0.35); pack.add(sh); pack.userData.shadow = sh;
  // label sticker
  const lab = canvasTex(760, 112, (g2, W, H) => {
    g2.fillStyle = '#eceeed'; g2.fillRect(0, 0, W, H);
    g2.fillStyle = '#151716'; g2.font = '600 58px Inter, Arial, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    if ('letterSpacing' in g2) g2.letterSpacing = '4px';
    g2.fillText('BILLION  MACHINE', W / 2, H / 2 + 3);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.28), new THREE.MeshStandardMaterial({ map: lab, roughness: 0.55, metalness: 0 }));
  label.position.set(0, -1.15, 0.004); pack.add(label);
}
// blister bubble — 4 quadrants sharing one geometry, separated by clip planes so it can crack & pop
const BW = 1.9, BH = 2.12, BD = 1.12;
const bubbleGeo = new RoundedBoxGeometry(BW, BH, BD, 6, 0.3);
const bubbleMatBase = MOBILE0
  ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.07, metalness: 0, transmission: 1, thickness: 0.12, ior: 1.42, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.5, transparent: true, opacity: 1, specularIntensity: 1 });
const bubble = new THREE.Group(); bubble.position.set(0, BY, BD / 2 + 0.004); pack.add(bubble);
const quads = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
  const m = bubbleMatBase.clone();
  const local = [new THREE.Plane(new THREE.Vector3(sx, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, sy, 0), 0)];
  m.clippingPlanes = [local[0].clone(), local[1].clone()];
  const mesh = new THREE.Mesh(bubbleGeo, m); mesh.renderOrder = 2;
  mesh.userData = { sx, sy, local, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize() };
  bubble.add(mesh); quads.push(mesh);
}
// plastic flange
{
  const ring = new THREE.Mesh(new RoundedBoxGeometry(BW + 0.26, BH + 0.26, 0.01, 2, 0.004), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.15, clearcoat: 1, depthWrite: false }));
  ring.position.set(0, BY, 0.008); pack.add(ring); pack.userData.flange = ring;
}
// torn foil petals around the bubble rim
const petals = [];
{
  const N = MOBILE0 ? 8 : 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.2;
    // point on rounded-rect rim
    const cx = Math.cos(a), cy = Math.sin(a);
    const k = Math.min((BW / 2 + 0.02) / Math.abs(cx || 1e-6), (BH / 2 + 0.02) / Math.abs(cy || 1e-6));
    const px = cx * k, py = cy * k + BY;
    const w = 0.5 + rand() * 0.35, hh = 0.32 + rand() * 0.3;
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0);
    const steps = 7;
    for (let j = 0; j <= steps; j++) { const x = -w / 2 + (w * j) / steps; sh.lineTo(x + (rand() - 0.5) * 0.05, hh * (0.45 + rand() * 0.55)); }
    sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0);
    const g = new THREE.ShapeGeometry(sh);
    const pos = g.attributes.position;
    for (let j = 0; j < pos.count; j++) { const y = pos.getY(j); pos.setZ(j, (rand() - 0.5) * 0.08 * (y / hh) + y * y * 0.6); }
    g.computeVertexNormals();
    const piv = new THREE.Group(); piv.position.set(px, py, 0.01);
    piv.rotation.z = Math.atan2(cy * k, cx * k) - Math.PI / 2; // local +y points outward
    const mesh = new THREE.Mesh(g, crumpleMat); piv.add(mesh); piv.scale.setScalar(0.0001);
    pack.add(piv); petals.push({ piv, mesh, d: rand() });
  }
}
// flying foil shards
const SHARDS = MOBILE0 ? 16 : 40;
const shardMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), crumpleMat, SHARDS);
const shardData = [];
for (let i = 0; i < SHARDS; i++) {
  const a = rand() * Math.PI * 2;
  shardData.push({
    o: new THREE.Vector3(Math.cos(a) * (BW / 2) * (0.6 + rand() * 0.5), BY + Math.sin(a) * (BH / 2) * (0.6 + rand() * 0.5), 0.3 + rand() * 0.8),
    v: new THREE.Vector3(Math.cos(a) * (1.5 + rand() * 3), Math.sin(a) * (1 + rand() * 2.5) + 1.2, 1 + rand() * 3.5),
    s: new THREE.Vector3(0.6 + rand() * 1.4, 0.5 + rand() * 1.2, 0.25),
    r: new THREE.Vector3(rand() * 9, rand() * 9, rand() * 9), d: rand() * 0.25,
  });
}
shardMesh.frustumCulled = false; root.add(shardMesh);
setLD(76);

// ── MACHINE ──
const M = new THREE.Group(); root.add(M);
const matWhite = new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.35 });
const matWhite2 = new THREE.MeshPhysicalMaterial({ color: 0xe9e7e0, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.4 });
const matGreen = new THREE.MeshPhysicalMaterial({ color: 0x2fbf5b, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.25 });
const matBlack = new THREE.MeshStandardMaterial({ color: 0x141615, roughness: 0.45 });
const matVent = new THREE.MeshStandardMaterial({ color: 0x9a9f9c, roughness: 0.5 });
const matGreenGlow = new THREE.MeshStandardMaterial({ color: 0x2fbf5b, emissive: 0x2fbf5b, emissiveIntensity: 0.25, roughness: 0.3 });
const rb = (w, h, d, r, mat, seg = 4) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), mat);

const parts = {};
function part(name, obj, pos, ex) { obj.position.copy(pos); M.add(obj); parts[name] = { obj, base: pos.clone(), ex }; return obj; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const shell = part('shell', new THREE.Group(), V(0, 0.19, 0), V(0, 0.95, 0));
shell.add(rb(1.3, 1.02, 1.16, 0.14, matWhite, 5));
for (let i = 0; i < 5; i++) { const g = rb(0.8, 0.008, 0.03, 0.004, matVent, 1); g.position.set(0, 0.511, -0.2 + i * 0.1); shell.add(g); }
const base = part('base', rb(1.32, 0.36, 1.18, 0.12, matGreen, 5), V(0, -0.5, 0), V(0, -0.78, 0));
const bezel = part('bezel', new THREE.Group(), V(0, 0.27, 0.585), V(0, 0.22, 0.9));
bezel.add(rb(1.02, 0.46, 0.1, 0.07, matGreen, 4));
// screen
const SCW = 640, SCH = 224;
const scrCanvas = document.createElement('canvas'); scrCanvas.width = SCW; scrCanvas.height = SCH;
const scr = scrCanvas.getContext('2d');
const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 4;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.3), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }));
screen.position.z = 0.0505; bezel.add(screen);
const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.3), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.02, clearcoat: 1, depthWrite: false }));
glass.position.z = 0.054; bezel.add(glass);
const door = part('door', new THREE.Group(), V(0, -0.37, 0.59), V(0, -0.12, 1.3));
door.add(rb(0.64, 0.56, 0.08, 0.06, matWhite2, 4));
const slot = rb(0.085, 0.22, 0.04, 0.018, matBlack, 2); slot.position.set(0.14, 0.03, 0.04); door.add(slot);
const slotLed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.01), matGreenGlow); slotLed.position.set(0.14, -0.11, 0.045); door.add(slotLed);
const feet = part('feet', new THREE.Group(), V(0, 0, 0), V(0, -1.02, 0));
for (const x of [-0.48, 0.48]) for (const z of [-0.4, 0.4]) { const f = rb(0.15, 0.1, 0.15, 0.03, matBlack, 2); f.position.set(x, -0.72, z); feet.add(f); }
// internals
const pcbTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#0f1a13'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(47,191,91,.55)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { g.beginPath(); let x = rand() * w, y = rand() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { if (k % 2) x = rand() * w; else y = rand() * h; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = '#2fbf5b'; for (let i = 0; i < 40; i++) g.fillRect(rand() * w, rand() * h, 4, 4);
});
const core = part('core', new THREE.Group(), V(0, -0.12, 0), V(0, 0.1, 0));
{
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.06, 0.9, 2, 0.02), new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.5, metalness: 0.2 })); core.add(board);
  const chipTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#121413'; g.fillRect(0, 0, w, h); g.fillStyle = '#2fbf5b'; g.font = '700 54px JBM, monospace'; g.textAlign = 'center'; g.fillText('BM-1', w / 2, h / 2 + 4); g.font = '500 22px JBM, monospace'; g.fillStyle = '#7d8a82'; g.fillText('ONE INSTRUCTION', w / 2, h / 2 + 48); });
  const chip = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.07, 0.38, 2, 0.015), matBlack); chip.position.y = 0.06; core.add(chip);
  const chipTop = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshStandardMaterial({ map: chipTex, roughness: 0.4 })); chipTop.rotation.x = -Math.PI / 2; chipTop.position.y = 0.0955; core.add(chipTop);
  for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.06), new THREE.MeshStandardMaterial({ color: 0xb9bcbd, metalness: 1, roughness: 0.3 })); const s = i < 4 ? -1 : 1; p.position.set(s * 0.2, 0.04, -0.12 + (i % 4) * 0.08); p.rotation.y = Math.PI / 2; core.add(p); }
}
const cell = part('cell', new THREE.Group(), V(-0.12, -0.05, -0.1), V(-1.0, 0.1, 0.1));
const cellFill = new THREE.Group();
{
  const glassC = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.72, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
  glassC.renderOrder = 3; cell.add(glassC);
  const capM = new THREE.MeshStandardMaterial({ color: 0xc9cccd, metalness: 1, roughness: 0.25 });
  for (const y of [-0.39, 0.39]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.07, 40), capM); c.position.y = y; cell.add(c); }
  const term = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 24), capM); term.position.y = 0.45; cell.add(term);
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.7, 40), new THREE.MeshStandardMaterial({ color: 0x2fbf5b, emissive: 0x1d8f40, emissiveIntensity: 0.5, roughness: 0.25, transparent: true, opacity: 0.92 }));
  liq.position.y = 0.35; cellFill.add(liq); cellFill.position.y = -0.35; cell.add(cellFill);
}
const igniter = part('igniter', new THREE.Group(), V(0.12, -0.05, -0.1), V(1.0, 0.1, 0.1));
const ringMat = new THREE.MeshStandardMaterial({ color: 0x2fbf5b, emissive: 0x2fbf5b, emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.3 });
const rings = [];
{
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 20), matWhite); igniter.add(rod);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.17 - i * 0.025, 0.028, 16, 48), ringMat); r.rotation.x = Math.PI / 2; r.position.y = -0.2 + i * 0.2; igniter.add(r); rings.push(r); }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), matGreenGlow); tip.position.y = 0.43; igniter.add(tip);
}
// unlock beam
const beamTex = canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 3.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x2fbf5b, alphaMap: beamTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
beam.position.y = 1.9; M.add(beam);
// coins
const COINS = MOBILE0 ? 14 : 24;
const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 28), new THREE.MeshStandardMaterial({ color: 0x2fbf5b, metalness: 0.75, roughness: 0.25 }), COINS);
coinMesh.frustumCulled = false; M.add(coinMesh);
const coinData = Array.from({ length: COINS }, () => ({ ph: rand(), a: rand() * Math.PI * 2, r: rand(), r2: rand() }));
// sparks
const SPARKS = MOBILE0 ? 60 : 140;
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
const sparkTex = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(120,255,160,.9)'); gr.addColorStop(1, 'rgba(47,191,91,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.09, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9dffb8, opacity: 0, toneMapped: false }));
sparks.frustumCulled = false; M.add(sparks);
const sparkData = Array.from({ length: SPARKS }, () => ({ ph: rand(), a: rand() * Math.PI * 2, sp: 0.5 + rand(), r: rand() }));
// floor shadow under machine
const mShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowBlob, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
root.add(mShadow);

// callout anchors
const anchors = {
  screen: [bezel, V(0, 0.16, 0.06)], cell: [cell, V(0, 0.45, 0)], core: [core, V(0.3, 0.0, 0.42)],
  door: [door, V(-0.3, 0.2, 0.05)], slot: [slot, V(0, -0.11, 0.02)], igniter: [igniter, V(0, 0.5, 0)], vent: [shell, V(0, 0.52, 0)],
};
const coDefs = [
  { id: 'screen', t: 'COUNTER · $0 → $1B', side: 'l' },
  { id: 'vent', t: 'ALGORITHM HOUSING', side: 'l' },
  { id: 'cell', t: 'TREASURY CELL', side: 'l' },
  { id: 'igniter', t: 'IGNITER', side: 'r' },
  { id: 'door', t: 'INTAKE · BUYBACK', side: 'l' },
  { id: 'slot', t: 'BURN SLOT', side: 'l' },
];
const coLayer = document.getElementById('callouts');
coDefs.forEach((d) => { const el = document.createElement('div'); el.className = 'co' + (d.side === 'l' ? ' left' : ''); el.innerHTML = `<i></i><span class="ln"></span><span class="tx">${d.t}</span>`; coLayer.appendChild(el); d.el = el; d.o = -1; });
setLD(88);

// ── screen drawing ──
let scrKey = '';
function screenBase() {
  const g = scr; g.fillStyle = '#041a0c'; g.fillRect(0, 0, SCW, SCH);
  const gr = g.createRadialGradient(SCW / 2, SCH / 2, 10, SCW / 2, SCH / 2, SCW * 0.6); gr.addColorStop(0, 'rgba(47,191,91,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, SCW, SCH);
}
function scanlines() { scr.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < SCH; y += 4) scr.fillRect(0, y, SCW, 2); }
function glowText(txt, x, y, font, color = '#9dffb6', align = 'center') {
  const g = scr; g.font = font; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.shadowColor = '#2fbf5b'; g.shadowBlur = 18; g.fillText(txt, x, y); g.shadowBlur = 0;
}
function drawScreen(kind, a = '', b = '') {
  const key = kind + '|' + a + '|' + b; if (key === scrKey) return; scrKey = key;
  screenBase();
  if (kind === 'count') {
    glowText(a, SCW / 2, SCH / 2 + 4, `500 ${a.length > 13 ? 70 : 78}px JBM, monospace`);
  } else if (kind === 'label') {
    glowText(a, 34, 46, '500 26px JBM, monospace', '#5fd987', 'left');
    glowText(b, SCW / 2, SCH / 2 + 26, `500 ${b.length > 12 ? 60 : 72}px JBM, monospace`);
  } else if (kind === 'read') {
    const g = scr, pts = []; for (let i = 0; i <= 40; i++) pts.push(SCH * 0.62 - Math.sin(i * 0.35) * 26 - i * 1.3 + Math.sin(i * 1.7) * 9 + (+a) * 0);
    g.strokeStyle = 'rgba(157,255,182,.35)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 40; i++) { const y = SCH * 0.6 - i * 1.1; i ? g.lineTo(30 + i * 9.5, y) : g.moveTo(30, y); } g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#9dffb6'; g.shadowColor = '#2fbf5b'; g.shadowBlur = 14; g.lineWidth = 4; g.beginPath(); pts.forEach((y, i) => (i ? g.lineTo(30 + i * 9.5, y) : g.moveTo(30, y))); g.stroke(); g.shadowBlur = 0;
    const n = +a; const rows = ['P/MA   --', 'DD     --', 'VOL    --', `FLR ${String(b || 0).padStart(2, '0')}/08`];
    rows.forEach((r, i) => glowText(r, 452, 40 + i * 48, '500 28px JBM, monospace', i < n ? '#9dffb6' : 'rgba(157,255,182,.25)', 'left'));
  }
  scanlines(); scrTex.needsUpdate = true;
}
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

// ── layout ──
const L = { visW: 1, visH: 1, camZ: 12 };
function layout() {
  const w = innerWidth, h = innerHeight, asp = w / h, mob = mobile();
  renderer.setSize(w, h, false);
  camera.aspect = asp;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needW = CW / (mob ? 0.86 : 0.44), needH = CH / (mob ? 0.36 : 0.5);
  L.camZ = Math.max(needW / (2 * tanH * asp), needH / (2 * tanH));
  camera.position.set(0, 0, L.camZ); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  L.visH = 2 * L.camZ * tanH; L.visW = L.visH * asp; L.mob = mob;
  L.heroY = mob ? 0.035 * L.visH : 0.075 * L.visH;
  L.sLift = mob ? Math.min(0.15 * L.visH, 0.3 * L.visW) : Math.min(0.19 * L.visH, 0.2 * L.visW);
  L.liftY = mob ? -0.02 * L.visH : -0.03 * L.visH;
  L.expY = mob ? -0.03 * L.visH : -0.1 * L.visH;
  L.sExp = mob ? Math.min(0.085 * L.visH, 0.2 * L.visW) : Math.min(0.16 * L.visH, 0.17 * L.visW);
  L.sMode = mob ? Math.min(0.075 * L.visH, 0.19 * L.visW) : Math.min(0.2 * L.visH, 0.15 * L.visW);
  L.modeX = mob ? 0 : 0.2 * L.visW; L.modeY = mob ? 0.22 * L.visH : -0.02 * L.visH;
  const bd = 200 - 80; backdrop.scale.set(2 * bd * tanH * asp * 1.1 + 2 * 80 * tanH * asp, 2 * (L.camZ + 80) * tanH * 1.1, 1);
}
layout();

// ── scroll state ──
const seqEl = document.getElementById('seq'), modesEl = document.getElementById('modes'), floorsEl = document.getElementById('floors');
const modeEls = [...document.querySelectorAll('.mode')];
const caps = [...document.querySelectorAll('[data-cap]')].map((el) => ({ el, r: el.dataset.cap.split(',').map(Number), o: -1 }));
const micros = [...document.querySelectorAll('.micro')];
const S = { p: 0, pS: 0, mF: -2, mFS: -2, fade: 1, mx: 0, my: 0, mxS: 0, myS: 0 };
function readScroll() {
  const vh = innerHeight;
  const r = seqEl.getBoundingClientRect();
  S.p = clamp(-r.top / (r.height - vh));
  const m0 = modeEls[0].getBoundingClientRect();
  const ph = m0.height;
  S.mF = (vh * 0.5 - (m0.top + ph * 0.5)) / ph; // 0 when first panel centered
  S.mF = clamp(S.mF, -2, modeEls.length - 1 + 0.6);
  const f = floorsEl.getBoundingClientRect();
  S.fade = range(f.top, vh * 0.1, vh * 0.8);
}
addEventListener('pointermove', (e) => { S.mx = e.clientX / innerWidth - 0.5; S.my = e.clientY / innerHeight - 0.5; }, { passive: true });

// ── per-mode configuration (0 cycle, 1 read, 2 charge, 3 defend, 4 burn, 5 ignite, 6 unlock) ──
const MODE_CFG = [
  { yaw: -0.62, pitch: 0.3, e: 1.0, co: null },
  { yaw: -0.1, pitch: 0.08, e: 0.18, co: 'screen', coT: 'INPUTS · READ EVERY CYCLE' },
  { yaw: 0.62, pitch: 0.22, e: 0.85, co: 'cell', coT: 'TREASURY CELL · CHARGING' },
  { yaw: -0.18, pitch: 0.14, e: 0.6, co: 'door', coT: 'INTAKE · BUYBACK' },
  { yaw: -0.45, pitch: 0.4, e: 0.6, co: 'slot', coT: 'BURN SLOT · ON-CHAIN' },
  { yaw: -0.85, pitch: 0.24, e: 0.85, co: 'igniter', coT: 'IGNITER · FUEL BUY' },
  { yaw: 0.3, pitch: 0.28, e: 0.15, co: 'screen', coT: 'ON FLOOR CLEAR · UNLOCK' },
];
function modeBlend(mF) {
  const f = clamp(mF, 0, MODE_CFG.length - 1); const i = Math.min(Math.floor(f), MODE_CFG.length - 2); const t = ss(f - i);
  const a = MODE_CFG[i], b = MODE_CFG[i + 1];
  return { yaw: lerp(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), e: lerp(a.e, b.e, t) };
}
const inten = (k, mF) => clamp(1 - Math.abs(mF - k) * 1.5);

// ── frame ──
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3();
const frameUI = initUI({ reduced });
let last = performance.now(), T = 0, lenis = null;

function partWorld(name, out) { parts[name].obj.getWorldPosition(out); return out; }
function setOpacity(el, o, holder) { const v = Math.round(o * 1000) / 1000; if (holder.o !== v) { holder.o = v; el.style.opacity = v; el.style.visibility = v <= 0.001 ? 'hidden' : 'visible'; } }

function update(dt) {
  readScroll();
  const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
  S.pS += (S.p - S.pS) * k; S.mFS += (S.mF - S.mFS) * k;
  S.mxS += (S.mx - S.mxS) * (1 - Math.exp(-dt * 3)); S.myS += (S.my - S.myS) * (1 - Math.exp(-dt * 3));
  const p = S.pS, mF = S.mFS, mob = L.mob;
  const t = reduced ? 0 : T;

  // captions
  for (const c of caps) {
    const [a, b] = c.r, fi = 0.04;
    let o = a <= 0 ? 1 - range(p, b - fi, b) : range(p, a, a + fi) * (1 - range(p, b - fi, b));
    if (b > 1) o = range(p, a, a + fi) * (1 - range(mF, -0.95, -0.6));
    const y = (1 - o) * 18;
    if (c.o !== Math.round(o * 1000)) { c.o = Math.round(o * 1000); c.el.style.opacity = o; c.el.style.visibility = o < 0.01 ? 'hidden' : 'visible'; c.el.style.translate = `0 ${y}px`; }
  }
  const microO = 1 - range(p, 0.05, 0.11); micros.forEach((m) => (m.style.opacity = microO));

  // phases
  const tear = range(p, 0.08, 0.34), crack = range(p, 0.2, 0.36), brk = range(p, 0.34, 0.58), lift = range(p, 0.54, 0.8), exp = range(p, 0.78, 0.95);
  const wM = ss(range(mF, -1.1, -0.1)); // blend into mechanism layout

  root.position.y = lerp(L.heroY, 0, eio(lift));
  root.position.x = mob ? 0 : L.visW * (0.13 * ss(tear) * (1 - ss(brk)) - 0.13 * ss(brk) * (1 - eio(lift)));
  root.rotation.y = S.mxS * (reduced ? 0 : 0.14) * (1 - wM * 0.6);
  root.rotation.x = S.myS * (reduced ? 0 : 0.08) * (1 - wM * 0.6);

  // pack
  pack.visible = brk < 1;
  if (pack.visible) {
    pack.rotation.x = -0.18 * ss(tear) - 1.1 * ei(brk) + (reduced ? 0 : Math.sin(t * 0.6) * 0.02 * (1 - tear));
    pack.rotation.y = 0.16 * ss(tear) * (1 - brk) + (reduced ? 0 : Math.sin(t * 0.45) * 0.03 * (1 - tear));
    pack.rotation.z = -0.08 * ss(tear);
    pack.position.y = -8 * ei(brk); pack.position.z = -2 * ss(brk);
    foilMat.normalScale.setScalar(0.75 + 0.9 * tear);
    petals.forEach((pt) => {
      const g = ss(range(tear, pt.d * 0.4, 0.6 + pt.d * 0.4));
      pt.piv.scale.setScalar(Math.max(0.0001, g));
      pt.mesh.rotation.x = -0.15 - 1.25 * g;
    });
    const q = quads;
    for (const m of q) {
      const { sx, sy, spin } = m.userData;
      const j = crack * 0.03, f = eo(brk);
      m.position.set(sx * (j + 2.6 * f), sy * (j + 2.0 * f), 0.02 * crack + 2.4 * f);
      m.rotation.set(spin.x * 2.2 * f, spin.y * 2.2 * f, spin.z * 1.4 * f + sx * sy * crack * 0.03);
      const o = 1 - range(brk, 0.35, 0.8);
      m.material.opacity = MOBILE0 ? 0.22 * o : o; m.visible = o > 0.01;
    }
    pack.userData.flange.material.opacity = 0.28 * (1 - crack);
  }
  // shards
  if (brk > 0 && brk < 1) {
    shardMesh.visible = true;
    for (let i = 0; i < SHARDS; i++) {
      const d = shardData[i], bt = range(brk, d.d, d.d + 0.75);
      tmpV.copy(d.o).addScaledVector(d.v, eo(bt) * 1.6); tmpV.y -= 3.2 * bt * bt; tmpV.y += pack.position.y * 0;
      tmpV.y += L.heroY * 0;
      tmpE.set(d.r.x * bt, d.r.y * bt, d.r.z * bt); tmpQ.setFromEuler(tmpE);
      const sc = bt > 0 ? (1 - range(bt, 0.7, 1)) : 0; tmpS.copy(d.s).multiplyScalar(sc + 1e-4);
      tmpM.compose(tmpV, tmpQ, tmpS); shardMesh.setMatrixAt(i, tmpM);
    }
    shardMesh.instanceMatrix.needsUpdate = true;
  } else shardMesh.visible = false;

  // machine transform
  const s0 = 1.08;
  const pop = Math.sin(Math.PI * clamp(brk * 1.15)) * 0.55;
  const startX = 0, startY = BY + 0.03, startZ = 0.56 + 2.0 * eo(brk);
  const lt = eio(lift);
  let e = eo(exp);
  let mx = lerp(startX, 0, lt), my = lerp(startY + pop, lerp(L.liftY, L.expY, e), lt), mz = lerp(startZ, 0, lt);
  let sc = lerp(s0, lerp(L.sLift, L.sExp, e), lt);
  let yaw = lerp(0, -0.62, lt), pitch = lerp(0, 0.3, lt), roll = Math.sin(Math.PI * brk) * 0.12;
  if (wM > 0) {
    const mb = modeBlend(mF);
    mx = lerp(mx, L.modeX, wM); my = lerp(my, L.modeY, wM); mz = lerp(mz, 0, wM); sc = lerp(sc, L.sMode, wM);
    yaw = lerp(yaw, mb.yaw, wM); pitch = lerp(pitch, mb.pitch, wM); e = lerp(e, mb.e, wM); roll *= 1 - wM;
  }
  const idle = reduced ? 0 : 1;
  M.position.set(mx, my + Math.sin(t * 1.1) * 0.035 * sc * idle * lift, mz);
  M.scale.setScalar(sc);
  M.rotation.set(pitch, yaw + Math.sin(t * 0.35) * 0.07 * idle * lift, roll);
  // pre-lift: machine rides with the pack's tilt so it reads as sealed inside
  if (brk < 1) {
    const ride = 1 - eo(brk);
    M.rotation.x += pack.rotation.x * ride; M.rotation.y += pack.rotation.y * ride; M.rotation.z += pack.rotation.z * ride;
  }

  // explode + mode-specific part motion
  const iCh = inten(2, mF) * wM, iDf = inten(3, mF) * wM, iBn = inten(4, mF) * wM, iIg = inten(5, mF) * wM, iUl = inten(6, mF) * wM;
  for (const n in parts) { const pt = parts[n]; pt.obj.position.copy(pt.base).addScaledVector(pt.ex, e); }
  parts.shell.obj.position.y += 0.75 * iUl;
  const inner = ss(clamp(e * 1.6));
  for (const n of ['core', 'cell', 'igniter']) parts[n].obj.scale.setScalar(Math.max(0.0001, inner));
  parts.core.obj.rotation.y = t * 0.25;
  const fill = 0.18 + 0.8 * ss(clamp((mF - 1.45) / 0.9)) * wM + 0.2 * Math.sin(t * 0.8) * 0 ;
  cellFill.scale.y = Math.max(0.02, Math.min(1, fill));
  rings.forEach((r, i) => (r.rotation.z += dt * (0.6 + i * 0.3 + 9 * iIg) * idle));
  ringMat.emissiveIntensity = 0.15 + iIg * (1.3 + Math.sin(t * 12) * 0.5 * idle);
  matGreenGlow.emissiveIntensity = 0.25 + 1.2 * Math.max(iIg, iBn * (0.5 + 0.5 * Math.sin(t * 9)));
  beam.material.opacity = 0.35 * iUl * (0.8 + 0.2 * Math.sin(t * 4));
  beam.visible = iUl > 0.01;
  beam.scale.set(1, 0.4 + 0.6 * iUl, 1); beam.position.y = 1.1 + 0.75 * iUl + 1.6 * (0.4 + 0.6 * iUl) / 2;

  // coins: charge (fees falling into cell), defend (buys pulled into intake), burn (out the slot, shrinking)
  const cMode = Math.max(iCh, iDf, iBn);
  coinMesh.visible = cMode > 0.02;
  if (coinMesh.visible) {
    const cellP = parts.cell.obj.position, doorP = parts.door.obj.position;
    for (let i = 0; i < COINS; i++) {
      const d = coinData[i]; const ct = reduced ? d.ph : fract(t * 0.42 + d.ph);
      let s = 0;
      if (iCh >= iDf && iCh >= iBn) {
        tmpV.set(cellP.x + (d.r - 0.5) * 0.12, cellP.y + 0.45 + (1 - eo(ct)) * 1.8, cellP.z + (d.r2 - 0.5) * 0.12);
        tmpE.set(Math.PI / 2 * 0.2, d.a + t, 0); s = iCh * (ct < 0.88 ? 1 : (1 - ct) / 0.12);
      } else if (iDf >= iBn) {
        const sx = Math.cos(d.a) * (1.6 + d.r), sy = Math.sin(d.a) * (1 + d.r2 * 0.6);
        const f = eio(ct);
        tmpV.set(doorP.x + sx * (1 - f), doorP.y + sy * (1 - f), doorP.z + 0.05 + (1.4 + d.r) * (1 - f));
        tmpE.set(Math.PI / 2, 0, d.a + t * 2); s = iDf * (ct < 0.9 ? 1 : (1 - ct) / 0.1) * (0.6 + 0.4 * (1 - f));
      } else {
        const sp = slot.getWorldPosition(tmpV); M.worldToLocal(sp);
        const f = ct;
        tmpV.set(sp.x + (d.r - 0.5) * 0.5 * f, sp.y - 0.08 - f * f * 2.2, sp.z + 0.1 + d.r2 * 0.4 * f);
        tmpE.set(d.a + t * 3, d.r * 3 + t * 2, 0); s = iBn * Math.max(0, 1 - f * 1.15);
      }
      tmpQ.setFromEuler(tmpE); tmpS.setScalar(s + 1e-4); tmpM.compose(tmpV, tmpQ, tmpS); coinMesh.setMatrixAt(i, tmpM);
    }
    coinMesh.instanceMatrix.needsUpdate = true;
  }
  // sparks: ignite
  sparks.visible = iIg > 0.02 && !reduced;
  if (sparks.visible) {
    const ip = parts.igniter.obj.position, arr = sparkGeo.attributes.position.array;
    for (let i = 0; i < SPARKS; i++) {
      const d = sparkData[i], st = fract(t * 0.7 * d.sp + d.ph);
      const r = 0.12 + st * 0.6 * d.r;
      arr[i * 3] = ip.x + Math.cos(d.a) * r; arr[i * 3 + 1] = ip.y + 0.45 + st * 1.8 * d.sp - st * st * 0.6; arr[i * 3 + 2] = ip.z + Math.sin(d.a) * r;
    }
    sparkGeo.attributes.position.needsUpdate = true; sparks.material.opacity = iIg; sparks.material.size = 0.09;
  }

  // screen
  if (wM < 0.5) {
    if (lift <= 0.02) drawScreen('count', '1,000,000,000');
    else { const v = lift < 1 ? Math.pow(10, 9 * ss(clamp((lift - 0.1) / 0.9))) - 1 : 1e9; drawScreen('count', '$' + fmtN(v)); }
  } else {
    const idx = Math.round(clamp(mF, 0, 6));
    // real values only (pre-launch: treasury balance is live, everything else honest zero)
    const solTxt = LIVE.sol == null ? '— SOL' : LIVE.sol.toFixed(2) + ' SOL';
    const nf = FLOORS[LIVE.floor];
    if (idx === 0) drawScreen('label', `CYCLES RUN · ${LIVE.cycles}`, LIVE.cycles ? ['READING', 'DECIDING', 'RECEIPT'][Math.floor(t / 1.3) % 3] : 'ARMED');
    else if (idx === 1) drawScreen('read', String(1 + Math.floor((reduced ? 3 : t * 1.5) % 4)), String(LIVE.floor));
    else if (idx === 2) drawScreen('label', 'MODE · CHARGE · TREASURY', solTxt);
    else if (idx === 3) drawScreen('label', 'MODE · DEFEND', 'BUYBACK');
    else if (idx === 4) drawScreen('label', 'MODE · BURN · BURNED', fmtN(LIVE.burned));
    else if (idx === 5) drawScreen('label', 'MODE · IGNITE', 'FUEL BUY');
    else drawScreen('label', 'MODE · UNLOCK · NEXT FLOOR', nf ? '$' + fmtN(nf.v) : '$1B CLEARED');
  }

  // machine floor shadow
  const sh = mShadow; const mh = (0.8 + 0.9 * e) * sc;
  sh.position.set(M.position.x, M.position.y - mh - 0.25 * sc, -0.4);
  sh.scale.set(2.8 * sc, 0.7 * sc, 1);
  sh.material.opacity = 0.5 * Math.max(lt, wM) * (1 - 0.3 * e);
}

// clip planes follow the moving bubble quads
function updateClips() {
  for (const m of quads) {
    if (!m.visible) continue;
    m.updateMatrixWorld();
    m.userData.local.forEach((lp, i) => m.material.clippingPlanes[i].copy(lp).applyMatrix4(m.matrixWorld));
  }
}

const proj = new THREE.Vector3();
function updateCallouts() {
  const p = S.pS, mF = S.mFS, wM = ss(range(mF, -1.1, -0.1));
  const heroO = ss(range(p, 0.88, 0.97)) * (1 - ss(range(mF, -1.3, -0.8)));
  const cur = Math.round(clamp(mF, 0, 6)), cfg = MODE_CFG[cur];
  const modeO = wM * clamp(1 - Math.abs(mF - cur) * 3.2);
  for (const d of coDefs) {
    let o = L.mob ? 0 : heroO;
    let text = d.t;
    if (cfg.co === d.id && modeO > o) { o = modeO; text = cfg.coT; }
    if (d.id === 'screen' && cfg.co === 'screen' && modeO > 0) { o = Math.max(o, modeO); }
    o *= S.fade * (L.mob ? 0 : 1);
    if (o > 0.01) {
      const [obj, off] = anchors[d.id];
      proj.copy(off); obj.localToWorld(proj); proj.project(camera);
      const x = (proj.x * 0.5 + 0.5) * innerWidth, y = (-proj.y * 0.5 + 0.5) * innerHeight;
      const tx = d.side === 'l' ? `translate3d(calc(${x}px - 100% + 3.5px), ${y - 3.5}px, 0)` : `translate3d(${x - 3.5}px, ${y - 3.5}px, 0)`;
      d.el.style.transform = tx;
      if (d.text !== text) { d.text = text; d.el.querySelector('.tx').textContent = text; }
    }
    setOpacity(d.el, o, d);
  }
}

let rendered = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  lenis?.raf(now);
  update(dt);
  frameUI();
  canvas.style.opacity = S.fade;
  if (S.fade > 0.001 || !rendered) {
    scene.updateMatrixWorld(); updateClips();
    renderer.render(scene, camera); rendered = true;
  }
  updateCallouts();
  requestAnimationFrame(loop);
}

addEventListener('resize', () => { layout(); });

async function start() {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch {}
  scrKey = ''; setLD(96);
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.11, smoothWheel: true, anchors: true });
  } else {
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { const t = document.querySelector(a.getAttribute('href')); if (t) { e.preventDefault(); t.scrollIntoView(); } }));
  }
  // debug hook removed for launch
  requestAnimationFrame((n) => { last = n; loop(n); setLD(100);
    setTimeout(() => { document.getElementById('loader').classList.add('done'); document.body.classList.remove('is-loading'); }, 250);
  });
}
start();
