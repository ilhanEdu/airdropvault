import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type Screen = 'hq' | 'raids' | 'detail' | 'log' | 'brain' | 'stats' | 'vault';

interface Ui {
  screen: Screen;
  selectedRaidId: string | null;
  brainEntryId: string | null;
  focusEntryId: string | null; // log row to scroll-to/flash on the detail screen
  go: (s: Screen) => void;
  openRaid: (raidId: string, focusEntryId?: string) => void;
  openLog: (raidId?: string) => void;
  openBrain: (entryId?: string) => void;
  juice: (xp: number) => void; // XP pop + confetti
}

const Ctx = createContext<Ui | null>(null);

const COLORS = ['#ff4fa3', '#ffd23e', '#48d6ff', '#15a35c', '#e8336e'];

export function UiProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('hq');
  const [selectedRaidId, setSelectedRaidId] = useState<string | null>(null);
  const [brainEntryId, setBrainEntryId] = useState<string | null>(null);
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const go = useCallback((s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0 });
  }, []);

  const juice = useCallback((xp: number) => {
    const pop = popRef.current;
    if (pop) {
      pop.textContent = `+${xp} XP!`;
      pop.classList.remove('go');
      void pop.offsetWidth;
      pop.classList.add('go');
    }
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('div');
      c.className = 'conf';
      c.style.left = `${20 + Math.random() * 60}vw`;
      c.style.top = `${28 + Math.random() * 10}vh`;
      c.style.background = COLORS[i % COLORS.length];
      c.style.animationDelay = `${Math.random() * 0.2}s`;
      c.style.borderRadius = Math.random() > 0.5 ? '50%' : '3px';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1600);
    }
  }, []);

  const ui = useMemo<Ui>(
    () => ({
      screen,
      selectedRaidId,
      brainEntryId,
      focusEntryId,
      go,
      openRaid: (raidId, entryId) => { setSelectedRaidId(raidId); setFocusEntryId(entryId ?? null); go('detail'); },
      openLog: (raidId) => { if (raidId) setSelectedRaidId(raidId); go('log'); },
      openBrain: (entryId) => { if (entryId) setBrainEntryId(entryId); go('brain'); },
      juice,
    }),
    [screen, selectedRaidId, brainEntryId, focusEntryId, go, juice],
  );

  return (
    <Ctx.Provider value={ui}>
      {children}
      <div className="xppop" ref={popRef}>+25 XP!</div>
    </Ctx.Provider>
  );
}

export function useUi(): Ui {
  const u = useContext(Ctx);
  if (!u) throw new Error('useUi outside provider');
  return u;
}
