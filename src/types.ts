export type RaidStatus = 'active' | 'won' | 'completed' | 'testnet';
export type Risk = 'low' | 'med' | 'high';

export interface Identity {
  id: string;
  name: string;
  color: 'pink' | 'cy' | 'yel' | 'grn';
  wallets: number; // legacy count — superseded by addresses.length when present
  addresses?: string[]; // actual wallet addresses attached to this profile
  main: boolean;
}

// Wallet count shown in the UI: real addresses win over the legacy number.
export function walletCount(i: Identity): number {
  return i.addresses ? i.addresses.length : i.wallets;
}

export interface RaidTask {
  id: string;
  text: string;
  done: boolean;
}

export interface Trophy {
  icon: string;
  image?: string; // Discord role badge / recognition image — shown instead of the emoji
  label: string;
  locked: boolean;
}

export interface RaidLink {
  label: string;
  url: string;
}

export interface Raid {
  id: string;
  name: string;
  logo?: string; // path or URL; defaults to /logos/<slug>.png|svg, falls back to a monogram
  status: RaidStatus;
  statusLabel?: string; // override e.g. "⏰ TIMED EVENT", "🔒 $116 STAKED"
  sub: string; // tagline shown on cards
  narrative: string;
  chain: string;
  identityIds: string[];
  risk: Risk;
  brief: {
    funding: string;
    investors: string;
    phase: string;
    why: string;
  };
  credentials: {
    login: string;
    address: string;
  };
  money: {
    spent: number; // total $ out (includes fees)
    fees: number;
    staked: number;
    looted: number; // realized $ value back
    lootLabel: string; // e.g. "+43 $RESOLV", "PENDING"
  };
  tasks: RaidTask[];
  trophies: Trophy[];
  links: RaidLink[];
  timer?: string; // legacy display string — superseded by deadline when set
  deadline?: string; // ISO datetime of the next snapshot / epoch close / claim cutoff
  deadlineLabel?: string; // what the clock counts to, e.g. "EPOCH CLOSE", "S3 SNAPSHOT"
  token?: { id: string; qty: number }; // CoinGecko coin id + amount held — live loot pricing
  customFields: Record<string, string>;
}

export interface MediaItem {
  name: string;
  url: string; // served from vault-data/ (e.g. /vault-media/raids/<slug>/media/<file>)
}

export interface LogEntry {
  id: string;
  raidId: string;
  date: string; // ISO datetime
  what: string;
  why: string;
  identityId: string;
  cost: number;
  minutes: number;
  chain: string;
  proofs: string[]; // labels (filenames / tx hashes / links)
  media?: MediaItem[]; // uploaded screenshots saved to disk
  repeat?: Repeat; // one-time (default), daily, or weekly — feeds the to-do list
  xp: number;
  loot?: { label: string; value: number }; // set when an entry records a win
}

export type Cadence = 'daily' | 'weekly';
export type Repeat = 'once' | Cadence;

// To-do list item — born when a logged contribution is marked daily/weekly.
// Never reset: "done" is derived from lastDone vs today (daily) or the last
// 7 days (weekly), so a weekly task automatically resurfaces a week later.
export interface RecurringTask {
  id: string;
  raidId?: string; // protocol the task came from
  text: string;
  xp: number;
  cadence: Cadence;
  lastDone?: string; // YYYY-MM-DD of most recent completion
  boss?: boolean;
}

export interface TrophyRule {
  id: string;
  text: string;
  xp: number;
  done: boolean;
}

export interface VoiceDials {
  tone: number; // 0 degen .. 100 pro
  length: number; // 0 punchy .. 100 deep
  emoji: number; // 0 none .. 100 heavy
  spice: number; // 0 subtle .. 100 🌶🌶🌶
}

export type BrainFormat = 'thread' | 'single' | 'longform';
export type BrainAngle = 'alpha' | 'story' | 'tutorial' | 'hottake';

export interface BrainDraftPost {
  tag: string; // "1/4 · HOOK"
  text: string;
  proof?: string;
}

export type AiProvider = 'local' | 'anthropic' | 'openai' | 'gemini' | 'custom';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string; // empty = provider default
  baseUrl: string; // only for 'custom' (OpenAI-compatible: OpenRouter, Groq, Ollama…)
}

export interface AppState {
  version: 1;
  xp: number;
  raids: Raid[];
  entries: LogEntry[];
  todo: RecurringTask[];
  questsDate: string; // YYYY-MM-DD the combo flag belongs to
  comboClaimed: boolean;
  identities: Identity[];
  customFields: string[];
  trophyRules: TrophyRule[];
  voice: VoiceDials;
  memory: string[];
  skillFiles: SkillFile[];
  ai: AiConfig;
  etherscanKey: string; // Etherscan V2 multichain key — powers the wallet scanner
}

export interface SkillFile {
  name: string;
  content: string; // markdown fed into the ghostwriter's system prompt
}
