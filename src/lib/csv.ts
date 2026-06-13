import type { AppState, LogEntry, Raid } from '../types';

// CSV import — the migration path off the spreadsheet every farmer already
// has. Headers are matched loosely (date/when, protocol/project/raid,
// what/action, cost/spent, time/minutes, chain/network, loot, why/notes);
// unknown raids are created automatically.

export interface CsvImportResult {
  next: AppState;
  entriesAdded: number;
  raidsCreated: string[];
  skipped: number; // rows missing a date/protocol/what we could understand
}

// quote-aware parser; sniffs , ; or tab from the header line
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const delim = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'day', 'when'],
  raid: ['protocol', 'project', 'raid', 'name', 'dapp', 'app'],
  what: ['what', 'action', 'activity', 'task', 'description', 'move', 'did'],
  why: ['why', 'note', 'notes', 'reason', 'narrative'],
  cost: ['cost', 'spent', 'cost usd', 'cost ($)', 'usd', '$', 'amount'],
  minutes: ['minutes', 'mins', 'min', 'time', 'time (min)', 'duration'],
  chain: ['chain', 'network'],
  loot: ['loot', 'looted', 'reward', 'claimed', 'earned'],
};

function mapHeaders(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((raw, i) => {
    const h = raw.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (idx[field] === undefined && aliases.includes(h)) idx[field] = i;
    }
  });
  return idx;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  // DD/MM/YYYY and DD.MM.YYYY — common in exported sheets, ambiguous to Date.parse
  const dm = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (dm) {
    const d = new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]), 12);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : new Date(ms);
}

const num = (s: string | undefined): number => {
  const n = parseFloat((s ?? '').replace(/[$,€\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function importCsvText(text: string, state: AppState): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV needs a header row plus at least one data row.');
  const idx = mapHeaders(rows[0]);
  if (idx.raid === undefined || idx.what === undefined) {
    throw new Error('Could not find "protocol" and "what" columns — download the template to see the expected headers.');
  }

  const mainId = state.identities.find((i) => i.main)?.id ?? state.identities[0]?.id ?? '';
  const raids = [...state.raids];
  const raidByName = new Map(raids.map((r) => [r.name.trim().toLowerCase(), r]));
  const raidsCreated: string[] = [];
  const newEntries: LogEntry[] = [];
  // per-raid money deltas — applied once at the end, mirroring + LOG semantics
  const spentDelta = new Map<string, number>();
  const lootDelta = new Map<string, number>();
  let skipped = 0;
  let n = 0;
  const uid = () => `${Date.now().toString(36)}_${(n++).toString(36)}`;

  for (const row of rows.slice(1)) {
    const cell = (f: string) => (idx[f] === undefined ? '' : (row[idx[f]] ?? '').trim());
    const raidName = cell('raid');
    const what = cell('what');
    const when = parseDate(cell('date')) ?? new Date();
    if (!raidName || !what) { skipped++; continue; }

    let raid = raidByName.get(raidName.toLowerCase());
    if (!raid) {
      raid = {
        id: `r_${uid()}`,
        name: raidName,
        status: 'active',
        sub: `${(cell('why') || 'IMPORTED').toUpperCase().slice(0, 18)} · ${(cell('chain') || 'EVM').toUpperCase()}`,
        narrative: (cell('why') || 'IMPORTED').toUpperCase().split(/\s+/)[0].slice(0, 12),
        chain: cell('chain') || 'Ethereum',
        identityIds: mainId ? [mainId] : [],
        risk: 'low',
        brief: { funding: '—', investors: '—', phase: '—', why: '' },
        credentials: { login: 'EVM wallet', address: '0x…' },
        money: { spent: 0, fees: 0, staked: 0, looted: 0, lootLabel: 'PENDING' },
        tasks: [],
        trophies: [],
        links: [],
        customFields: {},
      } satisfies Raid;
      raids.unshift(raid);
      raidByName.set(raidName.toLowerCase(), raid);
      raidsCreated.push(raidName);
    }

    const cost = num(cell('cost'));
    const loot = num(cell('loot'));
    newEntries.push({
      id: `e_${uid()}`,
      raidId: raid.id,
      date: when.toISOString(),
      what,
      why: cell('why'),
      identityId: mainId,
      cost,
      minutes: Math.round(num(cell('minutes'))),
      chain: cell('chain') || raid.chain,
      proofs: [],
      xp: 10,
      loot: loot > 0 ? { label: `+${fmtPlain(loot)}`, value: loot } : undefined,
    });
    if (cost > 0) spentDelta.set(raid.id, (spentDelta.get(raid.id) ?? 0) + cost);
    if (loot > 0) lootDelta.set(raid.id, (lootDelta.get(raid.id) ?? 0) + loot);
  }

  if (newEntries.length === 0) throw new Error(`No importable rows found (${skipped} skipped) — check the protocol/what columns.`);

  const next: AppState = {
    ...state,
    raids: raids.map((r) => {
      const spent = spentDelta.get(r.id) ?? 0;
      const loot = lootDelta.get(r.id) ?? 0;
      if (!spent && !loot) return r;
      return {
        ...r,
        money: {
          ...r.money,
          spent: r.money.spent + spent,
          looted: r.money.looted + loot,
          lootLabel: loot > 0 && r.money.looted + loot > 0 && r.money.lootLabel === 'PENDING' ? `+${fmtPlain(r.money.looted + loot)}` : r.money.lootLabel,
        },
      };
    }),
    entries: [...newEntries, ...state.entries].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
  };

  return { next, entriesAdded: newEntries.length, raidsCreated, skipped };
}

const fmtPlain = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;

export function buildCsvTemplate(): string {
  return [
    'date,protocol,what,why,cost,minutes,chain,loot',
    '2026-05-01,Monad,Bridged $200 to mainnet,Chain activity,3.20,15,Monad,0',
    '2026-05-02,Monad,Did 10 swaps on the native DEX,Volume for points,1.10,25,Monad,0',
    '2026-05-20,Resolv,Claimed airdrop,Airdrop claim,0.40,10,Ethereum,152',
  ].join('\n');
}
