import { useEffect, useState } from 'react';
import type { AppState, Raid } from '../types';

// Real deadlines for snapshots / epoch closes / claim cutoffs. A missed
// snapshot is the most expensive mistake in farming, so urgency is loud:
// overdue and <24h are alarm-red, <72h is warning-yellow.

export type Urgency = 'overdue' | 'critical' | 'soon' | 'later';

export interface DeadlineInfo {
  raid: Raid;
  at: Date;
  label: string; // what the clock counts to
  countdown: string; // "2D 4H" / "11H 20M" / "OVERDUE 2D"
  urgency: Urgency;
}

const HOUR = 3600000;

function countdownLabel(ms: number): string {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * HOUR));
  const h = Math.floor((abs % (24 * HOUR)) / HOUR);
  const m = Math.floor((abs % HOUR) / 60000);
  const span = d > 0 ? `${d}D ${h}H` : h > 0 ? `${h}H ${m}M` : `${m}M`;
  return ms < 0 ? `OVERDUE ${span}` : span;
}

export function deadlineInfo(raid: Raid, now = Date.now()): DeadlineInfo | null {
  if (!raid.deadline) return null;
  const at = new Date(raid.deadline);
  if (Number.isNaN(at.getTime())) return null;
  const ms = +at - now;
  const urgency: Urgency =
    ms < 0 ? 'overdue' : ms < 24 * HOUR ? 'critical' : ms < 72 * HOUR ? 'soon' : 'later';
  return { raid, at, label: raid.deadlineLabel || 'DEADLINE', countdown: countdownLabel(ms), urgency };
}

// Won/completed raids drop off the rail — their clocks no longer matter.
export function upcomingDeadlines(state: AppState, now = Date.now()): DeadlineInfo[] {
  return state.raids
    .filter((r) => r.status === 'active' || r.status === 'testnet')
    .map((r) => deadlineInfo(r, now))
    .filter((d): d is DeadlineInfo => d !== null)
    .sort((a, b) => +a.at - +b.at);
}

export const urgencyChip: Record<Urgency, string> = {
  overdue: 'rose',
  critical: 'rose',
  soon: 'yel',
  later: 'cy',
};

// Re-render once a minute so countdowns tick without any user action.
export function useNow(intervalMs = 60000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// <input type="datetime-local"> needs local "YYYY-MM-DDTHH:mm"; state keeps ISO.
export function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
