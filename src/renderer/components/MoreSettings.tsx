// Kullanıcı ayarları: sohbet, gizlilik, bildirim istisnaları ve gelişmiş sekmeleri
import React from 'react';
import { BellOff, Bell } from 'lucide-react';
import { useStore, updateSettings, setNotifyOverride, toggleMuted, confirmDialog, toast, DEFAULT_SETTINGS, openModal } from '../lib/store';
import { Avatar, Toggle } from './Common';
import { Row } from './Settings';
import { cx, copyText } from '../lib/util';

export function ChatTab() {
  const s = useStore((x) => x.settings);
  return (
    <>
      <h1>Sohbet</h1>
      <h3>Mesajları gösterme</h3>
      <Row title="Görselleri sohbette göster" sub="Kapalıyken görseller küçük bir dosya kartı olarak görünür; tıklayınca açılır.">
        <Toggle value={s.inlineMedia} onChange={(v) => updateSettings({ inlineMedia: v })} />
      </Row>
      <Row title="Katılma mesajlarını göster" sub='"… kovana katıldı" satırları.'>
        <Toggle value={s.showJoinMessages} onChange={(v) => updateSettings({ showJoinMessages: v })} />
      </Row>
      <Row title="Rol rozetlerini göster" sub="Rolü olan üyelerin adının yanında rol emojisi görünür.">
        <Toggle value={s.showRoleIcons} onChange={(v) => updateSettings({ showRoleIcons: v })} />
      </Row>
      <h3>Spoiler içerik</h3>
      <div className="radio-list">
        {(
          [
            ['click', 'Tıklayınca göster', '||gizli metin|| tıklanana kadar kapalı kalır.'],
            ['always', 'Her zaman göster', 'Spoiler etiketleri hiç gizlenmez.'],
          ] as const
        ).map(([id, t, sub]) => (
          <button key={id} className={cx('radio-opt', s.spoilers === id && 'on')} onClick={() => updateSettings({ spoilers: id })}>
            <span className="radio" />
            <div>
              <b>{t}</b>
              <span>{sub}</span>
            </div>
          </button>
        ))}
      </div>
      <h3>Yazarken</h3>
      <Row title="Emoji kısa kodlarını dönüştür" sub=":kalp: gibi kodlar gönderilirken emojiye çevrilir.">
        <Toggle value={s.emojiConvert} onChange={(v) => updateSettings({ emojiConvert: v })} />
      </Row>
      <Row title="Enter ile gönder" sub="Kapalıyken Ctrl+Enter ile gönderilir, Enter yeni satır açar.">
        <Toggle value={s.enterToSend} onChange={(v) => updateSettings({ enterToSend: v })} />
      </Row>
    </>
  );
}

export function PrivacyTab() {
  const s = useStore((x) => x.settings);
  const users = useStore((x) => x.users);
  return (
    <>
      <h1>Gizlilik ve Güvenlik</h1>
      <Row title="Yazıyor bilgisini gönder" sub='Kapalıyken başkaları sen yazarken "… yazıyor" göstergesini görmez.'>
        <Toggle value={s.sendTyping} onChange={(v) => updateSettings({ sendTyping: v })} />
      </Row>
      <Row title="Bağlantıları açmadan önce sor" sub="Mesajlardaki bir bağlantıya tıklayınca tarayıcıda açmadan önce adresi gösterir.">
        <Toggle value={s.confirmLinks} onChange={(v) => updateSettings({ confirmLinks: v })} />
      </Row>
      <h3>Engellenen kullanıcılar ({s.blocked.length})</h3>
      <p className="note">Engellediğin kişilerin mesajları gizlenir ("Göster" ile açabilirsin) ve senden bildirim almazsın. Engellemek için üye listesinde birine sağ tıkla.</p>
      <div className="list-card">
        {s.blocked.map((id) => (
          <div key={id} className="lc-row">
            <Avatar user={users[id]} size={30} />
            <div className="lc-text">
              <b>{users[id]?.name || 'Bilinmeyen kullanıcı'}</b>
              <span>{id}</span>
            </div>
            <button className="btn ghost sm" onClick={() => updateSettings({ blocked: s.blocked.filter((x) => x !== id) })}>
              Engeli kaldır
            </button>
          </div>
        ))}
        {!s.blocked.length && <div className="empty-note">Kimseyi engellemedin.</div>}
      </div>
    </>
  );
}

const LEVEL_LABEL = { all: 'Tüm mesajlar', mentions: 'Sadece bahsetmeler', none: 'Hiçbiri' } as const;

/** Bildirimler sekmesine eklenen bölüm: içerik önizleme ve istisnalar */
export function NotifyExtras() {
  const s = useStore((x) => x.settings);
  const communities = useStore((x) => x.communities);
  const ids = [...new Set([...Object.keys(s.notifyOverrides), ...s.mutedIds])];
  const describe = (id: string) => {
    const c = communities[id];
    if (c) return { title: c.dm ? '@' + c.name : c.name, sub: c.dm ? 'Özel mesaj' : 'Topluluk', cid: c.id };
    for (const x of Object.values(communities)) {
      const ch = x.channels.find((y) => y.id === id);
      if (ch) return { title: '#' + ch.name, sub: x.name, cid: x.id };
    }
    return null;
  };
  const rows = ids.map((id) => ({ id, d: describe(id) })).filter((r) => r.d);
  return (
    <>
      <Row title="Bildirimde mesaj içeriğini göster" sub='Kapalıyken bildirimde sadece gönderen ve kanal görünür, mesaj yerine "Yeni mesaj" yazar.'>
        <Toggle value={s.notifyPreview} onChange={(v) => updateSettings({ notifyPreview: v })} />
      </Row>
      <h3>Topluluk ve kanal istisnaları</h3>
      <p className="note">Bir topluluğa ya da kanala sağ tıklayıp "Bildirim ayarları" veya "Sessize al" seçersen burada listelenir.</p>
      <div className="list-card">
        {rows.map(({ id, d }) => (
          <div key={id} className="lc-row">
            {s.mutedIds.includes(id) ? <BellOff size={18} /> : <Bell size={18} />}
            <div className="lc-text">
              <b>{d!.title}</b>
              <span>
                {d!.sub} · {s.mutedIds.includes(id) ? 'Sessizde' : LEVEL_LABEL[s.notifyOverrides[id]]}
              </span>
            </div>
            <button className="btn ghost sm" onClick={() => openModal({ type: 'notify', cid: d!.cid, chId: id === d!.cid ? undefined : id })}>
              Düzenle
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                setNotifyOverride(id, null);
                if (s.mutedIds.includes(id)) toggleMuted(id);
              }}
            >
              Sıfırla
            </button>
          </div>
        ))}
        {!rows.length && <div className="empty-note">İstisna yok; her yerde yukarıdaki genel ayar geçerli.</div>}
      </div>
    </>
  );
}

export function AdvancedTab() {
  const s = useStore((x) => x.settings);
  const me = useStore((x) => x.me);
  return (
    <>
      <h1>Gelişmiş</h1>
      <Row title="Geliştirici modu" sub="Kanal, topluluk ve mesaj menülerine kimlik kopyalama seçenekleri ekler. Bot ve entegrasyon kurarken işe yarar.">
        <Toggle value={s.devMode} onChange={(v) => updateSettings({ devMode: v })} />
      </Row>
      <div className="info-card">
        <div className="ic-row">
          <span>Kullanıcı kimliğin</span>
          <b className="clickable" title="Kopyala" onClick={() => (copyText(me.id), toast('Kimlik kopyalandı', 'ok'))}>
            {me.id}
          </b>
        </div>
      </div>
      <h3>Sıfırlama</h3>
      <p className="note">Sohbet, gizlilik ve bildirim tercihlerini varsayılana döndürür. Profilin, toplulukların, ses aygıtların ve bağlantı ayarların değişmez.</p>
      <button
        className="btn ghost sm danger-text"
        onClick={() =>
          confirmDialog('Tercihler sıfırlansın mı?', 'Sohbet, gizlilik ve bildirim ayarların varsayılana döner. Engellediğin kişiler listede kalır.', () => {
            const d = DEFAULT_SETTINGS;
            updateSettings({
              notify: d.notify,
              notifyOverrides: {},
              mutedIds: [],
              suppressEveryone: [],
              notifyPreview: d.notifyPreview,
              sendTyping: d.sendTyping,
              devMode: d.devMode,
              confirmLinks: d.confirmLinks,
              spoilers: d.spoilers,
              emojiConvert: d.emojiConvert,
              showJoinMessages: d.showJoinMessages,
              inlineMedia: d.inlineMedia,
              showRoleIcons: d.showRoleIcons,
              enterToSend: d.enterToSend,
              sounds: d.sounds,
            });
            toast('Tercihler sıfırlandı', 'ok');
          }, 'Sıfırla')
        }
      >
        Tercihleri sıfırla
      </button>
    </>
  );
}
