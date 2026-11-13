// Kovan avatarı: yuvarlak gövde, kafa, kollar, ayaklar, şapka, isim etiketi, konuşma halkası ve balonlar.
import * as THREE from 'three';
import type { AvatarLook } from '../../shared/protocol';
import { roundRect, textCanvas } from './world';

const G = {
  body: new THREE.CapsuleGeometry(0.36, 0.42, 4, 14),
  belly: new THREE.SphereGeometry(0.3, 14, 10),
  head: new THREE.SphereGeometry(0.33, 18, 12),
  eye: new THREE.SphereGeometry(0.05, 8, 6),
  cheek: new THREE.CircleGeometry(0.055, 10),
  arm: new THREE.CapsuleGeometry(0.085, 0.3, 3, 8),
  foot: new THREE.SphereGeometry(0.13, 10, 8),
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
const blush = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.7 });
const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
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
  g.font = '700 46px Inter, "Segoe UI", sans-serif';
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
  g.font = '600 34px Inter, "Segoe UI", "Segoe UI Emoji", sans-serif';
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

export class Avatar {
  root = new THREE.Group();
  private bodyPivot = new THREE.Group();
  private body: THREE.Mesh;
  private belly: THREE.Mesh;
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private hat: THREE.Group | null = null;
  private ring: THREE.Mesh;
  private label: THREE.Sprite;
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  private particles: Particle[] = [];
  private phase = 0;
  private emoteName: string | null = null;
  private emoteT = 0;
  private jumpT = -1;
  private lastA = 0;
  look: AvatarLook;
  name: string;
  // görüntülenen durum (yumuşatılmış)
  x = 0;
  z = 0;
  y = 0;
  ry = 0;
  a = 0;
  speaking = false;

  constructor(look: AvatarLook, name: string, isMe: boolean) {
    this.look = look;
    this.name = name;
    this.body = new THREE.Mesh(G.body, lam(look.color));
    this.body.position.y = 0.62;
    this.belly = new THREE.Mesh(G.belly, lam('#fff3dc'));
    this.belly.position.set(0, 0.56, 0.14);
    this.belly.scale.set(0.95, 1.05, 0.7);
    this.bodyPivot.add(this.body, this.belly);
    // kafa
    const skull = new THREE.Mesh(G.head, lam('#ffe7c2'));
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(G.eye, black);
      eye.position.set(s * 0.115, 0.04, 0.3);
      eye.scale.set(1, 1.35, 0.6);
      const ch = new THREE.Mesh(G.cheek, blush);
      ch.position.set(s * 0.2, -0.07, 0.275);
      ch.rotation.y = s * 0.55;
      this.head.add(eye, ch);
    }
    this.head.position.y = 1.32;
    this.bodyPivot.add(this.head);
    // kollar (omuzdan döner)
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      const m = new THREE.Mesh(G.arm, lam(look.color));
      m.position.y = -0.2;
      arm.add(m);
      arm.position.set(s * 0.43, 0.88, 0);
      arm.rotation.z = s * 0.18;
      this.bodyPivot.add(arm);
    }
    this.footL = new THREE.Mesh(G.foot, lam(shade(look.color, -0.2)));
    this.footR = new THREE.Mesh(G.foot, lam(shade(look.color, -0.2)));
    this.footL.position.set(-0.17, 0.09, 0.04);
    this.footR.position.set(0.17, 0.09, 0.04);
    this.footL.scale.set(1, 0.7, 1.3);
    this.footR.scale.set(1, 0.7, 1.3);
    this.bodyPivot.add(this.footL, this.footR);
    this.root.add(this.bodyPivot);
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
    this.setHat(look.hat);
  }

  private setHat(hat: AvatarLook['hat']) {
    if (this.hat) this.head.remove(this.hat);
    this.hat = buildHat(hat, this.look.color);
    this.hat.position.y = 0.3;
    this.head.add(this.hat);
  }

  setLook(look: AvatarLook) {
    const old = this.look;
    this.look = look;
    if (old.color !== look.color) {
      this.body.material = lam(look.color);
      for (const arm of [this.armL, this.armR]) (arm.children[0] as THREE.Mesh).material = lam(look.color);
      this.footL.material = this.footR.material = lam(shade(look.color, -0.2));
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

    const moving = a === 1 || a === 2;
    const speed = a === 2 ? 15 : 10;
    if (moving) this.phase += dt * speed;
    else this.phase *= Math.pow(0.001, dt);
    const sw = Math.sin(this.phase);
    const amp = moving ? (a === 2 ? 0.95 : 0.6) : 0;
    let bob = moving ? Math.abs(Math.cos(this.phase)) * (a === 2 ? 0.1 : 0.06) : Math.sin(t * 2.2 + this.x) * 0.012;
    let armL = sw * amp, armR = -sw * amp, armLz = -0.18, armRz = 0.18;
    let tilt = moving ? (a === 2 ? 0.16 : 0.06) : 0;
    let roll = 0;
    let spin = 0;
    let headTilt = 0;
    let footLz = 0.04 + sw * amp * 0.22, footRz = 0.04 - sw * amp * 0.22;
    let footY = 0.09;
    let sitDrop = 0;

    if (a === 3) {
      sitDrop = -0.32;
      footLz = footRz = 0.38;
      footY = 0.22;
      armL = armR = -0.35;
      bob = Math.sin(t * 2) * 0.01;
      tilt = -0.06;
    }
    if (this.emoteName) {
      this.emoteT += dt;
      const et = this.emoteT;
      switch (this.emoteName) {
        case 'wave':
          armRz = 2.5 + Math.sin(et * 12) * 0.35;
          armR = 0;
          headTilt = Math.sin(et * 6) * 0.1;
          if (et > 2.2) this.emoteName = null;
          break;
        case 'dance':
          roll = Math.sin(et * 8) * 0.18;
          bob = Math.abs(Math.sin(et * 8)) * 0.14;
          armLz = -2.2 + Math.sin(et * 8) * 0.5;
          armRz = 2.2 + Math.sin(et * 8 + Math.PI) * 0.5;
          armL = armR = 0;
          footLz = 0.04 + Math.sin(et * 8) * 0.12;
          footRz = 0.04 - Math.sin(et * 8) * 0.12;
          spin = Math.sin(et * 2) * 0.6;
          if (et > 4.5) this.emoteName = null;
          break;
        case 'clap':
          armL = armR = -1.35;
          armLz = -0.2 - Math.abs(Math.sin(et * 14)) * -0.45 - 0.35;
          armRz = -armLz;
          if (et > 2) this.emoteName = null;
          break;
        case 'spin':
          spin = Math.min(1, et / 0.9) * Math.PI * 2;
          armLz = -1.3;
          armRz = 1.3;
          if (et > 1.1) this.emoteName = null;
          break;
        case 'heart':
        case 'laugh':
          bob += Math.abs(Math.sin(et * 10)) * 0.05;
          headTilt = Math.sin(et * 10) * 0.12;
          if (this.emoteName === 'heart') (armL = -0.4), (armR = -0.4), (armLz = -0.6), (armRz = 0.6);
          if (et > 1.8) this.emoteName = null;
          break;
        case 'jump':
          armLz = -2.4;
          armRz = 2.4;
          if (et > 0.65) this.emoteName = null;
          break;
        default:
          this.emoteName = null;
      }
    }
    if (a === 4 || this.jumpT >= 0) {
      armLz = -2;
      armRz = 2;
      armL = armR = 0;
      footLz = 0.15;
      footRz = -0.05;
    }

    this.bodyPivot.position.y = bob + sitDrop;
    this.bodyPivot.rotation.set(tilt, spin, roll);
    this.root.rotation.y = this.ry;
    this.armL.rotation.set(armL, 0, armLz);
    this.armR.rotation.set(armR, 0, armRz);
    this.head.rotation.set(0, 0, headTilt);
    this.footL.position.set(-0.17, footY + (moving ? Math.max(0, sw) * 0.06 : 0), footLz);
    this.footR.position.set(0.17, footY + (moving ? Math.max(0, -sw) * 0.06 : 0), footRz);
    if (this.hat) for (const c of this.hat.children) if (c.userData.float) c.position.y = 0.2 + Math.sin(t * 3) * 0.04;

    // konuşma halkası nabız gibi atar
    this.ring.visible = this.speaking;
    if (this.speaking) {
      const s = 1 + Math.sin(t * 12) * 0.06;
      this.ring.scale.set(s, s, 1);
    }
    this.label.position.y = 2.2 + sitDrop;
    // balon 7 sn kalır, son saniyede söner
    if (this.bubble) {
      this.bubbleT += dt;
      this.bubble.position.y = 2.95 + sitDrop + Math.min(0.15, this.bubbleT * 0.6);
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
      p.sprite.position.y = 1.8 + p.t * 1.2;
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
