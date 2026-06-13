import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { ScreenTitle } from '../components/bits';
import { generateLocal, generateRemote, PROVIDER_DEFAULTS, type BrainRequest } from '../lib/brain';
import { buildRaidDossier } from '../lib/dossier';
import type { BrainAngle, BrainDraftPost, BrainFormat, VoiceDials } from '../types';
import { fmtMoney } from '../lib/stats';

const DIALS: { key: keyof VoiceDials; name: string; ends: string }[] = [
  { key: 'tone', name: 'TONE', ends: 'DEGEN ↔ PRO' },
  { key: 'length', name: 'LENGTH', ends: 'PUNCHY ↔ DEEP' },
  { key: 'emoji', name: 'EMOJI', ends: 'NONE ↔ HEAVY' },
  { key: 'spice', name: 'HOOK SPICE', ends: 'SUBTLE ↔ 🌶🌶🌶' },
];

function Dial({ name, ends, value, onChange }: { name: string; ends: string; value: number; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function setFromEvent(e: PointerEvent) {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
  }

  return (
    <div className="dialq">
      <div className="top"><span className="nm">{name}</span><span className="ends">{ends}</span></div>
      <div
        className="trackq" ref={track}
        onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setFromEvent(e); }}
        onPointerMove={(e) => dragging.current && setFromEvent(e)}
        onPointerUp={() => { dragging.current = false; }}
      >
        <span className="fill" style={{ width: `${value}%` }} />
        <span className="knob" style={{ left: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Brain() {
  const { state, update } = useStore();
  const ui = useUi();

  const candidates = useMemo(() => state.entries.slice(0, 8), [state.entries]);
  const [entryId, setEntryId] = useState(ui.brainEntryId ?? candidates[0]?.id ?? '');
  const [format, setFormat] = useState<BrainFormat>('thread');
  const [angle, setAngle] = useState<BrainAngle>('alpha');
  const [winMode, setWinMode] = useState(false);
  const [draft, setDraft] = useState<BrainDraftPost[] | null>(null);
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<'hit' | 'flop' | null>(null);
  const [memInput, setMemInput] = useState('');
  const [addingMem, setAddingMem] = useState(false);

  // "→ TURN INTO POST" from a raid detail pre-selects that entry
  useEffect(() => {
    if (ui.brainEntryId) {
      setEntryId(ui.brainEntryId);
      setDraft(null);
    }
  }, [ui.brainEntryId]);
  const entry = state.entries.find((e) => e.id === entryId) ?? candidates[0];
  const raid = entry ? state.raids.find((r) => r.id === entry.raidId) : undefined;

  const liveProvider =
    state.ai.provider !== 'local' && (state.ai.apiKey || state.ai.provider === 'custom')
      ? state.ai.provider
      : null;

  async function generate(nextSeed = seed) {
    if (!entry || !raid) return;
    const req: BrainRequest = {
      entry, raid, format, angle, state, seed: nextSeed,
      // win mode hands the AI the protocol's entire contribution record
      dossier: winMode ? buildRaidDossier(raid, state.entries.filter((e) => e.raidId === raid.id), state) : undefined,
    };
    setBusy(true);
    setError('');
    setFeedback(null);
    try {
      if (liveProvider) {
        setDraft(await generateRemote(req, state.ai));
      } else {
        // small delay so the ✨ WRITING… state reads as intentional
        await new Promise((r) => setTimeout(r, 450));
        setDraft(generateLocal(req));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setDraft(generateLocal(req)); // fall back to local
    } finally {
      setBusy(false);
    }
  }

  function copyAll() {
    if (!draft) return;
    navigator.clipboard?.writeText(draft.map((p) => p.text).join('\n\n'));
  }

  function addMemory() {
    const v = memInput.trim();
    if (!v) return;
    update((s) => ({ ...s, memory: [...s.memory, v] }));
    setMemInput('');
    setAddingMem(false);
  }

  const fmtChip = (key: BrainFormat, label: string) => (
    <span className={`chipq click${format === key ? ' pink' : ''}`} onClick={() => setFormat(key)}>{label}</span>
  );
  const angleChip = (key: BrainAngle, label: string) => (
    <span className={`chipq click${angle === key ? ' yel' : ''}`} onClick={() => setAngle(key)}>{label}</span>
  );

  return (
    <section className="screen active">
      <ScreenTitle title="AI BRAIN" sub="YOUR GHOSTWRITER · TRAINED ON YOU · GETS SMARTER EVERY POST" />
      <div className="grid g12">

        <div className="s3" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <h3>✍️ WRITE ABOUT…</h3>
            {candidates.map((e) => {
              const r = state.raids.find((x) => x.id === e.raidId);
              const label = `${r?.name ?? '?'} — ${e.what.length > 26 ? e.what.slice(0, 26) + '…' : e.what}`;
              const on = e.id === entryId;
              return (
                <div key={e.id} className="quest" style={on ? { background: 'var(--yellow)' } : undefined}>
                  <span className="cb" style={on ? { background: 'var(--green)', color: '#fff' } : undefined} onClick={() => { setEntryId(e.id); ui.openBrain(e.id); setDraft(null); }}>
                    {on ? '✓' : ''}
                  </span>
                  <span className="t" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }} onClick={() => { setEntryId(e.id); ui.openBrain(e.id); setDraft(null); }}>{label}</span>
                </div>
              );
            })}
            <div className="lblq" style={{ margin: '14px 0 7px' }}>MODE</div>
            <div className="chiprow">
              <span className={`chipq click${!winMode ? ' pink' : ''}`} onClick={() => { setWinMode(false); setDraft(null); }}>SINGLE MOVE</span>
              <span className={`chipq click${winMode ? ' grn' : ''}`} onClick={() => { setWinMode(true); setDraft(null); }}>🏆 WIN POST</span>
            </div>
            {winMode && raid && (
              <div style={{ fontWeight: 700, fontSize: 11.5, color: 'var(--mut)', marginTop: 7 }}>
                Feeds the AI the <b>entire {raid.name} dossier</b> — every logged move, cost &amp; date — to write your eligibility / payout post.
              </div>
            )}
            <div className="lblq" style={{ margin: '14px 0 7px' }}>FORMAT</div>
            <div className="chiprow">
              {fmtChip('thread', 'X THREAD')}{fmtChip('single', 'SINGLE')}{fmtChip('longform', 'LONG-FORM')}
            </div>
            <div className="lblq" style={{ margin: '14px 0 7px' }}>ANGLE</div>
            <div className="chiprow">
              {angleChip('alpha', 'ALPHA DROP')}{angleChip('story', 'STORY')}{angleChip('tutorial', 'TUTORIAL')}{angleChip('hottake', 'HOT TAKE')}
            </div>
          </div>
        </div>

        <div className="s6">
          <div className="card white" style={{ height: '100%' }}>
            <h3>
              📝 DRAFT
              <span className="chipq cy">{format === 'thread' ? `THREAD${draft ? ` · ${draft.length} POSTS` : ''}` : format === 'single' ? 'SINGLE POST' : 'LONG-FORM'}</span>
              {liveProvider
                ? <span className="chipq grn">⚡ LIVE {PROVIDER_DEFAULTS[liveProvider]?.label ?? liveProvider.toUpperCase()}</span>
                : <span className="chipq">LOCAL MODE</span>}
              <span className="end">
                <span className="btnq cy" onClick={() => !busy && generate()}>{busy ? '✨ WRITING…' : '✨ GENERATE'}</span>
              </span>
            </h3>
            {error && <div className="chipq rose" style={{ marginBottom: 10 }}>⚠ {error} — used local mode</div>}
            <div className="qlog">
              {!draft && (
                <div className="entry">
                  <div className="when">READY</div>
                  <div className="what" style={{ color: 'var(--mut)' }}>
                    {entry && raid
                      ? <>Pick a format + angle, then hit ✨ GENERATE to ghostwrite "{entry.what.slice(0, 60)}{entry.what.length > 60 ? '…' : ''}" for {raid.name}.</>
                      : 'Log a move first — drafts are written from your real entries.'}
                  </div>
                </div>
              )}
              {draft?.map((p, i) => (
                <div key={i} className="entry">
                  <div className="when">{p.tag}</div>
                  {editing ? (
                    <textarea
                      className="draftarea" defaultValue={p.text}
                      onBlur={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                  ) : (
                    <div className="what" style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>
                  )}
                  {p.proof && <div className="proofph" style={{ marginTop: 9 }}>{p.proof.toUpperCase()}</div>}
                </div>
              ))}
            </div>
            {draft && (
              <div className="row between wrap" style={{ marginTop: 14, gap: 10 }}>
                <div className="chiprow">
                  <span className="btnq sm" onClick={() => { const ns = seed + 1; setSeed(ns); generate(ns); }}>↻ REROLL</span>
                  <span className={`btnq sm${editing ? ' yel' : ''}`} onClick={() => setEditing((e) => !e)}>{editing ? '✓ DONE' : '✎ EDIT'}</span>
                  <span className="btnq sm pink" onClick={copyAll}>⧉ COPY {format === 'thread' ? 'THREAD' : 'POST'}</span>
                </div>
                <div className="chiprow">
                  <span className={`chipq click${feedback === 'hit' ? ' grn' : ''}`} onClick={() => { setFeedback('hit'); update((s) => ({ ...s, memory: s.memory.includes(`${angle} angle hits`) ? s.memory : [...s.memory, `${angle} angle hits`] })); }}>👍 THIS HIT</span>
                  <span className={`chipq click${feedback === 'flop' ? ' rose' : ''}`} onClick={() => setFeedback('flop')}>👎 FLOPPED</span>
                </div>
              </div>
            )}
            {entry && raid && (
              <div className="lblq" style={{ marginTop: 12 }}>
                {winMode
                  ? <>SOURCE: FULL {raid.name.toUpperCase()} DOSSIER · {state.entries.filter((e) => e.raidId === raid.id).length} MOVES · {fmtMoney(-raid.money.spent)} SPENT</>
                  : <>SOURCE: {raid.name.toUpperCase()} · {fmtMoney(-entry.cost)} · {entry.proofs.length} PROOF{entry.proofs.length === 1 ? '' : 'S'}</>}
              </div>
            )}
          </div>
        </div>

        <div className="s3" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <h3>🎛 VOICE DIALS</h3>
            {DIALS.map((d) => (
              <Dial
                key={d.key} name={d.name} ends={d.ends} value={state.voice[d.key]}
                onChange={(v) => update((s) => ({ ...s, voice: { ...s.voice, [d.key]: v } }))}
              />
            ))}
          </div>
          <div className="card white">
            <h3>🧠 MEMORY BANK</h3>
            <div className="chiprow">
              {state.memory.map((m, i) => (
                <span key={i} className="chipq">{m} <span className="x" onClick={() => update((s) => ({ ...s, memory: s.memory.filter((_, j) => j !== i) }))}>✕</span></span>
              ))}
            </div>
            {addingMem ? (
              <div className="row" style={{ marginTop: 12 }}>
                <input className="fieldq" autoFocus value={memInput} onChange={(e) => setMemInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMemory()} placeholder="e.g. always tag $TICKER" />
                <span className="btnq sm" onClick={addMemory}>SAVE</span>
              </div>
            ) : (
              <span className="btnq sm" style={{ marginTop: 12 }} onClick={() => setAddingMem(true)}>+ REMEMBER A FACT</span>
            )}
          </div>
          <div className="card">
            <h3>📚 SKILL FILES</h3>
            <div className="chiprow">
              {state.skillFiles.map((f, i) => (
                <span key={f.name + i} className="chipq cy" title={f.content.slice(0, 200) || 'empty file'}>
                  {f.name} ✓ <span className="x" onClick={() => update((s) => ({ ...s, skillFiles: s.skillFiles.filter((_, j) => j !== i) }))}>✕</span>
                </span>
              ))}
            </div>
            <label className="dropq" style={{ minHeight: 60, marginTop: 10 }}>
              <b>⤓ DROP A SKILL FILE</b>
              <small>.md teaching your tone — fed straight into the ghostwriter's prompt</small>
              <input
                type="file" accept=".md,.txt" style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const content = await f.text();
                  update((s) => ({
                    ...s,
                    skillFiles: [...s.skillFiles.filter((x) => x.name !== f.name), { name: f.name, content }],
                  }));
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
