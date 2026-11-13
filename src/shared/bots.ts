// Kovan botları: topluluğa eklenen bot hesapları, otomatik yanıtlar, yapay zekâ (Claude) ve MCP bağlantısı.
import type { ID, UserPublic } from './protocol';

export type BotTemplate = 'blank' | 'welcome' | 'fun' | 'ai';

export interface BotRule {
  id: ID;
  /** command: önek + tetikleyici (ör. !merhaba); exact: mesajın tamamı; starts: ile başlar; contains: içerir */
  match: 'command' | 'exact' | 'starts' | 'contains';
  trigger: string;
  reply: string;
  react?: string; // isteğe bağlı emoji tepkisi
}

export type BotEffort = 'low' | 'medium' | 'high';

export interface BotMcpServer {
  name: string;
  url: string;
  token?: string; // yalnızca yazılırken; görünümde maskelenir
}

export interface BotAiConfig {
  on: boolean;
  model: string;
  effort: BotEffort;
  /** Kişilik / ek talimatlar */
  persona: string;
  /** Bu kanallarda her mesaja yanıt verir; diğerlerinde yalnızca bahsedilince ya da yanıtlanınca */
  channels: ID[];
  /** Bağlam olarak okunacak son mesaj sayısı */
  context: number;
  /** Kovan araçları: geçmiş okuma, arama, tepki, başka kanala yazma */
  tools: boolean;
  webSearch: boolean;
  mcpServers: BotMcpServer[];
}

export interface BotView {
  id: ID;
  cid: ID;
  user: UserPublic;
  createdBy: ID;
  createdAt: number;
  welcome: { on: boolean; channelId: ID | null; text: string };
  commands: { on: boolean; prefix: string };
  rules: BotRule[];
  ai: BotAiConfig & { hasKey: boolean; keyHint: string };
  api: { on: boolean; write: boolean };
  usage: { calls: number; inTok: number; outTok: number; lastError?: string; lastAt?: number };
}

export interface BotPatch {
  name?: string;
  color?: string;
  avatar?: string | null;
  bio?: string;
  welcome?: Partial<BotView['welcome']>;
  commands?: Partial<BotView['commands']>;
  rules?: BotRule[];
  ai?: Partial<BotAiConfig> & { apiKey?: string | null };
  api?: Partial<BotView['api']>;
}

export type BotClientFrame =
  | { t: 'bot.list'; cid: ID; rid?: string }
  | { t: 'bot.create'; cid: ID; name: string; template: BotTemplate; rid?: string }
  | { t: 'bot.update'; cid: ID; id: ID; patch: BotPatch; rid?: string }
  | { t: 'bot.delete'; cid: ID; id: ID; rid?: string }
  | { t: 'bot.token'; cid: ID; id: ID; reset?: boolean; rid?: string }
  | { t: 'bot.test'; cid: ID; id: ID; rid?: string };

export type BotServerFrame = { t: 'bots'; cid: ID; bots: BotView[] };

export const AI_MODELS: { id: string; label: string; sub: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', sub: 'Önerilen. Güçlü ve dengeli.' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', sub: 'Hızlı ve daha ucuz.' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', sub: 'En hızlı ve en ucuz.' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', sub: 'En yetenekli, en pahalı.' },
];
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

/** Bot belirteci: "kvb.<botId>.<gizli>" */
export function parseBotToken(token: string): { id: ID; secret: string } | null {
  const m = /^kvb\.([a-z0-9]{6,40})\.([A-Za-z0-9_-]{16,200})$/.exec(token.trim());
  return m ? { id: m[1], secret: m[2] } : null;
}

export const isBotId = (id: ID) => id.startsWith('b') && id.length === 15;
