// v1.54.1: pencere gerçekten görünüyor mu?
// Görüşmedeyken ses kesilmesin diye arka plan kısıtlaması kapatılıyor (main.ts 'win:in-call'). Bu durumda Chromium
// pencere küçültülse ya da tepsiye gizlense de sayfayı "görünür" sayar ve saniyede 60 kare çizmeye devam eder
// (document.hidden hiç true olmaz). Ana süreç gerçek durumu bildirir; gizliyken animasyonlar ve 3D sahne durur.
type Dinleyici = (gizli: boolean) => void;
const dinleyiciler = new Set<Dinleyici>();

export const pencere = {
  gizli: false,
  /** oyun içi kaplama şu an gösteriliyor mu (lib/overlay.ts yazar): gösteriliyorsa konuşma göstergeleri pencere gizliyken de güncellenir */
  kaplama: false,
};

export function pencereDinle(d: Dinleyici) {
  dinleyiciler.add(d);
  return () => void dinleyiciler.delete(d);
}

window.kovan?.onVisible?.((gorunur) => {
  const gizli = !gorunur;
  if (gizli === pencere.gizli) return;
  pencere.gizli = gizli;
  // tüm CSS animasyonları duraklar (performans.css); görünmeyen pencerede fark edilmez
  document.documentElement.classList.toggle('pencere-gizli', gizli);
  for (const d of dinleyiciler) d(gizli);
});
