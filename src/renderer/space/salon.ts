// "Salon" dünyası: ses odalarının varsayılan 3D görünümü.
// Kapalı, sade bir oturma salonu: duvarda ekran paylaşımının göründüğü büyük ekran, kanepeler, koltuklar, iki masa.
// Renkler Xanaphian Gece paletinden: gece mavisi duvarlar, ince altın çıtalar, turkuaz vurgu.
import * as THREE from 'three';
import { textCanvas, roundRect, type Collider, type Seat, type World } from './world';

export const SALON = { minX: -11.4, maxX: 11.4, minZ: -9.4, maxZ: 10.6, H: 6 };
const GOLD = '#c8aa6e';
const TURQ = '#0ac8b9';
const CREAM = '#f0e6d2';

export interface TableSpot {
  i: number;
  x: number;
  z: number;
  seats: number[];
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  last: string;
}

function woodTexture() {
  const c = textCanvas(512, 512);
  const g = c.getContext('2d')!;
  const tones = ['#5a3d29', '#634430', '#553824', '#6a4934', '#5e402b'];
  for (let row = 0; row < 16; row++) {
    let x = -((row * 97) % 180);
    while (x < 512) {
      const w = 140 + ((row * 31 + x) % 90);
      g.fillStyle = tones[Math.abs(row * 7 + Math.floor(x / 37)) % tones.length];
      g.fillRect(x, row * 32, w, 32);
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.fillRect(x, row * 32, 2, 32);
      x += w;
    }
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, row * 32 + 31, 512, 1);
  }
  // ince damar
  g.globalAlpha = 0.08;
  for (let k = 0; k < 140; k++) {
    g.fillStyle = k % 2 ? '#000' : '#fff';
    g.fillRect((k * 53) % 512, (k * 29) % 512, 40 + (k % 5) * 12, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.anisotropy = 4;
  return t;
}

function rugTexture() {
  const c = textCanvas(512, 320);
  const g = c.getContext('2d')!;
  g.fillStyle = '#16244a';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.85;
  g.lineWidth = 6;
  roundRect(g, 18, 18, 476, 284, 26);
  g.stroke();
  g.lineWidth = 2;
  roundRect(g, 34, 34, 444, 252, 18);
  g.stroke();
  g.globalAlpha = 0.18;
  g.strokeStyle = TURQ;
  g.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    g.ellipse(256, 160, 30 + k * 26, 18 + k * 15, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Duvar tablosu: soyut, özgün kompozisyon */
function artTexture(seed: number) {
  const c = textCanvas(256, 320);
  const g = c.getContext('2d')!;
  g.fillStyle = seed % 2 ? '#e9e1cf' : '#1a2747';
  g.fillRect(0, 0, 256, 320);
  const cols = [GOLD, TURQ, '#c0574b', '#e9e1cf', '#2f4b8a'];
  for (let k = 0; k < 5; k++) {
    g.fillStyle = cols[(k + seed) % cols.length];
    g.globalAlpha = 0.85;
    if (k % 2) {
      g.beginPath();
      g.arc(60 + ((k * 71 + seed * 37) % 140), 60 + ((k * 97 + seed * 23) % 200), 22 + ((k * 13) % 40), 0, Math.PI * 2);
      g.fill();
    } else g.fillRect((k * 43 + seed * 19) % 160, (k * 61) % 220, 50 + (k % 3) * 30, 18 + (k % 2) * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSalon(quality: 'low' | 'high'): World & { tables: TableSpot[] } {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const seats: Seat[] = [];
  const tables: TableSpot[] = [];
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const lambert = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => track(new THREE.MeshLambertMaterial({ color, ...extra }));
  const box = (w: number, h: number, d: number) => track(new THREE.BoxGeometry(w, h, d));
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const { minX, maxX, minZ, maxZ, H } = SALON;
  const W = maxX - minX + 1.2, D = maxZ - minZ + 1.2;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

  // --- zemin, tavan, duvarlar
  const wood = track(woodTexture());
  const floor = put(track(new THREE.PlaneGeometry(W, D)), lambert('#ffffff', { map: wood }), cx, 0, cz);
  floor.rotation.x = -Math.PI / 2;
  const ceil = put(track(new THREE.PlaneGeometry(W, D)), lambert('#0b1328'), cx, H, cz);
  ceil.rotation.x = Math.PI / 2;
  const wallMat = lambert('#1b2850');
  const lowMat = lambert('#101a36');
  const trimMat = lambert(GOLD, { emissive: '#3a2c10' });
  const walls: [number, number, number, number][] = [
    // x, z, uzunluk, dönüş
    [cx, minZ - 0.6, W, 0],
    [cx, maxZ + 0.6, W, Math.PI],
    [minX - 0.6, cz, D, Math.PI / 2],
    [maxX + 0.6, cz, D, -Math.PI / 2],
  ];
  for (const [x, z, len, ry] of walls) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    put(track(new THREE.PlaneGeometry(len, H)), wallMat, 0, H / 2, 0, g);
    put(track(new THREE.PlaneGeometry(len, 1.2)), lowMat, 0, 0.6, 0.01, g);
    put(box(len, 0.06, 0.05), trimMat, 0, 1.2, 0.03, g);
    put(box(len, 0.16, 0.06), lowMat, 0, 0.08, 0.03, g);
  }

  // --- büyük ekran (kuzey duvarı)
  const SW = 8.8, SH = 4.95;
  const screenCanvas = textCanvas(1280, 720);
  const screenTex = track(new THREE.CanvasTexture(screenCanvas));
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = track(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  const frame = put(box(SW + 0.32, SH + 0.32, 0.18), lambert('#05080f'), 0, 3.25, minZ - 0.5);
  frame.castShadow = false;
  const screen = put(track(new THREE.PlaneGeometry(SW, SH)), screenMat, 0, 3.25, minZ - 0.39);
  // ekranın altında turkuaz ışık çizgisi
  put(box(SW * 0.9, 0.04, 0.04), lambert(TURQ, { emissive: TURQ }), 0, 0.72, minZ - 0.4);
  // konsol
  const consoleMat = lambert('#2a1f17');
  put(box(7, 0.55, 0.8), consoleMat, 0, 0.28, minZ + 0.05);
  put(box(7.05, 0.04, 0.82), trimMat, 0, 0.57, minZ + 0.05);
  for (let k = -1; k <= 1; k++) colliders.push({ x: k * 2.4, z: minZ + 0.1, r: 1.2 });

  let video: HTMLVideoElement | null = null;
  let videoTex: THREE.VideoTexture | null = null;
  let idleLabel = '';
  const drawIdle = () => {
    const g = screenCanvas.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 720);
    grd.addColorStop(0, '#111c38');
    grd.addColorStop(1, '#070c1a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1280, 720);
    g.strokeStyle = 'rgba(200,170,110,.35)';
    g.lineWidth = 2;
    g.strokeRect(24, 24, 1232, 672);
    const now = new Date();
    g.fillStyle = CREAM;
    g.textAlign = 'center';
    g.font = '300 170px "Source Sans 3", "Segoe UI", sans-serif';
    g.fillText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, 640, 330);
    g.font = '600 40px "Source Sans 3", "Segoe UI", sans-serif';
    g.fillText('Ekranda şu an yayın yok', 640, 430);
    g.fillStyle = '#a9b6cc';
    g.font = '28px "Source Sans 3", "Segoe UI", sans-serif';
    g.fillText(idleLabel || 'Alttaki ekran paylaş tuşuna bas, yayının burada herkese görünsün.', 640, 482);
    g.fillStyle = GOLD;
    g.font = '24px "Marcellus", serif';
    g.fillText('X A N A P H I A N', 640, 640);
    screenTex.needsUpdate = true;
  };
  drawIdle();
  let lastMinute = -1;

  // --- halı
  const rug = put(track(new THREE.PlaneGeometry(10, 6.2)), lambert('#ffffff', { map: track(rugTexture()) }), 0, 0.012, -1.4);
  rug.rotation.x = -Math.PI / 2;

  // --- mobilya yardımcıları
  const sofaMats = { body: lambert('#2c3f73'), cush: lambert('#36508e'), leg: lambert('#1a120c') };
  const chairMats = { body: lambert('#16676c'), cush: lambert('#1c7e83'), leg: sofaMats.leg };
  /** kanepe: n kişilik, yüzü ry yönüne bakar */
  const sofa = (x: number, z: number, ry: number, n: number, mats = sofaMats) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    const len = n * 1.05 + 0.5;
    put(box(len, 0.36, 1.0), mats.body, 0, 0.3, 0, g);
    put(box(len, 0.85, 0.28), mats.body, 0, 0.62, -0.42, g);
    for (const s of [-1, 1]) put(box(0.28, 0.62, 1.0), mats.body, s * (len / 2 - 0.14), 0.42, 0, g);
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 1.05;
      const cu = put(box(0.98, 0.14, 0.78), mats.cush, ox, 0.53, 0.08, g);
      cu.scale.y = 1;
      put(box(0.9, 0.5, 0.16), mats.cush, ox, 0.85, -0.25, g);
      // dünya koordinatında oturak
      const sx = x + Math.cos(ry) * ox + Math.sin(ry) * 0.12, sz = z - Math.sin(ry) * ox + Math.cos(ry) * 0.12;
      seats.push({ x: sx, z: sz, ry, y: 0.46 });
    }
    for (const s of [-1, 1]) for (const t of [-1, 1]) put(box(0.08, 0.12, 0.08), mats.leg, s * (len / 2 - 0.15), 0.06, t * 0.4, g);
    for (let i = -n / 2; i <= n / 2; i += 0.5) colliders.push({ x: x + Math.cos(ry) * i * 1.05 - Math.sin(ry) * 0.15, z: z - Math.sin(ry) * i * 1.05 - Math.cos(ry) * 0.15, r: 0.5 });
  };
  const roundTable = (x: number, z: number, r: number, h: number, top: THREE.Material) => {
    put(track(new THREE.CylinderGeometry(r, r, 0.08, 28)), top, x, h, z);
    put(track(new THREE.CylinderGeometry(0.08, 0.1, h, 10)), consoleMat, x, h / 2, z);
    put(track(new THREE.CylinderGeometry(r * 0.45, r * 0.5, 0.05, 20)), consoleMat, x, 0.03, z);
    colliders.push({ x, z, r: r + 0.05 });
  };

  // orta: ekrana bakan kanepe + iki koltuk + sehpa
  sofa(0, 2.4, Math.PI, 4);
  sofa(-4.7, -0.6, Math.PI - 0.5, 1, chairMats);
  sofa(4.7, -0.6, Math.PI + 0.5, 1, chairMats);
  const marble = lambert('#e7e1d6');
  roundTable(0, -1.2, 1.1, 0.42, marble);
  // sehpa üstü: kitaplar ve küçük bitki
  put(box(0.6, 0.08, 0.42), lambert('#7a2f35'), -0.35, 0.5, -1.25);
  put(box(0.55, 0.07, 0.38), lambert(GOLD), -0.33, 0.575, -1.22).rotation.y = 0.2;
  // sol kanat: duvara yaslı uzun kanepe, doğuya bakar
  sofa(minX + 0.55, -2.2, Math.PI / 2, 3);
  sofa(minX + 0.55, 3.4, Math.PI / 2, 2);
  roundTable(minX + 2.3, 0.6, 0.45, 0.5, marble);

  // sağ kanat: iki masa, tabureli
  const tableTop = lambert('#1f4f4b');
  const stoolMat = lambert('#8a6243');
  const label = (i: number, x: number, z: number) => {
    const c = textCanvas(256, 64);
    const tex = track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
    sp.scale.set(1.6, 0.4, 1);
    sp.position.set(x, 2.35, z);
    group.add(sp);
    return { c, tex };
  };
  [[7.6, -4.6], [7.6, 3.2]].forEach(([x, z], ti) => {
    put(box(2.4, 0.08, 1.6), tableTop, x, 0.78, z);
    put(box(2.46, 0.03, 1.66), trimMat, x, 0.735, z);
    for (const s of [-1, 1]) for (const t of [-1, 1]) put(box(0.08, 0.74, 0.08), consoleMat, x + s * 1.05, 0.37, z + t * 0.65);
    colliders.push({ x: x - 0.6, z, r: 0.85 }, { x: x + 0.6, z, r: 0.85 });
    const ids: number[] = [];
    const spots: [number, number, number][] = [
      [x - 0.6, z - 1.25, 0], [x + 0.6, z - 1.25, 0],
      [x - 0.6, z + 1.25, Math.PI], [x + 0.6, z + 1.25, Math.PI],
    ];
    for (const [sx, sz, ry] of spots) {
      put(track(new THREE.CylinderGeometry(0.26, 0.22, 0.08, 16)), stoolMat, sx, 0.5, sz);
      put(track(new THREE.CylinderGeometry(0.05, 0.07, 0.48, 8)), consoleMat, sx, 0.24, sz);
      ids.push(seats.length);
      seats.push({ x: sx, z: sz, ry, y: 0.54 });
    }
    const { c, tex } = label(ti, x, z);
    tables.push({ i: ti, x, z, seats: ids, canvas: c, tex, last: '' });
  });

  // --- lambalar ve ışıklar
  const lampShade = lambert('#f3e3c0', { emissive: '#7a5a20' });
  const lampMat = lambert('#ffe3a3', { emissive: '#ffcf7a' });
  const floorLamp = (x: number, z: number) => {
    put(track(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6)), consoleMat, x, 0.95, z);
    put(track(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 16)), consoleMat, x, 0.02, z);
    put(track(new THREE.CylinderGeometry(0.24, 0.36, 0.42, 16, 1, true)), lampShade, x, 2.05, z);
    colliders.push({ x, z, r: 0.3 });
  };
  floorLamp(-6.2, -3.4);
  floorLamp(6.2, -3.4);
  floorLamp(minX + 0.6, 1.4);
  const lights: THREE.PointLight[] = [];
  const pend: [number, number][] = [[0, -1], [7.6, -4.6], [7.6, 3.2], [-8, 0.6], [0, 7]];
  for (const [x, z] of pend) {
    put(track(new THREE.CylinderGeometry(0.01, 0.01, 1.3, 4)), consoleMat, x, H - 0.65, z);
    put(track(new THREE.SphereGeometry(0.26, 16, 10)), lampMat, x, H - 1.4, z);
  }
  const lightSpots: [number, number, number][] = quality === 'high' ? [[0, 4.2, -1], [7.6, 4.2, -0.6], [-8, 4.2, 1], [0, 4.2, 7]] : [[0, 4.2, 0], [6, 4.2, 0]];
  for (const [x, y, z] of lightSpots) {
    const l = new THREE.PointLight('#ffd9a0', 14, 16, 1.6);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
  }
  const screenGlow = new THREE.PointLight('#7fb6ff', 6, 12, 1.8);
  screenGlow.position.set(0, 3, minZ + 2);
  group.add(screenGlow);

  // --- duvar süsleri: neon amblem, tablolar, pencereler
  {
    const c = textCanvas(512, 512);
    const g = c.getContext('2d')!;
    g.shadowColor = TURQ;
    g.shadowBlur = 30;
    g.strokeStyle = '#7ff3ea';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(256, 256, 190, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(170, 160);
    g.lineTo(342, 352);
    g.moveTo(342, 160);
    g.lineTo(170, 352);
    g.stroke();
    const tex = track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const neon = put(track(new THREE.PlaneGeometry(2.6, 2.6)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })), maxX + 0.55, 3.6, -0.6);
    neon.rotation.y = -Math.PI / 2;
    const nl = new THREE.PointLight(TURQ, 4, 7, 1.8);
    nl.position.set(maxX - 0.6, 3.6, -0.6);
    group.add(nl);
  }
  const frameMat = lambert(GOLD);
  [[-7.5, minZ - 0.55, 0, 0], [minX - 0.55, -5.5, Math.PI / 2, 1], [minX - 0.55, 6.5, Math.PI / 2, 2]].forEach(([x, z, ry, s]) => {
    const g = new THREE.Group();
    g.position.set(x, 3.2, z);
    g.rotation.y = ry;
    group.add(g);
    put(box(1.5, 1.86, 0.06), frameMat, 0, 0, 0, g);
    put(track(new THREE.PlaneGeometry(1.36, 1.72)), lambert('#ffffff', { map: track(artTexture(s)) }), 0, 0, 0.035, g);
  });
  // güney duvarında pencereler
  const skyMat = track(new THREE.MeshBasicMaterial({ color: '#0d1838', toneMapped: false }));
  const starsCanvas = textCanvas(256, 256);
  {
    const g = starsCanvas.getContext('2d')!;
    g.fillStyle = '#fff';
    for (let k = 0; k < 60; k++) g.fillRect((k * 97) % 256, (k * 53) % 256, k % 7 ? 1 : 2, k % 7 ? 1 : 2);
  }
  const starTex = track(new THREE.CanvasTexture(starsCanvas));
  const starMat = track(new THREE.MeshBasicMaterial({ map: starTex, transparent: true, toneMapped: false }));
  for (const x of [-7.5, -3, 3, 7.5]) {
    const g = new THREE.Group();
    g.position.set(x, 3.1, maxZ + 0.55);
    g.rotation.y = Math.PI;
    group.add(g);
    put(box(2.6, 2.9, 0.1), frameMat, 0, 0, 0, g);
    put(track(new THREE.PlaneGeometry(2.4, 2.7)), skyMat, 0, 0, 0.06, g);
    put(track(new THREE.PlaneGeometry(2.4, 2.7)), starMat, 0, 0, 0.07, g);
    put(box(0.05, 2.7, 0.05), frameMat, 0, 0, 0.08, g);
    put(box(2.4, 0.05, 0.05), frameMat, 0, 0.3, 0.08, g);
  }
  // köşelerde bitkiler
  const potMat = lambert('#c9b79a');
  const leafMat = lambert('#2f7a52');
  const leafGeo = track(new THREE.ConeGeometry(0.18, 0.9, 5));
  for (const [x, z] of [[minX + 0.4, minZ + 0.4], [maxX - 0.4, minZ + 0.4], [minX + 0.4, maxZ - 0.4], [maxX - 0.4, maxZ - 0.4], [-4.6, minZ + 0.3], [4.6, minZ + 0.3]]) {
    put(track(new THREE.CylinderGeometry(0.32, 0.24, 0.6, 12)), potMat, x, 0.3, z);
    for (let k = 0; k < 7; k++) {
      const lf = put(leafGeo, leafMat, x + Math.cos(k * 0.9) * 0.12, 1.0 + (k % 3) * 0.18, z + Math.sin(k * 0.9) * 0.12);
      lf.rotation.set(Math.cos(k * 0.9) * 0.6, 0, Math.sin(k * 0.9) * 0.6);
    }
    colliders.push({ x, z, r: 0.42 });
  }

  // --- boş oturak işaretleri (yakına gelince görünür)
  const ringGeo = track(new THREE.RingGeometry(0.16, 0.2, 24));
  const ringMat = track(new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  const rings = seats.map((s) => {
    const r = new THREE.Mesh(ringGeo, ringMat.clone());
    track(r.material as THREE.Material);
    r.position.set(s.x, s.y + 0.95, s.z);
    group.add(r);
    return r;
  });

  const clampFn = (p: { x: number; z: number }) => {
    p.x = Math.max(minX, Math.min(maxX, p.x));
    p.z = Math.max(minZ, Math.min(maxZ, p.z));
  };

  let night = true;
  return {
    group,
    colliders,
    seats,
    booths: [],
    tables,
    bounds: 999,
    stage: { x: 9999, z: 9999, r: 0 },
    clamp: clampFn,
    // girişte salonun arka tarafında, ekrana dönük
    spawn: () => ({ x: (Math.random() - 0.5) * 5, z: 6.4 + Math.random() * 1.2, ry: Math.PI }),
    height: () => 0,
    camLimit: { minX: minX - 0.3, maxX: maxX + 0.3, minZ: minZ - 0.3, maxZ: maxZ + 0.3, maxY: H - 0.3 },
    light(n) {
      return n
        ? { bg: '#070b18', fog: [30, 70], hemi: ['#8a9ad8', '#2a1f17', 0.85], sun: ['#a9b8ff', 0.25] }
        : { bg: '#9fc8ef', fog: [40, 90], hemi: ['#fff6e6', '#5a4632', 1.7], sun: ['#fff1d6', 0.9] };
    },
    setNight(v) {
      night = v;
      skyMat.color.set(v ? '#0d1838' : '#8fc4f0');
      starMat.opacity = v ? 1 : 0;
      for (const l of lights) l.intensity = v ? 14 : 5;
      lampMat.emissive.set(v ? '#ffcf7a' : '#a08050');
    },
    setScreen(v, label) {
      idleLabel = label || '';
      if (v === video) {
        if (!v) drawIdle();
        return;
      }
      video = v;
      videoTex?.dispose();
      videoTex = null;
      if (v) {
        videoTex = new THREE.VideoTexture(v);
        videoTex.colorSpace = THREE.SRGBColorSpace;
        screenMat.map = videoTex;
      } else {
        screenMat.map = screenTex;
        drawIdle();
      }
      screenMat.needsUpdate = true;
    },
    drawMap(g, P, k) {
      const [x0, z0] = P(minX, minZ);
      g.fillStyle = 'rgba(16,26,54,.9)';
      g.fillRect(x0, z0, (maxX - minX) * k, (maxZ - minZ) * k);
      g.strokeStyle = GOLD;
      g.lineWidth = 1;
      g.strokeRect(x0, z0, (maxX - minX) * k, (maxZ - minZ) * k);
      const [sx, sz] = P(-SW / 2, minZ);
      g.fillStyle = TURQ;
      g.fillRect(sx, sz, SW * k, 3);
      g.fillStyle = 'rgba(54,80,142,.9)';
      for (const s of seats) {
        const [px, pz] = P(s.x, s.z);
        g.fillRect(px - 2, pz - 2, 4, 4);
      }
    },
    mapScale: 13,
    seatOccupancy(occ, me) {
      for (let i = 0; i < rings.length; i++) {
        const s = seats[i];
        const near = me && Math.hypot(s.x - me.x, s.z - me.z) < 5;
        (rings[i].material as THREE.MeshBasicMaterial).opacity = !occ.has(i) && near ? 0.55 : 0;
      }
      for (const t of tables) {
        const n = t.seats.filter((i) => occ.has(i)).length;
        const txt = `Masa ${t.i + 1} · ${n ? n + ' kişi' : 'boş'}`;
        if (txt === t.last) continue;
        t.last = txt;
        const g = t.canvas.getContext('2d')!;
        g.clearRect(0, 0, 256, 64);
        g.fillStyle = 'rgba(7,12,26,.82)';
        roundRect(g, 4, 6, 248, 52, 26);
        g.fill();
        g.strokeStyle = 'rgba(200,170,110,.6)';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = CREAM;
        g.font = '600 26px "Source Sans 3", "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillText(txt, 128, 41);
        t.tex.needsUpdate = true;
      }
    },
    update(t) {
      const m = new Date().getMinutes();
      if (!video && m !== lastMinute) {
        lastMinute = m;
        drawIdle();
      }
      screenGlow.intensity = (night ? 6 : 2) * (video ? 1.4 : 1);
      void t;
    },
    dispose() {
      videoTex?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
