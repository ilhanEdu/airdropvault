import type { AppState, Identity, LogEntry, Raid } from '../types';
import { dateKey } from '../lib/todo';

const id = (() => {
  let n = 0;
  return (p: string) => `${p}_${(n++).toString(36)}`;
})();

// Demo identities — fictional farmer handles, not real people.
const ALPHA = 'id_alpha';
const BRAVO = 'id_bravo';

const identities: Identity[] = [
  { id: ALPHA, name: 'ALPHAFARM', color: 'pink', wallets: 4, main: true },
  { id: BRAVO, name: 'COLDSTAKE', color: 'cy', wallets: 2, main: false },
];

function raid(r: Partial<Raid> & Pick<Raid, 'id' | 'name' | 'status' | 'sub' | 'narrative' | 'chain'>): Raid {
  return {
    identityIds: [ALPHA],
    risk: 'low',
    brief: { funding: '—', investors: '—', phase: 'Mainnet', why: '' },
    credentials: { login: 'EVM wallet', address: '0x…demo' },
    money: { spent: 0, fees: 0, staked: 0, looted: 0, lootLabel: 'POINTS' },
    tasks: [],
    trophies: [],
    links: [],
    customFields: {},
    ...r,
  } as Raid;
}

// demo deadlines land in the near future so the countdown UI has something to show
const inHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

const raids: Raid[] = [
  raid({
    id: 'r_resolv', name: 'Resolv', status: 'won', sub: 'STABLES · MAINNET',
    narrative: 'STABLES', chain: 'Ethereum',
    identityIds: [ALPHA, BRAVO],
    brief: { funding: '$10M seed', investors: 'cyber.Fund, Maven11', phase: 'TGE done', why: 'Delta-neutral stable with a points season that actually paid — claimed and confirmed.' },
    money: { spent: 1.71, fees: 1.71, staked: 0, looted: 152, lootLabel: '+43 $RESOLV' },
    token: { id: 'resolv', qty: 43 },
    tasks: [
      { id: id('t'), text: 'Deposit USR', done: true },
      { id: id('t'), text: 'Weekly claim streak', done: true },
      { id: id('t'), text: 'Claim airdrop', done: true },
    ],
    trophies: [
      { icon: '🎁', label: 'LOOT DROPPED', locked: false },
      { icon: '💵', label: '$100 BACK', locked: false },
    ],
    links: [{ label: 'APP ↗', url: 'https://app.resolv.xyz' }, { label: 'X POST ↗', url: '' }],
  }),
  raid({
    id: 'r_nado', name: 'Nado', status: 'active', sub: 'PERPS · INK · BY KRAKEN',
    narrative: 'PERPS', chain: 'Ink', risk: 'med',
    brief: { funding: '$5M seed', investors: 'Kraken Ventures', phase: 'Mainnet', why: 'Kraken-backed perp on a fresh chain — early volume + invite tree should weight heavily in any retro drop.' },
    money: { spent: 30, fees: 30, staked: 0, looted: 0, lootLabel: 'PENDING' },
    tasks: [
      { id: id('t'), text: 'Activate invite codes', done: true },
      { id: id('t'), text: 'Generate volume', done: true },
      { id: id('t'), text: 'Hit $50k volume tier', done: false },
      { id: id('t'), text: '7-day trade streak', done: false },
    ],
    trophies: [
      { icon: '🥇', label: '1ST DEPOSIT', locked: false },
      { icon: '📈', label: 'VOL 10K', locked: false },
      { icon: '🐳', label: 'VOL 50K', locked: true },
    ],
    links: [
      { label: 'APP ↗', url: 'https://nado.xyz' },
      { label: 'REF ↗', url: '' },
      { label: 'X POST ↗', url: '' },
    ],
    customFields: { 'REF LINK': 'nado.xyz/r/demo' },
  }),
  raid({
    id: 'r_ostium', name: 'Ostium', status: 'active', statusLabel: '⏰ TIMED EVENT', sub: 'PERPS · RWA · EPOCH',
    narrative: 'PERPS', chain: 'Arbitrum', timer: '11H',
    deadline: inHours(11), deadlineLabel: 'EPOCH CLOSE',
    brief: { funding: '$3.5M', investors: 'GC, SIG', phase: 'Points epoch', why: 'RWA perps with epoch-based OP rewards — withdraw before epoch close or forfeit.' },
    money: { spent: 0, fees: 0, staked: 0, looted: 0, lootLabel: 'OP PTS' },
    tasks: [
      { id: id('t'), text: 'Trade each epoch', done: true },
      { id: id('t'), text: 'Withdraw OP before epoch close', done: false },
    ],
    trophies: [{ icon: '⏰', label: 'EPOCH × 3', locked: false }],
    links: [{ label: 'APP ↗', url: 'https://ostium.app' }],
  }),
  raid({
    id: 'r_sunrise', name: 'Sunrise', status: 'testnet', sub: 'INTERLIQUIDITY',
    narrative: 'INFRA', chain: 'Sunrise',
    brief: { funding: 'undisclosed', investors: '—', phase: 'Testnet', why: 'Interliquidity testnet — cheap tasks, confirmed $RISE allocation for early actors.' },
    money: { spent: 0, fees: 0, staked: 0, looted: 48, lootLabel: '385 $RISE' },
    tasks: [{ id: id('t'), text: 'Faucet + swap loop', done: true }, { id: id('t'), text: 'Governance vote', done: true }],
    trophies: [{ icon: '🧪', label: 'TESTNET OG', locked: false }],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_hyper', name: 'Hyperdrive', status: 'completed', sub: 'HYPERLIQUID · MONEY MKT',
    narrative: 'RWA', chain: 'Hyperliquid',
    brief: { funding: '—', investors: '—', phase: 'Season ended', why: 'Money market on Hyperliquid — supplied $117 through the season, allocation pending.' },
    money: { spent: 2, fees: 2, staked: 0, looted: 0, lootLabel: 'PENDING' },
    tasks: [{ id: id('t'), text: 'Supply assets', done: true }, { id: id('t'), text: 'Hold through season', done: true }],
    trophies: [{ icon: '🏁', label: 'SEASON DONE', locked: false }],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_towns', name: 'Towns', status: 'active', sub: 'WEB3 SOCIAL · A16Z',
    narrative: 'SOCIAL', chain: 'Base',
    identityIds: [BRAVO],
    brief: { funding: '$25.5M', investors: 'a16z crypto', phase: 'Beta', why: 'a16z-backed social protocol — daily channel activity is the obvious weighting.' },
    money: { spent: 6, fees: 6, staked: 0, looted: 0, lootLabel: 'POINTS' },
    tasks: [{ id: id('t'), text: 'Daily channel post', done: false }, { id: id('t'), text: 'Create a town', done: true }],
    trophies: [{ icon: '🏘', label: 'TOWN FOUNDER', locked: false }],
    links: [{ label: 'APP ↗', url: 'https://towns.com' }],
  }),
  raid({
    id: 'r_ethrl', name: 'Ethereal', status: 'active', sub: 'STABLES · PRE-DEPOSIT',
    narrative: 'STABLES', chain: 'Ethereum',
    brief: { funding: '—', investors: 'Ethena ecosystem', phase: 'Pre-deposit', why: 'Pre-deposit vault with points — capital parked, drop expected at TGE.' },
    money: { spent: 5.5, fees: 5.5, staked: 138, looted: 0, lootLabel: '43 PTS' },
    tasks: [{ id: id('t'), text: 'Deposit to vault', done: true }],
    trophies: [],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_loop', name: 'LoopScale', status: 'active', statusLabel: '🔒 $116 STAKED', sub: 'DEFI LENDING · SOLANA',
    narrative: 'DEFI', chain: 'Solana',
    identityIds: [ALPHA, BRAVO],
    brief: { funding: '$4.25M', investors: 'CoinFund', phase: 'Points', why: 'Solana lending with locked deposits earning points.' },
    money: { spent: 0, fees: 0, staked: 116, looted: 0, lootLabel: 'POINTS' },
    tasks: [{ id: id('t'), text: 'Lock deposit', done: true }],
    trophies: [],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_byte', name: 'ByteNova', status: 'active', sub: 'AI · NVIDIA',
    narrative: 'AI', chain: 'Base',
    identityIds: [ALPHA, BRAVO],
    brief: { funding: '—', investors: 'NVIDIA Inception', phase: 'Campaign', why: 'AI compute network with daily check-in campaign — zero cost, pure streak play.' },
    money: { spent: 5, fees: 5, staked: 0, looted: 0, lootLabel: 'POINTS' },
    tasks: [{ id: id('t'), text: 'Daily check-in', done: true }],
    trophies: [{ icon: '🔥', label: 'STREAK 30', locked: true }],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_gam3s', name: 'GAM3S', status: 'active', sub: 'GAMING · QUESTS',
    narrative: 'GAMING', chain: 'Polygon', risk: 'med',
    brief: { funding: '—', investors: '—', phase: 'Quests', why: 'Gaming quest platform — time-heavy, loot unproven.' },
    money: { spent: 38, fees: 8, staked: 0, looted: 0, lootLabel: 'POINTS' },
    tasks: [{ id: id('t'), text: 'Weekly quests', done: false }],
    trophies: [],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_mm', name: 'Might&Magic', status: 'active', sub: 'GAMING · SEASON 0',
    narrative: 'GAMING', chain: 'Immutable', risk: 'med',
    brief: { funding: '—', investors: 'Ubisoft', phase: 'Season 0', why: 'Big IP, but grindy — hours in, nothing back yet.' },
    money: { spent: 27, fees: 4, staked: 0, looted: 0, lootLabel: 'POINTS' },
    tasks: [{ id: id('t'), text: 'Season 0 matches', done: false }],
    trophies: [],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_zeta', name: 'ZetaChain', status: 'won', sub: 'OMNICHAIN · XP SEASON',
    narrative: 'INFRA', chain: 'ZetaChain',
    brief: { funding: '$27M', investors: 'Blockchain.com', phase: 'Claimed', why: 'Omnichain XP season — claimed 118 $ZETA.' },
    money: { spent: 210, fees: 14, staked: 0, looted: 89, lootLabel: '+118 $ZETA' },
    tasks: [{ id: id('t'), text: 'XP season tasks', done: true }, { id: id('t'), text: 'Claim drop', done: true }],
    trophies: [{ icon: '🎁', label: 'LOOT DROPPED', locked: false }],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_pixels', name: 'Pixels', status: 'won', sub: 'GAMING · RONIN',
    narrative: 'GAMING', chain: 'Ronin',
    brief: { funding: '$4.8M', investors: 'Animoca', phase: 'Claimed', why: 'Farming game that actually dropped — 9,400 $PIXEL claimed.' },
    money: { spent: 145, fees: 9, staked: 0, looted: 63, lootLabel: '+9,400 $PIXEL' },
    tasks: [{ id: id('t'), text: 'Farm dailies', done: true }, { id: id('t'), text: 'Claim drop', done: true }],
    trophies: [{ icon: '🎁', label: 'LOOT DROPPED', locked: false }],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_ethena', name: 'Ethena', status: 'active', sub: 'STABLES · SHARDS S3',
    narrative: 'STABLES', chain: 'Ethereum', risk: 'med',
    deadline: inHours(6 * 24), deadlineLabel: 'S3 SNAPSHOT',
    brief: { funding: '$14M', investors: 'Dragonfly, Binance Labs', phase: 'Shards S3', why: 'Biggest stable farm of the season — sUSDe locked for shards.' },
    money: { spent: 697, fees: 11, staked: 420, looted: 0, lootLabel: 'SHARDS' },
    tasks: [{ id: id('t'), text: 'Lock sUSDe', done: true }, { id: id('t'), text: 'Hold to S3 snapshot', done: false }],
    trophies: [{ icon: '💎', label: 'DIAMOND HANDS', locked: true }],
    links: [{ label: 'APP ↗', url: '' }],
  }),
  raid({
    id: 'r_camp', name: 'Camp Network', status: 'testnet', sub: 'IP LAYER · TESTNET',
    narrative: 'INFRA', chain: 'Camp',
    brief: { funding: '$4M', investors: 'Maven11', phase: 'Testnet', why: 'IP-focused L1 testnet — low effort task list.' },
    money: { spent: 0.5, fees: 0.5, staked: 0, looted: 0, lootLabel: 'POINTS' },
    tasks: [{ id: id('t'), text: 'Testnet task list', done: false }],
    trophies: [],
    links: [{ label: 'APP ↗', url: '' }],
  }),
];

// ---- entries -------------------------------------------------------------
// Showcase entries match the mockups; filler check-ins build a 14-day streak
// and ~10 weeks of heatmap history with realistic gaps.

function iso(daysAgo: number, h = 10, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function buildEntries(): LogEntry[] {
  const entries: LogEntry[] = [
    {
      id: id('e'), raidId: 'r_nado', date: iso(0, 9, 14),
      what: 'Deposited $148 for volume via Tread Fi MM bots; −$27 in trades',
      why: 'Volume for points', identityId: ALPHA, cost: 27, minutes: 120,
      chain: 'Ink', proofs: ['bots.png', 'fills.png'], xp: 25,
    },
    {
      id: id('e'), raidId: 'r_gam3s', date: iso(0, 8, 2),
      what: 'Minted Solana Gaming S0 NFT',
      why: 'Eligibility mint', identityId: ALPHA, cost: 2.26, minutes: 10,
      chain: 'Solana', proofs: [], xp: 10,
    },
    {
      id: id('e'), raidId: 'r_resolv', date: iso(1, 14, 10),
      what: '🎁 LOOT DROPPED — 43 $RESOLV confirmed!',
      why: 'Airdrop claim', identityId: ALPHA, cost: 0.4, minutes: 15,
      chain: 'Ethereum', proofs: ['claim-tx'], xp: 100,
      loot: { label: '+43 $RESOLV', value: 152 },
    },
    {
      id: id('e'), raidId: 'r_nado', date: iso(8, 11, 0),
      what: 'Deposited $109, withdrew all to activate 3 invite codes',
      why: 'Invite tree', identityId: ALPHA, cost: 1, minutes: 35,
      chain: 'Ink', proofs: ['proof.png'], xp: 25,
    },
    {
      id: id('e'), raidId: 'r_nado', date: iso(10, 10, 0),
      what: 'Got access code, created account with a fresh wallet',
      why: 'Onboarding', identityId: ALPHA, cost: 0, minutes: 10,
      chain: 'Ink', proofs: [], xp: 15,
    },
    {
      id: id('e'), raidId: 'r_hyper', date: iso(2, 16, 30),
      what: 'Supplied $117 to Hyperdrive money market',
      why: 'Season deposit', identityId: ALPHA, cost: 2, minutes: 25,
      chain: 'Hyperliquid', proofs: ['supply-tx'], xp: 25,
    },
  ];

  // Filler: deterministic pseudo-random history. Last 14 days always have
  // at least one entry (the streak); days 15-70 have ~60% density.
  const fillers = [
    { raidId: 'r_byte', what: 'ByteNova daily check-in', chain: 'Base' },
    { raidId: 'r_towns', what: 'Posted in Towns channel', chain: 'Base' },
    { raidId: 'r_ostium', what: 'Ostium epoch trade', chain: 'Arbitrum' },
    { raidId: 'r_gam3s', what: 'GAM3S weekly quests', chain: 'Polygon' },
    { raidId: 'r_mm', what: 'Might&Magic season matches', chain: 'Immutable' },
    { raidId: 'r_zeta', what: 'ZetaChain XP tasks', chain: 'ZetaChain' },
    { raidId: 'r_pixels', what: 'Pixels farm dailies', chain: 'Ronin' },
    { raidId: 'r_sunrise', what: 'Sunrise testnet loop', chain: 'Sunrise' },
  ];
  const seededDays = new Set(entries.map((e) => Math.round((Date.now() - +new Date(e.date)) / 86400000)));
  for (let day = 0; day <= 70; day++) {
    const r = (day * 137 + 41) % 100; // deterministic
    const inStreak = day < 14;
    if (!inStreak && r >= 60) continue;
    if (seededDays.has(day) && r % 3 !== 0) continue;
    const f = fillers[(day * 7 + 3) % fillers.length];
    const heavy = (day * 31) % 5 === 0;
    entries.push({
      id: id('e'), raidId: f.raidId, date: iso(day, 9 + (day % 9), (day * 13) % 60),
      what: f.what, why: 'Daily grind', identityId: day % 4 === 0 ? BRAVO : ALPHA,
      cost: 0, minutes: heavy ? 90 : 20, chain: f.chain, proofs: [], xp: 10,
    });
  }
  return entries.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

// A truly empty vault for real use — no demo raids, no history, level 1.
export function buildBlank(): AppState {
  return {
    version: 1,
    xp: 0,
    raids: [],
    entries: [],
    todo: [],
    questsDate: dateKey(),
    comboClaimed: false,
    identities: [{ id: 'id_main', name: 'MAIN', color: 'pink', wallets: 0, addresses: [], main: true }],
    customFields: [],
    trophyRules: [],
    voice: { tone: 50, length: 50, emoji: 40, spice: 50 },
    memory: [],
    skillFiles: [],
    ai: { provider: 'local', apiKey: '', model: '', baseUrl: '' },
    etherscanKey: '',
  };
}

export function buildSeed(): AppState {
  const todayKey = dateKey();
  return {
    version: 1,
    xp: 2140,
    raids,
    entries: buildEntries(),
    // demo to-do list — in real use these are created by logging a move
    // with DAILY or WEEKLY repeat in the + LOG screen
    todo: [
      { id: 'q1', raidId: 'r_byte', text: 'ByteNova check-in', xp: 10, cadence: 'daily', lastDone: todayKey },
      { id: 'q2', raidId: 'r_towns', text: 'Towns channel post', xp: 15, cadence: 'daily' },
      { id: 'q3', raidId: 'r_ostium', text: 'Ostium withdraw', xp: 40, cadence: 'weekly', boss: true },
      { id: 'q4', raidId: 'r_resolv', text: 'Resolv weekly claim', xp: 25, cadence: 'weekly' },
      { id: 'q5', raidId: 'r_gam3s', text: 'GAM3S weekly quests', xp: 20, cadence: 'weekly' },
      { id: 'q6', raidId: 'r_pixels', text: 'Pixels farm dailies', xp: 10, cadence: 'daily' },
    ],
    questsDate: todayKey,
    comboClaimed: false,
    identities,
    customFields: ['FUNDING', 'INVESTORS', 'RISK FACTOR', 'CRACKED CONTRIBUTION', 'LOCKED ASSET', 'REF LINK'],
    trophyRules: [
      { id: 'tr1', text: 'First airdrop confirmed', xp: 100, done: true },
      { id: 'tr2', text: '$100 looted', xp: 150, done: true },
      { id: 'tr3', text: '30-day streak', xp: 300, done: false },
    ],
    voice: { tone: 30, length: 45, emoji: 55, spice: 72 },
    memory: ['posts as @demofarmer', 'never shill scams', 'prefers low-fee L2s'],
    skillFiles: [
      {
        name: 'my-voice.md',
        content: 'Voice: lowercase, confident, never begs for engagement. Short lines. One concrete number per post beats three vague claims. Never use "gem", "moonshot", or rocket emoji.',
      },
      {
        name: 'best-threads.md',
        content: 'Hooks that hit: lead with what it cost me, not what I earned. End threads with a system/process note, not a CTA. Receipts post always carries the screenshot.',
      },
    ],
    ai: { provider: 'local', apiKey: '', model: '', baseUrl: '' },
    etherscanKey: '',
  };
}
