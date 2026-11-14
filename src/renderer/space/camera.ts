import type { World } from './world';

/** Engellerin kameraya göre kalınlığı (karakter çarpışmasından biraz geniş) */
const PAD = 0.35;
/** Bu yükseklikten yukarıda kalan ışın engellerin üstünden geçer */
const TOP = 4.2;

/**
 * Takip kamerasının karakterden geriye ne kadar uzaklaşabileceği.
 * Hedef noktadan (tx,ty,tz) birim yön (dx,dy,dz) boyunca: `wall` kapalı dünyanın duvar/tavan kutusuna kadar olan uzaklık,
 * `any` ise kameranın bir engelin (direk, dolap, tezgâh) içinde kalmadığı en büyük uzaklık.
 * Eskiden uzaklık %14'lük adımlarla küçültülerek aranıyordu: yürürken sonuç bir basamaktan ötekine atlıyor,
 * kamera ileri geri sıçrıyordu. Burada kesin değer hesaplanır; motor bunu ayrıca yumuşatır.
 * Engelin arkasında kalan kamera (engel yalnız görüşü kesiyorsa) eskisi gibi yerinde kalır.
 */
export function camReach(
  world: Pick<World, 'colliders' | 'camLimit'>,
  tx: number, ty: number, tz: number,
  dx: number, dy: number, dz: number,
  max: number,
): { wall: number; any: number } {
  let wall = max;
  const lim = world.camLimit;
  if (lim) {
    if (dx > 1e-6) wall = Math.min(wall, (lim.maxX - tx) / dx);
    else if (dx < -1e-6) wall = Math.min(wall, (lim.minX - tx) / dx);
    if (dz > 1e-6) wall = Math.min(wall, (lim.maxZ - tz) / dz);
    else if (dz < -1e-6) wall = Math.min(wall, (lim.minZ - tz) / dz);
    if (dy > 1e-6) wall = Math.min(wall, (lim.maxY - ty) / dy);
    wall = Math.max(0, wall);
  }
  let d = wall;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return { wall, any: d };
  // kamera noktası bir engelin içindeyse o engelin ön yüzüne çekilir; yeni nokta başka bir engelin içinde olabilir
  for (let guard = 0; guard < 8; guard++) {
    const px = tx + dx * d, py = ty + dy * d, pz = tz + dz * d;
    if (py > TOP) break;
    let hit = -1;
    for (const c of world.colliders) {
      const r = c.r + PAD;
      const qx = px - c.x, qz = pz - c.z;
      if (qx * qx + qz * qz >= r * r) continue;
      const ox = tx - c.x, oz = tz - c.z;
      const b = 2 * (ox * dx + oz * dz);
      const cc = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * cc;
      // karakter engelin dibindeyse (cc<=0) ön yüz yok: kamera karaktere yapışır, en küçük uzaklığa bırak
      const s = cc <= 0 || disc < 0 ? 0 : (-b - Math.sqrt(disc)) / (2 * a);
      hit = hit < 0 ? s : Math.min(hit, s);
    }
    if (hit < 0) break;
    d = Math.max(0, hit - 0.02);
  }
  return { wall, any: d };
}
