import { walletCount, type AppState } from '../types';
import type { Screen } from '../state/ui';
import { fmtMoney } from './stats';
import { whenLabel } from '../components/bits';

export type ResultKind = 'raid' | 'entry' | 'screen' | 'identity' | 'narrative' | 'chain' | 'trophy' | 'quest' | 'field';

export interface SearchResult {
  id: string;
  kind: ResultKind;
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  score: number;
  // where the result takes you
  screen: Screen;
  raidId?: string;
  entryId?: string;
}

const KIND_LABEL: Record<ResultKind, string> = {
  raid: 'RAID', entry: 'LOG', screen: 'GO TO', identity: 'IDENTITY',
  narrative: 'NARRATIVE', chain: 'CHAIN', trophy: 'TROPHY', quest: 'QUEST', field: 'FIELD',
};

export function kindLabel(k: ResultKind): string {
  return KIND_LABEL[k];
}

// Lightweight relevance: prefix/word-start beats substring; title beats body.
function match(query: string, title: string, body: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  if (new RegExp(`\\b${escapeRe(q)}`).test(t)) return 600;
  if (t.includes(q)) return 400;
  if (new RegExp(`\\b${escapeRe(q)}`).test(b)) return 250;
  if (b.includes(q)) return 120;
  // multi-word: every token appears somewhere
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => t.includes(tok) || b.includes(tok))) return 200;
  return 0;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SCREENS: { screen: Screen; title: string; sub: string; icon: string; keywords: string }[] = [
  { screen: 'hq', title: 'Player HQ', sub: 'Dashboard · money · quests', icon: '🏠', keywords: 'home dashboard war chest xp streak' },
  { screen: 'raids', title: 'Active Raids', sub: 'Portfolio of all projects', icon: '⚔️', keywords: 'portfolio projects list' },
  { screen: 'log', title: 'Log Your Move', sub: 'Record a contribution', icon: '📝', keywords: 'add new entry contribution deposit' },
  { screen: 'brain', title: 'AI Brain', sub: 'Ghostwrite posts', icon: '🤖', keywords: 'ghostwriter content thread voice memory' },
  { screen: 'stats', title: 'The Honest Mirror', sub: 'Analytics · ROI · win rate', icon: '📊', keywords: 'analytics roi stats charts coach' },
  { screen: 'vault', title: 'The Vault', sub: 'Settings · backup · AI engine', icon: '🔐', keywords: 'settings backup export import identities custom fields api key model' },
];

export function search(state: AppState, query: string, limit = 12): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const out: SearchResult[] = [];

  // navigation
  for (const s of SCREENS) {
    const sc = match(q, s.title, s.sub + ' ' + s.keywords);
    if (sc) out.push({ id: `screen:${s.screen}`, kind: 'screen', icon: s.icon, title: s.title, subtitle: s.sub, score: sc - 50, screen: s.screen });
  }

  // raids
  for (const r of state.raids) {
    const body = `${r.sub} ${r.narrative} ${r.chain} ${r.brief.why} ${r.brief.investors} ${r.brief.funding} ${r.status} ${Object.values(r.customFields).join(' ')}`;
    const sc = match(q, r.name, body);
    if (sc) {
      out.push({
        id: `raid:${r.id}`, kind: 'raid', icon: '⚔️', title: r.name,
        subtitle: `${r.sub} · ${r.chain}`,
        badge: r.money.looted > 0 ? r.money.lootLabel : fmtMoney(-r.money.spent),
        score: sc + 30, screen: 'detail', raidId: r.id,
      });
    }
  }

  // log entries
  for (const e of state.entries) {
    const raid = state.raids.find((x) => x.id === e.raidId);
    const body = `${e.why} ${e.chain} ${raid?.name ?? ''} ${e.proofs.join(' ')}`;
    const sc = match(q, e.what, body);
    if (sc) {
      out.push({
        id: `entry:${e.id}`, kind: 'entry', icon: e.loot ? '🎁' : '📜',
        title: e.what.length > 60 ? e.what.slice(0, 60) + '…' : e.what,
        subtitle: `${raid?.name ?? '?'} · ${whenLabel(e.date)}`,
        badge: e.cost > 0 ? fmtMoney(-e.cost) : `+${e.xp} XP`,
        score: sc, screen: 'detail', raidId: e.raidId, entryId: e.id,
      });
    }
  }

  // identities → vault
  for (const i of state.identities) {
    const sc = match(q, i.name, `identity wallet ${i.main ? 'main' : 'alt'}`);
    if (sc) out.push({ id: `id:${i.id}`, kind: 'identity', icon: '🪪', title: i.name, subtitle: `${walletCount(i)} wallets · ${i.main ? 'main' : 'alt'}`, score: sc, screen: 'vault' });
  }

  // narratives & chains → raids filtered conceptually (just navigate to raids)
  const narratives = [...new Set(state.raids.map((r) => r.narrative))];
  for (const n of narratives) {
    const count = state.raids.filter((r) => r.narrative === n).length;
    const sc = match(q, n, 'narrative tag');
    if (sc) out.push({ id: `narr:${n}`, kind: 'narrative', icon: '🏷', title: n, subtitle: `${count} raid${count === 1 ? '' : 's'}`, score: sc - 20, screen: 'raids' });
  }
  const chains = [...new Set(state.raids.map((r) => r.chain))];
  for (const c of chains) {
    const count = state.raids.filter((r) => r.chain === c).length;
    const sc = match(q, c, 'chain network');
    if (sc) out.push({ id: `chain:${c}`, kind: 'chain', icon: '⛓', title: c, subtitle: `${count} raid${count === 1 ? '' : 's'}`, score: sc - 20, screen: 'raids' });
  }

  // trophies (across raids)
  for (const r of state.raids) {
    for (const t of r.trophies) {
      const sc = match(q, t.label, `trophy badge ${r.name} ${t.locked ? 'locked' : 'unlocked'}`);
      if (sc) out.push({ id: `trophy:${r.id}:${t.label}`, kind: 'trophy', icon: t.icon, title: t.label, subtitle: `${r.name} · ${t.locked ? 'locked' : 'earned'}`, score: sc - 30, screen: 'detail', raidId: r.id });
    }
  }

  // recurring quests (to-do list)
  for (const qst of state.todo) {
    const sc = match(q, qst.text, `${qst.cadence} quest task recurring`);
    if (sc) out.push({ id: `quest:${qst.id}`, kind: 'quest', icon: qst.boss ? '👑' : '✅', title: qst.text, subtitle: `${qst.cadence === 'daily' ? 'Daily' : 'Weekly'} quest · +${qst.xp} XP`, score: sc - 25, screen: 'hq' });
  }

  // custom fields
  for (const f of state.customFields) {
    const sc = match(q, f, 'custom field');
    if (sc) out.push({ id: `field:${f}`, kind: 'field', icon: '🧩', title: f, subtitle: 'Custom field', score: sc - 40, screen: 'vault' });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
