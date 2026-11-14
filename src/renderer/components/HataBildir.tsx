// Ayarlar > Gelişmiş içindeki "Sorun bildir" bölümü ve sunucu yöneticisinin gördüğü bildirim listesi (v1.50).
import React, { useEffect, useState } from 'react';
import { ChevronDown, Copy, Flag, RefreshCw, Trash2 } from 'lucide-react';
import { toast, confirmDialog } from '../lib/store';
import { bildirimSil, bildirimleriGetir, hataBildir, raporMetni, useHata, useYonetici } from '../lib/hata';
import { ERR_MSG_MAX, type ErrReport } from '../../shared/ekler';
import { copyText, cx } from '../lib/util';

export function HataBildirBolumu() {
  const n = useHata((s) => s.n);
  const admin = useYonetici();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await hataBildir(note);
      if (r === 'bos') toast('Bildirecek bir hata yok. Sorunu kısaca yazıp yeniden dene.', 'err');
      else if (r === 'kopya') toast('Sunucu şu an bildirim almıyor. Rapor panoya kopyalandı.', 'ok');
      else {
        toast('Bildirildi, teşekkürler.', 'ok');
        setNote('');
        setPeek(false);
      }
    } catch (e) {
      toast((e as Error)?.message || 'Gönderilemedi.', 'err');
    }
    setBusy(false);
  };
  return (
    <>
      <h3>Sorun bildir</h3>
      <p className="note">
        Bir şey ters gittiyse buradan haber ver. Yalnızca hatanın teknik ayrıntısı, uygulama sürümü ve işletim sistemi gönderilir; adın, kimliğin, mesajların ve dosyaların gönderilmez.
      </p>
      <textarea className="hb-not" rows={2} maxLength={ERR_MSG_MAX} placeholder="Ne yaparken oldu? (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="hb-row">
        <button className="btn primary sm" disabled={busy || (!n && !note.trim())} onClick={send}>
          <Flag size={14} /> {busy ? 'Gönderiliyor…' : 'Hata bildir'}
        </button>
        <span className="hb-say">{n ? `Bu oturumda ${n} hata kaydedildi.` : 'Bu oturumda kaydedilen hata yok.'}</span>
        {(n > 0 || !!note.trim()) && (
          <button className="btn ghost sm" onClick={() => setPeek(!peek)}>
            {peek ? 'Gizle' : 'Gönderilecek bilgiyi gör'}
          </button>
        )}
      </div>
      {peek && <pre className="hb-pre">{raporMetni(note)}</pre>}
      {admin && <GelenBildirimler />}
    </>
  );
}

const when = (t: number) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function GelenBildirimler() {
  const [list, setList] = useState<ErrReport[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const load = () =>
    bildirimleriGetir()
      .then((l) => (setList(l), setErr('')))
      .catch((e) => setErr(e?.message || 'Liste alınamadı.'));
  useEffect(() => {
    load();
  }, []);
  const text = (r: ErrReport) => `Xanaphian ${r.ver} · ${r.os} · ${r.n} kez\n[${r.where}] ${r.msg}\n${r.stack}`;
  return (
    <>
      <div className="hb-head">
        <h3>Gelen hata bildirimleri{list ? ` (${list.length})` : ''}</h3>
        <button className="btn ghost sm" onClick={load}>
          <RefreshCw size={14} /> Yenile
        </button>
        {!!list?.length && (
          <button
            className="btn ghost sm danger-text"
            onClick={() => confirmDialog('Bütün bildirimler silinsin mi?', 'Gelen hata bildirimlerinin hepsi kalıcı olarak silinir.', () => bildirimSil().then(load).catch(() => toast('Silinemedi.', 'err')), 'Hepsini sil')}
          >
            <Trash2 size={14} /> Hepsini sil
          </button>
        )}
      </div>
      <p className="note">Bu listeyi yalnız sen görürsün. Aynı hata birden çok kez gelirse tek satırda toplanır; kimin gönderdiği tutulmaz.</p>
      {err && <p className="note">{err}</p>}
      {list && !list.length && !err && <div className="hb-bos">Henüz bildirim yok.</div>}
      <div className="hb-list">
        {list?.map((r) => (
          <div key={r.id} className={cx('hb-item', open === r.id && 'open')}>
            <div className="hb-top" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <ChevronDown size={14} className="hb-ok" />
              <span className={cx('hb-yer', r.where === 'not' && 'not')}>{r.where === 'not' ? 'Not' : r.where}</span>
              <span className="hb-msg">{r.msg || r.stack.split('\n')[0]}</span>
              {r.n > 1 && <span className="hb-n">{r.n} kez</span>}
            </div>
            <div className="hb-alt">
              <span>
                v{r.ver} · {r.os} · son: {when(r.last)}
              </span>
              <button className="btn ghost sm" onClick={() => (copyText(text(r)), toast('Kopyalandı', 'ok'))}>
                <Copy size={13} /> Kopyala
              </button>
              <button className="btn ghost sm danger-text" onClick={() => bildirimSil(r.id).then(load).catch(() => toast('Silinemedi.', 'err'))}>
                <Trash2 size={13} /> Sil
              </button>
            </div>
            {open === r.id && r.stack && <pre className="hb-pre">{r.stack}</pre>}
          </div>
        ))}
      </div>
    </>
  );
}
