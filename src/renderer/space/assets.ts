// 3D oda varlıkları: karakterler, ortak animasyonlar ve eşya kitaplıkları (GLB, meshopt ile sıkıştırılmış).
// Dosyalar yalnızca 3D oda ilk açıldığında yüklenir ve oturum boyunca bellekte kalır.
// Kaynak ve lisanslar: src/renderer/assets/3d/KAYNAKLAR.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarModel } from '../../shared/protocol';
import sovalyeUrl from '../assets/3d/sovalye.glb?url';
import barbarUrl from '../assets/3d/barbar.glb?url';
import buyucuUrl from '../assets/3d/buyucu.glb?url';
import haydutUrl from '../assets/3d/haydut.glb?url';
import kukuletaliUrl from '../assets/3d/kukuletali.glb?url';
import animUrl from '../assets/3d/animasyon.glb?url';
import salonUrl from '../assets/3d/salon.glb?url';
import meydanUrl from '../assets/3d/meydan.glb?url';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Standart malzemeyi sahnenin geri kalanıyla aynı, hafif Lambert malzemeye çevirir */
function toLambert(root: THREE.Object3D) {
  const cache = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    let l = cache.get(src);
    if (!l) {
      l = new THREE.MeshLambertMaterial({ map: src.map, color: src.color, transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest, side: src.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide });
      l.name = src.name;
      cache.set(src, l);
      src.dispose();
    }
    m.material = l;
  });
}

// ---------------------------------------------------------------- eşya kitaplıkları
export type LibName = 'salon' | 'meydan';
export interface Library {
  /** adı verilen modelin kopyası (geometri ve malzeme paylaşılır) */
  get(name: string): THREE.Object3D;
  has(name: string): boolean;
}
const LIB_URL: Record<LibName, string> = { salon: salonUrl, meydan: meydanUrl };
const libs = new Map<LibName, Promise<Library>>();

export function loadLibrary(name: LibName): Promise<Library> {
  let p = libs.get(name);
  if (!p) {
    p = loader.loadAsync(LIB_URL[name]).then((g) => {
      toLambert(g.scene);
      const items = new Map<string, THREE.Object3D>();
      for (const c of g.scene.children) items.set(c.name, c);
      return {
        has: (n) => items.has(n),
        get(n) {
          const src = items.get(n);
          if (!src) {
            console.warn('3D model yok:', n);
            return new THREE.Group();
          }
          return src.clone(true);
        },
      };
    });
    p.catch(() => libs.delete(name));
    libs.set(name, p);
  }
  return p;
}

// ---------------------------------------------------------------- karakterler
const MODEL_URL: Record<AvatarModel, string> = { knight: sovalyeUrl, barbarian: barbarUrl, mage: buyucuUrl, rogue: haydutUrl, hooded: kukuletaliUrl };
/** Kıyafetin kullanıcı rengine boyanan ton aralığı (derece) */
const BAND: Record<AvatarModel, [number, number]> = { knight: [335, 8], barbarian: [195, 235], mage: [232, 288], rogue: [135, 190], hooded: [135, 190] };

interface CharSource {
  scene: THREE.Object3D;
  image: CanvasImageSource | null;
  mats: Map<string, THREE.MeshLambertMaterial>;
}
const chars = new Map<AvatarModel, Promise<CharSource>>();
let animP: Promise<Map<string, THREE.AnimationClip>> | null = null;

function loadChar(model: AvatarModel): Promise<CharSource> {
  let p = chars.get(model);
  if (!p) {
    p = loader.loadAsync(MODEL_URL[model]).then((g) => {
      let image: CanvasImageSource | null = null;
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !image) image = ((m.material as THREE.MeshStandardMaterial).map?.image as CanvasImageSource) || null;
      });
      return { scene: g.scene, image, mats: new Map() };
    });
    p.catch(() => chars.delete(model));
    chars.set(model, p);
  }
  return p;
}

export function loadClips(): Promise<Map<string, THREE.AnimationClip>> {
  if (!animP) {
    animP = loader.loadAsync(animUrl).then((g) => new Map(g.animations.map((a) => [a.name, a])));
    animP.catch(() => (animP = null));
  }
  return animP;
}

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Karakter dokusunun kıyafet tonlarını kullanıcının rengine çevirir (ten, deri, metal aynı kalır) */
function outfitMaterial(src: CharSource, model: AvatarModel, color: string): THREE.MeshLambertMaterial {
  const key = color.toLowerCase();
  let m = src.mats.get(key);
  if (m) return m;
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (src.image) g.drawImage(src.image, 0, 0, N, N);
  const tc = new THREE.Color(color);
  // three renkleri doğrusal uzayda tutar; ton için sRGB değerine dön
  const hsl = { h: 0, s: 0, l: 0 };
  tc.getHSL(hsl, THREE.SRGBColorSpace);
  const [lo, hi] = BAND[model];
  const inBand = (h: number) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);
  try {
    const img = g.getImageData(0, 0, N, N);
    const d = img.data;
    const sk = Math.max(0.12, Math.min(1.25, hsl.s / 0.6));
    const lk = 0.72 + hsl.l * 0.6;
    for (let i = 0; i < d.length; i += 4) {
      const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      if (s < 0.22 || !inBand(h)) continue;
      const [r, gg, b] = hsl2rgb(hsl.h * 360, Math.min(1, s * sk), Math.min(0.95, l * lk));
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
    }
    g.putImageData(img, 0, 0);
  } catch {
    /* doku okunamazsa özgün renkler kalır */
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  src.mats.set(key, m);
  return m;
}

export interface CharInstance {
  model: AvatarModel;
  root: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  bones: Record<string, THREE.Object3D>;
  /** karakterin kendi başlığı (miğfer, şapka); yoksa null */
  headgear: THREE.Object3D | null;
  setColor(color: string): void;
}

const BONES = ['hips', 'spine', 'chest', 'head', 'upperarml', 'lowerarml', 'wristl', 'upperarmr', 'lowerarmr', 'wristr', 'handslotr'];

export async function createCharacter(model: AvatarModel, color: string): Promise<CharInstance> {
  const [src, clips] = await Promise.all([loadChar(model), loadClips()]);
  const root = cloneSkinned(src.scene);
  const bones: Record<string, THREE.Object3D> = {};
  for (const b of BONES) {
    const o = root.getObjectByName(b);
    if (o) bones[b] = o;
  }
  let headgear: THREE.Object3D | null = null;
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    m.frustumCulled = false; // iskeletle hareket eden gövdenin sınır kutusu güncel değil
    if (/Helmet|Hat/.test(m.name)) headgear = m;
  });
  const setColor = (c: string) => {
    const mat = outfitMaterial(src, model, c);
    for (const m of meshes) m.material = mat;
  };
  setColor(color);
  return { model, root, clips, bones, headgear, setColor };
}

/** Sık kullanılan dosyaları önceden iste (oda açılırken) */
export function preload(lib: LibName) {
  void loadLibrary(lib).catch(() => {});
  void loadClips().catch(() => {});
}
