// Kanal ve kategori ayarları (tam ekran)
import React, { useEffect, useState } from 'react';
import { Hash, Volume2, Megaphone, Box, Folder, Globe } from 'lucide-react';
import { useStore, cmd, toast, confirmDialog, request, selectChannel } from '../lib/store';
import { Shell, Row, close } from './Settings';
import { OverwriteEditor } from './Permissions';
import { Toggle } from './Common';
import { cx } from '../lib/util';
import { canIn, can, isVoiceLike, hasFreeName, cleanSiteUrl, DEFAULT_SITE_URL, Perm, type Overwrite } from '../../shared/protocol';

const SLOWMODES: [number, string][] = [
  [0, 'Kapalı'],
  [5, '5 sn'],
  [10, '10 sn'],
  [15, '15 sn'],
  [30, '30 sn'],
  [60, '1 dk'],
  [120, '2 dk'],
  [300, '5 dk'],
  [600, '10 dk'],
  [900, '15 dk'],
  [1800, '30 dk'],
  [3600, '1 sa'],
  [7200, '2 sa'],
  [21600, '6 sa'],
];

const sameOw = (a: Overwrite[] = [], b: Overwrite[] = []) => {
  const key = (l: Overwrite[]) => JSON.stringify([...l].sort((x, y) => (x.id < y.id ? -1 : 1)).map((o) => [o.id, o.type, o.allow, o.deny]));
  return key(a) === key(b);
};

function SaveBar({ onReset, onSave }: { onReset: () => void; onSave: () => void }) {
  return (
    <div className="save-bar">
      <span>Dikkat, kaydedilmemiş değişikliklerin var!</span>
      <button className="btn ghost sm" onClick={onReset}>
        Sıfırla
      </button>
      <button className="btn success sm" onClick={onSave}>
        Değişiklikleri kaydet
      </button>
    </div>
  );
}

export function ChannelSettings({ cid, chId, tab: initial }: { cid: string; chId: string; tab?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const ch = c?.channels.find((x) => x.id === chId);
  const [tab, setTab] = useState(initial || 'overview');
  const [name, setName] = useState(ch?.name || '');
  const [topic, setTopic] = useState(ch?.topic || '');
  const [slow, setSlow] = useState(ch?.slowmode || 0);
  const [limit, setLimit] = useState(ch?.userLimit || 0);
  const [type, setType] = useState(ch?.type || 'text');
  const [cat, setCat] = useState<string | null>(ch?.categoryId ?? null);
  const [ow, setOw] = useState<Overwrite[]>(ch?.overwrites || []);
  const [url, setUrl] = useState(ch?.url || DEFAULT_SITE_URL);
  useEffect(() => {
    if (!ch) close();
  }, [ch]);
  // sunucudan gelen değişiklikle taslağı tazele (kaydettikten sonra)
  useEffect(() => setOw(ch?.overwrites || []), [ch?.overwrites]); // eslint-disable-line
  if (!c || !ch) return null;
  const voice = isVoiceLike(ch.type);
  const site = ch.type === 'site';
  const free = hasFreeName(ch.type);
  const urlOk = !site || !!cleanSiteUrl(url);
  const canManage = canIn(c, me, ch, Perm.MANAGE_CHANNELS);
  const canPerms = canIn(c, me, ch, Perm.MANAGE_ROLES);
  const dirtyOverview =
    name !== ch.name || topic !== (ch.topic || '') || (site && url !== (ch.url || DEFAULT_SITE_URL)) || slow !== (ch.slowmode || 0) || limit !== (ch.userLimit || 0) || type !== ch.type || cat !== (ch.categoryId ?? null);
  const dirtyPerms = !sameOw(ow, ch.overwrites);
  const resetOverview = () => {
    setName(ch.name);
    setTopic(ch.topic || '');
    setSlow(ch.slowmode || 0);
    setLimit(ch.userLimit || 0);
    setType(ch.type);
    setCat(ch.categoryId ?? null);
    setUrl(ch.url || DEFAULT_SITE_URL);
  };
  const saveOverview = () => {
    if (!name.trim()) return toast('Kanal adı boş olamaz.', 'err');
    if (!urlOk) return toast('Geçerli bir http(s) adresi yaz.', 'err');
    cmd(cid, { t: 'chan.update', cid, id: chId, name, topic, slowmode: slow, userLimit: limit, type: type !== ch.type ? type : undefined, categoryId: cat, ...(site ? { url: cleanSiteUrl(url)! } : {}) });
    toast('Kanal kaydedildi', 'ok');
  };
  const savePerms = () => {
    cmd(cid, { t: 'chan.update', cid, id: chId, overwrites: ow });
    toast('Kanal izinleri kaydedildi', 'ok');
  };
  const clone = async () => {
    try {
      const r = await request<{ data: string }>(cid, { t: 'chan.create', cid, name: ch.name + (free ? ' 2' : '-2'), type: ch.type, categoryId: ch.categoryId, clone: ch.id, rid: '' });
      close();
      if (r?.data && !voice) selectChannel(cid, r.data);
      toast('Kanal kopyalandı', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  const Icon = ch.type === 'voice' ? Volume2 : ch.type === 'space' ? Box : site ? Globe : ch.type === 'announce' ? Megaphone : Hash;
  const nav = [
    { id: 'overview', label: 'Genel Bakış', group: (free ? '' : '#') + ch.name },
    ...(canPerms ? [{ id: 'perms', label: 'İzinler', group: (free ? '' : '#') + ch.name }] : []),
    ...(canManage ? [{ id: 'delete', label: 'Kanalı sil', danger: true }] : []),
  ];
  const cur = nav.some((n) => n.id === tab) ? tab : 'overview';
  return (
    <Shell nav={nav} tab={cur} setTab={setTab}>
      {cur === 'overview' && (
        <>
          <h1 className="h-icon">
            <Icon size={22} /> Kanal ayarları
          </h1>
          <label className="field">
            <span>Kanal adı</span>
            <input value={name} maxLength={48} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
          </label>
          {site && (
            <label className="field">
              <span>Sitenin adresi</span>
              <input value={url} maxLength={500} disabled={!canManage} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_SITE_URL} />
              <small className={cx('field-hint', !urlOk && 'err')}>{urlOk ? 'Oda bu adresle açılır.' : 'Geçerli bir http(s) adresi yaz.'}</small>
            </label>
          )}
          {!voice && (
            <label className="field">
              <span>Kanal konusu</span>
              <textarea rows={3} maxLength={512} value={topic} disabled={!canManage} onChange={(e) => setTopic(e.target.value)} placeholder="Herkese bu kanalın ne için olduğunu anlat" />
              <small className="counter">{512 - topic.length}</small>
            </label>
          )}
          <label className="field">
            <span>Kategori</span>
            <select value={cat || ''} disabled={!canManage} onChange={(e) => setCat(e.target.value || null)}>
              <option value="">Kategorisiz</option>
              {[...c.categories]
                .sort((a, b) => a.position - b.position)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          {!voice && !site && (
            <>
              <div className="field">
                <span>Yavaş mod</span>
                <div className="chip-pick">
                  {SLOWMODES.map(([v, l]) => (
                    <button key={v} disabled={!canManage} className={cx('chip-opt', slow === v && 'on')} onClick={() => setSlow(v)}>
                      {l}
                    </button>
                  ))}
                </div>
                <small className="note">Üyeler mesajları arasında bu kadar beklemek zorunda kalır. "Mesajları yönet" yetkisi olanlar etkilenmez.</small>
              </div>
              <Row title="Duyuru kanalı" sub="Sadece kanal yöneticileri (ya da izinlerde açıkça yazma hakkı verilenler) mesaj gönderebilir.">
                <Toggle value={type === 'announce'} disabled={!canManage} onChange={(v) => setType(v ? 'announce' : 'text')} />
              </Row>
            </>
          )}
          {voice && (
            <div className="field">
              <span>Kişi sınırı: {limit ? `${limit} kişi` : 'sınırsız'}</span>
              <input type="range" min={0} max={99} step={1} value={limit} disabled={!canManage} onChange={(e) => setLimit(Number(e.target.value))} />
              <small className="note">Kanal dolunca yeni kimse katılamaz. "Kanalları yönet" yetkisi olanlar sınırı aşabilir.</small>
            </div>
          )}
          {canManage && (
            <>
              <h3>Diğer</h3>
              <div className="btn-row">
                <button className="btn ghost sm" onClick={clone}>
                  Kanalı kopyala
                </button>
              </div>
              <p className="note">Kopya; konu, yavaş mod, kişi sınırı ve izinlerle birlikte aynı kategoride oluşturulur. Mesajlar kopyalanmaz.</p>
            </>
          )}
          {dirtyOverview && canManage && <SaveBar onReset={resetOverview} onSave={saveOverview} />}
        </>
      )}
      {cur === 'perms' && (
        <>
          <h1>Kanal izinleri</h1>
          <p className="note">
            Rollerin topluluk genelindeki yetkilerini bu kanal için değiştir. <b>✓</b> izin verir, <b>✕</b> reddeder, <b>/</b> rolün kendi ayarını kullanır.
            {ch.categoryId && ' Kategori izinleri önce uygulanır, buradaki ayarlar onların üstüne yazar.'}
          </p>
          <OverwriteEditor c={c} list={ow} onChange={setOw} scope={ch.type} canEdit={canPerms} />
          {dirtyPerms && <SaveBar onReset={() => setOw(ch.overwrites || [])} onSave={savePerms} />}
        </>
      )}
      {cur === 'delete' && (
        <>
          <h1>Kanalı sil</h1>
          <p className="note">{free ? ch.name : '#' + ch.name} kanalı{voice ? '' : ' ve içindeki tüm mesajlar'} kalıcı olarak silinir.</p>
          <button
            className="btn danger"
            onClick={() =>
              confirmDialog(`${free ? '' : '#'}${ch.name} silinsin mi?`, 'Bu işlem geri alınamaz.', () => {
                close();
                cmd(cid, { t: 'chan.delete', cid, id: chId });
              }, 'Kanalı sil')
            }
          >
            Kanalı sil
          </button>
        </>
      )}
    </Shell>
  );
}

export function CategorySettings({ cid, catId, tab: initial }: { cid: string; catId: string; tab?: string }) {
  const c = useStore((s) => s.communities[cid]);
  const me = useStore((s) => s.me.id);
  const cat = c?.categories.find((x) => x.id === catId);
  const [tab, setTab] = useState(initial || 'overview');
  const [name, setName] = useState(cat?.name || '');
  const [ow, setOw] = useState<Overwrite[]>(cat?.overwrites || []);
  useEffect(() => {
    if (!cat) close();
  }, [cat]);
  useEffect(() => setOw(cat?.overwrites || []), [cat?.overwrites]); // eslint-disable-line
  if (!c || !cat) return null;
  const canPerms = can(c, me, Perm.MANAGE_ROLES);
  const chans = c.channels.filter((x) => x.categoryId === catId);
  const nav = [
    { id: 'overview', label: 'Genel Bakış', group: cat.name },
    ...(canPerms ? [{ id: 'perms', label: 'İzinler', group: cat.name }] : []),
    { id: 'delete', label: 'Kategoriyi sil', danger: true },
  ];
  const cur = nav.some((n) => n.id === tab) ? tab : 'overview';
  return (
    <Shell nav={nav} tab={cur} setTab={setTab}>
      {cur === 'overview' && (
        <>
          <h1 className="h-icon">
            <Folder size={22} /> Kategori ayarları
          </h1>
          <label className="field">
            <span>Kategori adı</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <h3>Bu kategorideki kanallar ({chans.length})</h3>
          <div className="list-card">
            {chans.map((x) => (
              <div key={x.id} className="lc-row">
                <div className="lc-text">
                  <b>{isVoiceLike(x.type) ? x.name : '#' + x.name}</b>
                  <span>{x.overwrites?.length ? `${x.overwrites.length} kanal izni ayarı` : 'Kategori izinlerini kullanıyor'}</span>
                </div>
                <button className="btn ghost sm" onClick={() => useStore.setState({ modal: { type: 'editChannel', cid, chId: x.id } })}>
                  Düzenle
                </button>
              </div>
            ))}
            {!chans.length && <div className="empty-note">Bu kategoride kanal yok.</div>}
          </div>
          {name !== cat.name && name.trim() && (
            <SaveBar onReset={() => setName(cat.name)} onSave={() => (cmd(cid, { t: 'cat.update', cid, id: catId, name }), toast('Kategori kaydedildi', 'ok'))} />
          )}
        </>
      )}
      {cur === 'perms' && (
        <>
          <h1>Kategori izinleri</h1>
          <p className="note">Buradaki ayarlar kategorideki tüm kanallara uygulanır. Bir kanalın kendi izin ayarları bunların üstüne yazar.</p>
          <OverwriteEditor c={c} list={ow} onChange={setOw} scope="category" canEdit={canPerms} />
          {!sameOw(ow, cat.overwrites) && <SaveBar onReset={() => setOw(cat.overwrites || [])} onSave={() => (cmd(cid, { t: 'cat.update', cid, id: catId, overwrites: ow }), toast('Kategori izinleri kaydedildi', 'ok'))} />}
        </>
      )}
      {cur === 'delete' && (
        <>
          <h1>Kategoriyi sil</h1>
          <p className="note">"{cat.name}" kategorisi silinir. İçindeki kanallar silinmez, kategorisiz kalır.</p>
          <button className="btn danger" onClick={() => confirmDialog(`"${cat.name}" silinsin mi?`, 'Kanallar kategorisiz kalır.', () => (close(), cmd(cid, { t: 'cat.delete', cid, id: catId })), 'Sil')}>
            Kategoriyi sil
          </button>
        </>
      )}
    </Shell>
  );
}
