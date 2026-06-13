import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { Cells, ScreenTitle } from '../components/bits';
import { chainCount, fmtMoney, heatCells, minutesByRaid, narrativeScores, roi, totalMinutes, warChest, winRate } from '../lib/stats';

export default function Stats() {
  const { state } = useStore();
  const ui = useUi();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);
  const wc = warChest(state);
  const wr = winRate(state);
  const minutes = totalMinutes(state.entries);
  const hours = Math.round(minutes / 60);
  const perHour = hours > 0 ? (wc.looted / hours).toFixed(2) : '0';
  const narr = narrativeScores(state);
  const byRaid = minutesByRaid(state.entries);

  // Cost vs loot — top 10 by money involved in the card; full list in the overlay
  const allMoneyRaids = [...state.raids]
    .sort((a, b) => (b.money.spent + b.money.looted) - (a.money.spent + a.money.looted));
  const moneyRaids = allMoneyRaids.slice(0, 10);
  const maxMoney = Math.max(...moneyRaids.map((r) => Math.max(r.money.spent, r.money.looted)), 1);
  const maxMoneyAll = Math.max(...allMoneyRaids.map((r) => Math.max(r.money.spent, r.money.looted)), 1);

  // Scatter — hours vs looted, dot size = staked
  const dots = state.raids
    .map((r) => ({ raid: r, hours: (byRaid.get(r.id) ?? 0) / 60 }))
    .filter((d) => d.hours > 0 || d.raid.money.looted > 0);
  const maxH = Math.max(...dots.map((d) => d.hours), 1);
  const maxL = Math.max(...dots.map((d) => d.raid.money.looted), 1);
  const maxS = Math.max(...dots.map((d) => d.raid.money.staked), 1);

  // AI coach: days active in last 14 + worst time sinks with zero loot
  const last14 = heatCells(state.entries, 14).filter((c) => c > 0).length;
  const sinks = state.raids
    .filter((r) => r.money.looted === 0 && (byRaid.get(r.id) ?? 0) >= 60 && r.status === 'active')
    .sort((a, b) => (byRaid.get(b.id) ?? 0) - (byRaid.get(a.id) ?? 0))
    .slice(0, 2);
  const sinkHours = Math.round(sinks.reduce((a, r) => a + (byRaid.get(r.id) ?? 0), 0) / 60);
  const bestNarr = narr[0]?.narrative ?? 'PERPS';

  return (
    <section className="screen active">
      <ScreenTitle title="THE HONEST MIRROR" sub="AM I ACTUALLY WINNING — OR JUST BUSY?" />
      <div className="grid g12">
        <div className="card s3">
          <div className="lblq">ROI TO DATE</div>
          <div className="disp" style={{ fontSize: 42, color: roi(state) < 0 ? 'var(--rose)' : 'var(--green)' }}>{roi(state)}%</div>
          <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)' }}>{fmtMoney(wc.spent)} SPENT · {fmtMoney(wc.looted)} BACK</div>
        </div>
        <div className="card white s3">
          <div className="lblq">WIN RATE</div>
          <div className="disp" style={{ fontSize: 42 }}>{wr.pct}%</div>
          <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)' }}>{wr.wins} CONFIRMED / {wr.total} RAIDS</div>
        </div>
        <div className="card s3">
          <div className="lblq">STAKED</div>
          <div className="disp" style={{ fontSize: 42 }}>{fmtMoney(wc.staked)}</div>
          <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)' }}>ACROSS {chainCount(state)} CHAINS</div>
        </div>
        <div className="card white s3">
          <div className="lblq">HOURS PLAYED</div>
          <div className="disp" style={{ fontSize: 42, color: 'var(--green)' }}>{hours}h</div>
          <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)' }}>≈ ${perHour} / HR REALIZED</div>
        </div>

        <div className="card s6 stretch">
          <h3>
            💸 COST VS LOOT — TOP {moneyRaids.length}
            <span className="end chiprow">
              <span className="chipq pink">SPENT</span>
              <span className="chipq cy">LOOTED</span>
              {allMoneyRaids.length > moneyRaids.length || allMoneyRaids.length > 7
                ? <span className="btnq sm" onClick={() => setExpanded(true)}>⤢ ALL {allMoneyRaids.length}</span>
                : <span className="btnq sm" onClick={() => setExpanded(true)}>⤢ EXPAND</span>}
            </span>
          </h3>
          <div className="chartq" style={{ minHeight: 160 }}>
            {moneyRaids.map((r) => (
              <div key={r.id} className="col" style={{ cursor: 'pointer' }} onClick={() => ui.openRaid(r.id)}>
                <div className="row" style={{ gap: 4, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
                  <div className="bk" style={{ height: `${Math.max(4, (r.money.spent / maxMoney) * 100)}%`, maxWidth: 22 }} title={`spent ${fmtMoney(r.money.spent)}`} />
                  <div className="bk alt" style={{ height: `${Math.max(4, (r.money.looted / maxMoney) * 100)}%`, maxWidth: 22 }} title={`looted ${fmtMoney(r.money.looted)}`} />
                </div>
                <span>{r.name.slice(0, 6).toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card white s6 stretch">
          <h3>⏱ TIME VS REWARD <span className="chipq end">WORTH MY HOURS?</span></h3>
          <div className="scatter" style={{ minHeight: 160, marginTop: 8 }}>
            {dots.map((d) => {
              const size = 10 + (d.raid.money.staked / maxS) * 18;
              return (
                <span
                  key={d.raid.id}
                  className={`dot${d.raid.money.looted > 0 ? ' win' : ''}`}
                  title={`${d.raid.name}: ${d.hours.toFixed(1)}h · looted ${fmtMoney(d.raid.money.looted)} · staked ${fmtMoney(d.raid.money.staked)}`}
                  style={{
                    left: `${6 + (d.hours / maxH) * 86}%`,
                    bottom: `${8 + (d.raid.money.looted / maxL) * 74}%`,
                    width: size, height: size,
                  }}
                />
              );
            })}
            <span className="axis" style={{ bottom: 4, right: 8 }}>X: HOURS</span>
            <span className="axis" style={{ top: 4, left: 8 }}>Y: $ LOOTED · SIZE: STAKED</span>
          </div>
        </div>

        <div className="card s5">
          <h3>🏷 NARRATIVE SCOREBOARD</h3>
          {narr.slice(0, 5).map((n, i) => (
            <div key={n.narrative} className={`hbar${i % 2 ? ' alt' : ''}`}>
              <span className="nm">{n.narrative}</span>
              <div className="tr"><i style={{ width: `${Math.max(6, Math.round(n.score * 100))}%` }} /></div>
            </div>
          ))}
        </div>

        <div className="card pinkish s7">
          <div className="stamp cy">✦ AI COACH</div>
          <h3>⚡ MOMENTUM CHECK</h3>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.55 }}>
            You logged work <b>{last14} of the last 14 days</b> — {last14 >= 10 ? 'strong run.' : 'room to tighten up.'}{' '}
            {sinks.length > 0 ? (
              <>But {sinks[0].narrative.toLowerCase()} raids ate <b>{sinkHours}h for $0 loot</b>. Park <b>{sinks.map((s) => s.name).join(' & ')}</b>, push that time into {bestNarr} where your crits land.</>
            ) : (
              <>No dead-weight raids right now — keep compounding {bestNarr}.</>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <Cells counts={heatCells(state.entries, 56)} columns={28} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="overlay" onClick={() => setExpanded(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Lilita One'", fontSize: 22, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              💸 COST VS LOOT — ALL {allMoneyRaids.length} RAIDS
              <span className="chiprow"><span className="chipq pink">SPENT</span><span className="chipq cy">LOOTED</span></span>
              <span style={{ marginLeft: 'auto' }} className="btnq sm" onClick={() => setExpanded(false)}>✕ CLOSE</span>
            </h3>
            <div className="lblq">SCROLL → · CLICK A RAID TO OPEN IT</div>
            <div className="chartwrap">
              <div className="chartq">
                {allMoneyRaids.map((r) => (
                  <div key={r.id} className="col" onClick={() => { setExpanded(false); ui.openRaid(r.id); }}>
                    <span className="val">
                      {r.money.spent > 0 ? fmtMoney(-r.money.spent) : ''}{r.money.spent > 0 && r.money.looted > 0 ? ' · ' : ''}{r.money.looted > 0 ? fmtMoney(r.money.looted, true) : ''}
                    </span>
                    <div className="row" style={{ gap: 5, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
                      <div className="bk" style={{ height: `${Math.max(3, (r.money.spent / maxMoneyAll) * 100)}%`, width: 24 }} />
                      <div className="bk alt" style={{ height: `${Math.max(3, (r.money.looted / maxMoneyAll) * 100)}%`, width: 24 }} />
                    </div>
                    <span>{r.name.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
