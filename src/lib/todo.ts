import type { RecurringTask } from '../types';

// local-timezone YYYY-MM-DD — a "day" is the user's day, not UTC's
export const dateKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysSince = (key: string, today: string): number =>
  Math.round((Date.parse(today) - Date.parse(key)) / 86400000);

// Due = needs doing today. Daily: any day it wasn't done yet. Weekly: 7+ days
// since the last completion. A weekly done 3 days ago is neither due nor
// done-today, so it stays off the list until its week is up.
export function isDueToday(t: RecurringTask, today = dateKey()): boolean {
  if (t.lastDone === today) return false;
  if (!t.lastDone) return true;
  return t.cadence === 'daily' || daysSince(t.lastDone, today) >= 7;
}

export interface TodayList {
  due: RecurringTask[]; // still open, shown first
  doneToday: RecurringTask[]; // completed today, sink to the bottom
  total: number;
}

export function todaysTasks(todo: RecurringTask[], today = dateKey()): TodayList {
  const due = todo.filter((t) => isDueToday(t, today));
  const doneToday = todo.filter((t) => t.lastDone === today);
  return { due, doneToday, total: due.length + doneToday.length };
}
