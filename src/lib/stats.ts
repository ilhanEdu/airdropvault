import type { AppState, LogEntry, Raid } from '../types';

export const fmtMoney = (n: number, sign = false): string => {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs % 1 === 0 ? abs.toString()
    : abs.toFixed(2);
  if (n < 0) return `−$${s}`;
  return sign && n > 0 ? `+$${s}` : `$${s}`;
};

export interface WarChest {
  spent: number;
  looted: number;
  staked: number;
  net: number;
}

export function warChest(s: AppState): WarChest {
  let spent = 0, looted = 0, staked = 0;
  for (const r of s.raids) {
    spent += r.money.spent;
    looted += r.money.looted;
    staked += r.money.staked;
  }
  return { spent, looted, staked, net: looted - spent };
}

const dayKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function activeDays(entries: LogEntry[]): Set<string> {
  return new Set(entries.map((e) => dayKey(e.date)));
}

// Consecutive days (ending today or yesterday) with ≥1 logged entry.
export function streak(entries: LogEntry[]): number {
  const days = activeDays(entries);
  let n = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

// Per-day activity intensity (count of entries) for the last `n` days, oldest first.
export function heatCells(entries: LogEntry[], n: number): number[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = dayKey(e.date);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(counts.get(dayKey(d)) ?? 0);
  }
  return out;
}

export function totalMinutes(entries: LogEntry[]): number {
  return entries.reduce((a, e) => a + e.minutes, 0);
}

export function minutesByRaid(entries: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.raidId, (m.get(e.raidId) ?? 0) + e.minutes);
  return m;
}

export interface NarrativeScore {
  narrative: string;
  spent: number;
  looted: number;
  score: number; // 0..1 — payoff weighting used for the bars
}

export function narrativeScores(s: AppState): NarrativeScore[] {
  const agg = new Map<string, { spent: number; looted: number }>();
  for (const r of s.raids) {
    const a = agg.get(r.narrative) ?? { spent: 0, looted: 0 };
    a.spent += r.money.spent;
    a.looted += r.money.looted + r.money.staked * 0.1; // staked counts a little
    agg.set(r.narrative, a);
  }
  const rows = [...agg.entries()].map(([narrative, a]) => ({
    narrative,
    spent: a.spent,
    looted: a.looted,
    score: a.looted / (a.looted + a.spent + 1),
  }));
  const max = Math.max(...rows.map((r) => r.score), 0.001);
  return rows
    .map((r) => ({ ...r, score: r.score / max }))
    .sort((a, b) => b.score - a.score);
}

export function isWin(r: Raid): boolean {
  return r.money.looted > 0;
}

export function winRate(s: AppState): { wins: number; total: number; pct: number } {
  const wins = s.raids.filter(isWin).length;
  const total = s.raids.length;
  return { wins, total, pct: total ? Math.round((wins / total) * 100) : 0 };
}

export function roi(s: AppState): number {
  const { spent, looted } = warChest(s);
  if (spent === 0) return 0;
  return Math.round(((looted - spent) / spent) * 100);
}

export function chainCount(s: AppState): number {
  return new Set(s.raids.map((r) => r.chain)).size;
}
