// 3D oda avatarı: iskeletli karakter modeli (KayKit, CC0) + şapka, isim etiketi, konuşma halkası ve balonlar.
// Yürüme, koşma, oturma, zıplama hazır animasyonlardan; tepkiler (el sallama, alkış, selam...) kemikler üzerinde kodla üretilir.
import * as THREE from 'three';
import type { AvatarLook, AvatarModel } from '../../shared/protocol';
import { createCharacter, type CharInstance } from './assets';
import { modelFor } from '../lib/avatarModel';
import { roundRect, textCanvas } from './world';

const G = {
  shadow: new THREE.CircleGeometry(0.5, 20),
  ring: new THREE.RingGeometry(0.55, 0.68, 32),
  stalk: new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5),
  knob: new THREE.SphereGeometry(0.065, 8, 6),
  crown: new THREE.CylinderGeometry(0.22, 0.2, 0.16, 6, 1, true),
  spike: new THREE.ConeGeometry(0.05, 0.14, 4),
  capTop: new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12, 1, false, -Math.PI / 2, Math.PI),
  wizard: new THREE.ConeGeometry(0.3, 0.7, 12),
  wizBrim: new THREE.CylinderGeometry(0.46, 0.46, 0.03, 16),
  halo: new THREE.TorusGeometry(0.24, 0.035, 6, 24),
  band: new THREE.TorusGeometry(0.35, 0.035, 6, 20, Math.PI),
  cup: new THREE.CylinderGeometry(0.11, 0.11, 0.09, 12),
};

const matCache = new Map<string, THREE.MeshLambertMaterial>();
const lam = (c: string) => {
  let m = matCache.get(c);
  if (!m) matCache.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
  return m;
};
const black = new THREE.MeshBasicMaterial({ color: '#1b1410' });
const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: '#f0d48a', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
const haloMat = new THREE.MeshBasicMaterial({ color: '#ffe680' });

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return '#' + c.getHexString();
}

function buildHat(hat: AvatarLook['hat'], color: string): THREE.Group {
  const g = new THREE.Group();
  switch (hat) {
    case 'antenna':
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(G.stalk, black);
        st.position.set(s * 0.12, 0.14, 0);
        st.rotation.z = -s * 0.35;
        const kn = new THREE.Mesh(G.knob, lam('#f5a524'));
        kn.position.set(s * 0.18, 0.3, 0);
        g.add(st, kn);
      }
      break;
    case 'crown': {
      const gold = lam('#f6c343');
      const band = new THREE.Mesh(G.crown, gold);
      band.material = gold;
      (band.material as THREE.Material).side = THREE.DoubleSide;
      band.position.y = 0.04;
      g.add(band);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(G.spike, gold);
        sp.position.set(Math.cos(a) * 0.2, 0.18, Math.sin(a) * 0.2);
        g.add(sp);
      }
      const gem = new THREE.Mesh(G.knob, lam('#e84a5f'));
      gem.position.set(0, 0.05, 0.21);
      gem.scale.setScalar(0.7);
      g.add(gem);
      break;
    }
    case 'cap': {
      const top = new THREE.Mesh(G.capTop, lam(shade(color, -0.18)));
      top.position.y = -0.1;
      top.scale.set(1, 0.75, 1);
      const brim = new THREE.Mesh(G.brim, lam(shade(color, -0.25)));
      brim.position.set(0, -0.08, 0.3);
      brim.scale.set(1.3, 1, 1.4);
      g.add(top, brim);
      break;
    }
    case 'wizard': {
      const cone = new THREE.Mesh(G.wizard, lam('#5a3fb5'));
      cone.position.y = 0.3;
      cone.rotation.z = 0.12;
      const brim = new THREE.Mesh(G.wizBrim, lam('#4a3196'));
      brim.position.y = -0.03;
      const star = new THREE.Mesh(G.knob, lam('#ffd84d'));
      star.position.set(0.05, 0.3, 0.2);
      g.add(cone, brim, star);
      break;
    }
    case 'halo': {
      const h = new THREE.Mesh(G.halo, haloMat);
      h.rotation.x = Math.PI / 2;
      h.position.y = 0.2;
      h.userData.float = true;
      g.add(h);
      break;
    }
    case 'headphones': {
      const band = new THREE.Mesh(G.band, lam('#2b2b33'));
      band.position.y = -0.18;
      band.scale.set(1, 1.05, 1);
      g.add(band);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(G.cup, lam(s < 0 ? '#2b2b33' : '#2b2b33'));
        cup.rotation.z = Math.PI / 2;
        cup.position.set(s * 0.34, -0.2, 0);
        const pad = new THREE.Mesh(G.knob, lam(color));
        pad.position.set(s * 0.395, -0.2, 0);
        g.add(cup, pad);
      }
      break;
    }
  }
  return g;
}

function labelTexture(name: string, color: string) {
  const c = textCanvas(512, 112);
  const g = c.getContext('2d')!;
  g.font = '700 46px Rubik, "Segoe UI", sans-serif';
  const w = Math.min(500, g.measureText(name).width + 70);
  roundRect(g, (512 - w) / 2, 18, w, 76, 38);
  g.fillStyle = 'rgba(16,12,8,0.62)';
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc((512 - w) / 2 + 30, 56, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 256 + 12, 58, w - 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number, lines: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = t;
    while (g.measureText(cur).width > max) {
      // çok uzun kelime
      let k = cur.length;
      while (k > 1 && g.measureText(cur.slice(0, k)).width > max) k--;
      out.push(cur.slice(0, k));
      cur = cur.slice(k);
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/.{0,2}$/, '…');
  }
  return out;
}

function bubbleTexture(text: string) {
  const c = textCanvas(512, 256);
  const g = c.getContext('2d')!;
  g.font = '600 34px Rubik, "Segoe UI", "Segoe UI Emoji", sans-serif';
  const lines = wrap(g, text, 440, 4);
  const lh = 42;
  const w = Math.min(500, Math.max(...lines.map((l) => g.measureText(l).width)) + 48);
  const h = lines.length * lh + 34;
  const x = (512 - w) / 2, y = 256 - h - 22;
  roundRect(g, x, y, w, h, 24);
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 10;
  g.fill();
  g.shadowBlur = 0;
  g.beginPath();
  g.moveTo(256 - 14, y + h - 1);
  g.lineTo(256, 256 - 6);
  g.lineTo(256 + 14, y + h - 1);
  g.fill();
  g.fillStyle = '#1e1a16';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 256, y + 17 + lh / 2 + i * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const EMOJI: Record<string, string> = { heart: '💖', laugh: '😂', clap: '👏', wave: '👋', dance: '🎵' };
function emojiTexture(e: string) {
  const c = textCanvas(128, 128);
  const g = c.getContext('2d')!;
  g.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const emojiTexCache = new Map<string, THREE.CanvasTexture>();

interface Particle {
  sprite: THREE.Sprite;
  t: number;
  vx: number;
}

/** model birimi -> dünya: karakterler yaklaşık 1,65 m boyunda dursun */
const S = 0.75;
/** baş kemiğinden baş merkezine (model birimi) ve şapka ölçeği (şapkalar 0,33 yarıçaplı başa göre çizildi) */
const HEAD_C = 0.44;
const HAT_K = 1.58;
/** otururken: hazır oturma pozu kalçayı 0,4 geri, 0,47 yükseğe koyar */
const SIT_Y = 0.47 * S;
const SIT_Z = 0.4 * S;
/** başlığıyla birlikte karakterin tepe yüksekliği (dünya birimi) */
const TOP: Record<AvatarModel, [own: number, bare: number]> = {
  knight: [2.44 * S, 2.29 * S],
  barbarian: [2.37 * S, 2.16 * S],
  mage: [2.98 * S, 2.18 * S],
  rogue: [2.16 * S, 2.16 * S],
  hooded: [2.23 * S, 2.23 * S],
};
const HAT_TOP: Record<AvatarLook['hat'], number> = { none: 0, antenna: 0, crown: 0.2, cap: 0.05, wizard: 0.75, halo: 0.25, headphones: 0.05 };
const FADE = 0.18;
const qP = new THREE.Quaternion(), qM = new THREE.Quaternion(), qD = new THREE.Quaternion(), qT = new THREE.Quaternion();
const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();

export class Avatar {
  root = new THREE.Group();
  private pivot = new THREE.Group();
  private holder = new THREE.Group();
  private char: CharInstance | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private cur = '';
  private hatAnchor = new THREE.Group();
  private hat: THREE.Group | null = null;
  private ring: THREE.Mesh;
  private label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  private particles: Particle[] = [];
  private emoteName: string | null = null;
  private emoteT = 0;
  private jumpT = -1;
  private lastA = 0;
  private sitK = 0;
  private gen = 0;
  private dead = false;
  /** bu karede elle değiştirilen kemiklerin animasyondan gelen özgün dönüşleri (karıştırıcı sabit değerleri yeniden yazmaz) */
  private touched = new Map<THREE.Object3D, THREE.Quaternion>();
  private spare: THREE.Quaternion[] = [];
  private model: AvatarModel;
  /** karakter modeli yüklenip kurulunca çözülür */
  ready: Promise<void> = Promise.resolve();
  look: AvatarLook;
  name: string;
  // görüntülenen durum (yumuşatılmış)
  x = 0;
  z = 0;
  y = 0;
  ry = 0;
  a = 0;
  speaking = false;

  /** seed: karakter seçilmemişse kişiye göre sabit karakter için (kullanıcı kimliği) */
  constructor(look: AvatarLook, name: string, isMe: boolean, private seed = name) {
    this.look = look;
    this.name = name;
    this.model = modelFor(look.model, seed);
    this.holder.scale.setScalar(S);
    this.pivot.add(this.holder);
    this.root.add(this.pivot);
    const shadow = new THREE.Mesh(G.shadow, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    this.root.add(shadow);
    this.ring = new THREE.Mesh(G.ring, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.root.add(this.ring);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name, look.color), depthWrite: false }));
    this.label.scale.set(2.1, 0.46, 1);
    this.label.position.y = 2.2;
    this.label.renderOrder = 10;
    this.label.visible = !isMe;
    this.root.add(this.label);
    this.build();
  }

  /** karakter modelini (yeniden) kur; dosya ilk kez isteniyorsa yüklenmesi beklenir */
  private build() {
    const gen = ++this.gen;
    const model = this.model;
    this.ready = createCharacter(model, this.look.color)
      .then((ch) => {
        if (this.dead || gen !== this.gen) return;
        if (this.char) this.holder.remove(this.char.root);
        this.mixer?.stopAllAction();
        this.touched.clear();
        this.char = ch;
        // şapka bağlantısı: baş kemiğine bağlı ama karakter uzayında dik duran, baş merkezindeki nokta
        ch.root.updateMatrixWorld(true);
        const head = ch.bones.head;
        if (head) {
          const inv = new THREE.Matrix4().copy(ch.root.matrixWorld).invert().multiply(head.matrixWorld); // baş, model uzayında
          const want = new THREE.Matrix4().makeTranslation(0, inv.elements[13] + HEAD_C, 0);
          this.hatAnchor.matrix.copy(inv.invert().multiply(want));
          this.hatAnchor.matrix.decompose(this.hatAnchor.position, this.hatAnchor.quaternion, this.hatAnchor.scale);
          head.add(this.hatAnchor);
        }
        this.holder.add(ch.root);
        this.mixer = new THREE.AnimationMixer(ch.root);
        this.actions = {};
        const add = (key: string, clip: string, speed = 1) => {
          const c = ch.clips.get(clip);
          if (!c) return;
          const a = this.mixer!.clipAction(c);
          a.timeScale = speed;
          this.actions[key] = a;
        };
        add('idle', 'Idle');
        add('walk', 'Walking_A', 1.55);
        add('run', 'Running_A', 1.45);
        add('sit', 'Sit_Chair_Idle');
        add('jump', 'Jump_Idle');
        this.cur = '';
        // herkes aynı anda nefes almasın
        if (this.actions.idle) this.actions.idle.time = Math.random();
        this.setHat(this.look.hat);
      })
      .catch((e) => console.warn('3D karakter yüklenemedi', e));
  }

  private play(name: string) {
    if (name === this.cur) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.actions[this.cur];
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (name === 'idle') next.time = Math.random();
    next.play();
    if (prev) prev.crossFadeTo(next, FADE, false);
    this.cur = name;
  }

  private setHat(hat: AvatarLook['hat']) {
    if (this.hat) this.hatAnchor.remove(this.hat);
    this.hat = null;
    const own = hat === 'antenna';
    if (this.char?.headgear) this.char.headgear.visible = own;
    if (!own && hat !== 'none') {
      this.hat = buildHat(hat, this.look.color);
      this.hat.scale.setScalar(HAT_K);
      this.hat.position.y = 0.3 * HAT_K;
      this.hatAnchor.add(this.hat);
    }
  }

  get modelId() {
    return this.model;
  }

  /** isim etiketinin duracağı yükseklik */
  private get top() {
    const t = TOP[this.model];
    const own = this.look.hat === 'antenna';
    return (own ? t[0] : t[1] + HAT_TOP[this.look.hat] * HAT_K * S) + 0.34;
  }

  setLook(look: AvatarLook) {
    const old = this.look;
    this.look = look;
    const model = modelFor(look.model, this.seed);
    if (model !== this.model) {
      this.model = model;
      if (old.color !== look.color) this.setName(this.name, true);
      this.build();
      return;
    }
    if (old.color !== look.color) {
      this.char?.setColor(look.color);
      this.setName(this.name, true);
    }
    if (old.hat !== look.hat || old.color !== look.color) this.setHat(look.hat);
  }

  setName(name: string, force = false) {
    if (name === this.name && !force) return;
    this.name = name;
    const m = this.label.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = labelTexture(name, this.look.color);
    m.needsUpdate = true;
  }

  say(text: string) {
    if (this.bubble) {
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
      this.bubble.material.dispose();
      this.root.remove(this.bubble);
    }
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(text), depthWrite: false, transparent: true }));
    this.bubble.scale.set(2.8, 1.4, 1);
    this.bubble.position.y = 2.95;
    this.bubble.renderOrder = 11;
    this.root.add(this.bubble);
    this.bubbleT = 0;
  }

  emote(e: string) {
    this.emoteName = e;
    this.emoteT = 0;
    if (e === 'jump') this.jumpT = 0;
    const em = EMOJI[e];
    if (em && (e === 'heart' || e === 'laugh' || e === 'clap')) {
      let tex = emojiTexCache.get(em);
      if (!tex) emojiTexCache.set(em, (tex = emojiTexture(em)));
      for (let k = 0; k < (e === 'heart' ? 5 : 3); k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        s.scale.setScalar(0.5);
        s.position.set((Math.random() - 0.5) * 0.6, 1.8, 0);
        s.renderOrder = 12;
        this.root.add(s);
        this.particles.push({ sprite: s, t: -k * 0.18, vx: (Math.random() - 0.5) * 0.6 });
      }
    }
  }

  get emoting() {
    return this.emoteName;
  }

  cancelEmote() {
    if (this.emoteName !== 'jump') this.emoteName = null;
  }

  private keep(bone: THREE.Object3D) {
    if (!this.touched.has(bone)) this.touched.set(bone, (this.spare.pop() || new THREE.Quaternion()).copy(bone.quaternion));
  }

  /** Kemiği, karakter uzayındaki (x: karakterin solu, y: yukarı, z: ileri) yöne çevirir; w: karışım */
  private aim(bone: THREE.Object3D | undefined, child: THREE.Object3D | undefined, dx: number, dy: number, dz: number, w: number) {
    if (!bone || !child || !bone.parent || w <= 0) return;
    this.keep(bone);
    this.holder.getWorldQuaternion(qM);
    bone.parent.getWorldQuaternion(qP).invert();
    v1.set(dx, dy, dz).normalize().applyQuaternion(qM).applyQuaternion(qP);
    v0.copy(child.position).normalize().applyQuaternion(bone.quaternion);
    qD.setFromUnitVectors(v0, v1);
    qT.copy(qD).multiply(bone.quaternion);
    bone.quaternion.slerp(qT, Math.min(1, w));
  }

  /** Kemiği karakter uzayındaki bir eksen çevresinde döndürür */
  private turn(bone: THREE.Object3D | undefined, ax: number, ay: number, az: number, angle: number) {
    if (!bone || !bone.parent || !angle) return;
    this.keep(bone);
    this.holder.getWorldQuaternion(qM);
    bone.parent.getWorldQuaternion(qP).invert();
    v1.set(ax, ay, az).applyQuaternion(qM).applyQuaternion(qP);
    bone.quaternion.premultiply(qD.setFromAxisAngle(v1, angle));
  }

  /** kol: s = +1 sol, -1 sağ; üst kol ve ön kol yönleri karakter uzayında (x dışa doğru verilir) */
  private arm(s: 1 | -1, ux: number, uy: number, uz: number, fx: number, fy: number, fz: number, w: number) {
    const b = this.char?.bones;
    if (!b) return;
    const k = s > 0 ? 'l' : 'r';
    this.aim(b['upperarm' + k], b['lowerarm' + k], s * ux, uy, uz, w);
    this.aim(b['lowerarm' + k], b['wrist' + k], s * fx, fy, fz, w);
  }

  /** a: 0 bekle, 1 yürü, 2 koş, 3 otur, 4 zıpla (havada) */
  animate(dt: number, t: number, groundY: number, jumpY: number | null) {
    const a = this.a;
    if (a === 4 && this.lastA !== 4 && jumpY === null) this.jumpT = 0;
    this.lastA = a;
    let y = groundY;
    if (jumpY !== null) y = jumpY;
    else if (this.jumpT >= 0) {
      this.jumpT += dt;
      const d = 0.62;
      if (this.jumpT >= d) this.jumpT = -1;
      else y += 4 * 1.25 * (this.jumpT / d) * (1 - this.jumpT / d);
    }
    this.y += (y - this.y) * Math.min(1, dt * (jumpY !== null || this.jumpT >= 0 ? 60 : 14));
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.ry;

    // hazır animasyon: duruma göre geçiş
    const air = a === 4 || this.jumpT >= 0;
    this.play(a === 3 ? 'sit' : air ? 'jump' : a === 2 ? 'run' : a === 1 ? 'walk' : 'idle');
    this.sitK += ((a === 3 ? 1 : 0) - this.sitK) * Math.min(1, dt * 12);
    this.holder.position.set(0, -SIT_Y * this.sitK, SIT_Z * this.sitK);
    for (const [b, q] of this.touched) {
      b.quaternion.copy(q);
      this.spare.push(q);
    }
    this.touched.clear();
    this.mixer?.update(dt);

    // tepkiler: gövde hareketi (pivot) + kemik üstü kol/gövde pozu
    let bob = 0, roll = 0, spin = 0;
    if (this.emoteName) {
      this.emoteT += dt;
      const et = this.emoteT;
      const b = this.char?.bones || {};
      const env = (dur: number) => Math.max(0, Math.min(1, et / 0.15, (dur - et) / 0.2));
      let dur = 0;
      switch (this.emoteName) {
        case 'wave': {
          const w = env((dur = 2.2));
          this.arm(-1, 0.8, 0.45, 0.2, 0.3 + Math.sin(et * 11) * 0.45, 1, 0.15, w);
          this.turn(b.head, 0, 0, 1, Math.sin(et * 5.5) * 0.08 * w);
          break;
        }
        case 'dance': {
          const w = env((dur = 4.5));
          const ph = et * 8;
          roll = Math.sin(ph) * 0.14 * w;
          bob = Math.abs(Math.sin(ph)) * 0.12 * w;
          spin = Math.sin(et * 2) * 0.6 * w;
          this.arm(1, 0.75, 0.55 + Math.sin(ph) * 0.45, 0.25, 0.25, 1, 0.3, w);
          this.arm(-1, 0.75, 0.55 - Math.sin(ph) * 0.45, 0.25, 0.25, 1, 0.3, w);
          this.turn(b.spine, 0, 1, 0, Math.sin(ph * 0.5) * 0.25 * w);
          break;
        }
        case 'clap': {
          const w = env((dur = 2));
          const open = Math.abs(Math.sin(et * 13)) * 0.3;
          for (const s of [1, -1] as const) this.arm(s, 0.5, -0.45, 0.75, -0.6 + open, 0.3, 0.75, w);
          break;
        }
        case 'spin': {
          const w = env((dur = 1.1));
          spin = Math.min(1, et / 0.9) * Math.PI * 2;
          for (const s of [1, -1] as const) this.arm(s, 1, 0.15, 0, 1, 0.2, 0, w);
          break;
        }
        case 'heart': {
          const w = env((dur = 1.8));
          bob = Math.abs(Math.sin(et * 10)) * 0.04 * w;
          for (const s of [1, -1] as const) this.arm(s, 0.75, 0.7, 0.15, -0.8, 0.55, 0.1, w);
          this.turn(b.head, 0, 0, 1, Math.sin(et * 6) * 0.1 * w);
          break;
        }
        case 'laugh': {
          const w = env((dur = 1.8));
          bob = Math.abs(Math.sin(et * 12)) * 0.05 * w;
          this.turn(b.spine, 1, 0, 0, -0.16 * w);
          this.turn(b.head, 1, 0, 0, (-0.18 + Math.sin(et * 12) * 0.08) * w);
          for (const s of [1, -1] as const) this.arm(s, 0.55, -0.6, 0.55, -0.65, 0.05, 0.75, w);
          break;
        }
        case 'point': {
          // sağ kol ileri: "şuraya bak"
          const w = env((dur = 2.6));
          this.arm(-1, 0.22, 0.02, 1, 0.08, 0.06, 1, w);
          this.turn(b.head, 0, 0, 1, -0.08 * w);
          break;
        }
        case 'bow': {
          const w = env((dur = 1.8));
          const k = (et < 0.4 ? et / 0.4 : et > 1.4 ? Math.max(0, 1 - (et - 1.4) / 0.4) : 1) * w;
          this.turn(b.spine, 1, 0, 0, 0.3 * k);
          this.turn(b.chest, 1, 0, 0, 0.22 * k);
          this.arm(-1, 0.3, -0.6, 0.6, -0.85, 0.15, 0.5, k);
          break;
        }
        case 'jump':
          dur = 0.65;
          break;
        default:
          dur = 0;
      }
      if (et > dur) this.emoteName = null;
    }
    this.pivot.position.y = bob;
    this.pivot.rotation.set(0, spin, roll);
    if (this.hat) for (const c of this.hat.children) if (c.userData.float) c.position.y = 0.2 + Math.sin(t * 3) * 0.04;

    // konuşma halkası nabız gibi atar
    this.ring.visible = this.speaking;
    if (this.speaking) {
      const s = 1 + Math.sin(t * 12) * 0.06;
      this.ring.scale.set(s, s, 1);
    }
    const top = this.top - (SIT_Y - 0.08) * this.sitK;
    this.label.position.y = top;
    // balon 7 sn kalır, son saniyede söner
    if (this.bubble) {
      this.bubbleT += dt;
      this.bubble.position.y = top + 0.75 + Math.min(0.15, this.bubbleT * 0.6);
      const m = this.bubble.material as THREE.SpriteMaterial;
      m.opacity = this.bubbleT > 6 ? Math.max(0, 7 - this.bubbleT) : Math.min(1, this.bubbleT * 6);
      if (this.bubbleT > 7) {
        m.map?.dispose();
        m.dispose();
        this.root.remove(this.bubble);
        this.bubble = null;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      p.sprite.visible = p.t > 0;
      if (p.t <= 0) continue;
      p.sprite.position.y = top - 0.4 + p.t * 1.2;
      p.sprite.position.x += p.vx * dt;
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - p.t / 1.6);
      if (p.t > 1.6) {
        p.sprite.material.dispose();
        this.root.remove(p.sprite);
        this.particles.splice(i, 1);
      }
    }
  }

  dispose() {
    this.dead = true;
    this.mixer?.stopAllAction();
    const m = this.label.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.dispose();
    if (this.bubble) {
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
      this.bubble.material.dispose();
    }
    for (const p of this.particles) p.sprite.material.dispose();
  }
}
