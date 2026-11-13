// "Kovan Meydanı" haritası: altıgen petek zeminli meydan, sahne, standlar, kamp ateşi, gölet, ağaçlar.
import * as THREE from 'three';

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
    g.font = `800 ${size}px Inter, "Segoe UI", sans-serif`;
    while (g.measureText(text).width > W - 60 && size > 26) g.font = `800 ${(size -= 4)}px Inter, "Segoe UI", sans-serif`;
    g.fillText(text, W / 2, H / 2 - 18);
    g.font = '600 30px Inter, "Segoe UI", sans-serif';
    g.fillStyle = color;
    g.fillText('— ' + owner, W / 2, H - 46);
  } else {
    g.fillStyle = '#f5c35a';
    g.font = '800 52px Inter, "Segoe UI", sans-serif';
    g.fillText('BOŞ STAND', W / 2, H / 2 - 16);
    g.font = '600 28px Inter, "Segoe UI", sans-serif';
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

export function buildWorld(quality: 'low' | 'high'): World {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const seats: Seat[] = [];
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const lambert = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => track(new THREE.MeshLambertMaterial({ color, ...extra }));
  const R = rng(7);

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
      if (Math.hypot(x, z) < PLAZA) tiles.push([x, z]);
    }
  const tileMesh = new THREE.InstancedMesh(tileGeo, lambert('#ffffff'), tiles.length);
  const shades = ['#e9b44c', '#f0c262', '#dfa63e', '#f3cd78', '#e6ac45'].map((c) => new THREE.Color(c));
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
    grd.addColorStop(0, '#2a1b0e');
    grd.addColorStop(1, '#120b05');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 384);
    // petek deseni
    g.strokeStyle = 'rgba(245,165,36,0.25)';
    g.lineWidth = 3;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 22; x++) {
        const cx = x * 52 + (y % 2) * 26, cy = y * 45 + 10;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          g.lineTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
        }
        g.closePath();
        g.stroke();
      }
    g.fillStyle = '#f5a524';
    g.font = '900 120px Inter, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#f5a524';
    g.shadowBlur = 30;
    g.fillText('KOVAN SAHNESİ', 512, 170);
    g.shadowBlur = 0;
    g.font = '600 40px Inter, "Segoe UI", sans-serif';
    g.fillStyle = '#ffe2a8';
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
  const counterGeo = track(new THREE.BoxGeometry(2.8, 1.05, 1));
  const postGeo = track(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6));
  const roofGeo = track(new THREE.BoxGeometry(3.2, 0.12, 1.9));
  const signGeo = track(new THREE.PlaneGeometry(2.8, 0.7));
  const woodMat = lambert('#9a6b3d');
  const postMat = lambert('#5b3d22');
  boothPos.forEach(([x, z, ry], i) => {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    const counter = new THREE.Mesh(counterGeo, woodMat);
    counter.position.set(0, 0.52, 0.35);
    b.add(counter);
    const front = new THREE.Mesh(track(new THREE.PlaneGeometry(2.8, 0.5)), lambert(BOOTH_COLORS[i]));
    front.position.set(0, 0.7, 0.86);
    b.add(front);
    for (const [px, pz] of [[-1.35, 0.8], [1.35, 0.8], [-1.35, -0.8], [1.35, -0.8]]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(px, 1.3, pz);
      b.add(p);
    }
    const stripes = track(stripeTexture(BOOTH_COLORS[i]));
    stripes.wrapS = THREE.RepeatWrapping;
    stripes.repeat.set(2, 1);
    const awning = new THREE.Mesh(roofGeo, [lambert('#fff6e4'), lambert('#fff6e4'), lambert('#ffffff', { map: stripes }), lambert(BOOTH_COLORS[i]), lambert(BOOTH_COLORS[i]), lambert(BOOTH_COLORS[i])]);
    awning.position.set(0, 2.62, 0.1);
    awning.rotation.x = 0.12;
    b.add(awning);
    const canvas = textCanvas(512, 128 * 1.0 + 0);
    canvas.height = 128;
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sign = new THREE.Mesh(signGeo, track(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
    sign.position.set(0, 3.15, 0.95);
    b.add(sign);
    group.add(b);
    // tezgâh çarpışması: dünya koordinatına çevir
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const rx = Math.cos(ry), rz = -Math.sin(ry);
    for (const off of [-0.9, 0, 0.9]) colliders.push({ x: x + fx * 0.35 + rx * off, z: z + fz * 0.35 + rz * off, r: 0.62 });
    const spot: BoothSpot = { i, x: x + fx * 1.9, z: z + fz * 1.9, ry, sign, canvas, tex, awning };
    drawBoothSign(spot, null, '', BOOTH_COLORS[i]);
    booths.push(spot);
  });

  // --- çeşme ve dönen petek kristali (merkez)
  const FOUNT = { x: 0, z: 2 };
  const basin = new THREE.Mesh(track(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 6)), lambert('#c9b48f'));
  basin.position.set(FOUNT.x, 0.3, FOUNT.z);
  basin.rotation.y = Math.PI / 6;
  group.add(basin);
  const water = new THREE.Mesh(track(new THREE.CylinderGeometry(2.1, 2.1, 0.05, 6)), lambert('#4fb3e8', { transparent: true, opacity: 0.85 }));
  water.position.set(FOUNT.x, 0.55, FOUNT.z);
  water.rotation.y = Math.PI / 6;
  group.add(water);
  const pillar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6)), lambert('#b39b74'));
  pillar.position.set(FOUNT.x, 1.1, FOUNT.z);
  group.add(pillar);
  const gemMat = track(new THREE.MeshLambertMaterial({ color: '#f5a524', emissive: '#7a4a00', flatShading: true }));
  const gem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.6, 0)), gemMat);
  gem.scale.set(1, 1.5, 1);
  gem.position.set(FOUNT.x, 2.6, FOUNT.z);
  group.add(gem);
  const gemRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.95, 0.05, 6, 6)), gemMat);
  gemRing.position.set(FOUNT.x, 2.6, FOUNT.z);
  gemRing.rotation.x = Math.PI / 2;
  group.add(gemRing);
  colliders.push({ x: FOUNT.x, z: FOUNT.z, r: 2.55 });
  // çeşme kenarına oturulabilir
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    if (Math.abs(Math.sin(a) + 1) < 0.2) continue;
    seats.push({ x: FOUNT.x + Math.cos(a) * 2.85, z: FOUNT.z + Math.sin(a) * 2.85, ry: Math.atan2(Math.cos(a), Math.sin(a)), y: 0.3 });
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
  const stones = new THREE.InstancedMesh(track(new THREE.DodecahedronGeometry(0.22, 0)), lambert('#8d8a85'), 10);
  for (let k = 0; k < 10; k++) {
    const a = (Math.PI * 2 * k) / 10;
    m4.compose(p3.set(FIRE.x + Math.cos(a) * 0.95, 0.12, FIRE.z + Math.sin(a) * 0.95), q.setFromEuler(e.set(R(), R(), R())), s3.set(1, 0.7, 1));
    stones.setMatrixAt(k, m4);
  }
  group.add(stones);
  const flameMat = track(new THREE.MeshBasicMaterial({ color: '#ff9a2e', transparent: true, opacity: 0.92 }));
  const flameMat2 = track(new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9 }));
  const flame = new THREE.Mesh(track(new THREE.ConeGeometry(0.42, 1.2, 7)), flameMat);
  flame.position.set(FIRE.x, 0.75, FIRE.z);
  const flame2 = new THREE.Mesh(track(new THREE.ConeGeometry(0.24, 0.8, 7)), flameMat2);
  flame2.position.set(FIRE.x, 0.6, FIRE.z);
  group.add(flame, flame2);
  const fireLight = new THREE.PointLight('#ff9a40', 0, 14, 1.6);
  fireLight.position.set(FIRE.x, 1.4, FIRE.z);
  group.add(fireLight);
  colliders.push({ x: FIRE.x, z: FIRE.z, r: 1.1 });
  const benchGeo = track(new THREE.CylinderGeometry(0.26, 0.26, 1.7, 8));
  for (let k = 0; k < 5; k++) {
    const a = (Math.PI * 2 * k) / 5 + 0.3;
    const bx = FIRE.x + Math.cos(a) * 3.1, bz = FIRE.z + Math.sin(a) * 3.1;
    const bench = new THREE.Mesh(benchGeo, logMat);
    bench.position.set(bx, 0.26, bz);
    bench.rotation.set(0, -a, Math.PI / 2);
    group.add(bench);
    colliders.push({ x: bx, z: bz, r: 0.45 });
    // her bankta iki koltuk, ateşe dönük
    const tx = -Math.sin(a), tz = Math.cos(a);
    for (const off of [-0.45, 0.45]) {
      const sx = bx + tx * off, sz = bz + tz * off;
      seats.push({ x: sx, z: sz, ry: Math.atan2(FIRE.x - sx, FIRE.z - sz), y: 0.42 });
    }
  }

  // --- gölet (güneybatı) ve nilüferler
  const POND = { x: -10, z: 12.5, r: 3.4 };
  const pond = new THREE.Mesh(track(new THREE.CircleGeometry(POND.r, 24)), lambert('#3f9fd8', { transparent: true, opacity: 0.92 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND.x, 0.03, POND.z);
  group.add(pond);
  const shore = new THREE.Mesh(track(new THREE.TorusGeometry(POND.r + 0.1, 0.25, 6, 32)), lambert('#a89a7a'));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(POND.x, 0.05, POND.z);
  group.add(shore);
  const lily = new THREE.InstancedMesh(track(new THREE.CircleGeometry(0.35, 10)), lambert('#4c9a3a'), 7);
  for (let k = 0; k < 7; k++) {
    const a = R() * Math.PI * 2, d = R() * (POND.r - 0.8);
    m4.compose(p3.set(POND.x + Math.cos(a) * d, 0.06, POND.z + Math.sin(a) * d), q.setFromEuler(e.set(-Math.PI / 2, 0, R() * 6)), s3.set(1, 1, 1));
    lily.setMatrixAt(k, m4);
  }
  group.add(lily);
  colliders.push({ x: POND.x, z: POND.z, r: POND.r + 0.2 });

  // --- lambalar (meydan kenarı)
  const lampMats: THREE.MeshBasicMaterial[] = [];
  const lampPostGeo = track(new THREE.CylinderGeometry(0.08, 0.12, 3, 6));
  const lampHeadGeo = track(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 6));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: '#fff1c4' }));
  lampMats.push(lampMat);
  for (let k = 0; k < 14; k++) {
    const a = (Math.PI * 2 * k) / 14 + 0.12;
    const x = Math.cos(a) * 19.6, z = Math.sin(a) * 19.6;
    if (Math.hypot(x - STAGE.x, z - STAGE.z) < 7.5) continue;
    const post = new THREE.Mesh(lampPostGeo, postMat);
    post.position.set(x, 1.5, z);
    const head = new THREE.Mesh(lampHeadGeo, lampMat);
    head.position.set(x, 3.15, z);
    group.add(post, head);
    colliders.push({ x, z, r: 0.3 });
  }

  // --- ağaçlar (çevre) ve çit çalıları
  const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6));
  const leafGeo = track(new THREE.ConeGeometry(1.3, 2.4, 7));
  const leafGeo2 = track(new THREE.ConeGeometry(1.0, 1.8, 7));
  const roundLeaf = track(new THREE.IcosahedronGeometry(1.25, 0));
  const N = quality === 'low' ? 40 : 70;
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert('#6b4a2b'), N);
  const leaves = new THREE.InstancedMesh(leafGeo, lambert('#ffffff', { flatShading: true }), N);
  const leaves2 = new THREE.InstancedMesh(leafGeo2, lambert('#ffffff', { flatShading: true }), N);
  const leafColors = ['#3f8a3a', '#4c9b43', '#357a34', '#5aa84a'].map((c) => new THREE.Color(c));
  let n = 0;
  let tries = 0;
  while (n < N && tries++ < 2000) {
    const a = R() * Math.PI * 2, d = 22 + R() * 30;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue;
    const sc = 0.8 + R() * 0.7;
    const round = R() < 0.35;
    m4.compose(p3.set(x, 0.8 * sc, z), q.identity(), s3.set(sc, sc, sc));
    trunks.setMatrixAt(n, m4);
    m4.compose(p3.set(x, (round ? 2.5 : 2.4) * sc, z), q.setFromEuler(e.set(0, R() * 3, 0)), s3.set(sc, round ? sc * 0.9 : sc, sc));
    leaves.setMatrixAt(n, m4);
    const c = leafColors[Math.floor(R() * leafColors.length)];
    leaves.setColorAt(n, c);
    m4.compose(p3.set(x, (round ? -50 : 3.5) * sc, z), q.identity(), s3.set(sc, sc, sc));
    leaves2.setMatrixAt(n, m4);
    leaves2.setColorAt(n, c);
    if (d < BOUNDS + 2) colliders.push({ x, z, r: 0.45 * sc });
    n++;
  }
  trunks.count = leaves.count = leaves2.count = n;
  group.add(trunks, leaves, leaves2);
  void roundLeaf;
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
  const cloudGeo = track(new THREE.IcosahedronGeometry(3, 1));
  const cloudMat = lambert('#ffffff', { transparent: true, opacity: 0.95, fog: false, emissive: '#666666' });
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set(j * 3.2 - 5, R() * 1.5, R() * 2);
      puff.scale.setScalar(0.7 + R() * 0.6);
      puff.scale.y *= 0.6;
      c.add(puff);
    }
    const a = R() * Math.PI * 2, d = 70 + R() * 60;
    c.position.set(Math.cos(a) * d, 38 + R() * 20, Math.sin(a) * d);
    c.userData.speed = 0.5 + R() * 0.8;
    clouds.add(c);
  }
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
      lampMat.color.set(v ? '#ffe39a' : '#fff1c4');
      gemMat.emissive.set(v ? '#c07800' : '#7a4a00');
    },
    update(t, dt) {
      gem.rotation.y = t * 0.8;
      gem.position.y = 2.6 + Math.sin(t * 1.4) * 0.12;
      gemRing.rotation.z = -t * 0.4;
      gemRing.position.y = gem.position.y;
      const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.06;
      flame.scale.set(1, f, 1);
      flame2.scale.set(1, 2 - f, 1);
      flame.rotation.y = t * 2;
      fireLight.intensity = (night ? 9 : 2.5) * (0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17) * 0.07);
      for (let k = 0; k < lightMats.length; k++) lightMats[k].color.setHSL(((t * 0.08 + k * 0.25) % 1), 0.85, night ? 0.62 : 0.55);
      for (const c of clouds.children) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 140) c.position.x = -140;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
}
