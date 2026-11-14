// Büyük ekran görüntülerinin küçük kopyası (v1.53.1, bellek).
// Son eklenenler'deki 1400 px'lik görseller galeride 300-700 px gösteriliyor; Chromium her birini tam boyutta
// çözüp bellekte tutuyordu (140'ı aşkın görselde ~400 MB). Burada görsel, gösterildiği genişliğe (ekran
// ölçeği dahil) inen bir kopyaya çevrilir: çözme ana iş parçacığı dışında yapılır, tam boy hâli hemen bırakılır.
// Kopya, kaynağın kendisinden daha iyi kalitede küçültülür (yüksek kaliteli ölçekleme), görünüm aynı kalır.

const cache = new Map<string, Promise<string>>();
const ADIM = 160; // genişlik basamakları: aynı görsel küçük farklarla yeniden üretilmesin

export function kucukGenislik(cssPx: number) {
  const px = Math.max(1, cssPx) * (window.devicePixelRatio || 1);
  return Math.ceil(px / ADIM) * ADIM;
}

/** src'nin en çok `w` piksel genişliğindeki kopyasının adresi; olmazsa özgün adres döner. */
export function kucukResim(src: string, w: number): Promise<string> {
  const key = src + '#' + w;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const blob = await (await fetch(src)).blob();
        // yalnız genişlik verilince yükseklik oranı koruyarak hesaplanır
        const bm = await createImageBitmap(blob, { resizeWidth: w, resizeQuality: 'high' });
        const c = new OffscreenCanvas(bm.width, bm.height);
        c.getContext('2d')!.drawImage(bm, 0, 0);
        bm.close();
        const out = await c.convertToBlob({ type: 'image/webp', quality: 0.9 });
        return URL.createObjectURL(out);
      } catch {
        return src;
      }
    })();
    cache.set(key, p);
  }
  return p;
}
