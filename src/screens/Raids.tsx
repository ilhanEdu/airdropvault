import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { chainCount, fmtMoney, isWin } from '../lib/stats';
import { deadlineInfo, urgencyChip, useNow } from '../lib/deadlines';
import { ScreenTitle } from '../components/bits';
import { RaidLogo } from '../components/RaidLogo';
import type { Raid, RaidStatus } from '../types';

type StatusFilter = 'all' | 'active' | 'won' | 'testnet';

function statusStamp(r: Raid): { label: string; cls: string } {
  if (r.statusLabel) return { label: r.statusLabel, cls: r.timer ? 'hot' : 'cy' };
  switch (r.status) {
    case 'won': return { label: isWin(r) ? 'LOOT DROPPED!' : 'WON', cls: 'win' };
    case 'completed': return { label: 'COMPLETED', cls: 'win' };
    case 'testnet': return { label: 'TESTNET', cls: 'cy' };
    default: return { label: 'RAID ACTIVE', cls: '' };
  }
}

function cardClass(r: Raid, now: number): string {
  if (r.status === 'won' || r.status === 'completed') return ' win';
  if (r.status === 'testnet') return ' test';
  const d = deadlineInfo(r, now);
  if (d && (d.urgency === 'overdue' || d.urgency === 'critical')) return ' hot';
  if (r.timer) return ' hot';
  return '';
}

export default function Raids() {
  const { state, update } = useStore();
  const ui = useUi();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [chain, setChain] = useState('');
  const [narrative, setNarrative] = useState('');
  const [identity, setIdentity] = useState('');
  const [creating, setCreating] = useState(false);
  const now = useNow();
  const blankDraft = {
    name: '', narrative: 'PERPS', chain: '', why: '',
    funding: '', investors: '', identityId: '', refLink: '', wallet: '', tasks: '',
  };
  const [draft, setDraft] = useState(blankDraft);

  const chains = useMemo(() => [...new Set(state.raids.map((r) => r.chain))].sort(), [state.raids]);
  const narratives = useMemo(() => [...new Set(state.raids.map((r) => r.narrative))].sort(), [state.raids]);

  const counts = {
    all: state.raids.length,
    active: state.raids.filter((r) => r.status === 'active').length,
    won: state.raids.filter((r) => r.status === 'won' || r.status === 'completed').length,
    testnet: state.raids.filter((r) => r.status === 'testnet').length,
  };

  const filtered = state.raids.filter((r) => {
    if (status === 'active' && r.status !== 'active') return false;
    if (status === 'won' && r.status !== 'won' && r.status !== 'completed') return false;
    if (status === 'testnet' && r.status !== 'testnet') return false;
    if (chain && r.chain !== chain) return false;
    if (narrative && r.narrative !== narrative) return false;
    if (identity && !r.identityIds.includes(identity)) return false;
    return true;
  });

  function createRaid() {
    if (!draft.name.trim()) return;
    const tasks = draft.tasks
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `t_${Date.now().toString(36)}_${i}`, text, done: false }));
    const raid: Raid = {
      id: `r_${Date.now().toString(36)}`,
      name: draft.name.trim(),
      status: 'active' as RaidStatus,
      sub: `${draft.narrative} · ${(draft.chain || 'EVM').toUpperCase()}`,
      narrative: draft.narrative,
      chain: draft.chain || 'Ethereum',
      identityIds: [draft.identityId || (state.identities.find((i) => i.main)?.id ?? state.identities[0]?.id ?? '')],
      risk: 'low',
      brief: { funding: draft.funding.trim() || '—', investors: draft.investors.trim() || '—', phase: '—', why: draft.why },
      credentials: { login: 'EVM wallet', address: draft.wallet.trim() || '0x…' },
      money: { spent: 0, fees: 0, staked: 0, looted: 0, lootLabel: 'PENDING' },
      tasks,
      trophies: [],
      links: draft.refLink.trim() ? [{ label: '🔗 REF LINK', url: draft.refLink.trim() }] : [],
      customFields: {},
    };
    update((s) => ({ ...s, raids: [raid, ...s.raids] }));
    setCreating(false);
    setDraft(blankDraft);
    ui.openRaid(raid.id);
  }

  const statusChip = (key: StatusFilter, label: string) => (
    <span
      className={`chipq click${status === key ? ' yel' : ''}`}
      onClick={() => setStatus(key)}
    >{label} · {counts[key]}</span>
  );

  return (
    <section className="screen active">
      <ScreenTitle title="ACTIVE RAIDS" sub={`${state.raids.length} PROJECTS · ${chainCount(state)} CHAINS`}>
        <span style={{ marginLeft: 'auto' }}>
          <span className="btnq pink" onClick={() => setCreating((c) => !c)}>+ NEW RAID</span>
        </span>
      </ScreenTitle>

      <div className="chiprow" style={{ marginBottom: 20 }}>
        {statusChip('all', 'ALL')}
        {statusChip('active', 'ACTIVE')}
        {statusChip('won', 'WON')}
        {statusChip('testnet', 'TESTNET')}
        <select className="fieldq" style={{ width: 'auto', padding: '3px 30px 3px 11px', fontSize: 11, borderRadius: 99, borderWidth: 2.5 }} value={chain} onChange={(e) => setChain(e.target.value)}>
          <option value="">⛓ CHAIN</option>
          {chains.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="fieldq" style={{ width: 'auto', padding: '3px 30px 3px 11px', fontSize: 11, borderRadius: 99, borderWidth: 2.5 }} value={narrative} onChange={(e) => setNarrative(e.target.value)}>
          <option value="">🏷 NARRATIVE</option>
          {narratives.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="fieldq" style={{ width: 'auto', padding: '3px 30px 3px 11px', fontSize: 11, borderRadius: 99, borderWidth: 2.5 }} value={identity} onChange={(e) => setIdentity(e.target.value)}>
          <option value="">🪪 IDENTITY</option>
          {state.identities.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      {creating && (
        <div className="card white" style={{ marginBottom: 22 }}>
          <h3>🆕 NEW RAID</h3>
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
            <div><div className="lblq">PROJECT NAME</div><input className="fieldq" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Monad" /></div>
            <div><div className="lblq">NARRATIVE</div><input className="fieldq" value={draft.narrative} onChange={(e) => setDraft({ ...draft, narrative: e.target.value.toUpperCase() })} /></div>
            <div><div className="lblq">CHAIN</div><input className="fieldq" value={draft.chain} onChange={(e) => setDraft({ ...draft, chain: e.target.value })} placeholder="Ethereum" /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="lblq">WHY I'M RAIDING IT</div>
            <input className="fieldq" value={draft.why} onChange={(e) => setDraft({ ...draft, why: e.target.value })} placeholder="The thesis in one line…" />
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 12 }}>
            <div><div className="lblq">FUNDING</div><input className="fieldq" value={draft.funding} onChange={(e) => setDraft({ ...draft, funding: e.target.value })} placeholder="e.g. $12M Series A" /></div>
            <div><div className="lblq">INVESTORS</div><input className="fieldq" value={draft.investors} onChange={(e) => setDraft({ ...draft, investors: e.target.value })} placeholder="e.g. Paradigm, Binance Labs" /></div>
            <div>
              <div className="lblq">FARMING WITH (IDENTITY)</div>
              <select className="fieldq" value={draft.identityId || (state.identities.find((i) => i.main)?.id ?? '')} onChange={(e) => setDraft({ ...draft, identityId: e.target.value })}>
                {state.identities.map((i) => <option key={i.id} value={i.id}>{i.name}{i.main ? ' · MAIN' : ''}</option>)}
              </select>
            </div>
            <div><div className="lblq">REF LINK</div><input className="fieldq" value={draft.refLink} onChange={(e) => setDraft({ ...draft, refLink: e.target.value })} placeholder="https://app.xyz/ref/you" /></div>
            <div><div className="lblq">WALLET USED</div><input className="fieldq" value={draft.wallet} onChange={(e) => setDraft({ ...draft, wallet: e.target.value })} placeholder="0x…" /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="lblq">HERO TASKS — ONE PER LINE (THE BIG CHECKLIST FOR THIS RAID)</div>
            <textarea className="fieldq" rows={3} value={draft.tasks} onChange={(e) => setDraft({ ...draft, tasks: e.target.value })} placeholder={'Bridge $100 to mainnet\nDo 10 swaps\nMint the OG NFT'} />
          </div>
          <div className="chiprow" style={{ marginTop: 14 }}>
            <span className="btnq pink" onClick={createRaid}>START RAID ⚔️</span>
            <span className="btnq sm" onClick={() => setCreating(false)}>CANCEL</span>
          </div>
        </div>
      )}

      <div className="grid g12">
        {filtered.map((r) => {
          const stamp = statusStamp(r);
          const dl = r.status === 'active' || r.status === 'testnet' ? deadlineInfo(r, now) : null;
          return (
            <div
              key={r.id} className={`raid s4${cardClass(r, now)}`}
              role="button" tabIndex={0} aria-label={`Open ${r.name} raid`}
              onClick={() => ui.openRaid(r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.openRaid(r.id); } }}
            >
              <div className={`stamp ${stamp.cls}`}>{stamp.label}</div>
              <div className="row" style={{ gap: 11 }}>
                <RaidLogo raid={r} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{r.name}</div>
                  <div className="sub">{r.sub}</div>
                </div>
              </div>
              {dl && (
                <div className="chiprow" style={{ marginTop: 8 }}>
                  <span className={`chipq ${urgencyChip[dl.urgency]}`} style={{ fontSize: 9.5 }} title={dl.at.toLocaleString()}>
                    {dl.urgency === 'overdue' ? '🚨' : '⏰'} {dl.label} · {dl.countdown}
                  </span>
                </div>
              )}
              <div className="money">
                <span style={{ color: 'var(--rose)' }}>{fmtMoney(-r.money.spent)}</span>
                <span className={r.money.looted > 0 ? 'v good' : ''} style={{ fontSize: 13 }}>
                  {r.money.looted > 0 ? r.money.lootLabel : r.money.lootLabel.toLowerCase()}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card s12" style={{ textAlign: 'center', fontWeight: 800, color: 'var(--mut)' }}>
            No raids match these filters.
          </div>
        )}
      </div>
    </section>
  );
}
