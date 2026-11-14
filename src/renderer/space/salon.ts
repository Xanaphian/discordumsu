// "Salon" dünyası: ses odalarının varsayılan 3D görünümü.
// Kapalı, sade bir oturma salonu: duvarda ekran paylaşımının göründüğü büyük ekran, kanepeler, koltuklar, iki masa.
// Renkler Xanaphian Gece paletinden: gece mavisi duvarlar, ince altın çıtalar, turkuaz vurgu.
import * as THREE from 'three';
import { textCanvas, roundRect, type Collider, type Seat, type World } from './world';
import { propPlacer, UNIT } from './props';

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
  // konsolun üst kenarında turkuaz ışık çizgisi
  put(box(SW * 0.66, 0.03, 0.03), lambert(TURQ, { emissive: TURQ }), 0, 0.775, minZ - 0.38);
  const consoleMat = lambert('#2a1f17');
  for (let k = -1; k <= 1; k++) colliders.push({ x: k * 2.2, z: minZ + 0.1, r: 1.15 });

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
    g.font = '300 170px Rubik, "Segoe UI", sans-serif';
    g.fillText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, 640, 330);
    g.font = '600 40px Rubik, "Segoe UI", sans-serif';
    g.fillText('Ekranda şu an yayın yok', 640, 430);
    g.fillStyle = '#a9b6cc';
    g.font = '28px Rubik, "Segoe UI", sans-serif';
    g.fillText(idleLabel || 'Alttaki ekran paylaş tuşuna bas, yayının burada herkese görünsün.', 640, 482);
    g.fillStyle = GOLD;
    g.font = '24px Rubik, sans-serif';
    g.fillText('X A N A P H I A N', 640, 640);
    screenTex.needsUpdate = true;
  };
  drawIdle();
  let lastMinute = -1;

  // --- halı
  const rug = put(track(new THREE.PlaneGeometry(10, 6.2)), lambert('#ffffff', { map: track(rugTexture()) }), 0, 0.012, -1.4);
  rug.rotation.x = -Math.PI / 2;

  // --- mobilya (KayKit modelleri; ölçüler model birimi x UNIT)
  const P = propPlacer('salon', group);
  /** yerel (yüzü +Z) koordinatı dünya koordinatına çevir */
  const at = (x: number, z: number, ry: number, lx: number, lz: number): [number, number] => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
  const SEAT_H = 0.5 * UNIT;
  /** iki kişilik kanepe (2,25 x 1,2) */
  const couch = (x: number, z: number, ry: number, model = 'couch') => {
    P.put(model, x, 0, z, ry);
    for (const lx of [-0.52, 0.52]) {
      const [sx, sz] = at(x, z, ry, lx, 0.02);
      seats.push({ x: sx, z: sz, ry, y: SEAT_H });
    }
    for (const lx of [-0.75, 0, 0.75]) {
      const [cx2, cz2] = at(x, z, ry, lx, -0.15);
      colliders.push({ x: cx2, z: cz2, r: 0.5 });
    }
  };
  const armchair = (x: number, z: number, ry: number, model = 'armchair') => {
    P.put(model, x, 0, z, ry);
    const [sx, sz] = at(x, z, ry, 0, 0.02);
    seats.push({ x: sx, z: sz, ry, y: SEAT_H });
    const [cx2, cz2] = at(x, z, ry, 0, -0.15);
    colliders.push({ x: cx2, z: cz2, r: 0.6 });
  };
  const lowTable = (x: number, z: number, ry: number) => {
    P.put('table_low', x, 0, z, ry);
    for (const lx of [-0.5, 0.5]) {
      const [cx2, cz2] = at(x, z, ry, lx, 0);
      colliders.push({ x: cx2, z: cz2, r: 0.58 });
    }
  };
  const LOW_H = 0.5 * UNIT;

  // orta: ekrana bakan iki kanepe + iki koltuk + sehpa
  couch(-1.2, 2.5, Math.PI);
  couch(1.2, 2.5, Math.PI);
  armchair(-4.4, -0.3, Math.PI - 0.6, 'armchair_pillows');
  armchair(4.4, -0.3, Math.PI + 0.6, 'armchair_pillows');
  lowTable(0, -0.9, 0);
  P.put('book_set', -0.45, LOW_H + 0.07, -0.95, 1.2, 0.8).rotation.z = Math.PI / 2;
  P.put('mug', 0.25, LOW_H, -0.7, 0.6, 0.7);
  P.put('mug', 0.55, LOW_H, -1.1, 2.4, 0.7);
  P.put('cactus_small_A', 0.05, LOW_H, -1.15, 0, 0.7);
  P.put('pillow_B', -1.7, 0.47, 2.62, 0.4, 0.8).rotation.x = -0.9;
  P.put('pillow_A', 1.72, 0.47, 2.62, -0.4, 0.8).rotation.x = -0.9;

  // sol kanat: duvara yaslı iki kanepe (doğuya bakar), aralarında lambalı sehpa, önlerinde alçak masa
  couch(minX + 0.7, -2.6, Math.PI / 2);
  couch(minX + 0.7, 3.2, Math.PI / 2, 'couch_pillows');
  P.put('table_small', minX + 0.5, 0, 0.3, 0);
  P.put('lamp_table', minX + 0.5, UNIT, 0.3, 0, 0.8);
  colliders.push({ x: minX + 0.5, z: 0.3, r: 0.55 });
  lowTable(minX + 2.7, -2.6, Math.PI / 2);
  P.put('plate', minX + 2.7, LOW_H, -2.9, 0, 0.55);
  P.put('food_burger', minX + 2.7, LOW_H + 0.03, -2.9, 0.5, 0.5);
  P.put('mug', minX + 2.6, LOW_H, -2.2, 1, 0.7);
  armchair(minX + 3.4, 3.2, -Math.PI / 2 - 0.25);
  P.put('table_round', minX + 2.2, 0, 3.4, 0, 0.75);
  P.put('bottle', minX + 2.2, UNIT * 0.75, 3.4, 0, 0.8);
  colliders.push({ x: minX + 2.2, z: 3.4, r: 0.5 });

  // sağ kanat: iki uzun masa, dörder sandalye
  const label = (i: number, x: number, z: number) => {
    const c = textCanvas(256, 64);
    const tex = track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
    sp.scale.set(1.6, 0.4, 1);
    sp.position.set(x, 2.6, z);
    group.add(sp);
    return { c, tex };
  };
  [[7.6, -4.6], [7.6, 3.2]].forEach(([x, z], ti) => {
    P.put('table_medium_long', x, 0, z, 0);
    colliders.push({ x: x - 0.6, z, r: 0.8 }, { x: x + 0.6, z, r: 0.8 });
    const ids: number[] = [];
    const spots: [number, number, number][] = [
      [x - 0.6, z - 1.12, 0], [x + 0.6, z - 1.12, 0],
      [x - 0.6, z + 1.12, Math.PI], [x + 0.6, z + 1.12, Math.PI],
    ];
    for (const [sx, sz, ry] of spots) {
      P.put('chair_A', sx, 0, sz - Math.cos(ry) * 0.1, ry);
      ids.push(seats.length);
      seats.push({ x: sx, z: sz, ry, y: SEAT_H });
    }
    // masa üstü
    const T = UNIT;
    P.put('mug', x - 0.7, T, z - 0.3, 0.8, 0.7);
    P.put('mug', x + 0.5, T, z + 0.35, 3.6, 0.7);
    if (ti === 0) {
      P.put('plate', x + 0.55, T, z - 0.3, 0, 0.5);
      P.put('food_burger', x + 0.55, T + 0.03, z - 0.3, 1, 0.45);
      P.put('menu', x - 0.1, T, z + 0.05, 0.5, 0.7);
    } else {
      P.put('bottle', x - 0.15, T, z - 0.1, 0, 0.8);
      P.put('book_single', x - 0.65, T + 0.1, z + 0.3, 0.3, 0.8).rotation.z = Math.PI / 2;
      P.put('cactus_small_B', x + 0.1, T, z + 0.1, 0, 0.6);
    }
    const { c, tex } = label(ti, x, z);
    tables.push({ i: ti, x, z, seats: ids, canvas: c, tex, last: '' });
  });

  // arka (güney): iki yuvarlak masa, üçer tabure
  for (const x of [-5.4, 5.4]) {
    const z = 8.1;
    P.put('table_round', x, 0, z, 0);
    P.put('mug', x - 0.2, UNIT, z + 0.1, 1.3, 0.7);
    P.put('mug', x + 0.25, UNIT, z - 0.15, 4, 0.7);
    colliders.push({ x, z, r: 0.62 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + (x < 0 ? 0.5 : -0.5);
      const sx = x + Math.sin(a) * 1.15, sz = z + Math.cos(a) * 1.15;
      P.put('stool', sx, 0, sz, a);
      seats.push({ x: sx, z: sz, ry: a + Math.PI, y: SEAT_H });
    }
  }
  // güney duvarının iki ucunda dolaplar (orta boş: girişte kamera oraya sığar), kuzeyde ekranın altında alçak konsol
  P.put('cabinet_medium_decorated', -8.8, 0, maxZ + 0.15, Math.PI);
  P.put('cabinet_small_decorated', -7.3, 0, maxZ + 0.15, Math.PI);
  P.put('cabinet_medium', 8.4, 0, maxZ + 0.15, Math.PI);
  P.put('pictureframe_standing_A', 8.4, UNIT, maxZ + 0.15, Math.PI + 0.3);
  for (const x of [-8.8, -7.3, 8.4]) colliders.push({ x, z: maxZ + 0.2, r: 0.75 });
  for (const x of [-2.25, -0.75, 0.75, 2.25]) P.put('cabinet_medium', x, 0, minZ + 0.05, 0);
  // duvar rafları
  P.put('shelf_B_large_decorated', minX - 0.55, 2.3, 0.3, Math.PI / 2, 1.3);
  P.put('shelf_B_small_decorated', maxX + 0.55, 2.2, 5.6, -Math.PI / 2, 1.3);
  P.put('shelf_B_large_decorated', maxX + 0.55, 2.2, -6.6, -Math.PI / 2, 1.3);
  P.put('shelf_B_large_decorated', 7.5, 2.4, minZ - 0.55, 0, 1.3);

  // --- lambalar ve ışıklar
  const lampMat = lambert('#ffe3a3', { emissive: '#ffcf7a' });
  const floorLamp = (x: number, z: number) => {
    P.put('lamp_standing', x, 0, z, 0);
    colliders.push({ x, z, r: 0.3 });
  };
  floorLamp(-6.2, -1.7);
  floorLamp(6.2, -1.7);
  floorLamp(minX + 0.5, 6.4);
  floorLamp(maxX - 0.5, -0.7);
  const lights: THREE.PointLight[] = [];
  const pend: [number, number][] = [[0, -1], [7.6, -4.6], [7.6, 3.2], [-8, 0.6], [0, 7]];
  for (const [x, z] of pend) {
    put(track(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4)), consoleMat, x, H - 0.55, z);
    put(track(new THREE.SphereGeometry(0.22, 16, 10)), lampMat, x, H - 1.25, z);
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
  [[-7.5, minZ - 0.58, 0, 0], [minX - 0.58, -5.9, Math.PI / 2, 1], [minX - 0.58, 6.6, Math.PI / 2, 2]].forEach(([x, z, ry, sd]) => {
    const g = new THREE.Group();
    g.position.set(x, 3.3, z);
    g.rotation.y = ry;
    group.add(g);
    // çerçeve 1 x 1,2 birim; içindeki boş tuvalin önüne özgün tablo
    P.put('pictureframe_large_A', 0, 0, 0, 0, 2.1, g);
    put(track(new THREE.PlaneGeometry(1.16, 1.48)), lambert('#ffffff', { map: track(artTexture(sd)) }), 0, 0, 0.3, g);
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
  // köşelerde ve ekranın iki yanında saksılar
  ([[minX + 0.5, minZ + 0.5, 'A'], [maxX - 0.5, minZ + 0.5, 'B'], [minX + 0.5, maxZ - 0.5, 'B'], [maxX - 0.5, maxZ - 0.5, 'A'], [-5.2, minZ + 0.4, 'B'], [5.2, minZ + 0.4, 'A']] as [number, number, string][]).forEach(([x, z, v], i) => {
    P.put('cactus_medium_' + v, x, 0, z, i * 1.3, 1.55);
    colliders.push({ x, z, r: 0.5 });
  });

  // --- boş oturak işaretleri (yakına gelince görünür)
  const ringGeo = track(new THREE.RingGeometry(0.16, 0.2, 24));
  const ringMat = track(new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  const rings = seats.map((s) => {
    const r = new THREE.Mesh(ringGeo, ringMat.clone());
    track(r.material as THREE.Material);
    r.position.set(s.x, s.y + 1.25, s.z);
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
        g.font = '600 26px Rubik, "Segoe UI", sans-serif';
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
      P.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
