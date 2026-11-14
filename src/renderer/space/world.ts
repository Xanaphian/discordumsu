// "Meydan" dünyası: taş döşemeli açık meydan, sahne, standlar, kamp ateşi, gölet, ağaçlar.
// Ağaç, kaya, bank, fener, çadır, sandık gibi parçalar KayKit modelleri (props.ts); zemin, sahne, çeşme, ateş kodla üretilir.
import * as THREE from 'three';
import { propPlacer, UNIT } from './props';

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface Seat {
  x: number;
  z: number;
  ry: number;
  y: number;
}

export interface BoothSpot {
  i: number;
  x: number;
  z: number;
  ry: number;
  sign: THREE.Mesh;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  awning: THREE.Mesh;
}

export interface World {
  group: THREE.Group;
  colliders: Collider[];
  seats: Seat[];
  booths: BoothSpot[];
  bounds: number;
  stage: { x: number; z: number; r: number };
  height(x: number, z: number): number;
  /** kapalı dünyalar: dikdörtgen sınır (yoksa `bounds` yarıçaplı daire) */
  clamp?(p: { x: number; z: number }): void;
  /** giriş noktası (yoksa sunucunun verdiği) */
  spawn?(): { x: number; z: number; ry: number };
  /** kameranın çıkamayacağı kutu (duvarlar) */
  camLimit?: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
  /** gökyüzü, sis ve genel ışık (yoksa açık hava değerleri) */
  light?(night: boolean): { bg: string; fog: [number, number]; hemi: [string, string, number]; sun: [string, number] };
  /** duvardaki ekrana yayın ver (null: boş ekran) */
  setScreen?(v: HTMLVideoElement | null, label?: string): void;
  /** mini harita */
  drawMap?(g: CanvasRenderingContext2D, P: (x: number, z: number) => [number, number], k: number): void;
  mapScale?: number;
  /** dolu oturaklar (işaretler, masa tabelaları) */
  seatOccupancy?(occ: Set<number>, me: { x: number; z: number } | null): void;
  setNight(night: boolean): void;
  update(t: number, dt: number): void;
  dispose(): void;
}

export const STAGE = { x: 0, z: -14, r: 5.2 };
export const BOUNDS = 34;
export const BOOTH_COLORS = ['#e85d5d', '#4f9cf0', '#6cc36b', '#b072e8', '#f09a3e', '#3ec7c0'];

/** Deterministik rastgele: harita herkeste aynı görünsün */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function textCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export { roundRect };

export function drawBoothSign(b: BoothSpot, owner: string | null, text: string, color: string) {
  const g = b.canvas.getContext('2d')!;
  const W = b.canvas.width, H = b.canvas.height;
  g.clearRect(0, 0, W, H);
  roundRect(g, 4, 4, W - 8, H - 8, 22);
  g.fillStyle = owner ? '#fff8e8' : '#3a2d1e';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = color;
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (owner) {
    g.fillStyle = '#2b2116';
    let size = 64;
    g.font = `800 ${size}px Rubik, "Segoe UI", sans-serif`;
    while (g.measureText(text).width > W - 60 && size > 26) g.font = `800 ${(size -= 4)}px Rubik, "Segoe UI", sans-serif`;
    g.fillText(text, W / 2, H / 2 - 18);
    g.font = '600 30px Rubik, "Segoe UI", sans-serif';
    g.fillStyle = color;
    g.fillText('— ' + owner, W / 2, H - 46);
  } else {
    g.fillStyle = '#f5c35a';
    g.font = '800 52px Rubik, "Segoe UI", sans-serif';
    g.fillText('BOŞ STAND', W / 2, H / 2 - 16);
    g.font = '600 28px Rubik, "Segoe UI", sans-serif';
    g.fillStyle = '#d8c7a8';
    g.fillText('Yanına gel, E ile kirala', W / 2, H - 46);
  }
  b.tex.needsUpdate = true;
}

function stripeTexture(color: string) {
  const c = textCanvas(128, 32);
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#fff6e4' : color;
    g.fillRect(i * 16, 0, 16, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMeydan(quality: 'low' | 'high'): World {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const seats: Seat[] = [];
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const lambert = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => track(new THREE.MeshLambertMaterial({ color, ...extra }));
  const R = rng(7);
  const P = propPlacer('meydan', group);
  const SEAT_H = 0.5 * UNIT;

  // --- zemin
  const grass = new THREE.Mesh(track(new THREE.CircleGeometry(90, 48)), lambert('#5f9b4f'));
  grass.rotation.x = -Math.PI / 2;
  group.add(grass);
  // çim lekeleri
  const patchGeo = track(new THREE.CircleGeometry(1, 6));
  const patch = new THREE.InstancedMesh(patchGeo, lambert('#6dad59'), 70);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, d = 19 + R() * 40, sc = 1 + R() * 3;
    m4.compose(p3.set(Math.cos(a) * d, 0.01, Math.sin(a) * d), q.setFromEuler(e.set(-Math.PI / 2, 0, R() * 3)), s3.set(sc, sc, 1));
    patch.setMatrixAt(i, m4);
  }
  group.add(patch);

  // --- petek meydan: altıgen karolar
  const HEX = 1.15;
  const tileGeo = track(new THREE.CylinderGeometry(HEX * 0.94, HEX * 0.98, 0.14, 6));
  const tiles: [number, number][] = [];
  const PLAZA = 18.5;
  for (let qq = -20; qq <= 20; qq++)
    for (let rr = -20; rr <= 20; rr++) {
      // sivri uçlu altıgen eksen koordinatları
      const x = HEX * Math.sqrt(3) * (qq + rr / 2);
      const z = HEX * 1.5 * rr;
      // gölün üstüne taş döşenmez
      if (Math.hypot(x, z) < PLAZA && Math.hypot(x + 10, z - 12.5) > 4.1) tiles.push([x, z]);
    }
  const tileMesh = new THREE.InstancedMesh(tileGeo, lambert('#ffffff'), tiles.length);
  // taş döşeme (v1.31: bal sarısı petek yerine sade, sıcak gri taş)
  const shades = ['#b7ae9c', '#c2baa8', '#aaa190', '#beb5a2', '#b2a996'].map((c) => new THREE.Color(c));
  tiles.forEach(([x, z], i) => {
    m4.compose(p3.set(x, 0.07, z), q.setFromEuler(e.set(0, Math.PI / 6, 0)), s3.set(1, 1, 1));
    tileMesh.setMatrixAt(i, m4);
    tileMesh.setColorAt(i, shades[Math.floor(R() * shades.length)]);
  });
  group.add(tileMesh);
  // meydan kenarı
  const rim = new THREE.Mesh(track(new THREE.TorusGeometry(PLAZA + 0.4, 0.28, 6, 64)), lambert('#8a6a3c'));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.1;
  group.add(rim);

  // --- sahne
  const stage = new THREE.Group();
  stage.position.set(STAGE.x, 0, STAGE.z);
  const deck = new THREE.Mesh(track(new THREE.CylinderGeometry(STAGE.r, STAGE.r + 0.3, 0.7, 6)), lambert('#5b3d22'));
  deck.position.y = 0.35;
  deck.rotation.y = Math.PI / 6;
  stage.add(deck);
  const deckTop = new THREE.Mesh(track(new THREE.CylinderGeometry(STAGE.r - 0.25, STAGE.r - 0.25, 0.04, 6)), lambert('#8b5e34'));
  deckTop.position.y = 0.72;
  deckTop.rotation.y = Math.PI / 6;
  stage.add(deckTop);
  const step = new THREE.Mesh(track(new THREE.BoxGeometry(4.2, 0.35, 1.3)), lambert('#6b4a2b'));
  step.position.set(0, 0.17, STAGE.r - 0.1);
  stage.add(step);
  // arka pano
  const boardCanvas = textCanvas(1024, 384);
  {
    const g = boardCanvas.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 384);
    grd.addColorStop(0, '#15223f');
    grd.addColorStop(1, '#0a1226');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = 'rgba(200,170,110,0.55)';
    g.lineWidth = 4;
    g.strokeRect(18, 18, 988, 348);
    g.fillStyle = '#f0e6d2';
    g.font = '400 118px Rubik, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(10,200,185,.6)';
    g.shadowBlur = 24;
    g.fillText('SAHNE', 512, 165);
    g.shadowBlur = 0;
    g.font = '600 40px Rubik, "Segoe UI", sans-serif';
    g.fillStyle = '#c8aa6e';
    g.fillText('Sahnedekini herkes duyar', 512, 290);
  }
  const boardTex = track(new THREE.CanvasTexture(boardCanvas));
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(track(new THREE.BoxGeometry(11, 4.2, 0.4)), [
    lambert('#2a1b0e'),
    lambert('#2a1b0e'),
    lambert('#2a1b0e'),
    lambert('#2a1b0e'),
    track(new THREE.MeshBasicMaterial({ map: boardTex })),
    lambert('#2a1b0e'),
  ]);
  board.position.set(0, 2.85, -STAGE.r + 0.6);
  stage.add(board);
  // hoparlörler ve ışık direkleri
  const spkGeo = track(new THREE.BoxGeometry(1, 1.8, 0.9));
  const spkMat = lambert('#1d1d22');
  const coneMat = lambert('#3a3a44');
  for (const sx of [-1, 1]) {
    const spk = new THREE.Mesh(spkGeo, spkMat);
    spk.position.set(sx * 4.6, 0.9, -STAGE.r + 1.6);
    stage.add(spk);
    const cone = new THREE.Mesh(track(new THREE.CircleGeometry(0.32, 16)), coneMat);
    cone.position.set(sx * 4.6, 1.1, -STAGE.r + 2.06);
    stage.add(cone);
    colliders.push({ x: STAGE.x + sx * 4.6, z: STAGE.z - STAGE.r + 1.6, r: 0.75 });
  }
  const lightMats: THREE.MeshBasicMaterial[] = [];
  for (let k = 0; k < 4; k++) {
    const m = track(new THREE.MeshBasicMaterial({ color: ['#ff5d8f', '#5dc8ff', '#ffd25d', '#8dff7a'][k] }));
    lightMats.push(m);
    const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 12, 8)), m);
    bulb.position.set(-4.2 + k * 2.8, 5.25, -STAGE.r + 0.75);
    stage.add(bulb);
  }
  group.add(stage);
  // sahne çevresi: sancaklar, fıçılar, sandık, saksılar
  P.put('banner_blue', STAGE.x - 6.3, 1.2, STAGE.z - STAGE.r + 0.95, 0, 1.25);
  P.put('banner_shield', STAGE.x + 6.3, 1.2, STAGE.z - STAGE.r + 0.95, 0, 1.25);
  P.put('barrel_stack', STAGE.x - 6.6, 0.14, STAGE.z + 1.6, 0.5, 1);
  P.put('keg', STAGE.x + 6.7, 0.14, STAGE.z + 1.4, -0.9, 0.8);
  P.put('chest', STAGE.x + 6.2, 0.14, STAGE.z + 3.3, -0.5, 0.75);
  P.put('bush', STAGE.x - 2.9, 0.14, STAGE.z + STAGE.r + 0.9, 0, 4.2);
  P.put('bush', STAGE.x + 2.9, 0.14, STAGE.z + STAGE.r + 0.9, 0, 4.2);
  colliders.push({ x: STAGE.x - 6.6, z: STAGE.z + 1.6, r: 0.8 }, { x: STAGE.x + 6.7, z: STAGE.z + 1.4, r: 0.85 }, { x: STAGE.x + 6.2, z: STAGE.z + 3.3, r: 0.6 });
  colliders.push({ x: STAGE.x - 2.9, z: STAGE.z + STAGE.r + 0.9, r: 0.35 }, { x: STAGE.x + 2.9, z: STAGE.z + STAGE.r + 0.9, r: 0.35 });
  // panonun arkasına geçilmesin
  for (let k = -5; k <= 5; k++) colliders.push({ x: STAGE.x + k, z: STAGE.z - STAGE.r + 0.6, r: 0.6 });

  // --- standlar: batı ve doğu kanatlarında 3'er
  const booths: BoothSpot[] = [];
  const boothPos = [
    [-15, -5, Math.PI / 2],
    [-15.5, 1.5, Math.PI / 2],
    [-15, 8, Math.PI / 2],
    [15, -5, -Math.PI / 2],
    [15.5, 1.5, -Math.PI / 2],
    [15, 8, -Math.PI / 2],
  ];
  const counterGeo = track(new THREE.BoxGeometry(2.7, 0.95, 0.8));
  const signGeo = track(new THREE.PlaneGeometry(2.8, 0.7));
  const valanceGeo = track(new THREE.BoxGeometry(3.1, 0.34, 0.06));
  const woodMat = lambert('#8a5a3a');
  const GOODS = ['crate_long_A', 'crate_long_B', 'crate_long_C'];
  boothPos.forEach(([x, z, ry], i) => {
    const b = new THREE.Group();
    b.position.set(x, 0.14, z);
    b.rotation.y = ry;
    // çadır (0,52 birim) tezgâhı örtecek kadar büyütülür: 3,3 m
    P.put('tent', 0, 0, 0, 0, 8.4, b);
    const counter = new THREE.Mesh(counterGeo, woodMat);
    counter.position.set(0, 0.475, 0.75);
    b.add(counter);
    const front = new THREE.Mesh(track(new THREE.PlaneGeometry(2.7, 0.5)), lambert(BOOTH_COLORS[i]));
    front.position.set(0, 0.6, 1.155);
    b.add(front);
    // tezgâh üstü mallar, yanında fıçı ve çuval
    P.put(GOODS[i % 3], -0.7, 0.95, 0.75, 0, 3, b);
    P.put(GOODS[(i + 1) % 3], 0.7, 0.95, 0.75, 0, 3, b);
    P.put('barrel', i % 2 ? -2.1 : 2.1, 0, 0.9, i, 4, b);
    P.put(i % 2 ? 'crate_open' : 'crate_A_big', i % 2 ? 2.15 : -2.15, 0, 0.7, 0.4, 3.6, b);
    P.put('sack', i % 2 ? 2.0 : -2.0, 0, 1.6, 1 + i, 4.5, b);
    const stripes = track(stripeTexture(BOOTH_COLORS[i]));
    stripes.wrapS = THREE.RepeatWrapping;
    stripes.repeat.set(2, 1);
    const awning = new THREE.Mesh(valanceGeo, lambert('#ffffff', { map: stripes }));
    awning.position.set(0, 2.42, 1.62);
    b.add(awning);
    const canvas = textCanvas(512, 128);
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sign = new THREE.Mesh(signGeo, track(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
    sign.position.set(0, 3.0, 1.66);
    b.add(sign);
    group.add(b);
    // tezgâh çarpışması: dünya koordinatına çevir
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const rx = Math.cos(ry), rz = -Math.sin(ry);
    for (const off of [-0.9, 0, 0.9]) colliders.push({ x: x + fx * 0.75 + rx * off, z: z + fz * 0.75 + rz * off, r: 0.62 });
    for (const off of [-2.1, 2.1]) colliders.push({ x: x + fx * 0.85 + rx * off, z: z + fz * 0.85 + rz * off, r: 0.45 });
    const spot: BoothSpot = { i, x: x + fx * 2.3, z: z + fz * 2.3, ry, sign, canvas, tex, awning };
    drawBoothSign(spot, null, '', BOOTH_COLORS[i]);
    booths.push(spot);
  });

  // --- çeşme (merkez): yuvarlak taş havuz, ortada iki katlı çanak, akan su
  const FOUNT = { x: 0, z: 2 };
  const stone = lambert('#cdbfa6', { flatShading: true });
  const stoneDark = lambert('#b3a488', { flatShading: true });
  const lathe = (pts: [number, number][], seg = 20) => track(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  const fount = new THREE.Group();
  fount.position.set(FOUNT.x, 0.14, FOUNT.z);
  group.add(fount);
  // havuz duvarı: dıştan içe kesit
  fount.add(new THREE.Mesh(lathe([[2.75, 0], [2.75, 0.12], [2.6, 0.18], [2.6, 0.5], [2.72, 0.56], [2.72, 0.66], [2.28, 0.66], [2.28, 0.56], [2.34, 0.5], [2.34, 0.1], [0, 0.1]], 24), stone));
  const waterMat = lambert('#58b9e6', { transparent: true, opacity: 0.86, emissive: '#0b3550' });
  const water = new THREE.Mesh(track(new THREE.CircleGeometry(2.34, 24)), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.48;
  fount.add(water);
  // orta sütun ve çanaklar
  fount.add(new THREE.Mesh(lathe([[0.55, 0.1], [0.5, 0.5], [0.3, 0.62], [0.24, 1.3], [0.34, 1.4], [1.15, 1.62], [1.2, 1.74], [1.05, 1.74], [0.3, 1.56], [0, 1.56]], 16), stoneDark));
  fount.add(new THREE.Mesh(lathe([[0.2, 1.56], [0.16, 2.2], [0.24, 2.28], [0.62, 2.42], [0.66, 2.52], [0.54, 2.52], [0.18, 2.4], [0, 2.4]], 12), stone));
  const topKnob = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 8, 6)), stoneDark);
  topKnob.position.y = 2.62;
  fount.add(topKnob);
  for (const [r, y] of [[1.02, 1.7], [0.52, 2.48]] as [number, number][]) {
    const w = new THREE.Mesh(track(new THREE.CircleGeometry(r, 16)), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.y = y;
    fount.add(w);
  }
  // dökülen su: çanak kenarlarından inen ince şeritler (dokusu kayar)
  const fallCanvas = textCanvas(32, 64);
  {
    const g = fallCanvas.getContext('2d')!;
    for (let k = 0; k < 64; k += 8) {
      g.fillStyle = `rgba(210,240,255,${0.35 + ((k / 8) % 2) * 0.35})`;
      g.fillRect(0, k, 32, 8);
    }
  }
  const fallTex = track(new THREE.CanvasTexture(fallCanvas));
  fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.repeat.set(10, 1);
  const fallMat = track(new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  for (const [r, y0, y1] of [[1.19, 0.5, 1.7], [0.65, 1.7, 2.48]] as [number, number, number][]) {
    const f = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, y1 - y0, 20, 1, true)), fallMat);
    f.position.y = (y0 + y1) / 2;
    fount.add(f);
  }
  colliders.push({ x: FOUNT.x, z: FOUNT.z, r: 2.6 });
  // havuz kenarına oturulabilir (yüz dışarı)
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k + Math.PI / 8;
    seats.push({ x: FOUNT.x + Math.sin(a) * 2.62, z: FOUNT.z + Math.cos(a) * 2.62, ry: a, y: 0.14 + 0.66 });
  }

  // --- kamp ateşi ve kütük banklar (güneydoğu)
  const FIRE = { x: 9.5, z: 11 };
  const logGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 6));
  const logMat = lambert('#6b4428');
  for (let k = 0; k < 4; k++) {
    const l = new THREE.Mesh(logGeo, logMat);
    l.position.set(FIRE.x, 0.18, FIRE.z);
    l.rotation.set(Math.PI / 2, 0, (Math.PI / 4) * k);
    group.add(l);
  }
  {
    const ring: [number, number, number, number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const a = (Math.PI * 2 * k) / 10;
      ring.push([FIRE.x + Math.cos(a) * 0.95, 0.12, FIRE.z + Math.sin(a) * 0.95, R() * 6, 1.5 + R() * 0.5]);
    }
    P.many('rock_single_C', ring.filter((_, k) => k % 2 === 0));
    P.many('rock_single_D', ring.filter((_, k) => k % 2 === 1));
  }
  // alev: iç içe üç düşük poligonlu koni, her biri ayrı titrer
  const flames = (['#e8502a', '#ff9a2e', '#ffe27a'] as const).map((c, k) => {
    const m = new THREE.Mesh(track(new THREE.ConeGeometry(0.5 - k * 0.14, 1.35 - k * 0.32, 6)), track(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.94 - k * 0.04 })));
    m.position.set(FIRE.x + (k === 1 ? 0.06 : k === 2 ? -0.04 : 0), 0.3 + (1.35 - k * 0.32) / 2, FIRE.z + (k === 1 ? -0.05 : 0.03));
    m.rotation.y = k * 0.5;
    group.add(m);
    return m;
  });
  const fireLight = new THREE.PointLight('#ff9a40', 0, 14, 1.6);
  fireLight.position.set(FIRE.x, 1.4, FIRE.z);
  group.add(fireLight);
  colliders.push({ x: FIRE.x, z: FIRE.z, r: 1.1 });
  {
    const benches: [number, number, number, number, number][] = [];
    for (let k = 0; k < 5; k++) {
      const a = (Math.PI * 2 * k) / 5 + 0.3;
      const bx = FIRE.x + Math.cos(a) * 3.1, bz = FIRE.z + Math.sin(a) * 3.1;
      const ry = Math.atan2(FIRE.x - bx, FIRE.z - bz);
      benches.push([bx, 0.14, bz, ry, 1]);
      colliders.push({ x: bx, z: bz, r: 0.45 });
      // her bankta iki kişi, ateşe dönük
      const tx = -Math.sin(a), tz = Math.cos(a);
      for (const off of [-0.4, 0.4]) seats.push({ x: bx + tx * off, z: bz + tz * off, ry, y: 0.14 + SEAT_H });
    }
    P.many('bench', benches);
    P.put('resource_lumber', FIRE.x + 4.6, 0.14, FIRE.z - 2.6, 0.7, 2.6);
    colliders.push({ x: FIRE.x + 4.6, z: FIRE.z - 2.6, r: 0.8 });
  }

  // --- gölet (güneybatı) ve nilüferler
  const POND = { x: -10, z: 12.5, r: 3.4 };
  const pond = new THREE.Mesh(track(new THREE.CircleGeometry(POND.r, 24)), lambert('#3f9fd8', { transparent: true, opacity: 0.92 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND.x, 0.05, POND.z);
  group.add(pond);
  {
    const rocks: Record<string, [number, number, number, number, number][]> = { rock_single_A: [], rock_single_B: [], rock_single_E: [] };
    const names = Object.keys(rocks);
    for (let k = 0; k < 26; k++) {
      const a = (Math.PI * 2 * k) / 26 + R() * 0.1;
      const d = POND.r + 0.05 + R() * 0.25;
      rocks[names[k % 3]].push([POND.x + Math.cos(a) * d, 0.02, POND.z + Math.sin(a) * d, R() * 6, 2.6 + R() * 1.6]);
    }
    for (const n of names) P.many(n, rocks[n]);
    const lil: [number, number, number, number, number][][] = [[], []];
    for (let k = 0; k < 9; k++) {
      const a = R() * Math.PI * 2, d = R() * (POND.r - 0.9);
      lil[k % 2].push([POND.x + Math.cos(a) * d, 0.05, POND.z + Math.sin(a) * d, R() * 6, 3.5 + R() * 1.5]);
    }
    P.many('waterlily_A', lil[0]);
    P.many('waterlily_B', lil[1]);
    const reeds: [number, number, number, number, number][][] = [[], [], []];
    for (let k = 0; k < 12; k++) {
      const a = R() * Math.PI * 2, d = POND.r - 0.25 - R() * 0.5;
      reeds[k % 3].push([POND.x + Math.cos(a) * d, 0.04, POND.z + Math.sin(a) * d, R() * 6, 3.4 + R() * 1.4]);
    }
    P.many('waterplant_A', reeds[0]);
    P.many('waterplant_B', reeds[1]);
    P.many('waterplant_C', reeds[2]);
  }
  colliders.push({ x: POND.x, z: POND.z, r: POND.r + 0.2 });

  // --- lambalar (meydan kenarı)
  const lampMats: THREE.MeshBasicMaterial[] = [];
  let lampGlow: THREE.SpriteMaterial | null = null;
  const lampMat = track(new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.0, depthWrite: false, fog: false }));
  lampMats.push(lampMat);
  {
    // taş sütun üstünde fener; gece fenerin çevresinde ışık halesi
    const pillarGeo = track(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 6));
    const capGeo = track(new THREE.CylinderGeometry(0.34, 0.3, 0.12, 6));
    const glowC = textCanvas(64, 64);
    const gg = glowC.getContext('2d')!;
    const grd = gg.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,225,150,1)');
    grd.addColorStop(0.4, 'rgba(255,200,110,.45)');
    grd.addColorStop(1, 'rgba(255,190,90,0)');
    gg.fillStyle = grd;
    gg.fillRect(0, 0, 64, 64);
    const glowTex = track(new THREE.CanvasTexture(glowC));
    const glowMat = track(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    lampGlow = glowMat;
    const spots: [number, number, number, number, number][] = [];
    for (let k = 0; k < 14; k++) {
      const a = (Math.PI * 2 * k) / 14 + 0.12;
      const x = Math.cos(a) * 19.6, z = Math.sin(a) * 19.6;
      if (Math.hypot(x - STAGE.x, z - STAGE.z) < 7.5) continue;
      spots.push([x, 1.62, z, a, 1.5]);
      const pil = new THREE.Mesh(pillarGeo, stoneDark);
      pil.position.set(x, 0.75, z);
      const cap = new THREE.Mesh(capGeo, stone);
      cap.position.set(x, 1.56, z);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(2.6);
      glow.position.set(x, 2.1, z);
      group.add(pil, cap, glow);
      colliders.push({ x, z, r: 0.3 });
    }
    P.many('lantern_standing', spots);
  }

  // --- meydan kenarında banklar, kuyu, el arabası, taş yollar
  {
    const benches: [number, number, number, number, number][] = [];
    for (const a of [0.62, 1.0, 2.14, 2.52, 3.85, 5.57]) {
      const x = Math.sin(a) * 17.2, z = Math.cos(a) * 17.2;
      if (Math.hypot(x - STAGE.x, z - STAGE.z) < 8) continue;
      const ry = a + Math.PI;
      benches.push([x, 0.14, z, ry, 1]);
      colliders.push({ x, z, r: 0.5 });
      const tx = Math.cos(a), tz = -Math.sin(a);
      for (const off of [-0.4, 0.4]) seats.push({ x: x + tx * off, z: z + tz * off, ry, y: 0.14 + SEAT_H });
    }
    P.many('bench', benches);
    P.put('well', -8.2, 0.14, -6.4, 0.7, 3.4);
    colliders.push({ x: -8.2, z: -6.4, r: 1.15 });
    P.put('wheelbarrow', 9.2, 0.14, -7.6, 2.2, 3.4);
    P.put('pallet', 10.4, 0.14, -6.2, 0.3, 3.4);
    P.put('crate_B_small', 10.4, 0.4, -6.2, 0.9, 3.4);
    P.put('bucket_water', -6.6, 0.14, -5.6, 0, 3.4);
    colliders.push({ x: 9.2, z: -7.6, r: 0.7 }, { x: 10.4, z: -6.2, r: 0.6 });
    P.put('flag_red', -3.6, 0.14, 17.6, 1.2, 5);
    P.put('flag_blue', 3.6, 0.14, 17.6, 1.9, 5);
    const paths: Record<string, [number, number, number, number, number][]> = { path_A: [], path_B: [], path_C: [], path_D: [] };
    const pn = Object.keys(paths);
    let n = 0;
    for (const [tx, tz] of [[FIRE.x * 2.15, FIRE.z * 2.15], [POND.x * 2.3, POND.z * 2.1], [0, 30]]) {
      const len = Math.hypot(tx, tz);
      for (let d = 20.3; d < len && d < 32; d += 1.75) paths[pn[n++ % 4]].push([(tx / len) * d + (R() - 0.5) * 0.5, 0.0, (tz / len) * d + (R() - 0.5) * 0.5, R() * 6, 1.25]);
    }
    for (const k of pn) P.many(k, paths[k]);
  }

  // --- ağaçlar (çevre) ve çit çalıları
  const N = quality === 'low' ? 44 : 78;
  const leafColors = ['#3f8a3a', '#4c9b43', '#357a34', '#5aa84a'].map((c) => new THREE.Color(c));
  {
    const trees: [number, number, number, number, number][][] = [[], []];
    let n = 0;
    let tries = 0;
    while (n < N && tries++ < 2000) {
      const a = R() * Math.PI * 2, d = 22 + R() * 30;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue;
      // model 1,2 birim boyunda: 4,5–7,5 m ağaçlar
      const sc = 5 + R() * 3.4;
      trees[R() < 0.45 ? 1 : 0].push([x, 0.5, z, R() * 6, sc]);
      if (d < BOUNDS + 2) colliders.push({ x, z, r: 0.5 });
      n++;
    }
    P.many('tree_single_A', trees[0]);
    P.many('tree_single_B', trees[1]);
    // meydana serpiştirilmiş kayalar ve kütükler
    const rocks: [number, number, number, number, number][][] = [[], [], []];
    for (let k = 0; k < 18; k++) {
      const a = R() * Math.PI * 2, d = 21 + R() * 11;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.2)) continue;
      rocks[k % 3].push([x, 0, z, R() * 6, 3 + R() * 3]);
      colliders.push({ x, z, r: 0.5 });
    }
    P.many('rock_single_B', rocks[0]);
    P.many('rock_single_E', rocks[1]);
    P.many('tree_single_B_cut', rocks[2].map(([x, y, z, ry]) => [x, y + 0.3, z, ry, 4]));
  }
  const bushGeo = track(new THREE.IcosahedronGeometry(0.9, 0));
  const B = Math.round((Math.PI * 2 * (BOUNDS + 1.2)) / 1.6);
  const bushes = new THREE.InstancedMesh(bushGeo, lambert('#ffffff', { flatShading: true }), B);
  for (let k = 0; k < B; k++) {
    const a = (Math.PI * 2 * k) / B;
    const sc = 0.8 + R() * 0.5;
    m4.compose(p3.set(Math.cos(a) * (BOUNDS + 1.2), 0.4, Math.sin(a) * (BOUNDS + 1.2)), q.setFromEuler(e.set(R(), R(), R())), s3.set(sc, sc * 0.8, sc));
    bushes.setMatrixAt(k, m4);
    bushes.setColorAt(k, leafColors[k % leafColors.length]);
  }
  group.add(bushes);

  // --- çiçekler
  const flowerGeo = track(new THREE.SphereGeometry(0.12, 6, 4));
  const F = 120;
  const flowers = new THREE.InstancedMesh(flowerGeo, lambert('#ffffff'), F);
  const fc = ['#ff7aa8', '#ffd84d', '#ffffff', '#b58cff', '#ff9a4d'].map((c) => new THREE.Color(c));
  for (let k = 0; k < F; k++) {
    const a = R() * Math.PI * 2, d = 19.5 + R() * 14;
    m4.compose(p3.set(Math.cos(a) * d, 0.12, Math.sin(a) * d), q.identity(), s3.set(1, 1, 1));
    flowers.setMatrixAt(k, m4);
    flowers.setColorAt(k, fc[k % fc.length]);
  }
  group.add(flowers);

  // --- gökyüzü: yıldızlar, ay, bulutlar
  const starGeo = track(new THREE.BufferGeometry());
  const sp: number[] = [];
  for (let k = 0; k < 600; k++) {
    const u = R() * Math.PI * 2, v = Math.acos(R() * 0.9);
    sp.push(Math.sin(v) * Math.cos(u) * 180, Math.cos(v) * 180, Math.sin(v) * Math.sin(u) * 180);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, track(new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, fog: false })));
  group.add(stars);
  const moon = new THREE.Mesh(track(new THREE.SphereGeometry(6, 16, 12)), track(new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false })));
  moon.position.set(-70, 80, -120);
  group.add(moon);
  const clouds = new THREE.Group();
  const cloudMat = lambert('#ffffff', { fog: false, emissive: '#7d8894' });
  for (let k = 0; k < 9; k++) {
    const a = R() * Math.PI * 2, d = 70 + R() * 60;
    const c = P.put(k % 3 ? 'cloud_big' : 'cloud_small', Math.cos(a) * d, 38 + R() * 20, Math.sin(a) * d, R() * 6, 6 + R() * 5, clouds);
    c.userData.speed = 0.5 + R() * 0.8;
  }
  void P.ready.then(() => clouds.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material = cloudMat))).catch(() => {});
  group.add(clouds);

  const height = (x: number, z: number) => {
    const dx = x - STAGE.x, dz = z - STAGE.z;
    // sahne altıgeni ~ daire
    if (Math.hypot(dx, dz) < STAGE.r - 0.15) return 0.74;
    if (Math.abs(dx) < 2.1 && dz > STAGE.r - 0.8 && dz < STAGE.r + 0.6) return 0.35;
    return 0.14;
  };

  let night = false;
  return {
    group,
    colliders,
    seats,
    booths,
    bounds: BOUNDS,
    stage: STAGE,
    height,
    setNight(v) {
      night = v;
      stars.visible = v;
      moon.visible = v;
      clouds.visible = !v;
      fireLight.intensity = v ? 9 : 2.5;
      if (lampGlow) lampGlow.opacity = v ? 0.95 : 0;
      waterMat.emissive.set(v ? '#0a2a44' : '#0b3550');
    },
    update(t, dt) {
      fallTex.offset.y = t * 0.9;
      flames.forEach((f, k) => {
        const w = 1 + Math.sin(t * (11 + k * 3.7) + k) * 0.1 + Math.sin(t * (6.3 + k * 2.1)) * 0.07;
        f.scale.set(1 / Math.sqrt(w), w, 1 / Math.sqrt(w));
        f.rotation.y = t * (1.4 + k * 0.8);
      });
      fireLight.intensity = (night ? 9 : 2.5) * (0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17) * 0.07);
      for (let k = 0; k < lightMats.length; k++) lightMats[k].color.setHSL(((t * 0.08 + k * 0.25) % 1), 0.85, night ? 0.62 : 0.55);
      for (const c of clouds.children) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 140) c.position.x = -140;
      }
    },
    dispose() {
      P.dispose();
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
}
