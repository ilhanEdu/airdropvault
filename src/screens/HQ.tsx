import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { fmtMoney, heatCells, narrativeScores, streak, warChest } from '../lib/stats';
import { levelProgress } from '../lib/levels';
import { dateKey, todaysTasks } from '../lib/todo';
import { upcomingDeadlines, urgencyChip, useNow } from '../lib/deadlines';
import { Cells, ScreenTitle, whenLabel } from '../components/bits';

const QUEST_ROW = 62; // px per row (.quest height + margin) — window shows 4, rest scroll

export default function HQ() {
  const { state, update } = useStore();
  const ui = useUi();
  const wc = warChest(state);
  const lp = levelProgress(state.xp);
  const st = streak(state.entries);
  const cells = heatCells(state.entries, 42);
  const narr = narrativeScores(state).slice(0, 5);
  const recent = state.entries.slice(0, 3);
  const now = useNow();
  const deadlines = upcomingDeadlines(state, now);
  const hotCount = deadlines.filter((d) => d.urgency === 'overdue' || d.urgency === 'critical').length;

  const today = dateKey();
  const { due, doneToday, total } = todaysTasks(state.todo, today);
  // open quests first; completing one sinks it so the next rises into view
  const todays = [...due, ...doneToday];

  function toggleTask(tid: string) {
    const t = state.todo.find((x) => x.id === tid);
    if (!t) return;
    const wasDoneToday = t.lastDone === today;
    let gained = wasDoneToday ? -t.xp : t.xp;
    let combo = state.comboClaimed;
    if (!wasDoneToday && !combo && due.every((x) => x.id === tid)) {
      gained += 50; // that was the last open quest — clear-all combo
      combo = true;
    }
    if (!wasDoneToday) ui.juice(gained);
    update((s) => ({
      ...s,
      comboClaimed: combo,
      xp: Math.max(0, s.xp + gained),
      todo: s.todo.map((x) => (x.id === tid ? { ...x, lastDone: wasDoneToday ? undefined : today } : x)),
    }));
  }

  return (
    <section className="screen active">
      <ScreenTitle title="PLAYER HQ" sub="MONEY · MOMENTUM · TODAY'S QUESTS" />
      <div className="grid g12">

        {deadlines.length > 0 && (
          <div className={`card s12${hotCount > 0 ? ' pinkish' : ''}`}>
            <h3>
              ⏰ NEXT DEADLINES
              {hotCount > 0
                ? <span className="chipq rose end">🚨 {hotCount} INSIDE 24H</span>
                : <span className="chipq end">SNAPSHOTS · EPOCHS · CLAIMS</span>}
            </h3>
            <div className="chiprow">
              {deadlines.slice(0, 8).map((d) => (
                <span
                  key={d.raid.id}
                  className={`chipq click ${urgencyChip[d.urgency]}`}
                  title={`${d.raid.name} — ${d.label} · ${d.at.toLocaleString()}`}
                  onClick={() => ui.openRaid(d.raid.id)}
                >
                  {d.urgency === 'overdue' ? '🚨' : '⏰'} {d.raid.name.toUpperCase()} · {d.label} · {d.countdown}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="card s7">
          <h3>💰 WAR CHEST <span className="chipq end">REALIZED + UNREALIZED</span></h3>
          <div className="coins">
            <div className="coin"><div className="l">SPENT</div><div className="v bad">{fmtMoney(-wc.spent)}</div></div>
            <div className="coin"><div className="l">LOOTED</div><div className="v good">{fmtMoney(wc.looted)}</div></div>
            <div className="coin"><div className="l">STAKED</div><div className="v">{fmtMoney(wc.staked)}</div></div>
            <div className="coin"><div className="l">NET</div><div className={`v ${wc.net < 0 ? 'bad' : 'good'}`}>{fmtMoney(wc.net)}</div></div>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="row between" style={{ fontWeight: 900, fontSize: 10.5, letterSpacing: '.1em' }}>
              <span>XP — {state.xp.toLocaleString()} / {lp.nextAt.toLocaleString()}</span>
              <span>NEXT: {lp.nextTitle}</span>
            </div>
            <div className="xpbar" style={{ marginTop: 6 }}>
              <i style={{ width: `${lp.pct}%` }} />
              <span>{lp.toNext} XP TO LV {lp.level + 1}</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 16, gap: 16 }}>
            <div className="flamecount">×{st}</div>
            <Cells counts={cells} columns={21} />
          </div>
        </div>

        <div className="card white s5">
          <h3>
            ⚔️ TODAY'S QUESTS
            <span className={`chipq end ${doneToday.length === total && total > 0 ? 'grn' : 'yel'}`}>
              {doneToday.length} / {total} DONE
            </span>
            {due.length > 0 && <span className="chipq pink">{due.length} TO GO</span>}
          </h3>
          {total === 0 && (
            <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--mut)', marginBottom: 8 }}>
              Nothing due today. Quests come from your grind — log a move in <b>+ LOG</b> and mark it DAILY or WEEKLY to put it on this list.
            </div>
          )}
          <div style={{ maxHeight: QUEST_ROW * 4 - 8, overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
            {todays.map((t) => {
              const done = t.lastDone === today;
              const raidName = t.raidId ? state.raids.find((r) => r.id === t.raidId)?.name : undefined;
              return (
                <div key={t.id} className={`quest${done ? ' on' : ''}${t.boss ? ' boss' : ''}`}>
                  <span
                    className="cb" role="checkbox" aria-checked={done} tabIndex={0}
                    aria-label={`${t.text} — +${t.xp} XP`}
                    onClick={() => toggleTask(t.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(t.id); } }}
                  >{done ? '✓' : ''}</span>
                  <span className="t">
                    {t.text}
                    {raidName && <span style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)', marginLeft: 6 }}>· {raidName.toUpperCase()}</span>}
                  </span>
                  <span className={`chipq ${t.cadence === 'daily' ? 'cy' : 'yel'}`} style={{ fontSize: 9 }}>{t.cadence === 'daily' ? '☀ DAILY' : '↻ WEEKLY'}</span>
                  <span className="xp">+{t.xp} XP</span>
                </div>
              );
            })}
          </div>
          {todays.length > 4 && (
            <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)', textAlign: 'center', marginTop: 4 }}>↓ SCROLL — {todays.length} QUESTS TODAY</div>
          )}
          <div className="row between" style={{ marginTop: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--mut)' }}>
              {state.comboClaimed ? 'COMBO CLEARED TODAY 🏆' : 'CLEAR ALL = COMBO BONUS'}
            </span>
            <span className="chipq pink">+50 XP 🎉</span>
          </div>
        </div>

        <div className="card s7">
          <h3>📜 RECENT LOOT &amp; LOGS</h3>
          <div className="qlog">
            {recent.map((e) => {
              const raidName = state.raids.find((r) => r.id === e.raidId)?.name ?? '?';
              return (
                <div key={e.id} className="entry" style={e.loot ? { background: 'var(--mint)' } : undefined}>
                  <div className="when">{whenLabel(e.date)} · {raidName.toUpperCase()}</div>
                  <div className="what">
                    {e.what}{' '}
                    {e.cost > 0 && <span className="chipq rose">{fmtMoney(-e.cost)}</span>}{' '}
                    {e.loot ? <span className="chipq grn">{e.loot.label}</span> : <span className="chipq pink">+{e.xp} XP</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card yel s5 stretch">
          <h3>🎯 WHAT'S PAYING OFF</h3>
          <div className="chartq" style={{ marginTop: 4, minHeight: 140 }}>
            {narr.map((n, i) => (
              <div key={n.narrative} className="col">
                <div className={`bk${i % 2 ? ' alt' : ''}`} style={{ height: `${Math.max(8, Math.round(n.score * 90))}%` }} />
                <span>{n.narrative}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontWeight: 800, fontSize: 12 }}>
            Your crit hits land in <span className="chipq pink">{narr[0]?.narrative ?? '—'}</span> — double down there.
          </div>
        </div>
      </div>
    </section>
  );
}
