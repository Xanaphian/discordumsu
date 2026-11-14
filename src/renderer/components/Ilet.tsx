// Mesajı iletme: bir mesajı başka bir kanala ya da özel mesaja, kimin yazdığı belli olacak şekilde gönderir.
import React, { useMemo, useState } from 'react';
import { Hash, Megaphone, Search, Forward } from 'lucide-react';
import { useStore, openModal, sendMessage, selectChannel, hostHttp, toast, plainText } from '../lib/store';
import { Avatar, CommunityIcon } from './Common';
import { Modal } from './Modals';
import { cx, displayName } from '../lib/util';
import { mediaLabel } from '../lib/medya';
import { channelPerms, Perm, isVoiceLike, isToolChannel } from '../../shared/protocol';
import '../styles/kucuk-ekler.css';

interface Hedef {
  key: string;
  cid: string;
  ch: string;
  ad: string;
  alt: string;
  dm?: string;
  duyuru?: boolean;
}

export function IletModal({ cid, chId, id }: { cid: string; chId: string; id: string }) {
  const communities = useStore((s) => s.communities);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me.id);
  const m = useStore((s) => s.chans[chId]?.items.find((x) => x.id === id));
  const src = communities[cid];
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const hedefler = useMemo(() => {
    const out: Hedef[] = [];
    const dms: Hedef[] = [];
    for (const c of Object.values(communities)) {
      if (c.dm) {
        const ch = c.channels[0];
        if (ch) dms.push({ key: ch.id, cid: c.id, ch: ch.id, ad: users[c.dm]?.name || c.name, alt: 'Özel mesaj', dm: c.dm });
        continue;
      }
      for (const ch of c.channels) {
        if (isVoiceLike(ch.type) || isToolChannel(ch.type) || ch.id === chId) continue;
        if (!(channelPerms(c, me, ch) & Perm.SEND_MESSAGES)) continue;
        out.push({ key: ch.id, cid: c.id, ch: ch.id, ad: ch.name, alt: c.name, duyuru: ch.type === 'announce' });
      }
    }
    // önce aynı topluluğun kanalları, sonra özel mesajlar, sonra diğer topluluklar
    const same = out.filter((x) => x.cid === cid);
    return [...same, ...dms, ...out.filter((x) => x.cid !== cid)];
  }, [communities, users, me, cid, chId]);

  const list = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr');
    return (s ? hedefler.filter((h) => (h.ad + ' ' + h.alt).toLocaleLowerCase('tr').includes(s)) : hedefler).slice(0, 60);
  }, [hedefler, q]);

  if (!m || !src) return null;
  const yazar = displayName(src, m.authorId, users);
  const ozet = plainText(m.content, src);
  const resimler = (m.attachments || []).filter((a) => a.mime?.startsWith('image/'));

  const gonder = () => {
    const h = hedefler.find((x) => x.key === sel);
    if (!h) return;
    const medya = !!mediaLabel(m.content);
    const kaynak = src.dm ? 'özel mesajdan' : `#${src.channels.find((x) => x.id === chId)?.name || 'kanal'} kanalından`;
    const baslik = `↪ **${yazar.replace(/([*_~`|\\])/g, '\\$1')}** · *${kaynak} iletildi*`;
    // bahsetmeler düz ada çevrilir: hedef toplulukta o kişi ya da kanal olmayabilir
    const govde = medya ? '' : ozet.split('\n').map((l) => '> ' + l).join('\n');
    // ekler yalnızca aynı sunucuda geçerli adres taşır
    const atts = m.attachments?.length && hostHttp(cid) === hostHttp(h.cid) ? m.attachments.filter((a) => a.url.startsWith('/f/')) : undefined;
    const text = [baslik, govde].filter(Boolean).join('\n').slice(0, 4000);
    sendMessage(h.ch, text, atts?.length ? atts : undefined);
    if (medya) sendMessage(h.ch, m.content);
    if (note.trim()) sendMessage(h.ch, note.trim().slice(0, 4000));
    openModal(null);
    toast(`Mesaj ${h.dm ? h.ad + ' kişisine' : '#' + h.ad + ' kanalına'} iletildi`, 'ok');
    selectChannel(h.cid, h.ch);
  };

  return (
    <Modal onClose={() => openModal(null)} className="ilet">
      <div className="modal-head">
        <h2>Mesajı ilet</h2>
      </div>
      <div className="modal-body">
        <div className="ilet-ozet">
          <b>{yazar}</b>
          <span>{ozet || (m.attachments?.length ? `${m.attachments.length} ek dosya` : '')}</span>
          {resimler.length > 0 && (
            <div className="ilet-resimler">
              {resimler.slice(0, 4).map((a) => (
                <img key={a.id} src={a.url.startsWith('blob:') ? a.url : hostHttp(cid) + a.url} alt="" />
              ))}
            </div>
          )}
        </div>
        <div className="ilet-ara">
          <Search size={15} />
          <input autoFocus placeholder="Kanal ya da kişi ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ilet-liste">
          {list.map((h) => (
            <button key={h.key} className={cx('ilet-satir', sel === h.key && 'on')} onClick={() => setSel(h.key)} onDoubleClick={gonder}>
              {h.dm ? <Avatar user={users[h.dm]} size={24} /> : <span className="ilet-ikon">{h.duyuru ? <Megaphone size={15} /> : <Hash size={15} />}</span>}
              <span className="ilet-ad">{h.ad}</span>
              {!h.dm && (
                <span className="ilet-alt">
                  <CommunityIcon c={communities[h.cid]} size={16} /> {h.alt}
                </span>
              )}
              {h.dm && <span className="ilet-alt">{h.alt}</span>}
            </button>
          ))}
          {!list.length && <div className="ilet-bos">Eşleşen kanal ya da kişi yok.</div>}
        </div>
        <input className="ilet-not" placeholder="İstersen bir not ekle" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && gonder()} />
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={() => openModal(null)}>
          Vazgeç
        </button>
        <button className="btn primary" disabled={!sel} onClick={gonder}>
          <Forward size={16} /> İlet
        </button>
      </div>
    </Modal>
  );
}
