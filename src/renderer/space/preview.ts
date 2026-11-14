// Kıyafet panelindeki karakter önizlemesi: tek, paylaşılan küçük bir WebGL bağlamında çizer ve sonucu 2B tuvale kopyalar.
import * as THREE from 'three';
import type { AvatarLook } from '../../shared/protocol';
import { Avatar } from './avatar';

let R: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
let queue: Promise<void> = Promise.resolve();

function init(w: number, h: number) {
  if (!R) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight('#fff1d6', 1.1);
    sun.position.set(3, 6, 5);
    scene.add(new THREE.HemisphereLight('#fff6e6', '#5a4632', 1.9), sun, new THREE.AmbientLight('#ffffff', 0.3));
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    R = { renderer, scene, cam };
  }
  R.renderer.setSize(w, h, false);
  R.cam.aspect = w / h;
  R.cam.updateProjectionMatrix();
  return R;
}

/** look'a göre karakteri hedef tuvale çizer (sıraya alınır; hedef artık geçerli değilse `alive` false döndürmeli) */
export function drawAvatarPreview(target: HTMLCanvasElement, look: AvatarLook, seed: string, alive: () => boolean = () => true): Promise<void> {
  queue = queue
    .then(async () => {
      if (!alive()) return;
      const { renderer, scene, cam } = init(target.width, target.height);
      const av = new Avatar(look, '', true, seed);
      try {
        await av.ready;
        if (!alive()) return;
        av.ry = 0.35;
        for (let i = 0; i < 12; i++) av.animate(1 / 30, i / 30, 0, null);
        scene.add(av.root);
        const tall = look.hat === 'wizard' || (look.hat === 'antenna' && av.modelId === 'mage');
        cam.position.set(0, 1.35, tall ? 5.3 : 4.2);
        cam.lookAt(0, tall ? 1.1 : 0.86, 0);
        renderer.render(scene, cam);
        const g = target.getContext('2d')!;
        g.clearRect(0, 0, target.width, target.height);
        g.drawImage(renderer.domElement, 0, 0);
      } finally {
        scene.remove(av.root);
        av.dispose();
      }
    })
    .catch((e) => console.warn('3D önizleme çizilemedi', e));
  return queue;
}
