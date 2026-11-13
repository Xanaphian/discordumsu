import React from 'react';
import { Download, RefreshCw, RotateCw, CircleAlert, LoaderCircle, Hash, Volume2, Megaphone } from 'lucide-react';
import { useStore, toast } from '../lib/store';
import { Logo, Tooltip } from './Common';
import { fmtSize } from '../lib/util';

export function UpdateButton() {
  const u = useStore((s) => s.update);
  const version = useStore((s) => s.info?.version);
  switch (u.state) {
    case 'available':
      return (
        <button className="upd-btn available" onClick={() => window.kovan.update.download()} title={u.notes || ''}>
          <Download size={14} /> Güncelle <b>v{u.version}</b>
          {u.size ? <span className="upd-size">{fmtSize(u.size)}</span> : null}
        </button>
      );
    case 'downloading':
      return (
        <div className="upd-btn downloading">
          <LoaderCircle size={14} className="spin" /> İndiriliyor %{Math.floor(u.percent)}
          <span className="upd-bar" style={{ width: `${u.percent}%` }} />
        </div>
      );
    case 'ready':
      return (
        <button className="upd-btn ready" onClick={() => window.kovan.update.install()}>
          <RotateCw size={14} /> Yeniden başlat ve yükle <b>v{u.version}</b>
        </button>
      );
    case 'checking':
      return (
        <span className="tb-icon">
          <LoaderCircle size={15} className="spin" />
        </span>
      );
    case 'error':
      if (!u.manual) return <UpdateIdle version={version} />;
      return (
        <Tooltip text={u.message} side="bottom">
          <button className="tb-icon err" onClick={() => window.kovan.update.check()}>
            <CircleAlert size={15} />
          </button>
        </Tooltip>
      );
    default:
      return <UpdateIdle version={version} dev={u.state === 'dev'} />;
  }
}

function UpdateIdle({ version, dev }: { version?: string; dev?: boolean }) {
      return (
        <Tooltip text={dev ? 'Geliştirme modunda güncelleme kapalı' : `Güncellemeleri denetle (şu an v${version})`} side="bottom">
          <button
            className="tb-icon"
            onClick={async () => {
              if (dev) return toast('Geliştirme modunda güncelleme denetlenmez.');
              await window.kovan.update.check();
            }}
          >
            <RefreshCw size={15} />
          </button>
        </Tooltip>
      );
}

export function TitleBar() {
  const current = useStore((s) => s.current);
  const comm = useStore((s) => (s.current !== 'home' ? s.communities[s.current] : undefined));
  const chId = useStore((s) => (s.current !== 'home' ? s.chanByComm[s.current] : undefined));
  const ch = comm?.channels.find((x) => x.id === chId);
  const u = useStore((s) => s.update);
  // elle denetimde "güncelsin" bildirimi
  const lastNone = React.useRef(0);
  React.useEffect(() => {
    if (u.state === 'none' && u.manual && u.checkedAt !== lastNone.current) {
      lastNone.current = u.checkedAt;
      toast('Kovan güncel. En son sürümü kullanıyorsun.', 'ok');
    }
    if (u.state === 'error' && u.manual) toast('Güncelleme denetlenemedi: ' + u.message, 'err');
  }, [u]);
  const Icon = ch?.type === 'voice' ? Volume2 : ch?.type === 'announce' ? Megaphone : Hash;
  return (
    <header className="titlebar">
      <div className="tb-brand">
        <Logo size={18} />
        <span>Kovan</span>
      </div>
      <div className="tb-crumb">
        {current === 'home' ? (
          <span>Ana Sayfa</span>
        ) : comm ? (
          <>
            <span>{comm.name}</span>
            {ch && (
              <>
                <span className="tb-sep">/</span>
                <Icon size={13} />
                <span>{ch.name}</span>
              </>
            )}
          </>
        ) : null}
      </div>
      <div className="tb-actions">
        <UpdateButton />
      </div>
    </header>
  );
}
