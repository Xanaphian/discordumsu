// v1.71 Ayarlar ekranının yeni düzeni: solda profil + arama + simgeli kategoriler (seçili olanın altında
// bölümleri açılır), sağda bölüm başlıklı satırlar. Kategorilerin içerikleri eski dosyalarında durur.
import React, { useEffect, useRef, useState } from 'react';
import { X, Search, Pencil, type LucideIcon } from 'lucide-react';
import { useStore, openModal, escBusy, homeData, girisSupported } from '../lib/store';
import { Avatar } from './Common';
import { TagText } from './Etiket';
import { cikisYap, GirisBilgileri } from './Giris';
import { RekeySection } from './MoreSettings';
import { cx } from '../lib/util';
import type { HesapGirisi } from '../../shared/giris';

export type AyarKat = { id: string; label: string; group: string; icon: LucideIcon; kw?: string };

const close = () => openModal(null);

/** Türkçe harfleri sadeleştirip küçült: "gurultu" yazan "Gürültü"yü bulsun */
export function sadele(s: string) {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâî]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i' })[c] || c)
    .replace(/\s+/g, ' ')
    .trim();
}

type Baslik = { text: string; el: HTMLElement };
const baslikAdi = (t: string) => t.replace(/\s*[:(].*$/, '').trim();

/** Arama sonucuna gidince bulunan satırı kısa süre vurgula */
function vurgula(root: Element, aranan: string) {
  const q = sadele(aranan);
  const adaylar = root.querySelectorAll<HTMLElement>('h3, h2, .set-row-title, .radio-opt b, .field > span, .ic-row > span');
  for (const el of adaylar) {
    if (!el.offsetParent || !sadele(el.textContent || '').includes(q)) continue;
    const hedef = (el.closest('.set-row, .radio-opt, .field') as HTMLElement | null) || el;
    hedef.scrollIntoView({ block: 'center', behavior: 'smooth' });
    hedef.classList.remove('ayar-vurgu');
    void hedef.offsetWidth;
    hedef.classList.add('ayar-vurgu');
    setTimeout(() => hedef.classList.remove('ayar-vurgu'), 1800);
    return true;
  }
  return false;
}

export function AyarKabugu({ nav, tab, setTab, children, footer }: { nav: AyarKat[]; tab: string; setTab: (t: string) => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const me = useStore((x) => x.me);
  const mobile = !!window.kovan.mobile;
  const [mobPage, setMobPage] = useState(false);
  const [q, setQ] = useState('');
  const qRef = useRef(q);
  qRef.current = q;
  const aramaRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [basliklar, setBasliklar] = useState<Baslik[]>([]);
  const [etkin, setEtkin] = useState(0);
  const bekleyen = useRef<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && qRef.current) {
        setQ('');
        return;
      }
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop .confirm') && !escBusy()) close();
      // Ctrl+F ayarlarda aramaya gider
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !mobile) {
        e.preventDefault();
        aramaRef.current?.focus();
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [mobile]);

  // seçili kategorinin bölüm başlıklarını (h3) topla; içerik değişince (ör. sekme, form açılması) yenile
  useEffect(() => {
    const root = mainRef.current?.querySelector('.settings-content');
    if (!root) return;
    mainRef.current!.scrollTop = 0;
    setEtkin(0);
    let raf = 0;
    const topla = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const yeni = [...root.querySelectorAll<HTMLElement>('h3')].filter((h) => h.offsetParent && baslikAdi(h.textContent || '')).map((el) => ({ el, text: baslikAdi(el.textContent || '') }));
        setBasliklar((eski) => (eski.length === yeni.length && eski.every((b, i) => b.el === yeni[i].el && b.text === yeni[i].text) ? eski : yeni));
        if (bekleyen.current && vurgula(root, bekleyen.current)) bekleyen.current = null;
      });
    };
    topla();
    const mo = new MutationObserver(topla);
    mo.observe(root, { childList: true, subtree: true });
    const birak = setTimeout(() => (bekleyen.current = null), 1500);
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(birak);
    };
  }, [tab]);

  const kaydir = () => {
    const main = mainRef.current;
    if (!main || !basliklar.length) return;
    const ust = main.getBoundingClientRect().top + main.clientHeight * 0.35;
    let i = 0;
    basliklar.forEach((b, j) => b.el.getBoundingClientRect().top <= ust && (i = j));
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) i = basliklar.length - 1;
    setEtkin(i);
  };

  const sq = sadele(q);
  const sonuclar = sq
    ? nav
        .map((n) => {
          if (sadele(n.label).includes(sq)) return { n, hit: '' };
          const hit = (n.kw || '').split('|').find((k) => sadele(k).includes(sq));
          return hit ? { n, hit } : null;
        })
        .filter((x): x is { n: AyarKat; hit: string } => !!x)
    : [];
  const sonucAc = (id: string, hit: string) => {
    bekleyen.current = hit || null;
    setQ('');
    if (id === tab && hit) {
      const root = mainRef.current?.querySelector('.settings-content');
      if (root && vurgula(root, hit)) bekleyen.current = null;
    }
    setTab(id);
    setMobPage(true);
  };

  const cur = nav.find((n) => n.id === tab);
  let lastGroup = '';
  return (
    <div className={cx('settings ayar-yeni', mobile && (mobPage ? 'mob-page' : 'mob-nav'))}>
      <nav className="settings-nav scroll-thin">
        <div className="settings-nav-inner">
          {mobile && (
            <div className="settings-mob-head">
              <b>Ayarlar</b>
              <button onClick={close} aria-label="Kapat">
                <X size={22} />
              </button>
            </div>
          )}
          <button className="an-kim" onClick={() => (setTab('profile'), setMobPage(true))} title="Profilini düzenle">
            <Avatar user={me} size={40} />
            <span className="an-kim-txt">
              <b>{me.name}</b>
              <span>
                Profilini düzenle <Pencil size={11} />
              </span>
            </span>
          </button>
          <label className="an-ara">
            <Search size={15} />
            <input
              ref={aramaRef}
              value={q}
              placeholder="Ayarlarda ara"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sonuclar[0]) sonucAc(sonuclar[0].n.id, sonuclar[0].hit);
              }}
            />
            {q && (
              <button className="an-ara-sil" onClick={() => setQ('')} aria-label="Aramayı temizle">
                <X size={13} />
              </button>
            )}
          </label>
          {sq ? (
            <div className="an-sonuc">
              {sonuclar.map(({ n, hit }) => {
                const I = n.icon;
                return (
                  <button key={n.id} className="an-kat" onClick={() => sonucAc(n.id, hit)}>
                    <span className="an-ikon">
                      <I size={16} />
                    </span>
                    <span className="an-sonuc-txt">
                      <b>{n.label}</b>
                      {hit && <span>{hit}</span>}
                    </span>
                  </button>
                );
              })}
              {!sonuclar.length && <div className="an-bos">"{q}" ile eşleşen ayar yok.</div>}
            </div>
          ) : (
            nav.map((n) => {
              const head = n.group !== lastGroup ? ((lastGroup = n.group), <div key={'g' + n.group} className="an-grup">{n.group}</div>) : null;
              const I = n.icon;
              const on = tab === n.id;
              return (
                <React.Fragment key={n.id}>
                  {head}
                  <button className={cx('an-kat', on && 'an-on')} onClick={() => (setTab(n.id), setMobPage(true))} aria-current={on ? 'page' : undefined}>
                    <span className="an-ikon">
                      <I size={16} />
                    </span>
                    <span className="an-ad">{n.label}</span>
                  </button>
                  {on && !mobile && basliklar.length > 1 && (
                    <div className="an-alt">
                      {basliklar.map((b, i) => (
                        <button key={i} className={cx('an-alt-item', i === etkin && 'an-on')} onClick={() => b.el.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                          {b.text}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
          {!sq && footer}
        </div>
      </nav>
      <main className="settings-main scroll-thin" ref={mainRef} onScroll={kaydir}>
        {mobile && (
          <button className="settings-mob-back" onClick={() => setMobPage(false)}>
            ‹ {cur?.label || 'Ayarlar'}
          </button>
        )}
        {!mobile && (
          <div className="an-iz">
            <span>Ayarlar</span>
            <i>/</i>
            <b>{cur?.label}</b>
            {basliklar[etkin] && basliklar.length > 1 && (
              <>
                <i>/</i>
                <span>{basliklar[etkin].text}</span>
              </>
            )}
          </div>
        )}
        <div className="settings-content">{children}</div>
        <button className="settings-close" onClick={close} aria-label="Kapat">
          <X size={20} />
          <span>ESC</span>
        </button>
      </main>
    </div>
  );
}

/** Bilgi satırı: solda ad, sağda değer ve düğme */
function Satir({ ad, children, dugme, onDugme, kapali }: { ad: string; children: React.ReactNode; dugme?: string; onDugme?: () => void; kapali?: boolean }) {
  return (
    <div className="an-satir">
      <div className="an-satir-ad">{ad}</div>
      <div className="an-satir-deger">{children}</div>
      {dugme && (
        <button className="btn ghost sm an-duzenle" disabled={kapali} onClick={onDugme}>
          {dugme}
        </button>
      )}
    </div>
  );
}

const maskele = (e: string) => {
  const [ad, alan] = e.split('@');
  return '•'.repeat(Math.min(Math.max(ad.length, 4), 10)) + '@' + (alan || '');
};

/** Giriş bilgileri formunu aç ve ona kaydır (form Giris.tsx'te) */
const girisAc = () => window.dispatchEvent(new Event('xan:giris-ac'));

export function HesabimTab({ git }: { git: (tab: string) => void }) {
  const me = useStore((x) => x.me);
  const online = useStore((x) => (x.conns, girisSupported()));
  const [bilgi, setBilgi] = useState<HesapGirisi | null>(null);
  const [goster, setGoster] = useState(false);
  useEffect(() => {
    if (!online) return;
    homeData<HesapGirisi>({ t: 'auth.me' }).then(setBilgi, () => setBilgi(null));
    const degisti = (e: Event) => setBilgi((e as CustomEvent<HesapGirisi>).detail);
    window.addEventListener('xan:giris', degisti);
    return () => window.removeEventListener('xan:giris', degisti);
  }, [online]);
  const yok = <span className="an-soluk">{online ? 'Belirlenmedi' : 'Sunucuya bağlıyken görünür'}</span>;
  return (
    <>
      <h1>Hesabım</h1>
      <h3>Hesap bilgileri</h3>
      <div className="an-kart">
        <Satir ad="Görünen ad" dugme="Düzenle" onDugme={() => git('profile')}>
          {me.name}
        </Satir>
        <Satir ad="Etiket" dugme="Düzenle" onDugme={() => git('profile')}>
          {me.tag ? <TagText user={me} /> : <span className="an-soluk">Sunucuya bağlıyken görünür</span>}
        </Satir>
        <Satir ad="Kullanıcı adı" dugme={bilgi?.username ? 'Düzenle' : 'Belirle'} onDugme={girisAc} kapali={!online}>
          {bilgi?.username || yok}
        </Satir>
        <Satir ad="E-posta" dugme={bilgi?.email ? 'Düzenle' : 'Ekle'} onDugme={girisAc} kapali={!online}>
          {bilgi?.email ? (
            <>
              {goster ? bilgi.email : maskele(bilgi.email)}{' '}
              <button className="an-goster" onClick={() => setGoster(!goster)}>
                {goster ? 'Gizle' : 'Göster'}
              </button>
            </>
          ) : (
            yok
          )}
        </Satir>
        <Satir ad="Şifre" dugme={bilgi?.hasPassword ? 'Değiştir' : 'Belirle'} onDugme={girisAc} kapali={!online}>
          {bilgi?.hasPassword ? '••••••••' : yok}
        </Satir>
      </div>
      <GirisBilgileri />
      <RekeySection />
      <h3>Hesap durumu</h3>
      <div className="an-kart">
        <Satir ad="Hesap türü">
          {me.misafir ? (
            <span className="an-durum uyari">Misafir hesap</span>
          ) : bilgi?.hasPassword ? (
            <span className="an-durum iyi">Kalıcı hesap</span>
          ) : (
            <span className="an-durum">Yalnız bu bilgisayarda</span>
          )}
        </Satir>
        <Satir ad="Oturum" dugme="Çıkış yap" onDugme={() => void cikisYap()}>
          <span className="an-soluk">Bu bilgisayardan çıkıp giriş ekranına dön.</span>
        </Satir>
      </div>
      {me.misafir && <p className="note">Misafir hesap topluluk kuramaz, arkadaş ekleyemez, dosya gönderemez. Yukarıdan e-postanı doğrulayınca bu kısıtlar kalkar.</p>}
    </>
  );
}
