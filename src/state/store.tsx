import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, RecurringTask } from '../types';
import { buildSeed } from '../data/seed';
import { buildAllDossiers } from '../lib/dossier';
import { dateKey } from '../lib/todo';

const STORAGE_KEY = 'airdrop-vault-v1';

interface LegacyQuest { id: string; text: string; xp: number; done: boolean; boss: boolean }

function migrate(parsed: AppState & { apiKey?: string; quests?: LegacyQuest[] }): AppState {
  // migrate name-only skill files to {name, content}
  parsed.skillFiles = (parsed.skillFiles ?? []).map((f: unknown) =>
    typeof f === 'string' ? { name: f, content: '' } : (f as { name: string; content: string }),
  );
  // migrate pre-multi-provider saves (single anthropic apiKey field)
  if (!parsed.ai) {
    parsed.ai = parsed.apiKey
      ? { provider: 'anthropic', apiKey: parsed.apiKey, model: '', baseUrl: '' }
      : { provider: 'local', apiKey: '', model: '', baseUrl: '' };
    delete parsed.apiKey;
  }
  // identities saved before wallet management get a real (empty) address list —
  // the old hardcoded "1 wallet" count was a lie, so start from zero truth
  parsed.identities = (parsed.identities ?? []).map((i) =>
    i.addresses ? i : { ...i, addresses: [] },
  );
  // saves from before the wallet scanner get an empty Etherscan key
  parsed.etherscanKey ??= '';
  // migrate fixed daily quests to the recurring to-do list
  if (!parsed.todo) {
    parsed.todo = (parsed.quests ?? []).map((q): RecurringTask => ({
      id: q.id,
      text: q.text.replace(/^BOSS:\s*/i, ''),
      xp: q.xp,
      cadence: 'daily',
      boss: q.boss || undefined,
      lastDone: q.done ? dateKey() : undefined,
    }));
  }
  delete parsed.quests;
  return rolloverQuests(parsed);
}

function loadLocal(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === 1) return migrate(parsed);
    }
  } catch {
    // corrupt storage — fall through to seed
  }
  return buildSeed();
}

// New day → clear the combo flag. Task done-ness needs no reset: it's
// derived from each task's lastDone date (see lib/todo.ts).
function rolloverQuests(s: AppState): AppState {
  const today = dateKey();
  if (s.questsDate === today) return s;
  return { ...s, questsDate: today, comboClaimed: false };
}

interface Store {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  resetDemo: () => void;
  connected: boolean; // file backend reachable — data lives on disk in vault-data/
  dataPath: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [fileSync, setFileSync] = useState<{ connected: boolean; root: string | null }>({ connected: false, root: null });
  const firstSave = useRef(true);

  // Boot: prefer state.json on disk; fall back to localStorage / seed when the
  // file API isn't there (e.g. static hosting of the built app).
  useEffect(() => {
    let alive = true;
    (async () => {
      let connected = false;
      let root: string | null = null;
      let fromDisk: AppState | null = null;
      try {
        const h = await fetch('/api/health');
        if (h.ok) {
          const hj = (await h.json()) as { ok?: boolean; root?: string };
          if (hj.ok) {
            connected = true;
            root = hj.root ?? null;
            const r = await fetch('/api/state');
            if (r.ok) {
              const parsed = (await r.json()) as AppState;
              if (parsed?.version === 1) fromDisk = migrate(parsed);
            }
          }
        }
      } catch {
        // no file backend — browser-only mode
      }
      if (!alive) return;
      setFileSync({ connected, root });
      setState(fromDisk ?? loadLocal());
    })();
    return () => { alive = false; };
  }, []);

  // Autosave: localStorage immediately (cheap cache), disk debounced — each
  // disk write also regenerates every dossier.md + MASTER-DOSSIER.md.
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full / private mode — app still works in-memory
    }
    if (!fileSync.connected) return;
    const delay = firstSave.current ? 0 : 500;
    firstSave.current = false;
    const t = setTimeout(() => {
      fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, dossiers: buildAllDossiers(state) }),
      }).catch(() => {
        // disk write failed — localStorage copy above still has everything
      });
    }, delay);
    return () => clearTimeout(t);
  }, [state, fileSync.connected]);

  const store = useMemo<Store | null>(
    () =>
      state && {
        state,
        update: (fn) => setState((s) => (s ? fn(s) : s)),
        resetDemo: () => setState(buildSeed()),
        connected: fileSync.connected,
        dataPath: fileSync.root,
      },
    [state, fileSync],
  );

  if (!store) {
    return <div className="vaultload">⏳ OPENING VAULT…</div>;
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
