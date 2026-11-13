import React from 'react';
import { Download, RefreshCw, RotateCw, CircleAlert, LoaderCircle, Palette } from 'lucide-react';
import { ThemeQuick } from './Appearance';
import { cx } from '../lib/util';
import { useStore, toast } from '../lib/store';
import { Logo, Tooltip } from './Common';
import { ServerRail } from './ServerRail';
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
  const onboarded = useStore((s) => s.onboarded);
  const [themes, setThemes] = React.useState(false);
  return (
    <header className="titlebar">
      <div className="tb-brand">
        <Logo size={20} />
        <span>kovan</span>
      </div>
      {onboarded && <ServerRail />}
      <div className="tb-drag" />
      <div className="tb-actions">
        <Tooltip text="Renk teması" side="bottom">
          <button className={cx('tb-icon', themes && 'on')} onClick={() => setThemes((v) => !v)} aria-label="Renk teması">
            <Palette size={15} />
          </button>
        </Tooltip>
        {themes && <ThemeQuick onClose={() => setThemes(false)} />}
        <UpdateButton />
      </div>
    </header>
  );
}
