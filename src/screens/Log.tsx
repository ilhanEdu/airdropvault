import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { streak } from '../lib/stats';
import { slugify } from '../lib/dossier';
import { dateKey } from '../lib/todo';
import { isLink, linkLabel, proofLabel, ScreenTitle } from '../components/bits';
import type { LogEntry, MediaItem, Repeat } from '../types';

interface QuickAction {
  label: string;
  what: string;
  why: string;
  xp: number;
  stake?: boolean; // cost counts as staked capital, not burnt
}

const QUICK: QuickAction[] = [
  { label: '+ DAILY CHECK-IN', what: 'Daily check-in', why: 'Streak points', xp: 10 },
  { label: '+ DEPOSIT', what: 'Deposited $— to ', why: 'Volume for points', xp: 25 },
  { label: '+ BRIDGE', what: 'Bridged $— to ', why: 'Chain activity', xp: 15 },
  { label: '+ MINT NFT', what: 'Minted ', why: 'Eligibility mint', xp: 15 },
  { label: '+ STAKE', what: 'Staked $— in ', why: 'Locked for points', xp: 25, stake: true },
  { label: '+ TESTNET TASK', what: 'Completed testnet task: ', why: 'Testnet allocation', xp: 15 },
  { label: '+ POSTED ON X', what: 'Posted on X about ', why: 'Social weighting', xp: 20 },
  { label: '+ WROTE THREAD', what: 'Wrote a thread about ', why: 'Content contribution', xp: 25 },
  { label: '+ WROTE ARTICLE', what: 'Wrote an article about ', why: 'Content contribution', xp: 30 },
  { label: '+ MADE VIDEO', what: 'Made a video about ', why: 'Content contribution', xp: 35 },
  { label: '+ BUILT A TOOL', what: 'Built a tool for ', why: 'Builder contribution', xp: 40 },
  { label: '+ CUSTOM…', what: '', why: '', xp: 25 },
];

function parseMinutes(s: string): number {
  const h = /(\d+)\s*h/i.exec(s);
  const m = /(\d+)\s*m/i.exec(s);
  if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export default function Log() {
  const { state, update, connected } = useStore();
  const ui = useUi();
  const defaultRaid = ui.selectedRaidId ?? state.raids.find((r) => r.status === 'active')?.id ?? state.raids[0]?.id ?? '';

  const [raidId, setRaidId] = useState(defaultRaid);
  const [action, setAction] = useState<QuickAction | null>(null);
  const [what, setWhat] = useState('');
  const [why, setWhy] = useState('');
  const [identityId, setIdentityId] = useState(state.identities.find((i) => i.main)?.id ?? '');
  const [entryDate, setEntryDate] = useState(dateKey()); // YYYY-MM-DD, defaults to today
  const [cost, setCost] = useState('0');
  const [time, setTime] = useState('15m');
  const [chainOverride, setChainOverride] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [proofs, setProofs] = useState<string[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [proofInput, setProofInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);

  const raid = state.raids.find((r) => r.id === raidId);
  const chain = chainOverride || raid?.chain || 'Ethereum';
  // sybil guard: logging with a persona that isn't assigned to this raid is
  // either a mistag or two identities touching the same farm
  const identityMismatch =
    raid && raid.identityIds.length > 0 && identityId && !raid.identityIds.includes(identityId)
      ? state.identities.find((i) => i.id === identityId)?.name ?? 'THIS IDENTITY'
      : null;
  const currentStreak = streak(state.entries);
  const loggedToday = state.entries.some((e) => new Date(e.date).toDateString() === new Date().toDateString());
  const xpPreview = (action?.xp ?? 25) + (proofs.length > 0 ? 5 : 0);
  const lockedTrophy = raid?.trophies.find((t) => t.locked);

  const smartPrefill = useMemo(() => {
    const lower = what.toLowerCase();
    const kind =
      lower.includes('deposit') ? 'deposit' :
      lower.includes('stake') ? 'stake' :
      lower.includes('bridge') ? 'bridge' :
      lower.includes('mint') ? 'mint' :
      lower.includes('check-in') ? 'check-in' : null;
    if (!kind || !raid) return null;
    return (
      <>Looks like a <b>{kind}</b> — pre-filled cost as money-out, tagged narrative{' '}
      <span className="chipq pink">{raid.narrative}</span>, set chain to {raid.chain} from your last {raid.name} entry. Edit anything.</>
    );
  }, [what, raid]);

  function pickAction(q: QuickAction) {
    setAction(q);
    setWhat(q.what === '' ? what : q.what + (q.what.endsWith(' ') ? raid?.name ?? '' : ''));
    if (q.why) setWhy(q.why);
    if (q.label.includes('CHECK-IN')) setRepeat('daily'); // check-ins are a daily grind by nature
  }

  // Dropped/picked screenshots get written to vault-data/raids/<slug>/media/
  // on your Mac; when the file backend is off we keep the filename as a label.
  async function addFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      let stored: MediaItem | null = null;
      if (connected && raid) {
        try {
          const dataUrl = await readAsDataUrl(f);
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raidSlug: slugify(raid.name), name: f.name, dataUrl }),
          });
          if (res.ok) {
            const j = (await res.json()) as { name: string; url: string };
            stored = { name: j.name, url: j.url };
          }
        } catch {
          // upload failed — fall back to label-only proof below
        }
      }
      if (stored) {
        setMedia((m) => [...m, stored]);
        setProofs((p) => [...p, stored.name]);
      } else {
        setProofs((p) => [...p, f.name]);
      }
    }
    setUploading(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void addFiles([...e.dataTransfer.files]);
  }

  // store the full hash/URL — chips and proof tiles truncate for display only,
  // so links stay openable later
  function addProofText() {
    const v = proofInput.trim();
    if (!v) return;
    setProofs((p) => [...p, v]);
    setProofInput('');
  }

  function removeProof(i: number) {
    const label = proofs[i];
    setProofs(proofs.filter((_, j) => j !== i));
    setMedia((m) => {
      const k = m.findIndex((x) => x.name === label);
      return k === -1 ? m : m.filter((_, j) => j !== k);
    });
  }

  function save() {
    if (!raid || !what.trim()) return;
    const costN = Math.max(0, parseFloat(cost) || 0);
    const text = what.trim();
    // backdated entries land at noon local time so they sort inside the right day
    const when = entryDate === dateKey() ? new Date() : new Date(`${entryDate}T12:00:00`);
    const entry: LogEntry = {
      id: `e_${Date.now().toString(36)}`,
      raidId: raid.id,
      date: (Number.isNaN(when.getTime()) ? new Date() : when).toISOString(),
      what: text,
      why: why.trim(),
      identityId,
      cost: action?.stake ? 0 : costN,
      minutes: parseMinutes(time),
      chain,
      proofs,
      media: media.length ? media : undefined,
      repeat,
      xp: xpPreview,
    };
    const cadence = repeat === 'once' ? null : repeat;
    update((s) => {
      // daily/weekly moves join the HQ to-do list; logging it counts as done
      // today, so it resurfaces tomorrow (daily) or in a week (weekly)
      let todo = s.todo;
      if (cadence) {
        const existing = s.todo.find((t) => t.raidId === raid.id && t.text.toLowerCase() === text.toLowerCase());
        todo = existing
          ? s.todo.map((t) => (t.id === existing.id ? { ...t, cadence, lastDone: dateKey() } : t))
          : [...s.todo, { id: `td_${Date.now().toString(36)}`, raidId: raid.id, text, xp: action?.xp ?? 15, cadence, lastDone: dateKey() }];
      }
      return {
        ...s,
        todo,
        xp: s.xp + xpPreview,
        // keep newest-first even when the entry is backdated
        entries: [entry, ...s.entries].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
        raids: s.raids.map((r) =>
          r.id === raid.id
            ? {
                ...r,
                money: action?.stake
                  ? { ...r.money, staked: r.money.staked + costN }
                  : { ...r.money, spent: r.money.spent + costN },
              }
            : r,
        ),
      };
    });
    ui.juice(xpPreview);
    setSaved(true);
    setWhat(''); setWhy(''); setCost('0'); setProofs([]); setMedia([]); setAction(null); setRepeat('once'); setEntryDate(dateKey());
    setTimeout(() => setSaved(false), 2500);
  }


  return (
    <section className="screen active">
      <ScreenTitle title="LOG YOUR MOVE" sub="15 SECONDS IN & OUT · +XP EVERY TIME" />
      <div className="grid g12">
        <div className="s8">
          <div className="card">
            <h3>
              WHAT DID YOU JUST DO?
              <span className="end">
                <select className="fieldq" style={{ width: 'auto', padding: '3px 30px 3px 11px', fontSize: 11, borderRadius: 99, borderWidth: 2.5, background: 'var(--pink)', color: '#fff', backgroundImage: 'none' }} value={raidId} onChange={(e) => setRaidId(e.target.value)}>
                  {state.raids.map((r) => <option key={r.id} value={r.id}>RAID: {r.name.toUpperCase()}</option>)}
                </select>
              </span>
            </h3>
            <div className="lblq" style={{ marginBottom: 10 }}>TAP A QUICK-ACTION — IT AUTOFILLS THE BORING FIELDS</div>
            <div className="chiprow" style={{ marginBottom: 16 }}>
              {QUICK.map((q) => (
                <span key={q.label} className={`chipq click${action?.label === q.label ? ' pink' : ''}`} onClick={() => pickAction(q)}>{q.label}</span>
              ))}
            </div>
            <textarea
              className="fieldq big" rows={2} value={what}
              placeholder={`Deposited $148 to generate volume with Tread Fi MM bots…`}
              onChange={(e) => setWhat(e.target.value)}
            />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
              <div><div className="lblq">WHY / NARRATIVE</div><input className="fieldq" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Volume for points" /></div>
              <div>
                <div className="lblq">WHEN{entryDate !== dateKey() ? ' · BACKDATED' : ''}</div>
                <input className="fieldq" type="date" max={dateKey()} value={entryDate} onChange={(e) => setEntryDate(e.target.value || dateKey())} />
              </div>
              <div>
                <div className="lblq">IDENTITY{identityMismatch ? ' · ⚠' : ''}</div>
                <select className="fieldq" value={identityId} onChange={(e) => setIdentityId(e.target.value)} style={identityMismatch ? { borderColor: 'var(--rose)' } : undefined}>
                  {state.identities.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {identityMismatch && (
                  <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--rose)', marginTop: 4 }}>
                    🛡 {identityMismatch} ISN'T ASSIGNED TO {raid?.name.toUpperCase()} — CROSS-IDENTITY LOGS LINK YOUR PERSONAS
                  </div>
                )}
              </div>
              <div><div className="lblq">COST ($)</div><input className="fieldq" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" /></div>
              <div><div className="lblq">TIME TAKEN</div><input className="fieldq" value={time} onChange={(e) => setTime(e.target.value)} placeholder="2h 00m" /></div>
              <div><div className="lblq">CHAIN</div><input className="fieldq" value={chain} onChange={(e) => setChainOverride(e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="lblq" style={{ marginBottom: 7 }}>REPEAT — DAILY &amp; WEEKLY MOVES JOIN YOUR HQ QUEST LIST</div>
              <div className="chiprow">
                <span className={`chipq click${repeat === 'once' ? ' pink' : ''}`} onClick={() => setRepeat('once')}>ONE-TIME</span>
                <span className={`chipq click${repeat === 'daily' ? ' cy' : ''}`} onClick={() => setRepeat('daily')}>☀ DAILY</span>
                <span className={`chipq click${repeat === 'weekly' ? ' yel' : ''}`} onClick={() => setRepeat('weekly')}>↻ WEEKLY</span>
                {repeat !== 'once' && (
                  <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--mut)', alignSelf: 'center' }}>
                    → on today's list as done; back {repeat === 'daily' ? 'tomorrow' : 'in 7 days'}
                  </span>
                )}
              </div>
            </div>
            <div
              className={`dropq${dragOver ? ' over' : ''}`} style={{ marginTop: 16 }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <b>{uploading ? '⏳ SAVING TO YOUR MAC…' : '📎 PROOF & MEDIA — ALL IN ONE PLACE'}</b>
              <small>
                drag screenshots in, hit ⤒ BROWSE, or paste a tx hash / ref link / URL below and press ADD.{' '}
                {connected
                  ? <>Images save to <b>vault-data/raids/{raid ? slugify(raid.name) : '…'}/media/</b> on your Mac.</>
                  : 'File backend off — only filenames are kept. Run via npm run dev to save real files.'}
              </small>
              <div className="row" style={{ gap: 8, width: '100%', maxWidth: 480 }}>
                <input
                  className="fieldq" style={{ flex: 1 }} value={proofInput} placeholder="0xabc… / https://…"
                  onChange={(e) => setProofInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addProofText()}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="btnq sm" onClick={(e) => { e.stopPropagation(); addProofText(); }}>ADD</span>
                <span className="btnq sm yel" onClick={(e) => { e.stopPropagation(); pickRef.current?.click(); }}>⤒ BROWSE</span>
                <input
                  ref={pickRef} type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }}
                />
              </div>
              {proofs.length > 0 && (
                <div className="chiprow" style={{ marginTop: 8 }}>
                  {proofs.map((p, i) => {
                    const m = media.find((x) => x.name === p);
                    const href = m ? m.url : isLink(p) ? p : '';
                    return (
                      <span key={i} className={`chipq${m ? ' grn' : ''}`} title={p} onClick={(e) => e.stopPropagation()}>
                        {m ? '🖼' : isLink(p) ? '🔗' : '📎'}{' '}
                        {href
                          ? <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => window.open(href, '_blank')}>{isLink(p) ? linkLabel(p) : proofLabel(p)}</span>
                          : proofLabel(p)}{' '}
                        <span className="x" onClick={() => removeProof(i)}>✕</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="row between wrap" style={{ marginTop: 18 }}>
              <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--mut)' }}>
                {saved
                  ? `SAVED ✓ · ${connected ? 'WRITTEN TO YOUR MAC FILES' : 'AUTOSAVED TO YOUR VAULT'}`
                  : `UNSAVED · ${connected ? 'AUTOSAVES TO MAC FILES' : 'AUTOSAVES TO YOUR VAULT'}`}
              </span>
              <span className="btnq pink big" onClick={save}>SAVE MOVE 🎉</span>
            </div>
          </div>
        </div>

        <div className="s4" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card yel" style={{ textAlign: 'center' }}>
            <div className="stamp">REWARD PREVIEW</div>
            <div className="disp" style={{ fontSize: 58, lineHeight: 1, marginTop: 8, color: 'var(--rose)', textShadow: '3px 3px 0 var(--ink)' }}>+{xpPreview} XP</div>
            <div style={{ fontWeight: 900, fontSize: 9.5, letterSpacing: '.14em', color: 'var(--ink)', marginTop: 4 }}>
              {action ? `${action.label.replace('+ ', '')} LOGGED` : 'MOVE LOGGED'}{proofs.length > 0 ? ' · PROOF ATTACHED' : ''}{repeat !== 'once' ? ` · ${repeat.toUpperCase()} QUEST ↻` : ''}
            </div>
            <div className="row between" style={{ marginTop: 16 }}>
              <span style={{ fontWeight: 800 }}>🔥 STREAK</span>
              <span className="chipq pink">{loggedToday ? `HOLDING ${currentStreak}` : `→ ${currentStreak + 1} DAYS`}</span>
            </div>
            {lockedTrophy && (
              <div className="row between" style={{ marginTop: 9 }}>
                <span style={{ fontWeight: 800 }}>{lockedTrophy.icon} {lockedTrophy.label} BADGE</span>
                <span className="chipq">9 / 10</span>
              </div>
            )}
          </div>
          <div className="card white">
            <h3>🤖 SMART PREFILL <span className="chipq cy end">✦ AI</span></h3>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {smartPrefill ?? <>Start typing or tap a quick-action — I'll tag the narrative, set the chain from your last entry, and file the cost correctly.</>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
