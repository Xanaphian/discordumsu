// Anlık etkinlik algılama (yalnız Windows): oynanan oyun, çalan müzik (Spotify ve diğerleri),
// League of Legends maç bilgisi ve Kick/Twitch canlı yayın durumu.
// Hiçbir hizmet anahtarı gerekmez: oyunlar süreç listesinden, müzik Windows'un medya denetimlerinden
// (SMTC, Spotify'ın da kullandığı), maç bilgisi oyunun kendi yerel API'sinden, yayın durumu herkese açık sayfalardan okunur.
import { app, nativeImage, net } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { KNOWN_GAMES, NOT_GAMES, gameFromPath } from './games';
import { initSpotify, setSpotifyPolling, spotifyStatus, type SpotifyStatus, type SpotifyTrack } from './spotify';

export interface DetectedGame {
  name: string;
  exe: string;
  start?: number;
  icon?: string;
  details?: string;
  state?: string;
  /** LoL maç başlangıcı (oyun süresinden) */
  matchStart?: number;
}
export interface DetectedMedia {
  app: string;
  /** spotify | music | browser | other */
  src: string;
  appName: string;
  title: string;
  artist?: string;
  album?: string;
  playing: boolean;
  pos?: number;
  dur?: number;
  /** pos'un ölçüldüğü an */
  at?: number;
  art?: string;
}
export interface DetectedStream {
  svc: 'kick' | 'twitch';
  name: string;
  live: boolean;
  title?: string;
  category?: string;
  viewers?: number;
  start?: number;
  url: string;
}
export interface ActivityState {
  supported: boolean;
  /** Windows medya denetimlerine (SMTC) erişilebiliyor mu */
  mediaOk?: boolean;
  /** teşhis: görülen medya oturumları ("Spotify.exe:Playing") */
  sessions?: string[];
  mediaErr?: string;
  game: DetectedGame | null;
  media: DetectedMedia | null;
  streams: DetectedStream[];
  /** Spotify hesabı bağlantısı (Ayarlar > Etkinlik) */
  spotify?: SpotifyStatus;
  /** şarkı Spotify hesabından mı okundu */
  mediaFrom?: 'account' | 'windows';
}
export interface ActivityConfig {
  enabled: boolean;
  customGames: { exe: string; name: string }[];
  streams: { svc: 'kick' | 'twitch'; name: string }[];
}
export interface RunningApp {
  exe: string;
  title: string;
  path?: string;
  icon?: string;
  game?: string;
}

const isWin = process.platform === 'win32';
let send: (s: ActivityState) => void = () => {};
let cfg: ActivityConfig = { enabled: true, customGames: [], streams: [] };
let state: ActivityState = { supported: isWin || !!process.env.KOVAN_FAKE_ACTIVITY, game: null, media: null, streams: [] };
let ps: ChildProcess | null = null;
let psRestart: NodeJS.Timeout | null = null;
let lastProcs: Proc[] = [];
let lastThumb: string | undefined;
let lastThumbKey = '';
/** Windows medya denetimlerinden / pencere başlığından okunan son şarkı */
let localMedia: DetectedMedia | null = null;
/** Spotify hesabından okunan şarkı */
let accountMedia: DetectedMedia | null = null;
const accountArt = new Map<string, string | null>();
let lolTimer: NodeJS.Timeout | null = null;
let streamTimer: NodeJS.Timeout | null = null;
const iconCache = new Map<string, string>();

interface Proc {
  n: string;
  p?: string;
  t?: string;
  s?: number;
}

const emit = () => send({ ...state, streams: [...state.streams], spotify: spotifyStatus() });

// ---------------------------------------------------------------------------
// PowerShell izleyicisi: 4 saniyede bir pencereli süreçler + medya oturumu; yalnız değişince yazar.
function psScript(known: string[]) {
  const list = known.map((k) => "'" + k.replace(/'/g, "''") + "'").join(',');
  return String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$parent = ${process.pid}
$known = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($k in @(${list})) { [void]$known.Add($k) }
$mgr = $null
$asTaskG = $null
$mgrErr = ''
function Await($op, [Type]$t) {
  $task = $script:asTaskG.MakeGenericMethod($t).Invoke($null, @($op))
  [void]$task.Wait(4000)
  if ($task.IsCompleted -and -not $task.IsFaulted) { return $task.Result }
  return $null
}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskG = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' })[0]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
} catch { $mgrErr = "$_" }
# kapak okumak için (yüklenemezse yalnız kapak gelmez, şarkı yine görünür)
try { [void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] } catch {}
function GetMgr {
  if (-not $script:asTaskG) { return $null }
  try { return Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
  catch { $script:mgrErr = "$_"; return $null }
}
$mgr = GetMgr
function Thumb($ref) {
  try {
    $st = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $st) { return $null }
    $ns = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
    $ms = New-Object System.IO.MemoryStream
    $ns.CopyTo($ms)
    $b = $ms.ToArray()
    $ns.Dispose(); $ms.Dispose()
    if ($b.Length -gt 0 -and $b.Length -lt 3000000) { return [Convert]::ToBase64String($b) }
  } catch {}
  return $null
}
# Pencereli süreçler: her süreç için ayrı ayrı pencere taramak (MainWindowHandle) yerine
# tüm pencereler tek seferde taranır; yol ve başlangıç zamanı da süreç başına bir kez okunur.
$winApi = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class KovanPencere {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static Dictionary<int, bool> Pids() {
    var s = new Dictionary<int, bool>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero) { uint p; GetWindowThreadProcessId(h, out p); s[(int)p] = true; }
      return true;
    }, IntPtr.Zero);
    return s;
  }
}
'@
  [void][KovanPencere]::Pids()
  $winApi = $true
} catch { $winApi = $false }
$info = @{}
$tick = 0
$last = ''
$lastKey = ''
$thumbTries = 0
$thumbOk = $false
while ($true) {
  if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
  $tick++
  $wins = $null
  if ($winApi) { try { $wins = [KovanPencere]::Pids() } catch { $wins = $null } }
  $found = New-Object System.Collections.ArrayList
  foreach ($pr in [System.Diagnostics.Process]::GetProcesses()) {
    try {
      $n = $pr.ProcessName
      $hasWin = if ($wins) { $wins.ContainsKey($pr.Id) } else { $pr.MainWindowHandle -ne 0 }
      if (-not ($hasWin -or $known.Contains($n.ToLower()))) { continue }
      $key = "$($pr.Id)|$n"
      $c = $info[$key]
      if (-not $c) {
        $s = 0; $p = $null
        try { $s = ([DateTimeOffset]$pr.StartTime).ToUnixTimeMilliseconds() } catch {}
        try { $p = $pr.MainModule.FileName } catch {}
        $c = @{ p = $p; s = $s; seen = 0 }
        $info[$key] = $c
      }
      $c.seen = $tick
      $o = [ordered]@{ n = $n; p = $c.p; s = $c.s }
      if ($n -match '^(javaw?|spotify)$') { $t = $pr.MainWindowTitle; if ($t) { $o.t = $t } }
      [void]$found.Add($o)
    } catch {} finally { $pr.Dispose() }
  }
  foreach ($k in @($info.Keys)) { if ($info[$k].seen -ne $tick) { $info.Remove($k) } }
  $procs = @($found | Sort-Object { $_.n })
  $media = $null
  $thumb = $null
  $sess = @()
  if (-not $mgr -and ($tick % 15) -eq 1) { $mgr = GetMgr }
  if ($mgr) {
    try {
      # Xanaphian'ın kendi ses oturumu (ses odası, bildirim sesi) müzik sayılmaz. Kalan oturumlar puanlanır,
      # adı (başlığı) olan en yüksek puanlı oturum seçilir: çalan > Spotify ya da Spotify'a bağlı oynatıcı > bilinen müzik uygulaması.
      $cands = New-Object System.Collections.ArrayList
      foreach ($ss in $mgr.GetSessions()) {
        $id = "$($ss.SourceAppUserModelId)"
        $pi = $ss.GetPlaybackInfo()
        $playing = ("$($pi.PlaybackStatus)" -eq 'Playing')
        $sess += "$($id):$($pi.PlaybackStatus)"
        if ($id -match '(?i)xanaphian|kovan') { continue }
        $score = 0
        if ($playing) { $score += 10 }
        if ($id -match '(?i)spotify|retrofy|spotif') { $score += 5 }
        elseif ($id -match '(?i)music|deezer|tidal|foobar|aimp|winamp|musicbee|vlc|fizy|soundcloud') { $score += 3 }
        [void]$cands.Add(@{ ss = $ss; sc = $score; pl = $playing })
      }
      $best = $null; $bestPlaying = $false; $pr = $null
      foreach ($c in @($cands | Sort-Object -Property @{ Expression = { $_.sc }; Descending = $true })) {
        $p2 = Await ($c.ss.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        if ($p2 -and $p2.Title) { $best = $c.ss; $bestPlaying = $c.pl; $pr = $p2; break }
      }
      if ($best) {
        if ($pr -and $pr.Title) {
          $tl = $null
          try { $tl = $best.GetTimelineProperties() } catch {}
          $key = "$($best.SourceAppUserModelId)|$($pr.Title)|$($pr.Artist)"
          # Spotify kapağı çoğu zaman şarkı adından birkaç saniye sonra verir: alınamazsa sonraki turlarda yeniden dene
          if ($key -ne $lastKey) { $lastKey = $key; $thumbTries = 0; $thumbOk = $false }
          if (-not $thumbOk -and $thumbTries -lt 6) {
            $thumbTries++
            if ($pr.Thumbnail) { $thumb = Thumb $pr.Thumbnail }
            if ($thumb) { $thumbOk = $true }
          }
          $media = [ordered]@{ app = $best.SourceAppUserModelId; title = $pr.Title; artist = $pr.Artist; album = $pr.AlbumTitle; playing = [bool]$bestPlaying }
          if ($tl) {
            try { $media.pos = [int64]$tl.Position.TotalMilliseconds; $media.dur = [int64]$tl.EndTime.TotalMilliseconds; $media.upd = [int64]$tl.LastUpdatedTime.ToUnixTimeMilliseconds() } catch {}
          }
        }
      }
    } catch { $mgrErr = "$_" }
  }
  $sig = (@{ p = $procs; m = $media; s = $sess; ok = [bool]$mgr } | ConvertTo-Json -Compress -Depth 4)
  if ($sig -ne $last -or $thumb) {
    $last = $sig
    $out = [ordered]@{ p = $procs; m = $media; th = $thumb; tk = $lastKey; ok = [bool]$mgr; s = $sess; e = $mgrErr }
    [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  }
  Start-Sleep -Seconds 4
}
`;
}

function startWatcher() {
  if (!isWin || ps) return;
  const file = path.join(app.getPath('userData'), 'etkinlik-izleyici.ps1');
  try {
    // UTF-8 BOM: Windows PowerShell 5.1 dosyayı doğru kodlamayla okusun
    fs.writeFileSync(file, '﻿' + psScript([...Object.keys(KNOWN_GAMES), ...cfg.customGames.map((g) => g.exe)]), 'utf8');
  } catch {
    return;
  }
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  ps = child;
  let buf = '';
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith('{')) {
        try {
          onSample(JSON.parse(line));
        } catch {
          /* yarım satır */
        }
      }
    }
  });
  child.on('exit', () => {
    if (ps !== child) return;
    ps = null;
    if (cfg.enabled && !psRestart) psRestart = setTimeout(() => ((psRestart = null), startWatcher()), 15_000);
  });
}

function stopWatcher() {
  const p = ps;
  ps = null;
  if (psRestart) clearTimeout(psRestart), (psRestart = null);
  try {
    p?.kill();
  } catch {
    /* zaten kapalı */
  }
}

const arr = <T,>(v: T | T[] | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

/** Spotify masaüstü penceresinin başlığı çalarken "Sanatçı - Şarkı" olur; duraklatılınca "Spotify Premium". */
function spotifyFromTitle(procs: Proc[]): DetectedMedia | null {
  for (const pr of procs) {
    if (pr.n.toLowerCase() !== 'spotify' || !pr.t) continue;
    const t = pr.t.trim();
    if (/^spotify( premium| free)?$/i.test(t) || /^(advertisement|reklam)$/i.test(t)) continue;
    const i = t.indexOf(' - ');
    if (i < 1) continue;
    return { app: 'Spotify.exe', src: 'spotify', appName: 'Spotify', artist: t.slice(0, i).trim(), title: t.slice(i + 3).trim(), playing: true };
  }
  return null;
}

async function onSample(o: { p?: Proc | Proc[]; m?: any; th?: string | null; tk?: string; ok?: boolean; s?: string | string[]; e?: string }) {
  lastProcs = arr(o.p);
  if (o.th) (lastThumb = resizeArt(o.th)), (lastThumbKey = o.tk || '');
  // kapak yalnız alındığı şarkıya aittir: şarkı değişip yenisinin kapağı henüz gelmediyse eskisini gösterme
  else if ((o.tk || '') !== lastThumbKey) lastThumb = undefined;
  const game = await pickGame(lastProcs);
  const m = o.m;
  let media: DetectedMedia | null = null;
  if (m && m.title) {
    const src = mediaSource(String(m.app || ''));
    media = {
      app: String(m.app || ''),
      src: src.src,
      appName: src.name,
      title: String(m.title),
      artist: m.artist ? String(m.artist) : undefined,
      album: m.album ? String(m.album) : undefined,
      playing: !!m.playing,
      pos: typeof m.pos === 'number' ? m.pos : undefined,
      dur: typeof m.dur === 'number' && m.dur > 0 ? m.dur : undefined,
      at: typeof m.upd === 'number' && m.upd > 0 ? m.upd : Date.now(),
      art: lastThumb,
    };
  } else (lastThumb = undefined), (lastThumbKey = '');
  // medya denetimleri Spotify'ı vermediyse (kapalı, hata ya da başka uygulama seçildi) pencere başlığından oku
  if (!media || !media.playing) {
    const sp = spotifyFromTitle(lastProcs);
    if (sp && (!media || media.src !== 'spotify' || !media.playing)) {
      if (media && media.src === 'spotify' && media.title === sp.title) media = { ...media, playing: true };
      else media = sp;
    }
  }
  if (media) withOnlineArt(media);
  const prevGame = state.game;
  // LoL maç ayrıntılarını koru (ayrı zamanlayıcı günceller)
  if (game && prevGame && prevGame.exe === game.exe && prevGame.name === game.name) {
    game.details = prevGame.details;
    game.state = prevGame.state;
    game.matchStart = prevGame.matchStart;
  }
  localMedia = media;
  state = { ...state, game, media: pickMedia(), mediaFrom: accountMedia?.playing ? 'account' : media ? 'windows' : undefined, mediaOk: !!o.ok, sessions: arr(o.s).slice(0, 8), mediaErr: o.e ? String(o.e).slice(0, 200) : undefined };
  syncLol();
  emit();
}

function mediaSource(app: string): { src: string; name: string } {
  const a = app.toLowerCase();
  // Spotify'a bağlı üçüncü taraf oynatıcılar (Retrofy vb.) da Spotify sayılır: şarkı Spotify'dan çalar
  if (/spotif|retrofy/.test(a)) return { src: 'spotify', name: 'Spotify' };
  const music: [RegExp, string][] = [
    [/applemusic|itunes/, 'Apple Music'],
    [/deezer/, 'Deezer'],
    [/tidal/, 'TIDAL'],
    [/youtube ?music|ytmdesktop|youtube-music/, 'YouTube Music'],
    [/foobar/, 'foobar2000'],
    [/aimp/, 'AIMP'],
    [/musicbee/, 'MusicBee'],
    [/winamp/, 'Winamp'],
    [/zunemusic|microsoft\.zune|mediaplayer/, 'Medya Oynatıcı'],
    [/soundcloud/, 'SoundCloud'],
    [/amazon ?music/, 'Amazon Music'],
    [/fizy/, 'fizy'],
    [/vlc/, 'VLC'],
  ];
  for (const [re, name] of music) if (re.test(a)) return { src: 'music', name };
  const browsers: [RegExp, string][] = [
    [/chrome/, 'Chrome'],
    [/msedge|microsoftedge/, 'Edge'],
    [/firefox|308046b0af4a39cb/, 'Firefox'],
    [/opera/, 'Opera'],
    [/brave/, 'Brave'],
    [/vivaldi/, 'Vivaldi'],
    [/yandex/, 'Yandex'],
  ];
  for (const [re, name] of browsers) if (re.test(a)) return { src: 'browser', name };
  // "com.firma.Uygulama" ya da "Firma.Uygulama_abc123!App" gibi kimliklerden okunur bir ad çıkar
  let base = app.split('!')[0].replace(/\.exe$/i, '').replace(/_[a-z0-9]{10,}$/i, '');
  base = base.split(/[.\\/]/).filter(Boolean).pop() || base;
  base = base.replace(/[-_]+/g, ' ').trim();
  return { src: 'other', name: (base.charAt(0).toLocaleUpperCase('tr-TR') + base.slice(1)).slice(0, 32) || 'Medya' };
}

// ---------------------------------------------------------------------------
// Albüm kapağı yedeği: medya denetimleri kapak vermediyse (ya da şarkı Spotify pencere başlığından okunduysa)
// kapak Deezer / iTunes'un herkese açık aramasından alınır (anahtar gerekmez). Yalnız müzik uygulamalarında;
// tarayıcıdaki videolar için arama yapılmaz, yanlış kapak çıkmasın.
const artCache = new Map<string, string | null>();
const artPending = new Set<string>();
const fold = (t: string) =>
  t
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** "Şarkı - Remastered 2011", "Şarkı (feat. X)" gibi ekleri at */
const baseTitle = (t: string) => t.replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || t;
const mainArtist = (a: string) => a.split(/,|&| feat\.? | ft\.? | x | ve /i)[0].trim();

function sameSong(wantTitle: string, wantArtist: string, title: string, artist: string): boolean {
  const wt = fold(baseTitle(wantTitle)), t = fold(baseTitle(title));
  const wa = fold(mainArtist(wantArtist)), a = fold(artist);
  if (!wt || !t) return false;
  const [s1, s2] = wt.length < t.length ? [wt, t] : [t, wt];
  const titleOk = wt === t || (s2.startsWith(s1 + ' ') && s1.length >= s2.length * 0.6);
  const artistOk = !wa || a.includes(wa) || wa.includes(fold(mainArtist(artist)));
  return titleOk && artistOk;
}

async function getJson(url: string): Promise<any> {
  const r = await net.fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function findCoverUrl(title: string, artist: string): Promise<string | null> {
  const q = (artist ? mainArtist(artist) + ' ' : '') + baseTitle(title);
  try {
    const d = await getJson('https://api.deezer.com/search?limit=8&q=' + encodeURIComponent(q));
    for (const x of d?.data || []) {
      if (x?.album?.cover_medium && sameSong(title, artist, String(x.title || ''), String(x.artist?.name || ''))) return String(x.album.cover_medium);
    }
  } catch {
    /* Deezer'a ulaşılamadı */
  }
  try {
    const d = await getJson('https://itunes.apple.com/search?media=music&entity=song&limit=8&country=TR&term=' + encodeURIComponent(q));
    for (const x of d?.results || []) {
      if (x?.artworkUrl100 && sameSong(title, artist, String(x.trackName || ''), String(x.artistName || '')))
        return String(x.artworkUrl100).replace(/100x100bb/, '256x256bb');
    }
  } catch {
    /* iTunes'a ulaşılamadı */
  }
  return null;
}

function withOnlineArt(media: DetectedMedia) {
  if (media.art || (media.src !== 'spotify' && media.src !== 'music')) return;
  const key = fold(media.artist || '') + '|' + fold(media.title);
  const hit = artCache.get(key);
  if (hit !== undefined) {
    if (hit) media.art = hit;
    return;
  }
  if (artPending.has(key)) return;
  artPending.add(key);
  (async () => {
    let art: string | null = null;
    try {
      const url = await findCoverUrl(media.title, media.artist || '');
      if (url && /^https:\/\//.test(url)) {
        const r = await net.fetch(url, { headers: { 'user-agent': UA } });
        if (r.ok) art = resizeArt(Buffer.from(await r.arrayBuffer()).toString('base64')) || null;
      }
    } catch {
      art = null;
    }
    artPending.delete(key);
    if (artCache.size > 300) artCache.clear();
    artCache.set(key, art);
    const cur = localMedia;
    if (art && cur && !cur.art && cur.title === media.title && (cur.artist || '') === (media.artist || '')) {
      localMedia = { ...cur, art };
      state = { ...state, media: pickMedia() };
      emit();
    }
  })();
}

function resizeArt(b64: string): string | undefined {
  try {
    const img = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'));
    if (img.isEmpty()) return undefined;
    const { width, height } = img.getSize();
    // kare kırp (bazı uygulamalar kapağı geniş verir) ve 128px'e indir
    const side = Math.min(width, height);
    const sq = width !== height ? img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }) : img;
    const out = sq.resize({ width: 128, height: 128, quality: 'good' }).toJPEG(78);
    if (out.length > 16_500) return 'data:image/jpeg;base64,' + sq.resize({ width: 96, height: 96 }).toJPEG(65).toString('base64');
    return 'data:image/jpeg;base64,' + out.toString('base64');
  } catch {
    return undefined;
  }
}

async function iconFor(p?: string): Promise<string | undefined> {
  if (!p) return undefined;
  const hit = iconCache.get(p);
  if (hit !== undefined) return hit || undefined;
  try {
    const img = await app.getFileIcon(p, { size: 'large' });
    const url = img.isEmpty() ? '' : 'data:image/png;base64,' + img.toPNG().toString('base64');
    iconCache.set(p, url.length < 11_000 ? url : '');
  } catch {
    iconCache.set(p, '');
  }
  return iconCache.get(p) || undefined;
}

function matchGame(pr: Proc): string | null {
  const n = pr.n.toLowerCase();
  const custom = cfg.customGames.find((g) => g.exe === n);
  if (custom) return custom.name;
  if (n === 'javaw' || n === 'java') return pr.t && /^minecraft/i.test(pr.t) ? 'Minecraft' : null;
  if (KNOWN_GAMES[n]) return KNOWN_GAMES[n];
  if (NOT_GAMES.has(n)) return null;
  return gameFromPath(pr.p);
}

async function pickGame(procs: Proc[]): Promise<DetectedGame | null> {
  let best: { pr: Proc; name: string; score: number } | null = null;
  for (const pr of procs) {
    const name = matchGame(pr);
    if (!name) continue;
    const n = pr.n.toLowerCase();
    // maçtaki LoL istemciden, özel eklenen oyun tahmin edilenden önce gelir
    const score = (n === 'league of legends' ? 30 : 0) + (cfg.customGames.some((g) => g.exe === n) ? 20 : KNOWN_GAMES[n] ? 10 : 0);
    if (!best || score > best.score) best = { pr, name, score };
  }
  if (!best) return null;
  const n = best.pr.n.toLowerCase();
  const sameAsBefore = state.game && state.game.name === best.name;
  // aynı oyun içinde süreç değişse de (istemci -> maç) başlangıç saati korunur
  const start = sameAsBefore && state.game!.start ? state.game!.start : best.pr.s || Date.now();
  const g: DetectedGame = { name: best.name, exe: n, start, icon: await iconFor(best.pr.p) };
  if (n === 'leagueclientux') g.state = 'İstemcide';
  return g;
}

// ---------------------------------------------------------------------------
// League of Legends: maçtayken oyunun yerel API'si (127.0.0.1:2999) şampiyon, kip ve süreyi verir.
const LOL_MODES: Record<string, string> = {
  CLASSIC: 'Sihirdar Vadisi',
  ARAM: 'ARAM',
  CHERRY: 'Arena',
  URF: 'URF',
  ARURF: 'ARURF',
  ONEFORALL: 'Hepsi Bir İçin',
  PRACTICETOOL: 'Antrenman',
  TUTORIAL: 'Eğitim',
  SWIFTPLAY: 'Hızlı Oyun',
  NEXUSBLITZ: 'Nexus Saldırısı',
  STRAWBERRY: 'Swarm',
  TFT: 'Teamfight Tactics',
};
const lolAgent = new https.Agent({ rejectUnauthorized: false });

function lolFetch(): Promise<any> {
  return new Promise((resolve) => {
    const req = https.get({ host: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', agent: lolAgent, timeout: 3000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => (req.destroy(), resolve(null)));
  });
}

async function pollLol() {
  const g = state.game;
  if (!g || g.exe !== 'league of legends') return;
  const d = await lolFetch();
  if (!state.game || state.game.exe !== 'league of legends') return;
  if (!d?.activePlayer) {
    state.game = { ...state.game, details: undefined, state: 'Yükleme ekranında' };
    return emit();
  }
  const me = d.activePlayer;
  const myId = me.riotId || me.summonerName;
  const p = (d.allPlayers || []).find((x: any) => (x.riotId || x.summonerName) === myId) || {};
  const mode = String(d.gameData?.gameMode || '');
  const t = Number(d.gameData?.gameTime) || 0;
  const sc = p.scores || {};
  const kda = typeof sc.kills === 'number' ? ` · ${sc.kills}/${sc.deaths}/${sc.assists}` : '';
  state.game = {
    ...state.game,
    details: p.championName ? `${p.championName}` : undefined,
    state: (LOL_MODES[mode] || mode || 'Maçta') + kda,
    matchStart: Date.now() - Math.round(t * 1000),
  };
  emit();
}

function syncLol() {
  const want = state.game?.exe === 'league of legends';
  if (want && !lolTimer) {
    lolTimer = setInterval(pollLol, 15_000);
    pollLol();
  } else if (!want && lolTimer) {
    clearInterval(lolTimer);
    lolTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Canlı yayın: Kick ve Twitch'in herkese açık sayfaları; anahtar gerekmez.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function checkKick(name: string): Promise<DetectedStream> {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const base: DetectedStream = { svc: 'kick', name, live: false, url: 'https://kick.com/' + slug };
  try {
    const r = await net.fetch('https://kick.com/api/v2/channels/' + slug, { headers: { accept: 'application/json', 'user-agent': UA } });
    if (!r.ok) return base;
    const d: any = await r.json();
    const ls = d?.livestream;
    if (!ls || ls.is_live === false) return base;
    const created = Date.parse(String(ls.created_at || ls.start_time || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(ls.created_at || '')) ? '' : 'Z'));
    return {
      ...base,
      live: true,
      title: ls.session_title ? String(ls.session_title) : undefined,
      category: ls.categories?.[0]?.name ? String(ls.categories[0].name) : undefined,
      viewers: typeof ls.viewer_count === 'number' ? ls.viewer_count : typeof ls.viewers === 'number' ? ls.viewers : undefined,
      start: isFinite(created) ? created : undefined,
    };
  } catch {
    return base;
  }
}

async function checkTwitch(name: string): Promise<DetectedStream> {
  const login = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const base: DetectedStream = { svc: 'twitch', name, live: false, url: 'https://www.twitch.tv/' + login };
  try {
    const r = await net.fetch('https://www.twitch.tv/' + login, { headers: { 'user-agent': UA, accept: 'text/html' } });
    if (!r.ok) return base;
    const html = await r.text();
    if (!/"isLiveBroadcast"\s*:\s*true/.test(html)) return base;
    let title: string | undefined;
    let start: number | undefined;
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        const j = JSON.parse(m[1]);
        for (const o of Array.isArray(j) ? j : [j]) {
          const pub = Array.isArray(o?.publication) ? o.publication[0] : o?.publication;
          if (pub?.isLiveBroadcast) {
            title = o.description || o.name;
            const t = Date.parse(pub.startDate || '');
            if (isFinite(t)) start = t;
          }
        }
      } catch {
        /* başka betik */
      }
    }
    return { ...base, live: true, title, start };
  } catch {
    return base;
  }
}

async function pollStreams() {
  const list = cfg.enabled ? cfg.streams.slice(0, 4) : [];
  const out = await Promise.all(list.map((s) => (s.svc === 'kick' ? checkKick(s.name) : checkTwitch(s.name))));
  const changed = JSON.stringify(out) !== JSON.stringify(state.streams);
  state.streams = out;
  if (changed) emit();
}

function syncStreams() {
  if (streamTimer) clearInterval(streamTimer), (streamTimer = null);
  if (process.env.KOVAN_FAKE_ACTIVITY) return;
  if (!cfg.enabled || !cfg.streams.length) {
    if (state.streams.length) (state.streams = []), emit();
    return;
  }
  pollStreams();
  streamTimer = setInterval(pollStreams, 75_000);
}

// ---------------------------------------------------------------------------
// Ekran görüntüsü ve deneme için sahte veri: KOVAN_FAKE_ACTIVITY=<json dosyası>
function loadFake() {
  try {
    const f = JSON.parse(fs.readFileSync(process.env.KOVAN_FAKE_ACTIVITY!, 'utf8'));
    const img = (p?: string) => (p && fs.existsSync(p) ? 'data:image/' + (p.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(p).toString('base64') : undefined);
    if (f.game) f.game.icon = img(f.game.iconFile);
    if (f.media) f.media.art = img(f.media.artFile), (f.media.at = Date.now());
    state = { supported: true, mediaOk: f.mediaOk ?? true, game: f.game || null, media: f.media || null, streams: f.streams || [] };
    if (state.game && !state.game.start) state.game.start = Date.now() - 23 * 60_000;
    if (state.game?.matchStart) state.game.matchStart = Date.now() - state.game.matchStart;
    for (const s of state.streams) if (s.start && s.start < 1e9) s.start = Date.now() - s.start;
    localMedia = state.media;
    if (state.media && !state.media.art) withOnlineArt(state.media);
  } catch {
    /* sahte veri yok */
  }
}

export function initActivity(sender: (s: ActivityState) => void) {
  send = sender;
  initSpotify(onAccountTrack, () => emit());
  if (process.env.KOVAN_FAKE_ACTIVITY) loadFake();
}

export function getActivity(): ActivityState {
  return { ...state, spotify: spotifyStatus() };
}

// ---------------------------------------------------------------------------
// Spotify hesabı: çalıyorsa Windows'tan okunanın önüne geçer (Retrofy, telefon, web çalar dahil her yerden dinleneni görür)
function pickMedia(): DetectedMedia | null {
  if (accountMedia?.playing) return accountMedia;
  return localMedia || accountMedia;
}

function onAccountTrack(t: SpotifyTrack | null) {
  if (!t || !t.title) accountMedia = null;
  else {
    const art = t.artUrl ? accountArt.get(t.artUrl) : undefined;
    accountMedia = {
      app: 'Spotify',
      src: 'spotify',
      appName: 'Spotify',
      title: t.title,
      artist: t.artist,
      album: t.album,
      playing: t.playing,
      pos: t.pos,
      dur: t.dur,
      at: t.at,
      art: art || undefined,
    };
    if (t.artUrl && art === undefined && (/^https:\/\//.test(t.artUrl) || (!!process.env.KOVAN_SPOTIFY_TEST && t.artUrl.startsWith(process.env.KOVAN_SPOTIFY_TEST)))) {
      const url = t.artUrl;
      accountArt.set(url, null);
      net
        .fetch(url, { headers: { 'user-agent': UA } })
        .then(async (r) => (r.ok ? resizeArt(Buffer.from(await r.arrayBuffer()).toString('base64')) || null : null))
        .catch(() => null)
        .then((a) => {
          if (accountArt.size > 200) accountArt.clear();
          if (!a) return accountArt.delete(url);
          accountArt.set(url, a);
          if (accountMedia && t.artUrl === url) (accountMedia = { ...accountMedia, art: a }), (state = { ...state, media: pickMedia() }), emit();
        });
    }
    // hesap kapak vermediyse (yerel dosya) internetten bul
    if (!t.artUrl) withOnlineArt(accountMedia);
  }
  // ilerleme her yoklamada değişir; yalnız şarkı, durum, kapak ya da atlama (başlangıç anı kayması) olunca gönder
  const sig = (m: DetectedMedia | null) => (m ? [m.title, m.artist, m.playing, m.art ? 1 : 0, Math.round(((m.at || 0) - (m.pos || 0)) / 3000)].join('|') : '');
  const before = sig(state.media);
  state = { ...state, media: pickMedia(), mediaFrom: accountMedia?.playing ? 'account' : localMedia ? 'windows' : undefined };
  if (before !== sig(state.media)) emit();
}

export function configureActivity(next: ActivityConfig) {
  const prevGames = JSON.stringify(cfg.customGames);
  const prevStreams = JSON.stringify(cfg.streams);
  const wasEnabled = cfg.enabled;
  cfg = {
    enabled: next.enabled !== false,
    customGames: (next.customGames || []).slice(0, 50).map((g) => ({ exe: String(g.exe).toLowerCase().replace(/\.exe$/, ''), name: String(g.name).slice(0, 64) })),
    streams: (next.streams || []).filter((s) => s.svc === 'kick' || s.svc === 'twitch').map((s) => ({ svc: s.svc, name: String(s.name).slice(0, 48) })),
  };
  if (process.env.KOVAN_FAKE_ACTIVITY) return emit();
  setSpotifyPolling(cfg.enabled);
  if (!cfg.enabled) {
    stopWatcher();
    localMedia = null;
    state = { ...state, game: null, media: null, streams: [] };
    syncLol();
    syncStreams();
    return emit();
  }
  if (!wasEnabled || !ps || prevGames !== JSON.stringify(cfg.customGames)) {
    stopWatcher();
    startWatcher();
  }
  if (!wasEnabled || prevStreams !== JSON.stringify(cfg.streams)) syncStreams();
  // özel oyun listesi değiştiyse son örneği yeniden değerlendir
  if (prevGames !== JSON.stringify(cfg.customGames) && lastProcs.length)
    pickGame(lastProcs).then((g) => {
      state.game = g;
      syncLol();
      emit();
    });
}

/** "Oyun ekle" için açık pencereli uygulamalar */
export async function runningApps(): Promise<RunningApp[]> {
  if (process.env.KOVAN_FAKE_ACTIVITY) {
    return [
      { exe: 'hollow knight silksong', title: 'Hollow Knight: Silksong', game: 'Hollow Knight: Silksong' },
      { exe: 'obsidian', title: 'Notlar - Obsidian' },
      { exe: 'spotify', title: 'Spotify Premium' },
      { exe: 'mygame', title: 'Benim Oyunum' },
    ];
  }
  if (!isWin) return [];
  const script =
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Sort-Object ProcessName -Unique | ForEach-Object { [ordered]@{ n = $_.ProcessName; t = $_.MainWindowTitle; p = $_.Path } } | ConvertTo-Json -Compress";
  const out = await new Promise<string>((resolve) => {
    const c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
    let b = '';
    c.stdout.setEncoding('utf8');
    c.stdout.on('data', (d) => (b += d));
    c.on('close', () => resolve(b));
    c.on('error', () => resolve(''));
    setTimeout(() => c.kill(), 10_000);
  });
  let list: Proc[] = [];
  try {
    list = arr(JSON.parse(out.trim() || '[]'));
  } catch {
    return [];
  }
  const res: RunningApp[] = [];
  for (const p of list) {
    const exe = String(p.n || '').toLowerCase();
    if (!exe || ['applicationframehost', 'textinputhost', 'systemsettings', 'shellexperiencehost', 'kovan', 'xanaphian', 'electron'].includes(exe)) continue;
    res.push({ exe, title: String(p.t || ''), path: p.p || undefined, icon: await iconFor(p.p || undefined), game: matchGame({ n: exe, p: p.p, t: p.t }) || undefined });
  }
  return res;
}

export function stopActivity() {
  setSpotifyPolling(false);
  stopWatcher();
  if (lolTimer) clearInterval(lolTimer);
  if (streamTimer) clearInterval(streamTimer);
}
