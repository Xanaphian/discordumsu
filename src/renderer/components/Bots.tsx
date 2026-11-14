import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bot, Sparkles, PartyPopper, HandHeart, Code2, Plus, Trash2, Copy, Eye, EyeOff, RefreshCw, LoaderCircle,
  CircleCheck, CircleAlert, Plug, KeyRound, MessageSquareReply,
} from 'lucide-react';
import { useStore, request, toast, confirmDialog, botHooks, connFor } from '../lib/store';
import { httpBase, wsUrl } from '../lib/net';
import { Avatar, Toggle } from './Common';
import { Row } from './Settings';
import { cx, COLORS, resizeImage, copyText, fmtDay } from '../lib/util';
import { isVoiceLike, makeId } from '../../shared/protocol';
import { AI_MODELS, type BotPatch, type BotRule, type BotTemplate, type BotView, type BotMcpServer } from '../../shared/bots';
import '../styles/bots.css';
import { cropImage, BOT_CROP } from './Kirpma';

const TEMPLATES: { id: BotTemplate; icon: React.ReactNode; title: string; sub: string }[] = [
  { id: 'ai', icon: <Sparkles size={22} />, title: 'Yapay zekâ (Claude)', sub: 'Anıldığında ya da seçtiğin kanallarda Claude ile yanıt verir. Anthropic API anahtarı gerekir.' },
  { id: 'welcome', icon: <HandHeart size={22} />, title: 'Karşılama botu', sub: 'Yeni katılanları seçtiğin kanalda karşılar.' },
  { id: 'fun', icon: <PartyPopper size={22} />, title: 'Eğlence botu', sub: '!zar, !yazıtura, !seç, !anket gibi hazır komutlar ve kendi otomatik yanıtların.' },
  { id: 'blank', icon: <Code2 size={22} />, title: 'Boş bot (MCP / API)', sub: 'Claude Desktop, Claude Code ya da kendi kodunla bağlanacağın bir bot hesabı.' },
];

type Sub = 'general' | 'ai' | 'auto' | 'welcome' | 'connect';

function useBots(cid: string) {
  const [bots, setBots] = useState<BotView[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    request<{ data: BotView[] }>(cid, { t: 'bot.list', cid })
      .then((r) => alive && setBots(r.data))
      .catch((e) => alive && setError(e.message));
    const h = (f: { cid: string; bots: BotView[] }) => f.cid === cid && setBots(f.bots);
    botHooks.add(h);
    return () => {
      alive = false;
      botHooks.delete(h);
    };
  }, [cid]);
  return { bots, error };
}

const update = (cid: string, id: string, patch: BotPatch) =>
  request(cid, { t: 'bot.update', cid, id, patch }).catch((e: Error) => toast(e.message, 'err'));

export function BotsTab({ cid }: { cid: string }) {
  const { bots, error } = useBots(cid);
  const [sel, setSel] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub>('general');
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<Record<string, string>>({});
  const bot = bots?.find((b) => b.id === sel) || null;

  const create = async (template: BotTemplate) => {
    setCreating(true);
    try {
      const r = await request<{ data: { id: string; token: string } }>(cid, { t: 'bot.create', cid, name: '', template });
      setFreshToken((x) => ({ ...x, [r.data.id]: r.data.token }));
      setSel(r.data.id);
      setSub(template === 'ai' ? 'ai' : template === 'welcome' ? 'welcome' : template === 'fun' ? 'auto' : 'connect');
      toast('Bot oluşturuldu ve topluluğa eklendi', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setCreating(false);
    }
  };

  if (error) return <div className="empty-note">Botlar yüklenemedi: {error}</div>;
  if (!bots)
    return (
      <div className="empty-note">
        <LoaderCircle className="spin" size={18} /> Yükleniyor…
      </div>
    );

  if (bot) return <BotEditor cid={cid} bot={bot} sub={sub} setSub={setSub} onBack={() => setSel(null)} freshToken={freshToken[bot.id]} />;

  return (
    <>
      <h1>Botlar</h1>
      <p className="note">
        Botlar topluluğunda üye gibi görünür, mesaj yazar ve komutlara yanıt verir. Yapay zekâ botu Claude ile konuşur; MCP bağlantısıyla Claude Desktop ya da Claude Code
        topluluğunu doğrudan okuyup yazabilir. Botlar bu topluluğu barındıran bilgisayarda çalışır.
      </p>
      {bots.length > 0 && (
        <>
          <h3>Bu topluluktaki botlar ({bots.length})</h3>
          <div className="list-card">
            {bots.map((b) => (
              <button key={b.id} className="lc-row bot-row" onClick={() => (setSel(b.id), setSub('general'))}>
                <Avatar user={b.user} size={36} status="online" />
                <div className="lc-text">
                  <b>
                    {b.user.name} <span className="tag-bot">BOT</span>
                  </b>
                  <span>{b.user.bio || 'Açıklama yok'}</span>
                </div>
                <div className="bot-badges">
                  {b.ai.on && <span className={cx('bot-badge', !b.ai.hasKey && 'warn')}>{b.ai.hasKey ? 'Yapay zekâ' : 'Anahtar yok'}</span>}
                  {b.welcome.on && <span className="bot-badge">Karşılama</span>}
                  {(b.commands.on || b.rules.length > 0) && <span className="bot-badge">Komutlar</span>}
                  {b.api.on && <span className="bot-badge">MCP</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <h3>Yeni bot ekle</h3>
      <div className="bot-templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="bot-template" disabled={creating} onClick={() => create(t.id)}>
            <span className="bt-icon">{t.icon}</span>
            <b>{t.title}</b>
            <span>{t.sub}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function BotEditor({ cid, bot, sub, setSub, onBack, freshToken }: { cid: string; bot: BotView; sub: Sub; setSub: (s: Sub) => void; onBack: () => void; freshToken?: string }) {
  const tabs: { id: Sub; label: string }[] = [
    { id: 'general', label: 'Profil' },
    { id: 'ai', label: 'Yapay zekâ' },
    { id: 'auto', label: 'Komutlar ve yanıtlar' },
    { id: 'welcome', label: 'Karşılama' },
    { id: 'connect', label: 'MCP ve API' },
  ];
  return (
    <>
      <button className="btn ghost sm bot-back" onClick={onBack}>
        <ArrowLeft size={14} /> Tüm botlar
      </button>
      <div className="bot-head">
        <Avatar user={bot.user} size={56} status="online" />
        <div>
          <h1>
            {bot.user.name} <span className="tag-bot">BOT</span>
          </h1>
          <div className="note">Oluşturuldu: {fmtDay(bot.createdAt)}</div>
        </div>
      </div>
      <div className="bot-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={cx('bot-tab', sub === t.id && 'on')} onClick={() => setSub(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'general' && <GeneralPane cid={cid} bot={bot} onDeleted={onBack} />}
      {sub === 'ai' && <AiPane cid={cid} bot={bot} />}
      {sub === 'auto' && <AutoPane cid={cid} bot={bot} />}
      {sub === 'welcome' && <WelcomePane cid={cid} bot={bot} />}
      {sub === 'connect' && <ConnectPane cid={cid} bot={bot} freshToken={freshToken} />}
    </>
  );
}

function GeneralPane({ cid, bot, onDeleted }: { cid: string; bot: BotView; onDeleted: () => void }) {
  const [name, setName] = useState(bot.user.name);
  const [bio, setBio] = useState(bot.user.bio || '');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setName(bot.user.name), [bot.user.name]);
  return (
    <div className="bot-pane">
      <div className="overview">
        <button className="icon-upload" onClick={() => file.current?.click()}>
          <Avatar user={bot.user} size={88} />
          <span className="iu-hover">Değiştir</span>
        </button>
        <input ref={file} hidden type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const r = f && (await cropImage(f, BOT_CROP));
          if (r) update(cid, bot.id, { avatar: r.image });
        }} />
        <div className="overview-form">
          <label className="field">
            <span>Bot adı</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== bot.user.name && update(cid, bot.id, { name })} />
          </label>
          {bot.user.avatar && (
            <button className="btn ghost sm" onClick={() => update(cid, bot.id, { avatar: null })}>
              Resmi kaldır
            </button>
          )}
        </div>
      </div>
      <label className="field">
        <span>Hakkında</span>
        <textarea rows={2} maxLength={190} value={bio} onChange={(e) => setBio(e.target.value)} onBlur={() => bio !== (bot.user.bio || '') && update(cid, bot.id, { bio })} />
      </label>
      <div className="field">
        <span>Renk</span>
        <div className="swatches">
          {COLORS.map((x) => (
            <button key={x} className={cx('swatch', bot.user.color === x && 'on')} style={{ background: x }} onClick={() => update(cid, bot.id, { color: x })} aria-label={x} />
          ))}
        </div>
      </div>
      <div className="info-card">
        <div className="ic-row">
          <span>Bot kimliği</span>
          <b>{bot.id}</b>
        </div>
        <div className="ic-row">
          <span>Yapay zekâ çağrıları</span>
          <b>{bot.usage.calls}</b>
        </div>
      </div>
      <button
        className="btn danger sm"
        onClick={() =>
          confirmDialog(`"${bot.user.name}" silinsin mi?`, 'Bot topluluktan çıkarılır, belirteci geçersiz olur. Gönderdiği mesajlar kalır.', async () => {
            await request(cid, { t: 'bot.delete', cid, id: bot.id }).catch((e: Error) => toast(e.message, 'err'));
            onDeleted();
          }, 'Sil')
        }
      >
        <Trash2 size={14} /> Botu sil
      </button>
    </div>
  );
}

function ChannelPicker({ cid, value, onChange }: { cid: string; value: string[]; onChange: (v: string[]) => void }) {
  const c = useStore((s) => s.communities[cid]);
  const chans = (c?.channels || []).filter((x) => !isVoiceLike(x.type)).sort((a, b) => a.position - b.position);
  return (
    <div className="chan-picker">
      {chans.map((ch) => {
        const on = value.includes(ch.id);
        return (
          <button key={ch.id} className={cx('chan-chip', on && 'on')} onClick={() => onChange(on ? value.filter((x) => x !== ch.id) : [...value, ch.id])}>
            # {ch.name}
          </button>
        );
      })}
      {!chans.length && <span className="note">Metin kanalı yok.</span>}
    </div>
  );
}

function AiPane({ cid, bot }: { cid: string; bot: BotView }) {
  const ai = bot.ai;
  const [key, setKey] = useState('');
  const [persona, setPersona] = useState(ai.persona);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [servers, setServers] = useState<BotMcpServer[]>(ai.mcpServers);
  useEffect(() => setServers(ai.mcpServers), [JSON.stringify(ai.mcpServers)]);
  const upd = (patch: BotPatch['ai']) => update(cid, bot.id, { ai: patch });
  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const conn = connFor(cid);
      if (!conn) throw new Error('Sunucuya bağlı değil');
      const r = await conn.request<{ data: string }>({ t: 'bot.test', cid, id: bot.id }, 90_000);
      setTest({ ok: true, text: r.data });
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const cost = useMemo(() => {
    const k = (n: number) => (n > 9999 ? (n / 1000).toFixed(0) + 'B' : n.toLocaleString('tr-TR'));
    return `${k(bot.usage.inTok)} giriş · ${k(bot.usage.outTok)} çıkış jetonu`;
  }, [bot.usage.inTok, bot.usage.outTok]);
  return (
    <div className="bot-pane">
      <Row title="Yapay zekâyı aç" sub={`Bot, anıldığında (@${bot.user.name}) ya da mesajına yanıt verildiğinde Claude üzerinden yanıt verir${bot.commands.on ? `; ${bot.commands.prefix}sor komutu da çalışır` : ''}.`}>
        <Toggle value={ai.on} onChange={(v) => upd({ on: v })} />
      </Row>

      <h3>Anthropic API anahtarı</h3>
      {ai.hasKey ? (
        <div className="key-row">
          <KeyRound size={16} />
          <span>Kayıtlı anahtar {ai.keyHint}</span>
          <button className="btn ghost sm" onClick={() => upd({ apiKey: null })}>
            Kaldır
          </button>
        </div>
      ) : (
        <p className="note">
          Anahtarı{' '}
          <a href="https://platform.claude.com/settings/keys" onClick={(e) => (e.preventDefault(), window.kovan.openExternal('https://platform.claude.com/settings/keys'))}>
            platform.claude.com
          </a>{' '}
          üzerinden alabilirsin. Kullanım, anahtarın sahibinin hesabından ücretlendirilir. Anahtar bu topluluğu barındıran bilgisayarda şifreli saklanır ve kimseye gösterilmez.
        </p>
      )}
      <div className="copy-row">
        <input type="password" placeholder={ai.hasKey ? 'Yeni anahtarla değiştir (sk-ant-…)' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        <button
          className="btn primary"
          disabled={!key.trim()}
          onClick={async () => {
            await upd({ apiKey: key.trim() });
            setKey('');
            toast('API anahtarı kaydedildi', 'ok');
          }}
        >
          Kaydet
        </button>
      </div>
      <div className="bot-test">
        <button className="btn sm" disabled={!ai.hasKey || testing} onClick={runTest}>
          {testing ? <LoaderCircle className="spin" size={14} /> : <Plug size={14} />} Bağlantıyı test et
        </button>
        {test && (
          <span className={cx('bot-test-res', test.ok ? 'ok' : 'err')}>
            {test.ok ? <CircleCheck size={14} /> : <CircleAlert size={14} />} {test.text}
          </span>
        )}
      </div>
      {bot.usage.lastError && (
        <p className="note err-text">
          <CircleAlert size={13} /> Son hata: {bot.usage.lastError}
        </p>
      )}

      <h3>Model</h3>
      <div className="model-grid">
        {AI_MODELS.map((m) => (
          <button key={m.id} className={cx('model-card', ai.model === m.id && 'on')} onClick={() => upd({ model: m.id })}>
            <b>{m.label}</b>
            <span>{m.sub}</span>
          </button>
        ))}
      </div>
      <Row title="Düşünme derinliği" sub="Hızlı: sohbet için ideal. Derin: zor sorularda daha iyi ama daha yavaş ve pahalı.">
        <div className="seg">
          {(
            [
              ['low', 'Hızlı'],
              ['medium', 'Dengeli'],
              ['high', 'Derin'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={cx(ai.effort === v && 'on')} onClick={() => upd({ effort: v })}>
              {l}
            </button>
          ))}
        </div>
      </Row>

      <h3>Kişilik ve talimatlar</h3>
      <label className="field">
        <textarea
          rows={5}
          maxLength={4000}
          placeholder="Ör. Adın Arı. Esprili ve samimisin. Oyun önerileri konusunda uzmansın. Küfür etme, kısa yaz."
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          onBlur={() => persona !== ai.persona && upd({ persona })}
        />
      </label>

      <h3>Her mesaja yanıt verdiği kanallar</h3>
      <p className="note">Seçtiğin kanallarda bot anılmayı beklemeden her mesaja yanıt verir (ör. bir #yapay-zeka kanalı). Diğer kanallarda yalnızca anılınca yanıt verir.</p>
      <ChannelPicker cid={cid} value={ai.channels} onChange={(v) => upd({ channels: v })} />

      <h3>Bağlam ve araçlar</h3>
      <Row title="Okunacak son mesaj sayısı" sub="Yanıt verirken kanaldaki kaç önceki mesajı görsün.">
        <div className="num-ctl">
          <input type="range" min={0} max={60} step={5} value={ai.context} onChange={(e) => upd({ context: Number(e.target.value) })} />
          <b>{ai.context}</b>
        </div>
      </Row>
      <Row title="Xanaphian araçları" sub="Gerektiğinde kanal geçmişini okur, arama yapar, üyeleri görür, tepki ekler, başka kanala yazar.">
        <Toggle value={ai.tools} onChange={(v) => upd({ tools: v })} />
      </Row>
      <Row title="Web araması" sub="Güncel bilgi gerekince internette arar (arama başına ek ücret).">
        <Toggle value={ai.webSearch} onChange={(v) => upd({ webSearch: v })} />
      </Row>

      <h3>Dış MCP sunucuları</h3>
      <p className="note">
        Claude'a başka araçlar bağla (ör. bir hava durumu, takvim ya da kendi MCP sunucun). Sunucu internetten erişilebilir bir <b>https</b> adresinde olmalı; çağrıları Anthropic
        yapar.
      </p>
      {servers.map((s, i) => (
        <div key={i} className="mcp-row">
          <input placeholder="ad" value={s.name} onChange={(e) => setServers(servers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input placeholder="https://…/mcp" value={s.url} onChange={(e) => setServers(servers.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <input placeholder="belirteç (isteğe bağlı)" type="password" value={s.token || ''} onChange={(e) => setServers(servers.map((x, j) => (j === i ? { ...x, token: e.target.value } : x)))} />
          <button className="btn ghost sm" onClick={() => setServers(servers.filter((_, j) => j !== i))} aria-label="Kaldır">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="row-btns">
        {servers.length < 5 && (
          <button className="btn ghost sm" onClick={() => setServers([...servers, { name: '', url: '' }])}>
            <Plus size={14} /> Sunucu ekle
          </button>
        )}
        {JSON.stringify(servers) !== JSON.stringify(ai.mcpServers) && (
          <button
            className="btn primary sm"
            onClick={() => {
              const bad = servers.find((s) => !/^https:\/\//i.test(s.url.trim()));
              if (bad) return toast('MCP sunucu adresi https:// ile başlamalı', 'err');
              upd({ mcpServers: servers });
              toast('MCP sunucuları kaydedildi', 'ok');
            }}
          >
            Kaydet
          </button>
        )}
      </div>

      <div className="info-card">
        <div className="ic-row">
          <span>Toplam çağrı</span>
          <b>{bot.usage.calls}</b>
        </div>
        <div className="ic-row">
          <span>Kullanım</span>
          <b>{cost}</b>
        </div>
      </div>
    </div>
  );
}

const MATCH_LABEL: Record<BotRule['match'], string> = { command: 'Komut', exact: 'Mesaj tam olarak', starts: 'Şununla başlarsa', contains: 'İçerirse' };

function AutoPane({ cid, bot }: { cid: string; bot: BotView }) {
  const [rules, setRules] = useState<BotRule[]>(bot.rules);
  const [prefix, setPrefix] = useState(bot.commands.prefix);
  useEffect(() => setRules(bot.rules), [JSON.stringify(bot.rules)]);
  const dirty = JSON.stringify(rules) !== JSON.stringify(bot.rules);
  const setR = (i: number, p: Partial<BotRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const p = bot.commands.prefix;
  return (
    <div className="bot-pane">
      <Row title="Hazır komutlar" sub={`${p}yardım, ${p}zar, ${p}yazıtura, ${p}seç, ${p}anket, ${p}saat${bot.ai.on ? `, ${p}sor` : ''}`}>
        <Toggle value={bot.commands.on} onChange={(v) => update(cid, bot.id, { commands: { on: v } })} />
      </Row>
      <Row title="Komut öneki" sub="Komutların başına gelen karakter.">
        <input className="prefix-input" value={prefix} maxLength={3} onChange={(e) => setPrefix(e.target.value)} onBlur={() => prefix.trim() && prefix !== p && update(cid, bot.id, { commands: { prefix } })} />
      </Row>

      <h3>Otomatik yanıtlar</h3>
      <p className="note">
        Bir mesaj kurala uyarsa bot yanıt verir ya da tepki ekler. Yanıtta kullanabileceklerin: <code>{'{kullanıcı}'}</code> (anar), <code>{'{ad}'}</code>, <code>{'{kanal}'}</code>,{' '}
        <code>{'{topluluk}'}</code>, <code>{'{üye_sayısı}'}</code>, <code>{'{argüman}'}</code> (komuttan sonra yazılan), <code>{'{zar}'}</code>, <code>{'{sayı}'}</code>,{' '}
        <code>{'{rastgele:a|b|c}'}</code>, <code>{'{saat}'}</code>, <code>{'{tarih}'}</code>.
      </p>
      {rules.map((r, i) => (
        <div key={r.id} className="rule-card">
          <div className="rule-top">
            <select value={r.match} onChange={(e) => setR(i, { match: e.target.value as BotRule['match'] })}>
              {(Object.keys(MATCH_LABEL) as BotRule['match'][]).map((m) => (
                <option key={m} value={m}>
                  {MATCH_LABEL[m]}
                </option>
              ))}
            </select>
            <div className="rule-trigger">
              {r.match === 'command' && <span className="rule-prefix">{p}</span>}
              <input placeholder={r.match === 'command' ? 'komut' : 'metin'} value={r.trigger} maxLength={100} onChange={(e) => setR(i, { trigger: e.target.value })} />
            </div>
            <input className="rule-emoji" placeholder="tepki 👍" value={r.react || ''} maxLength={16} onChange={(e) => setR(i, { react: e.target.value || undefined })} />
            <button className="btn ghost sm" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Kuralı sil">
              <Trash2 size={14} />
            </button>
          </div>
          <textarea rows={2} placeholder="Yanıt (boş bırakırsan yalnızca tepki ekler)" value={r.reply} maxLength={2000} onChange={(e) => setR(i, { reply: e.target.value })} />
        </div>
      ))}
      <div className="row-btns">
        <button className="btn ghost sm" onClick={() => setRules([...rules, { id: makeId(), match: 'command', trigger: '', reply: '' }])}>
          <Plus size={14} /> Kural ekle
        </button>
        {dirty && (
          <>
            <button className="btn primary sm" onClick={() => (update(cid, bot.id, { rules: rules.filter((r) => r.trigger.trim()) }), toast('Kurallar kaydedildi', 'ok'))}>
              Kaydet
            </button>
            <button className="btn ghost sm" onClick={() => setRules(bot.rules)}>
              Vazgeç
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function WelcomePane({ cid, bot }: { cid: string; bot: BotView }) {
  const c = useStore((s) => s.communities[cid]);
  const [text, setText] = useState(bot.welcome.text);
  const chans = (c?.channels || []).filter((x) => !isVoiceLike(x.type)).sort((a, b) => a.position - b.position);
  return (
    <div className="bot-pane">
      <Row title="Yeni üyeleri karşıla" sub="Biri davetle katıldığında bot seçtiğin kanala mesaj atar.">
        <Toggle value={bot.welcome.on} onChange={(v) => update(cid, bot.id, { welcome: { on: v } })} />
      </Row>
      <label className="field">
        <span>Kanal</span>
        <select value={bot.welcome.channelId || ''} onChange={(e) => update(cid, bot.id, { welcome: { channelId: e.target.value || null } })}>
          <option value="">İlk metin kanalı</option>
          {chans.map((ch) => (
            <option key={ch.id} value={ch.id}>
              # {ch.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Mesaj</span>
        <textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== bot.welcome.text && update(cid, bot.id, { welcome: { text } })} />
      </label>
      <p className="note">
        <code>{'{kullanıcı}'}</code> yeni üyeyi anar, <code>{'{ad}'}</code> adını yazar, <code>{'{topluluk}'}</code> ve <code>{'{üye_sayısı}'}</code> da kullanılabilir.
      </p>
    </div>
  );
}

function CodeBox({ label, text, secret }: { label: string; text: string; secret?: string }) {
  const [show, setShow] = useState(false);
  const shown = secret && !show ? text.split(secret).join('kvb.••••••••') : text;
  return (
    <div className="code-box">
      <div className="code-box-head">
        <span>{label}</span>
        <div>
          {secret && (
            <button className="btn ghost sm" onClick={() => setShow(!show)} aria-label="Göster">
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          <button className="btn ghost sm" onClick={() => (copyText(text), toast('Kopyalandı', 'ok'))}>
            <Copy size={13} /> Kopyala
          </button>
        </div>
      </div>
      <pre>{shown}</pre>
    </div>
  );
}

function ConnectPane({ cid, bot, freshToken }: { cid: string; bot: BotView; freshToken?: string }) {
  const host = useStore((s) => s.commHost[cid]);
  const info = useStore((s) => s.info);
  const [token, setToken] = useState(freshToken || '');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) request<{ data: string }>(cid, { t: 'bot.token', cid, id: bot.id }).then((r) => setToken(r.data), () => {});
  }, [bot.id]);
  const url = `${httpBase(host)}/mcp`;
  const slug =
    'kovan-' +
    (bot.user.name
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'bot');
  const tok = token || '<BELİRTEÇ>';
  const desktopJson = JSON.stringify(
    { mcpServers: { [slug]: { command: info?.exePath || 'Kovan.exe', args: [info?.mcpBridge || 'mcp-bridge.js', '--url', url], env: { ELECTRON_RUN_AS_NODE: '1', KOVAN_TOKEN: tok } } } },
    null,
    2,
  );
  const codeCmd = `claude mcp add --transport http ${slug} ${url} --header "Authorization: Bearer ${tok}"`;
  const httpJson = JSON.stringify({ mcpServers: { [slug]: { type: 'http', url, headers: { Authorization: `Bearer ${tok}` } } } }, null, 2);
  const curl = `curl -X POST ${httpBase(host)}/api/v1/channels/genel/messages \\\n  -H "Authorization: Bot ${tok}" -H "content-type: application/json" \\\n  -d "{\\"content\\": \\"Merhaba!\\"}"`;

  const addDesktop = async () => {
    if (!token) return;
    setBusy(true);
    const r = await window.kovan.installClaudeDesktop({ name: slug, url, token }).catch((e: Error) => ({ ok: false, files: [] as string[], error: e.message }));
    setBusy(false);
    if (r.ok) toast('Claude Desktop yapılandırmasına eklendi. Claude Desktop\'ı tamamen kapatıp yeniden aç.', 'ok');
    else toast('Eklenemedi: ' + (r.error || 'bilinmeyen hata'), 'err');
  };
  const reset = () =>
    confirmDialog('Belirteç yenilensin mi?', 'Eski belirteçle bağlanan Claude Desktop, Claude Code ya da programlar çalışmayı bırakır; yeni belirteçle yeniden eklemen gerekir.', async () => {
      const r = await request<{ data: string }>(cid, { t: 'bot.token', cid, id: bot.id, reset: true }).catch((e: Error) => (toast(e.message, 'err'), null));
      if (r) setToken(r.data), toast('Belirteç yenilendi', 'ok');
    }, 'Yenile');

  return (
    <div className="bot-pane">
      <p className="note">
        MCP (Model Context Protocol), yapay zekâ uygulamalarının dış araçlara bağlanma yolu. Bu botu Claude Desktop'a ya da Claude Code'a eklediğinde, Claude bu bot adına topluluğundaki
        kanalları okuyabilir, mesaj yazabilir, tepki ekleyebilir ve yeni mesajları bekleyip yanıtlayabilir. API anahtarı gerekmez; Claude aboneliğinle çalışır.
      </p>
      <Row title="MCP ve API erişimi" sub="Kapatırsan belirteçle bağlanan hiçbir uygulama bu botu kullanamaz.">
        <Toggle value={bot.api.on} onChange={(v) => update(cid, bot.id, { api: { on: v } })} />
      </Row>
      <Row title="Mesaj yazabilir" sub="Kapalıyken bağlanan yapay zekâ yalnızca okur; mesaj gönderemez, tepki ekleyemez.">
        <Toggle value={bot.api.write} onChange={(v) => update(cid, bot.id, { api: { write: v } })} />
      </Row>

      <h3>Bot belirteci</h3>
      <div className="copy-row">
        <input readOnly type={show ? 'text' : 'password'} value={token} onFocus={(e) => e.target.select()} />
        <button className="btn ghost" onClick={() => setShow(!show)} aria-label="Göster">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button className="btn primary" disabled={!token} onClick={() => (copyText(token), toast('Belirteç kopyalandı', 'ok'))}>
          Kopyala
        </button>
      </div>
      <p className="note">Belirteç bu botun parolasıdır; kimseyle paylaşma. Sızdığını düşünüyorsan yenile.</p>
      <button className="btn ghost sm" onClick={reset}>
        <RefreshCw size={14} /> Belirteci yenile
      </button>

      <h3>Claude Desktop</h3>
      <div className="connect-card">
        <Bot size={22} />
        <div>
          <b>Tek tıkla ekle</b>
          <span>Xanaphian, Claude Desktop'ın yapılandırma dosyasına bu botu ekler. Sonra Claude Desktop'ı tamamen kapatıp yeniden aç; araçlar menüsünde "{slug}" görünür.</span>
        </div>
        <button className="btn primary" disabled={!token || busy} onClick={addDesktop}>
          {busy ? <LoaderCircle className="spin" size={14} /> : <MessageSquareReply size={14} />} Claude Desktop'a ekle
        </button>
      </div>
      <CodeBox label="Elle eklemek için claude_desktop_config.json" text={desktopJson} secret={token} />

      <h3>Claude Code</h3>
      <CodeBox label="Terminalde çalıştır" text={codeCmd} secret={token} />

      <h3>Diğer MCP istemcileri (HTTP)</h3>
      <CodeBox label="Adres ve başlık" text={httpJson} secret={token} />
      <p className="note">
        Adres: <code>{url}</code>. Xanaphian kapalıyken ya da bu bilgisayardan topluluğu barındıran bilgisayara ulaşılamıyorsa bağlantı kurulmaz.
      </p>

      <h3>Kendi kodunla (REST API)</h3>
      <CodeBox label="Mesaj gönder" text={curl} secret={token} />
      <p className="note">
        Uç noktalar: <code>GET /api/v1/channels</code>, <code>GET|POST /api/v1/channels/:kanal/messages</code>, <code>GET /api/v1/members</code>, <code>GET /api/v1/updates?timeout=25</code>{' '}
        (yeni mesajları bekler). Gerçek zamanlı olaylar için WebSocket'e (<code>{wsUrl(host)}</code>) bot kimliği ve belirtecin son parçasıyla <code>hello</code> gönderebilirsin.
      </p>
    </div>
  );
}
