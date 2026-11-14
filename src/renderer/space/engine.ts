// 3D oda motoru: sahne, kamera, kontroller, ağ senkronu ve konumsal ses dinleyicisi.
// Bu modül dinamik olarak yüklenir (three.js yalnızca 3D odaya girince indirilir).
import * as THREE from 'three';
import type { ID, Room3d } from '../../shared/protocol';
import { buildMeydan, drawBoothSign, BOOTH_COLORS, type World } from './world';
import { Avatar } from './avatar';
import { buildSalon } from './salon';
import { live, sendMove, emote as sendEmote, useSpace, type SpaceEvent } from '../lib/space';
import { useVoice, spatialListener, spatialSource, spatialForget } from '../lib/voice';

export type Prompt = { kind: 'sit'; label: string } | { kind: 'stand'; label: string } | { kind: 'booth'; i: number; label: string } | null;

export interface EngineOpts {
  quality: 'low' | 'high';
  night: boolean;
  world: Room3d;
  nameOf: (uid: ID) => string;
  myUid: ID;
  onPrompt: (p: Prompt) => void;
  onBooth: (i: number) => void;
  onStage: (on: boolean) => void;
}

const WALK = 4.2;
const RUN = 7.8;
const GRAV = 24;
const JUMP_V = 8;

export const EMOTES: { e: string; label: string; key: string; icon: string }[] = [
  { e: 'wave', label: 'El salla', key: '1', icon: '👋' },
  { e: 'dance', label: 'Dans', key: '2', icon: '💃' },
  { e: 'clap', label: 'Alkış', key: '3', icon: '👏' },
  { e: 'heart', label: 'Kalp', key: '4', icon: '💖' },
  { e: 'laugh', label: 'Gül', key: '5', icon: '😂' },
  { e: 'spin', label: 'Dön', key: '6', icon: '🌀' },
  { e: 'jump', label: 'Zıpla', key: '7', icon: '⤴️' },
];

export class SpaceEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private world: World;
  private avatars = new Map<ID, Avatar>();
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0.42;
  private dist = 8.5;
  private dragging = false;
  private lastPtr = { x: 0, y: 0 };
  private me = { x: 0, z: 14, y: 0.14, vy: 0, ry: Math.PI, air: false, sit: -1 as number, a: 0 };
  private meReady = false;
  private prompt: Prompt = null;
  private onStageNow = false;
  private unsub: () => void;
  private disposed = false;
  private camTarget = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private fps = { n: 0, t: 0, v: 60 };
  paused = false;
  /** birinci şahıs bakış (V) */
  firstPerson = false;
  private occT = 0;
  /** Sohbet kutusu açıkken klavye hareketi durur */
  typing = false;

  constructor(private el: HTMLElement, private opts: EngineOpts) {
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 1.5 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'space-canvas';
    this.renderer.domElement.tabIndex = 0;
    el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5b7a3a', 1.6);
    this.sun = new THREE.DirectionalLight('#fff3dd', 1.8);
    this.sun.position.set(30, 50, 20);
    this.scene.add(this.hemi, this.sun, new THREE.AmbientLight('#ffffff', 0.25));
    this.world = opts.world === 'meydan' ? buildMeydan(opts.quality) : buildSalon(opts.quality);
    if (this.world.camLimit) {
      // kapalı salonda daha alçak ve yakın kamera: tavana çarpmasın, ekran görünsün
      this.pitch = 0.26;
      this.dist = 6.5;
    }
    this.scene.add(this.world.group);
    this.setNight(opts.night);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();

    const l = (e: SpaceEvent) => this.onEvent(e);
    live.listeners.add(l);
    this.unsub = () => live.listeners.delete(l);
    this.sync();
    this.drawBooths();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', this.onPtrDown);
    window.addEventListener('pointermove', this.onPtrMove);
    window.addEventListener('pointerup', this.onPtrUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.loop();
    (window as any).__kovanSpace = this; // tanılama / otomatik test için
  }

  // ---------------------------------------------------------------- olaylar
  private onEvent(e: SpaceEvent) {
    switch (e.k) {
      case 'snap':
      case 'add':
      case 'del':
        this.sync();
        if (e.k === 'snap') this.drawBooths();
        break;
      case 'look': {
        const a = live.avatars.get(e.sid);
        const av = this.avatars.get(e.sid);
        if (a && av) av.setLook(a.look);
        break;
      }
      case 'say':
        this.avatars.get(e.sid)?.say(e.text);
        break;
      case 'emote':
        if (e.sid !== useSpace.getState().you) this.avatars.get(e.sid)?.emote(e.e);
        break;
      case 'booths':
        this.drawBooths();
        break;
    }
  }

  private sync() {
    const you = useSpace.getState().you;
    for (const [sid, a] of live.avatars) {
      if (this.avatars.has(sid)) continue;
      const av = new Avatar(a.look, this.opts.nameOf(a.userId), sid === you);
      av.x = a.x;
      av.z = a.z;
      av.ry = a.ry;
      av.y = this.world.height(a.x, a.z);
      this.avatars.set(sid, av);
      this.scene.add(av.root);
      if (sid === you && !this.meReady) {
        this.meReady = true;
        const sp = this.world.spawn?.() || { x: a.x, z: a.z, ry: a.ry };
        Object.assign(this.me, { x: sp.x, z: sp.z, ry: sp.ry, y: this.world.height(sp.x, sp.z) });
        a.ry = sp.ry;
        this.yaw = sp.ry + Math.PI;
      }
    }
    for (const [sid, av] of this.avatars)
      if (!live.avatars.has(sid)) {
        this.scene.remove(av.root);
        av.dispose();
        this.avatars.delete(sid);
        spatialForget(sid);
      }
    if (!you) this.meReady = false;
  }

  drawBooths() {
    const booths = useSpace.getState().booths;
    for (const b of this.world.booths) {
      const d = booths[b.i];
      drawBoothSign(b, d?.owner ? this.opts.nameOf(d.owner) : null, d?.text || '', BOOTH_COLORS[b.i]);
    }
  }

  refreshNames() {
    for (const [sid, av] of this.avatars) {
      const a = live.avatars.get(sid);
      if (a) av.setName(this.opts.nameOf(a.userId));
    }
    this.drawBooths();
  }

  setNight(night: boolean) {
    this.world.setNight(night);
    const L = this.world.light?.(night) || {
      bg: night ? '#0b1026' : '#9fd3f5',
      fog: night ? [28, 95] : [45, 150],
      hemi: night ? ['#6c7bc4', '#1b2a1a', 0.7] : ['#cfe8ff', '#5b7a3a', 1.6],
      sun: night ? ['#a9b8ff', 0.35] : ['#fff3dd', 1.8],
    };
    const bg = new THREE.Color(L.bg);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, L.fog[0], L.fog[1]);
    this.hemi.color.set(L.hemi[0]);
    this.hemi.groundColor.set(L.hemi[1]);
    this.hemi.intensity = L.hemi[2];
    this.sun.color.set(L.sun[0]);
    this.sun.intensity = L.sun[1];
  }

  /** duvardaki büyük ekran (yalnız salonda) */
  setScreen(v: HTMLVideoElement | null, label?: string) {
    this.world.setScreen?.(v, label);
  }

  get hasScreen() {
    return !!this.world.setScreen;
  }

  get mapDraw() {
    return this.world.drawMap ? { draw: this.world.drawMap, scale: this.world.mapScale || 13 } : null;
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (this.typing || tag === 'input' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop')) return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(k)) {
      e.preventDefault();
      if (k === 'Space' && !e.repeat) this.jump();
      this.keys.add(k);
      if (this.me.sit >= 0 && k !== 'ShiftLeft' && k !== 'ShiftRight') this.standUp();
      return;
    }
    if (e.repeat) return;
    if (k === 'KeyE') {
      e.preventDefault();
      this.interact();
      return;
    }
    const em = EMOTES.find((x) => x.key === e.key);
    if (em) {
      e.preventDefault();
      this.doEmote(em.e);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();
  private onPtrDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastPtr = { x: e.clientX, y: e.clientY };
    this.renderer.domElement.focus();
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  private onPtrMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPtr.x, dy = e.clientY - this.lastPtr.y;
    this.lastPtr = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(0.05, Math.min(1.35, this.pitch + dy * 0.004));
  };
  private onPtrUp = () => (this.dragging = false);
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = Math.max(3, Math.min(20, this.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  };

  // ---------------------------------------------------------------- eylemler
  doEmote(e: string) {
    if (!this.meReady) return;
    const you = useSpace.getState().you;
    const av = you && this.avatars.get(you);
    if (!av) return;
    if (e === 'jump') return this.jump();
    av.emote(e);
    sendEmote(e);
  }

  jump() {
    if (!this.meReady || this.me.air) return;
    if (this.me.sit >= 0) this.standUp();
    this.me.vy = JUMP_V;
    this.me.air = true;
  }

  interact() {
    const p = this.prompt;
    if (!p) return;
    if (p.kind === 'stand') this.standUp();
    else if (p.kind === 'sit') this.sitNearest();
    else if (p.kind === 'booth') this.opts.onBooth(p.i);
  }

  private nearestSeat() {
    let best = -1, bd = 2.2;
    const occupied = new Set<number>();
    for (const [sid, av] of this.avatars) {
      if (sid === useSpace.getState().you || av.a !== 3) continue;
      this.world.seats.forEach((s, i) => Math.hypot(s.x - av.x, s.z - av.z) < 0.3 && occupied.add(i));
    }
    this.world.seats.forEach((s, i) => {
      const d = Math.hypot(s.x - this.me.x, s.z - this.me.z);
      if (d < bd && !occupied.has(i)) (bd = d), (best = i);
    });
    return best;
  }

  private sitNearest() {
    const i = this.nearestSeat();
    if (i < 0) return;
    const s = this.world.seats[i];
    Object.assign(this.me, { sit: i, x: s.x, z: s.z, ry: s.ry, vy: 0, air: false });
    const you = useSpace.getState().you;
    you && this.avatars.get(you)?.cancelEmote();
  }

  private standUp() {
    if (this.me.sit < 0) return;
    const s = this.world.seats[this.me.sit];
    this.me.sit = -1;
    // koltuğun önüne adım at
    this.me.x = s.x + Math.sin(s.ry) * 0.7;
    this.me.z = s.z + Math.cos(s.ry) * 0.7;
  }

  private updatePrompt() {
    let p: Prompt = null;
    if (this.me.sit >= 0) p = { kind: 'stand', label: 'Kalk' };
    else {
      const booths = useSpace.getState().booths;
      for (const b of this.world.booths) {
        if (Math.hypot(b.x - this.me.x, b.z - this.me.z) < 2.4) {
          const d = booths[b.i];
          const mine = d?.owner === this.opts.myUid;
          p = { kind: 'booth', i: b.i, label: mine ? 'Standını düzenle' : d?.owner ? `${this.opts.nameOf(d.owner)} standı` : 'Standı kirala' };
          if (d?.owner && !mine) p = null;
          break;
        }
      }
      if (!p && this.nearestSeat() >= 0) p = { kind: 'sit', label: 'Otur' };
    }
    if (JSON.stringify(p) !== JSON.stringify(this.prompt)) {
      this.prompt = p;
      this.opts.onPrompt(p);
    }
  }

  // ---------------------------------------------------------------- döngü
  private resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.paused || document.hidden) return;
    const t = this.clock.elapsedTime;
    this.step(dt, t);
    this.renderer.render(this.scene, this.camera);
    this.fps.n++;
    this.fps.t += dt;
    if (this.fps.t > 1) (this.fps.v = Math.round(this.fps.n / this.fps.t)), (this.fps.n = 0), (this.fps.t = 0);
  };

  private moveMe(dt: number) {
    const me = this.me;
    let ix = 0, iz = 0;
    if (!this.typing) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let moving = false;
    if ((ix || iz) && me.sit < 0) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      // kamera yönüne göre: ileri = (-sin yaw, -cos yaw), sağ = (cos yaw, -sin yaw)
      let dx = -s * iz + c * ix, dz = -c * iz - s * ix;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      const sp = (run ? RUN : WALK) * dt;
      me.x += dx * sp;
      me.z += dz * sp;
      const target = Math.atan2(dx, dz);
      let diff = target - me.ry;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      me.ry += diff * Math.min(1, dt * 14);
      moving = true;
      const you = useSpace.getState().you;
      you && this.avatars.get(you)?.cancelEmote();
    }
    // çarpışmalar (otururken yok: oturak mobilyanın içinde)
    if (me.sit < 0)
    for (let pass = 0; pass < 2; pass++)
      for (const c of this.world.colliders) {
        const dx = me.x - c.x, dz = me.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + 0.38;
        if (d < min && d > 1e-4) {
          me.x = c.x + (dx / d) * min;
          me.z = c.z + (dz / d) * min;
        }
      }
    const r = Math.hypot(me.x, me.z);
    if (this.world.clamp) this.world.clamp(me);
    else if (r > this.world.bounds) {
      me.x *= this.world.bounds / r;
      me.z *= this.world.bounds / r;
    }
    // yerçekimi / zıplama
    const ground = me.sit >= 0 ? this.world.seats[me.sit].y : this.world.height(me.x, me.z);
    if (me.air) {
      me.vy -= GRAV * dt;
      me.y += me.vy * dt;
      if (me.y <= ground) {
        me.y = ground;
        me.vy = 0;
        me.air = false;
      }
    } else me.y += (ground - me.y) * Math.min(1, dt * 16);
    me.a = me.sit >= 0 ? 3 : me.air ? 4 : moving ? (run ? 2 : 1) : 0;
  }

  private step(dt: number, t: number) {
    const st = useSpace.getState();
    const you = st.you;
    const speaking = useVoice.getState().speaking;
    if (this.meReady && you) {
      this.moveMe(dt);
      sendMove(this.me.x, this.me.z, this.me.ry, this.me.a);
    }
    for (const [sid, av] of this.avatars) {
      const a = live.avatars.get(sid);
      if (!a) continue;
      const isMe = sid === you;
      if (isMe) {
        av.x = this.me.x;
        av.z = this.me.z;
        av.ry = this.me.ry;
        av.a = this.me.a;
      } else {
        const k = 1 - Math.exp(-dt * 11);
        if (Math.hypot(a.x - av.x, a.z - av.z) > 10) (av.x = a.x), (av.z = a.z);
        av.x += (a.x - av.x) * k;
        av.z += (a.z - av.z) * k;
        let diff = a.ry - av.ry;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        av.ry += diff * k;
        // 1.5 sn haber gelmezse yürüme animasyonunu durdur
        av.a = (a.a === 1 || a.a === 2) && performance.now() - a.at > 1500 ? 0 : a.a;
        if (av.a === 1 || av.a === 2) av.cancelEmote();
      }
      av.speaking = !!speaking[a.userId];
      const ground = av.a === 3 ? this.seatY(av.x, av.z) : this.world.height(av.x, av.z);
      av.animate(dt, t, ground, isMe && (this.me.air || this.me.sit >= 0) ? this.me.y : null);
      if (!isMe) spatialSource(sid, av.x, av.z, this.onStage(av.x, av.z));
    }
    // kamera
    const me = this.me;
    this.camTarget.lerp(this.tmp.set(me.x, me.y + 1.45, me.z), Math.min(1, dt * 10));
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * cp * this.dist,
      this.camTarget.y + Math.sin(this.pitch) * this.dist,
      this.camTarget.z + Math.cos(this.yaw) * cp * this.dist,
    );
    // kamera çarpışması: direk, ağaç, tezgâh gibi engellerin içine girmesin
    let d = this.dist;
    for (let it = 0; it < 24 && this.blocked(this.camera.position); it++) {
      d *= 0.86;
      this.camera.position.set(
        this.camTarget.x + Math.sin(this.yaw) * cp * d,
        this.camTarget.y + Math.sin(this.pitch) * d,
        this.camTarget.z + Math.cos(this.yaw) * cp * d,
      );
    }
    if (this.camera.position.y < 0.4) this.camera.position.y = 0.4;
    const lim = this.world.camLimit;
    if (lim) {
      const P = this.camera.position;
      P.x = Math.max(lim.minX, Math.min(lim.maxX, P.x));
      P.z = Math.max(lim.minZ, Math.min(lim.maxZ, P.z));
      P.y = Math.min(lim.maxY, P.y);
    }
    if (this.firstPerson) {
      const fp = this.pitch - 0.42;
      this.camera.position.set(me.x - Math.sin(this.yaw) * 0.25, me.y + 1.5, me.z - Math.cos(this.yaw) * 0.25);
      this.tmp.set(-Math.sin(this.yaw) * Math.cos(fp), -Math.sin(fp), -Math.cos(this.yaw) * Math.cos(fp)).add(this.camera.position);
      this.camera.lookAt(this.tmp);
    } else this.camera.lookAt(this.camTarget);
    if (you) {
      const mine = this.avatars.get(you);
      if (mine) mine.root.visible = !this.firstPerson;
    }
    // dinleyici: kendi avatarın, kameranın baktığı yöne dönük
    spatialListener(me.x, me.z, -Math.sin(this.yaw), -Math.cos(this.yaw));
    const onStage = this.onStage(me.x, me.z);
    if (onStage !== this.onStageNow) {
      this.onStageNow = onStage;
      this.opts.onStage(onStage);
    }
    this.world.update(t, dt);
    this.updatePrompt();
    this.occT += dt;
    if (this.world.seatOccupancy && this.occT > 0.2) {
      this.occT = 0;
      const occ = new Set<number>();
      for (const av of this.avatars.values()) {
        if (av.a !== 3) continue;
        this.world.seats.forEach((s, i) => Math.hypot(s.x - av.x, s.z - av.z) < 0.3 && occ.add(i));
      }
      if (this.me.sit >= 0) occ.add(this.me.sit);
      this.world.seatOccupancy(occ, this.meReady ? this.me : null);
    }
  }

  private blocked(p: THREE.Vector3) {
    const lim = this.world.camLimit;
    if (lim && (p.x < lim.minX || p.x > lim.maxX || p.z < lim.minZ || p.z > lim.maxZ || p.y > lim.maxY)) return true;
    if (p.y > 4.2) return false;
    for (const c of this.world.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, r = c.r + 0.35;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  private seatY(x: number, z: number) {
    for (const s of this.world.seats) if (Math.hypot(s.x - x, s.z - z) < 0.4) return s.y;
    return this.world.height(x, z);
  }

  private onStage(x: number, z: number) {
    return Math.hypot(x - this.world.stage.x, z - this.world.stage.z) < this.world.stage.r - 0.3;
  }

  /** Mini harita için anlık görüntü */
  snapshot() {
    const you = useSpace.getState().you;
    const others: { x: number; z: number; color: string; speaking: boolean }[] = [];
    for (const [sid, av] of this.avatars) if (sid !== you) others.push({ x: av.x, z: av.z, color: av.look.color, speaking: av.speaking });
    return { me: { x: this.me.x, z: this.me.z, ry: this.me.ry }, yaw: this.yaw, others, fps: this.fps.v };
  }

  /** test/tanılama: kendini bir noktaya ışınla */
  teleport(x: number, z: number) {
    Object.assign(this.me, { x, z, sit: -1, air: false });
  }

  dispose() {
    this.disposed = true;
    if ((window as any).__kovanSpace === this) (window as any).__kovanSpace = null;
    cancelAnimationFrame(this.raf);
    this.unsub();
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onPtrMove);
    window.removeEventListener('pointerup', this.onPtrUp);
    for (const av of this.avatars.values()) av.dispose();
    this.avatars.clear();
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
