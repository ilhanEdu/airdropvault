// Cumulative XP required to *reach* each level. Index i = level i+1.
const THRESHOLDS = [
  0, 40, 100, 180, 280, 400, 560, 760, 1000, 1280, 1580, 1900, 2500, 3200,
  4000, 4900, 5900, 7000, 8200, 9500, 10900, 12400, 14000, 15700, 17500,
];

const TITLES = [
  'FRESH WALLET', 'DUST COLLECTOR', 'GAS PAYER', 'TESTNET TOURIST', 'POINT CHASER',
  'CHAIN HOPPER', 'YIELD GOBLIN', 'SYBIL SUSPECT', 'VOLUME GRINDER', 'EPOCH WATCHER',
  'RETRO HUNTER', 'CRACKED', 'WHALE WHISPERER 🐳', 'AIRDROP ORACLE', 'CHAIN LORD',
  'GIGA FARMER', 'PROTOCOL GHOST', 'VAULT KEEPER', 'DEGEN ASCENDANT', 'FINAL BOSS',
];

export function levelFor(xp: number): number {
  let level = 1;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (xp >= THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function levelTitle(level: number): string {
  return TITLES[Math.min(level - 1, TITLES.length - 1)];
}

export function nextLevelXp(level: number): number {
  if (level >= THRESHOLDS.length) return THRESHOLDS[THRESHOLDS.length - 1] + (level - THRESHOLDS.length + 1) * 1800;
  return THRESHOLDS[level];
}

export function currentLevelXp(level: number): number {
  return THRESHOLDS[Math.min(level - 1, THRESHOLDS.length - 1)];
}

export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const lo = currentLevelXp(level);
  const hi = nextLevelXp(level);
  return {
    level,
    title: levelTitle(level),
    nextTitle: levelTitle(level + 1),
    toNext: hi - xp,
    nextAt: hi,
    pct: Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100)),
  };
}
