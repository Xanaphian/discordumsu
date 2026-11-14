// Eşya yerleştirici: kitaplıktaki modelleri sahneye koyar. Yer tutucu hemen eklenir, model dosya yüklenince içine girer;
// böylece dünya kurulumu eşzamanlı kalır, çarpışma ve oturak verisi beklemez.
import * as THREE from 'three';
import { loadLibrary, type LibName } from './assets';

/** KayKit model birimi -> dünya birimi (karakterlerle aynı ölçek) */
export const UNIT = 0.75;

export function propPlacer(lib: LibName, group: THREE.Object3D) {
  let dead = false;
  const instanced: THREE.InstancedMesh[] = [];
  const ready = loadLibrary(lib);
  ready.catch((e) => console.warn('3D eşyalar yüklenemedi', e));
  return {
    ready,
    /** tek model; s: ek ölçek, parent: başka bir yer tutucunun içine koymak için */
    put(name: string, x: number, y: number, z: number, ry = 0, s = 1, parent: THREE.Object3D = group) {
      const h = new THREE.Group();
      h.position.set(x, y, z);
      h.rotation.y = ry;
      h.scale.setScalar(UNIT * s);
      parent.add(h);
      void ready.then((L) => !dead && h.add(L.get(name))).catch(() => {});
      return h;
    },
    /** aynı modelden çok sayıda (ağaç, taş): tek çizim çağrısı. spots: [x, y, z, ry, ölçek] */
    many(name: string, spots: [number, number, number, number, number][]) {
      void ready
        .then((L) => {
          if (dead || !spots.length) return;
          const src = L.get(name);
          src.updateMatrixWorld(true);
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
          src.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
            spots.forEach(([x, y, z, ry, s], i) => {
              m4.compose(p.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), sc.setScalar(UNIT * s)).multiply(mesh.matrixWorld);
              im.setMatrixAt(i, m4);
            });
            im.instanceMatrix.needsUpdate = true;
            im.computeBoundingSphere();
            group.add(im);
            instanced.push(im);
          });
        })
        .catch(() => {});
    },
    dispose() {
      dead = true;
      for (const im of instanced) im.dispose();
    },
  };
}
