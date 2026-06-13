import { useStore } from './state/store';
import { useUi, type Screen } from './state/ui';
import { fmtMoney, streak, warChest } from './lib/stats';
import { levelProgress } from './lib/levels';
import { Search } from './components/Search';
import HQ from './screens/HQ';
import Raids from './screens/Raids';
import RaidDetail from './screens/RaidDetail';
import Log from './screens/Log';
import Brain from './screens/Brain';
import Stats from './screens/Stats';
import Vault from './screens/Vault';

const TABS: { key: Screen; label: string }[] = [
  { key: 'hq', label: 'HQ' },
  { key: 'raids', label: 'RAIDS' },
  { key: 'log', label: '+ LOG' },
  { key: 'brain', label: 'AI BRAIN' },
  { key: 'stats', label: 'STATS' },
  { key: 'vault', label: 'VAULT' },
];

export default function App() {
  const { state } = useStore();
  const ui = useUi();
  const wc = warChest(state);
  const lp = levelProgress(state.xp);
  const st = streak(state.entries);

  return (
    <>
      <header className="hud">
        <div className="logo" onClick={() => ui.go('hq')}>
          <span className="mk"><span className="dollar">$</span></span>
          <div className="nm">AIRDROP VAULT<small>SEASON {new Date().getFullYear()} · QUEST MODE</small></div>
        </div>
        <nav className="tabs" aria-label="Main navigation">
          {TABS.map((t) => {
            const active = ui.screen === t.key || (t.key === 'raids' && ui.screen === 'detail');
            return (
              <span
                key={t.key}
                role="button"
                tabIndex={0}
                aria-current={active ? 'page' : undefined}
                className={`tab${active ? ' active' : ''}`}
                onClick={() => ui.go(t.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.go(t.key); } }}
              >{t.label}</span>
            );
          })}
        </nav>
        <Search />
        <div className="hudright">
          <div className="hudstat">
            <div className="v" style={{ color: wc.net < 0 ? 'var(--rose)' : 'var(--green)' }}>{fmtMoney(wc.net)}</div>
            <div className="l">NET</div>
          </div>
          <div className="hudstat flame"><div className="v">🔥 {st}</div><div className="l">STREAK</div></div>
          <div className="hudstat lv"><div className="v">LV {lp.level}</div><div className="l">{lp.title}</div></div>
        </div>
      </header>

      <main>
        {ui.screen === 'hq' && <HQ />}
        {ui.screen === 'raids' && <Raids />}
        {ui.screen === 'detail' && <RaidDetail />}
        {ui.screen === 'log' && <Log />}
        {ui.screen === 'brain' && <Brain />}
        {ui.screen === 'stats' && <Stats />}
        {ui.screen === 'vault' && <Vault />}
      </main>
    </>
  );
}
