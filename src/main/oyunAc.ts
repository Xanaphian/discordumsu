// Oyuna davet: bu bilgisayarda daha önce algılanan oyunların yolu hatırlanır, davetten "Oyunu aç" ile başlatılır.
// Yalnız burada görülmüş oyunlar açılabilir (davet eden tarafın yolu kullanılmaz; davet yalnız oyunun adını taşır).
import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Store = 'steam' | 'epic' | 'riot' | 'xbox' | 'ea' | 'ubisoft' | 'gog' | 'battlenet';
let known: Record<string, string> | null = null;
let saveT: NodeJS.Timeout | null = null;
const file = () => path.join(app.getPath('userData'), 'oyun-yollari.json');
const key = (name: string) => name.trim().toLocaleLowerCase('tr');

function load(): Record<string, string> {
  if (known) return known;
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    known = j && typeof j === 'object' ? j : {};
  } catch {
    known = {};
  }
  return known!;
}

export function storeOf(p?: string): Store | undefined {
  if (!p) return undefined;
  const s = p.replace(/\//g, '\\');
  if (/\\steamapps\\common\\/i.test(s)) return 'steam';
  if (/\\Epic Games\\/i.test(s)) return 'epic';
  if (/\\Riot Games\\/i.test(s)) return 'riot';
  if (/\\XboxGames\\/i.test(s)) return 'xbox';
  if (/\\(EA Games|Electronic Arts)\\/i.test(s)) return 'ea';
  if (/\\Ubisoft Game Launcher\\/i.test(s)) return 'ubisoft';
  if (/\\GOG Galaxy\\/i.test(s)) return 'gog';
  if (/\\Battle\.net\\/i.test(s)) return 'battlenet';
  return undefined;
}

/** Algılanan oyunun yolunu hatırla (oyun adı -> exe) */
export function rememberGame(name: string, p?: string) {
  if (!name || !p || !/\.exe$/i.test(p)) return;
  const k = load();
  if (k[key(name)] === p) return;
  k[key(name)] = p;
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(() => {
    saveT = null;
    try {
      fs.writeFileSync(file(), JSON.stringify(k));
    } catch {
      /* yazılamadı */
    }
  }, 2000);
}

export function hasGame(name: string): boolean {
  const p = load()[key(String(name || ''))];
  return !!p && fs.existsSync(p);
}

function run(file: string, args: string[], cwd: string) {
  const c = spawn(file, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false });
  c.on('error', () => {}); // açılamazsa ana süreç çökmesin
  c.unref();
}

const RIOT_PRODUCT: Record<string, string> = { 'league of legends': 'league_of_legends', valorant: 'valorant', 'legends of runeterra': 'bacon', '2xko': 'lion' };

export function launchGame(name: string): { ok: boolean; error?: string } {
  const n = key(String(name || ''));
  const p = load()[n];
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'Bu oyun bu bilgisayarda henüz görülmedi. Bir kez kendin aç, sonraki davetlerde buradan açılır.' };
  try {
    // Riot oyunları kendi istemcisinden açılır
    const riot = /^(.*\\Riot Games)\\/i.exec(p.replace(/\//g, '\\'));
    const product = RIOT_PRODUCT[n];
    if (riot && product) {
      const rcs = path.join(riot[1], 'Riot Client', 'RiotClientServices.exe');
      if (fs.existsSync(rcs)) {
        run(rcs, ['--launch-product=' + product, '--launch-patchline=live'], path.dirname(rcs));
        return { ok: true };
      }
    }
    run(p, [], path.dirname(p));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Oyun açılamadı: ' + (e as Error).message };
  }
}
