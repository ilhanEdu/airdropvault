import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { fmtMoney } from '../lib/stats';
import { buildRaidDossier, downloadText, slugify } from '../lib/dossier';
import { deadlineInfo, fromLocalInput, toLocalInput, urgencyChip, useNow } from '../lib/deadlines';
import { liveLootValue, useLivePrices } from '../lib/prices';
import { downloadWinCard } from '../lib/wincard';
import { defaultScanChain, isMultiChain, SCAN_CHAINS, scanWallet, type ScannedTx } from '../lib/chains';
import { isLink, linkLabel, minutesLabel, Modal, proofLabel, whenLabel } from '../components/bits';
import { RaidLogo } from '../components/RaidLogo';
import type { LogEntry, RaidStatus } from '../types';

export default function RaidDetail() {
  const { state, update, connected } = useStore();
  const ui = useUi();
  const [showAddr, setShowAddr] = useState(false);
  // one small modal at a time — cards keep just a ✏️ in the header
  const [modal, setModal] = useState<'brief' | 'task' | 'trophy' | 'link' | 'money' | 'scan' | null>(null);
  const [briefDraft, setBriefDraft] = useState({ funding: '', investors: '', phase: '', why: '', deadline: '', deadlineLabel: '' });
  const [moneyDraft, setMoneyDraft] = useState({ spent: '0', fees: '0', staked: '0', looted: '0', lootLabel: '', tokenId: '', tokenQty: '' });
  const [scanAddr, setScanAddr] = useState('');
  const [scanChain, setScanChain] = useState('Ethereum');
  const [scanState, setScanState] = useState<{ busy: boolean; error: string; txs: ScannedTx[] | null }>({ busy: false, error: '', txs: null });
  const [newTask, setNewTask] = useState('');
  const [newLink, setNewLink] = useState({ label: '', url: '' });
  const [newTrophy, setNewTrophy] = useState({ icon: '', label: '', image: '' });
  const trophyImgRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const raid = state.raids.find((r) => r.id === ui.selectedRaidId) ?? state.raids[0];
  const entries = state.entries.filter((e) => e.raidId === raid?.id);
  const now = useNow();
  const prices = useLivePrices(raid ? [raid] : []);

  // Repeated daily/weekly grinds collapse into one row with a ×N count —
  // otherwise the log drowns in identical check-in cards. One-off moves
  // stay individual; the dossier export keeps every entry regardless.
  const grouped = (() => {
    const byKey = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const k = e.what.trim().toLowerCase();
      byKey.set(k, [...(byKey.get(k) ?? []), e]);
    }
    const seen = new Set<string>();
    const rows: { e: LogEntry; count: number; from: string; cost: number; minutes: number }[] = [];
    for (const e of entries) {
      const k = e.what.trim().toLowerCase();
      const members = byKey.get(k) ?? [e];
      const grind = members.length > 1 && members.some((x) => x.repeat === 'daily' || x.repeat === 'weekly');
      if (!grind) {
        rows.push({ e, count: 1, from: e.date, cost: e.cost, minutes: e.minutes });
        continue;
      }
      if (seen.has(k)) continue; // entries are newest-first, so first hit is the latest
      seen.add(k);
      rows.push({
        e,
        count: members.length,
        from: members[members.length - 1].date,
        cost: members.reduce((a, x) => a + x.cost, 0),
        minutes: members.reduce((a, x) => a + x.minutes, 0),
      });
    }
    return rows;
  })();

  const shortDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();

  // when arriving from search with a focused entry, scroll to it and flash
  useEffect(() => {
    if (!ui.focusEntryId) return;
    const el = logRef.current?.querySelector(`[data-entry="${ui.focusEntryId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      const t = setTimeout(() => el.classList.remove('flash'), 1600);
      return () => clearTimeout(t);
    }
  }, [ui.focusEntryId, raid?.id]);

  if (!raid) return null;
  const identities = raid.identityIds
    .map((iid) => state.identities.find((i) => i.id === iid)?.name)
    .filter(Boolean) as string[];

  function toggleTask(tid: string) {
    const t = raid.tasks.find((x) => x.id === tid);
    if (!t) return;
    const gained = t.done ? -20 : 20;
    if (!t.done) ui.juice(20);
    update((s) => ({
      ...s,
      xp: Math.max(0, s.xp + gained),
      raids: s.raids.map((r) =>
        r.id === raid.id
          ? { ...r, tasks: r.tasks.map((x) => (x.id === tid ? { ...x, done: !x.done } : x)) }
          : r,
      ),
    }));
  }

  const mediaItems = entries.flatMap((e) => e.media ?? []);

  function patchRaid(fn: (r: typeof raid) => typeof raid) {
    update((s) => ({ ...s, raids: s.raids.map((r) => (r.id === raid.id ? fn(r) : r)) }));
  }

  function openBriefModal() {
    setBriefDraft({ ...raid.brief, deadline: toLocalInput(raid.deadline), deadlineLabel: raid.deadlineLabel ?? '' });
    setModal('brief');
  }

  function saveBrief() {
    const { deadline, deadlineLabel, ...brief } = briefDraft;
    patchRaid((r) => ({
      ...r,
      brief,
      deadline: fromLocalInput(deadline),
      deadlineLabel: deadlineLabel.trim() ? deadlineLabel.trim().toUpperCase() : undefined,
    }));
    setModal(null);
  }

  function openMoneyModal() {
    setMoneyDraft({
      spent: String(raid.money.spent), fees: String(raid.money.fees),
      staked: String(raid.money.staked), looted: String(raid.money.looted),
      lootLabel: raid.money.lootLabel,
      tokenId: raid.token?.id ?? '', tokenQty: raid.token ? String(raid.token.qty) : '',
    });
    setModal('money');
  }

  function saveMoney() {
    const n = (s: string) => Math.max(0, parseFloat(s) || 0);
    const tokenId = moneyDraft.tokenId.trim().toLowerCase();
    const tokenQty = parseFloat(moneyDraft.tokenQty) || 0;
    patchRaid((r) => ({
      ...r,
      money: {
        spent: n(moneyDraft.spent), fees: n(moneyDraft.fees),
        staked: n(moneyDraft.staked), looted: n(moneyDraft.looted),
        lootLabel: moneyDraft.lootLabel.trim() || 'PENDING',
      },
      token: tokenId && tokenQty > 0 ? { id: tokenId, qty: tokenQty } : undefined,
    }));
    setModal(null);
  }

  // ON-CHAIN SCAN — read-only tx history via Etherscan V2; pulled moves can
  // be added to the quest log with their real timestamp + hash as proof
  const loggedHashes = new Set(state.entries.flatMap((e) => e.proofs.map((p) => p.toLowerCase())));

  function openScanModal() {
    const candidate = /^0x[a-fA-F0-9]{40}$/.test(raid.credentials.address)
      ? raid.credentials.address
      : state.identities.flatMap((i) => i.addresses ?? []).find((a) => /^0x[a-fA-F0-9]{40}$/.test(a)) ?? '';
    setScanAddr(candidate);
    setScanChain(defaultScanChain(raid.chain)); // "Multi" raids start on Ethereum — pick per scan
    setScanState({ busy: false, error: '', txs: null });
    setModal('scan');
  }

  async function runScan(chain = scanChain) {
    setScanState({ busy: true, error: '', txs: null });
    try {
      const txs = await scanWallet(scanAddr, chain, state.etherscanKey);
      setScanState({ busy: false, error: '', txs });
    } catch (err) {
      setScanState({ busy: false, error: err instanceof Error ? err.message : String(err), txs: null });
    }
  }

  function logTx(tx: ScannedTx) {
    if (loggedHashes.has(tx.hash.toLowerCase())) return;
    const valueBit = tx.valueEth > 0 ? ` · ${tx.valueEth < 0.0001 ? '<0.0001' : tx.valueEth.toFixed(4)} native` : '';
    const entry: LogEntry = {
      id: `e_${Date.now().toString(36)}`,
      raidId: raid.id,
      date: tx.date,
      what: `⛓ ${tx.method}${valueBit} (on-chain)`,
      why: 'Pulled from wallet scan',
      identityId: raid.identityIds[0] ?? state.identities.find((i) => i.main)?.id ?? '',
      cost: 0,
      minutes: 5,
      chain: scanChain, // the chain actually scanned — matters for Multi raids
      proofs: [tx.hash],
      xp: 10,
    };
    update((s) => ({
      ...s,
      xp: s.xp + 10,
      entries: [entry, ...s.entries].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    }));
    ui.juice(10);
  }

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    patchRaid((r) => ({ ...r, tasks: [...r.tasks, { id: `t_${Date.now().toString(36)}`, text, done: false }] }));
    setNewTask('');
  }

  function removeTask(tid: string) {
    patchRaid((r) => ({ ...r, tasks: r.tasks.filter((t) => t.id !== tid) }));
  }

  function addLink() {
    const raw = newLink.url.trim();
    if (!raw) return;
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    let label = newLink.label.trim();
    if (!label) {
      try { label = new URL(url).hostname.replace('www.', '').toUpperCase(); } catch { label = raw.slice(0, 24); }
    }
    patchRaid((r) => ({ ...r, links: [...r.links, { label, url }] }));
    setNewLink({ label: '', url: '' });
  }

  function removeLink(label: string) {
    patchRaid((r) => ({ ...r, links: r.links.filter((l) => l.label !== label) }));
  }

  // Trophies are badges you define per raid — born locked, click to unlock.
  // Mostly discord roles / recognitions, so they take a real badge image
  // (square logo-style tile); the emoji is the fallback look.
  function addTrophy() {
    const label = newTrophy.label.trim();
    if (!label) return;
    patchRaid((r) => ({
      ...r,
      trophies: [...r.trophies, { icon: newTrophy.icon.trim() || '🏅', image: newTrophy.image || undefined, label, locked: true }],
    }));
    setNewTrophy({ icon: '', label: '', image: '' });
  }

  async function pickTrophyImage(f: File | undefined) {
    if (!f) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });
    let image = dataUrl;
    if (connected) {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raidSlug: slugify(raid.name), name: `trophy-${f.name}`, dataUrl }),
        });
        if (res.ok) image = ((await res.json()) as { url: string }).url;
      } catch {
        // disk save failed — data URL fallback above still works
      }
    }
    setNewTrophy((t) => ({ ...t, image }));
  }

  function toggleTrophy(label: string) {
    const t = raid.trophies.find((x) => x.label === label);
    if (!t) return;
    if (t.locked) ui.juice(50);
    update((s) => ({
      ...s,
      xp: Math.max(0, s.xp + (t.locked ? 50 : -50)),
      raids: s.raids.map((r) =>
        r.id === raid.id
          ? { ...r, trophies: r.trophies.map((x) => (x.label === label ? { ...x, locked: !x.locked } : x)) }
          : r,
      ),
    }));
  }

  function removeTrophy(label: string) {
    patchRaid((r) => ({ ...r, trophies: r.trophies.filter((t) => t.label !== label) }));
  }

  // Click the logo to attach a real project logo. With the file backend on it's
  // saved under vault-data/raids/<slug>/media/; otherwise it lives in state as
  // a data URL so it still survives reloads.
  async function uploadLogo(f: File | undefined) {
    if (!f) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });
    let logo = dataUrl;
    if (connected) {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raidSlug: slugify(raid.name), name: `logo-${f.name}`, dataUrl }),
        });
        if (res.ok) logo = ((await res.json()) as { url: string }).url;
      } catch {
        // disk save failed — data URL fallback above still works
      }
    }
    patchRaid((r) => ({ ...r, logo }));
  }

  function exportDossier() {
    downloadText(`${slugify(raid.name)}-dossier.md`, buildRaidDossier(raid, entries, state));
  }

  // status is editable right on the page — still farming, testnet, won, done
  const statusColors: Record<RaidStatus, string> = { active: '#ffd23e', testnet: '#48d6ff', won: '#7be3a8', completed: '#7be3a8' };
  const statusChip = (
    <select
      className="fieldq"
      title="Update raid status"
      style={{ width: 'auto', padding: '3px 30px 3px 11px', fontSize: 11, fontWeight: 900, borderRadius: 99, borderWidth: 2.5, background: statusColors[raid.status], color: 'var(--ink)' }}
      value={raid.status}
      onChange={(e) => patchRaid((r) => ({ ...r, status: e.target.value as RaidStatus, statusLabel: undefined }))}
    >
      <option value="active">⚔️ RAID ACTIVE — STILL FARMING</option>
      <option value="testnet">🧪 TESTNET</option>
      <option value="won">🏆 WON — LOOT DROPPED</option>
      <option value="completed">✅ COMPLETED — STOPPED FARMING</option>
    </select>
  );

  return (
    <section className="screen active">
      <div className="back" onClick={() => ui.go('raids')} style={{ marginBottom: 16 }}>← BACK TO RAIDS</div>
      <div className="screenttl">
        <span
          title="Click to set this project's logo"
          style={{ cursor: 'pointer', position: 'relative', display: 'inline-flex' }}
          onClick={() => logoRef.current?.click()}
        >
          <RaidLogo raid={raid} size={52} />
          <span style={{ position: 'absolute', right: -6, bottom: -6, fontSize: 14, background: '#fff', border: '2px solid var(--ink)', borderRadius: 99, lineHeight: 1, padding: 2 }}>✏️</span>
        </span>
        <input
          ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }}
        />
        <h1>{raid.name.toUpperCase()}</h1>
        {statusChip}
        <span className="chipq rose">⚠ RISK: {raid.risk.toUpperCase()}</span>
        {(() => {
          const dl = deadlineInfo(raid, now);
          return dl && raid.status !== 'won' && raid.status !== 'completed'
            ? <span className={`chipq ${urgencyChip[dl.urgency]}`} title={dl.at.toLocaleString()}>{dl.urgency === 'overdue' ? '🚨' : '⏰'} {dl.label} · {dl.countdown}</span>
            : null;
        })()}
        {identities.map((n) => <span key={n} className="chipq">🪪 {n}</span>)}
      </div>

      <div className="grid g12">
        <div className="s4" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <h3>📋 THE BRIEF <span className="end"><span className="btnq sm" onClick={openBriefModal}>✏️</span></span></h3>
            <div className="kv"><span className="k">FUNDING</span><span>{raid.brief.funding}</span></div>
            <div className="kv"><span className="k">INVESTORS</span><span>{raid.brief.investors}</span></div>
            <div className="kv"><span className="k">NARRATIVE</span><span className="chipq pink">{raid.narrative}</span></div>
            <div className="kv"><span className="k">PHASE</span><span>{raid.brief.phase}</span></div>
            {Object.entries(raid.customFields).map(([k, v]) => (
              <div className="kv" key={k}><span className="k">{k}</span><span>{v}</span></div>
            ))}
            <div className="lblq" style={{ marginTop: 12 }}>WHY I'M RAIDING IT</div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{raid.brief.why || '—'}</div>
          </div>
          <div className="card white">
            <h3>🔑 CREDENTIALS <span className="end"><span className="chipq grn">🔒 LOCAL ONLY</span> <span className="btnq sm cy" onClick={openScanModal}>⛓ SCAN</span></span></h3>
            <div className="kv"><span className="k">IDENTITY</span><span className="chipq">{identities[0] ?? '—'}</span></div>
            <div className="kv"><span className="k">LOGIN</span><span>{raid.credentials.login}</span></div>
            <div className="kv">
              <span className="k">ADDRESS</span>
              <span style={{ cursor: 'pointer' }} onClick={() => setShowAddr((v) => !v)}>
                {showAddr ? raid.credentials.address : `${raid.credentials.address.slice(0, 2)}…${raid.credentials.address.slice(-4)}`} 👁
              </span>
            </div>
            <div className="kv"><span className="k">CHAIN</span><span>{raid.chain}</span></div>
          </div>
          <div className="card">
            <h3>🪙 MONEY <span className="end"><span className="btnq sm" onClick={openMoneyModal}>✏️</span></span></h3>
            <div className="kv"><span className="k">SPENT</span><span className="v bad" style={{ fontSize: 15 }}>{fmtMoney(-raid.money.spent)}</span></div>
            <div className="kv"><span className="k">FEES BURNT</span><span className="v bad" style={{ fontSize: 15 }}>{fmtMoney(-raid.money.fees)}</span></div>
            <div className="kv"><span className="k">STAKED</span><span style={{ fontWeight: 800 }}>{fmtMoney(raid.money.staked)}</span></div>
            <div className="kv">
              <span className="k">LOOT</span>
              {raid.money.looted > 0
                ? <span className="chipq grn">{raid.money.lootLabel} · {fmtMoney(raid.money.looted)}</span>
                : <span className="chipq yel">{raid.money.lootLabel}</span>}
            </div>
            {(() => {
              const live = liveLootValue(raid, prices);
              return raid.token ? (
                <div className="kv">
                  <span className="k">LIVE VALUE</span>
                  {live !== null
                    ? <span className="chipq cy" title={`${raid.token.qty} × ${raid.token.id} @ CoinGecko`}>📈 {fmtMoney(live)} NOW</span>
                    : <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--mut)' }}>fetching {raid.token.id}…</span>}
                </div>
              ) : null;
            })()}
          </div>
        </div>

        <div className="s5">
          {/* card fills the row but never outgrows the viewport; the log
              flexes to the card's bottom edge — no dead space below it */}
          <div className="card" style={{ height: '100%', maxHeight: 'calc(100dvh - 230px)', display: 'flex', flexDirection: 'column' }}>
            <h3>📜 QUEST LOG <span className="end"><span className="btnq sm cy" onClick={() => void downloadWinCard(raid, entries)}>🏆 WIN CARD .PNG</span> <span className="btnq sm yel" onClick={exportDossier}>⤓ DOSSIER .MD</span> <span className="btnq sm pink" onClick={() => ui.openLog(raid.id)}>+ LOG</span></span></h3>
            <div className="lblq" style={{ marginBottom: 12 }}>WHAT · WHY · WHEN · COST · PROOF — 1 CLICK → POST</div>
            <div className="qlog" ref={logRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
              {entries.length === 0 && (
                <div className="entry"><div className="what" style={{ color: 'var(--mut)' }}>Nothing logged yet — hit + LOG to record your first move.</div></div>
              )}
              {grouped.map(({ e, count, from, cost, minutes }) => (
                <div key={e.id} data-entry={e.id} className="entry" style={e.loot ? { background: 'var(--mint)' } : undefined}>
                  <div className="when">
                    {count > 1
                      ? `${shortDay(from)} → ${shortDay(e.date)} · ${minutes ? minutesLabel(minutes) + ' TOTAL' : 'STREAK'}`
                      : <>{whenLabel(e.date)}{e.minutes ? ` · ${minutesLabel(e.minutes)}` : ''}</>}
                  </div>
                  <div className="what">{e.what}</div>
                  <div className="chiprow" style={{ marginTop: 8, alignItems: 'center' }}>
                    {count > 1 && <span className="chipq yel" title={`Logged ${count} times — latest ${whenLabel(e.date)}`}>🔥 ×{count}</span>}
                    {cost > 0 && <span className="chipq rose" title={count > 1 ? 'Total across all repeats' : undefined}>{fmtMoney(-cost)}</span>}
                    {e.proofs.length > 0 && (
                      e.proofs.length === 1
                        ? <span
                            className="chipq" title={e.proofs[0]}
                            style={isLink(e.proofs[0]) ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}
                            onClick={() => isLink(e.proofs[0]) && window.open(e.proofs[0], '_blank')}
                          >{isLink(e.proofs[0]) ? '🔗' : '📎'} {linkLabel(e.proofs[0])}</span>
                        : <span className="chipq">📎 {e.proofs.length} PROOFS</span>
                    )}
                    <span className="btnq sm ghost" style={{ marginLeft: 'auto' }} onClick={() => ui.openBrain(e.id)}>✨ TURN INTO POST</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="s3" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card white">
            <h3>⚔️ HERO TASKS <span className="end"><span className="btnq sm" onClick={() => setModal('task')}>✏️</span></span></h3>
            {raid.tasks.length === 0 && <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--mut)' }}>No tasks yet — hit ✏️ to add the big checklist items.</div>}
            <div style={{ maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
              {raid.tasks.map((t) => (
                <div key={t.id} className={`quest${t.done ? ' on' : ''}`}>
                  <span
                    className="cb" role="checkbox" aria-checked={t.done} tabIndex={0}
                    aria-label={`${t.text} — +20 XP`}
                    onClick={() => toggleTask(t.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(t.id); } }}
                  >{t.done ? '✓' : ''}</span>
                  <span className="t wrap">{t.text}</span>
                </div>
              ))}
            </div>
            {raid.tasks.length > 4 && (
              <div style={{ fontWeight: 800, fontSize: 10, color: 'var(--mut)', textAlign: 'center', marginTop: 4 }}>↓ SCROLL — {raid.tasks.length} TASKS</div>
            )}
          </div>
          <div className="card">
            <h3>🏅 TROPHIES <span className="end"><span className="btnq sm" onClick={() => setModal('trophy')}>✏️</span></span></h3>
            <div className="badgesq" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {raid.trophies.length === 0 && <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--mut)' }}>No trophies yet — hit ✏️ to add discord roles & recognitions, then click one when you earn it.</div>}
              {raid.trophies.map((t) => (
                <div
                  key={t.label} className={`badgeq${t.locked ? ' locked' : ''}`}
                  style={{ cursor: 'pointer' }}
                  title={t.locked ? 'Click when you earn it · +50 XP' : 'Unlocked — click to re-lock'}
                  onClick={() => toggleTrophy(t.label)}
                >
                  {t.image
                    ? <img className="ic" src={t.image} alt={t.label} />
                    : <div className="ic">{t.icon}</div>}
                  <small>{t.label}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="card white">
            <h3>📎 PROOFS &amp; LINKS <span className="end"><span className="btnq sm" onClick={() => setModal('link')}>✏️</span></span></h3>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              {mediaItems.slice(0, 4).map((m, i) => (
                <img
                  key={i} src={m.url} alt={m.name} title={m.name}
                  style={{ width: '100%', height: 74, objectFit: 'cover', border: '2.5px solid var(--ink)', borderRadius: 10, cursor: 'pointer', background: '#fff' }}
                  onClick={() => window.open(m.url, '_blank')}
                />
              ))}
              {mediaItems.length < 4 && entries.flatMap((e) => e.proofs).filter((p) => !mediaItems.some((m) => m.name === p)).slice(0, 4 - mediaItems.length).map((p, i) => (
                <div
                  key={`p${i}`} className="proofph" title={p}
                  style={isLink(p) ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}
                  onClick={() => isLink(p) && window.open(p, '_blank')}
                >{isLink(p) ? '🔗 ' : ''}{linkLabel(p).toUpperCase()}</div>
              ))}
              {mediaItems.length === 0 && entries.flatMap((e) => e.proofs).length === 0 && (
                <><div className="proofph">TX SCREENSHOT</div><div className="proofph">INVITE CODES</div></>
              )}
            </div>
            <div className="chiprow" style={{ marginTop: 10 }}>
              {raid.links.map((l) => (
                <span key={l.label} className="chipq cy click" onClick={() => l.url && window.open(l.url, '_blank')}>{l.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modal === 'brief' && (
        <Modal title="📋 EDIT THE BRIEF" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><div className="lblq">FUNDING</div><input className="fieldq" autoFocus value={briefDraft.funding} onChange={(e) => setBriefDraft({ ...briefDraft, funding: e.target.value })} placeholder="e.g. $12M Series A" /></div>
            <div><div className="lblq">INVESTORS</div><input className="fieldq" value={briefDraft.investors} onChange={(e) => setBriefDraft({ ...briefDraft, investors: e.target.value })} placeholder="e.g. Paradigm, Binance Labs" /></div>
            <div><div className="lblq">PHASE</div><input className="fieldq" value={briefDraft.phase} onChange={(e) => setBriefDraft({ ...briefDraft, phase: e.target.value })} placeholder="e.g. Testnet S2" /></div>
            <div><div className="lblq">WHY I'M RAIDING IT</div><input className="fieldq" value={briefDraft.why} onChange={(e) => setBriefDraft({ ...briefDraft, why: e.target.value })} placeholder="The thesis in one line…" /></div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div className="lblq">⏰ DEADLINE — SNAPSHOT / EPOCH / CLAIM</div>
                <input className="fieldq" type="datetime-local" value={briefDraft.deadline} onChange={(e) => setBriefDraft({ ...briefDraft, deadline: e.target.value })} />
              </div>
              <div>
                <div className="lblq">WHAT HAPPENS THEN</div>
                <input className="fieldq" value={briefDraft.deadlineLabel} onChange={(e) => setBriefDraft({ ...briefDraft, deadlineLabel: e.target.value })} placeholder="e.g. S3 SNAPSHOT" />
              </div>
            </div>
            {briefDraft.deadline && (
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--mut)' }}>
                Countdown shows on the raid card, the detail header, and the HQ deadline rail — goes alarm-red inside 24h.{' '}
                <span className="chipq click" onClick={() => setBriefDraft({ ...briefDraft, deadline: '', deadlineLabel: '' })}>✕ CLEAR DEADLINE</span>
              </div>
            )}
          </div>
          <div className="chiprow" style={{ marginTop: 14 }}>
            <span className="btnq pink" onClick={saveBrief}>SAVE ✓</span>
          </div>
        </Modal>
      )}

      {modal === 'money' && (
        <Modal title="🪙 EDIT MONEY" onClose={() => setModal(null)}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div className="lblq">SPENT ($)</div><input className="fieldq" autoFocus inputMode="decimal" value={moneyDraft.spent} onChange={(e) => setMoneyDraft({ ...moneyDraft, spent: e.target.value })} /></div>
            <div><div className="lblq">FEES BURNT ($)</div><input className="fieldq" inputMode="decimal" value={moneyDraft.fees} onChange={(e) => setMoneyDraft({ ...moneyDraft, fees: e.target.value })} /></div>
            <div><div className="lblq">STAKED ($)</div><input className="fieldq" inputMode="decimal" value={moneyDraft.staked} onChange={(e) => setMoneyDraft({ ...moneyDraft, staked: e.target.value })} /></div>
            <div><div className="lblq">LOOTED ($ REALIZED)</div><input className="fieldq" inputMode="decimal" value={moneyDraft.looted} onChange={(e) => setMoneyDraft({ ...moneyDraft, looted: e.target.value })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><div className="lblq">LOOT LABEL</div><input className="fieldq" value={moneyDraft.lootLabel} onChange={(e) => setMoneyDraft({ ...moneyDraft, lootLabel: e.target.value })} placeholder="e.g. +43 $RESOLV · PENDING · POINTS" /></div>
          </div>
          <div className="lblq" style={{ marginTop: 14, marginBottom: 6 }}>📈 LIVE PRICING — OPTIONAL, VIA COINGECKO (FREE, NO KEY)</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div className="lblq">COINGECKO COIN ID</div><input className="fieldq" value={moneyDraft.tokenId} onChange={(e) => setMoneyDraft({ ...moneyDraft, tokenId: e.target.value })} placeholder="e.g. resolv · zetachain · pixels" /></div>
            <div><div className="lblq">TOKENS HELD</div><input className="fieldq" inputMode="decimal" value={moneyDraft.tokenQty} onChange={(e) => setMoneyDraft({ ...moneyDraft, tokenQty: e.target.value })} placeholder="e.g. 43" /></div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--mut)', marginTop: 8 }}>
            The coin id is the last bit of the token's coingecko.com URL. Set it and the MONEY card shows what your bag is worth right now.
          </div>
          <div className="chiprow" style={{ marginTop: 14 }}>
            <span className="btnq pink" onClick={saveMoney}>SAVE ✓</span>
          </div>
        </Modal>
      )}

      {modal === 'scan' && (
        <Modal title={`⛓ WALLET SCAN — ${scanChain.toUpperCase()}`} onClose={() => setModal(null)}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>
            Read-only: pulls the address's latest transactions from the block explorer. Hit <b>+ LOG</b> on any move to file it with its real timestamp and tx hash as proof.
          </div>
          {isMultiChain(raid.chain) && (
            <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--mut)', marginBottom: 8 }}>
              🌐 This raid is <b>MULTI-CHAIN</b> — pick which chain to scan, then repeat for the others.
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <select
              className="fieldq" style={{ width: 150, flex: 'none' }} value={scanChain}
              onChange={(e) => { setScanChain(e.target.value); if (scanState.txs || scanState.error) void runScan(e.target.value); }}
            >
              {SCAN_CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              className="fieldq" style={{ flex: 1 }} value={scanAddr}
              onChange={(e) => setScanAddr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runScan()}
              placeholder="0x… wallet to scan"
            />
            <span className="btnq sm pink" onClick={() => void runScan()}>{scanState.busy ? '⏳' : 'SCAN'}</span>
          </div>
          {!state.etherscanKey && (
            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--mut)', marginTop: 10 }}>
              No Etherscan key — scans use free public explorers where available. Add a key in VAULT → ⛓ WALLET TRACKER for full chain coverage.
            </div>
          )}
          {scanState.error && <div className="chipq rose" style={{ marginTop: 10, whiteSpace: 'normal' }}>⚠ {scanState.error}</div>}
          {scanState.txs && scanState.txs.length === 0 && (
            <div className="chipq" style={{ marginTop: 10 }}>No transactions found for this address on {scanChain}.</div>
          )}
          {scanState.txs && scanState.txs.length > 0 && (
            <div className="qlog" style={{ marginTop: 12, maxHeight: '46vh', overflowY: 'auto', paddingRight: 2 }}>
              {scanState.txs.map((tx) => {
                const logged = loggedHashes.has(tx.hash.toLowerCase());
                return (
                  <div key={tx.hash} className="entry" style={logged ? { opacity: 0.55 } : undefined}>
                    <div className="when">{whenLabel(tx.date)} · {tx.direction.toUpperCase()}{tx.failed ? ' · ❌ FAILED' : ''}</div>
                    <div className="what">
                      {tx.method}{tx.valueEth > 0 ? ` · ${tx.valueEth < 0.0001 ? '<0.0001' : tx.valueEth.toFixed(4)}` : ''}{' '}
                      <span className="chipq" title={tx.hash}>📎 {proofLabel(tx.hash)}</span>{' '}
                      {logged
                        ? <span className="chipq grn">✓ LOGGED</span>
                        : <span className="btnq sm pink" onClick={() => logTx(tx)}>+ LOG</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {modal === 'task' && (
        <Modal title="⚔️ HERO TASKS" onClose={() => setModal(null)}>
          {raid.tasks.map((t) => (
            <div key={t.id} className={`quest${t.done ? ' on' : ''}`}>
              <span className="cb" onClick={() => toggleTask(t.id)}>{t.done ? '✓' : ''}</span>
              <span className="t wrap">{t.text}</span>
              <span className="x" style={{ cursor: 'pointer' }} onClick={() => removeTask(t.id)}>✕</span>
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <input
              className="fieldq" style={{ flex: 1 }} autoFocus value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              placeholder="e.g. Bridge $100 in"
            />
            <span className="btnq sm pink" onClick={addTask}>+ ADD</span>
          </div>
        </Modal>
      )}

      {modal === 'trophy' && (
        <Modal title="🏅 TROPHIES — ROLES & RECOGNITIONS" onClose={() => setModal(null)}>
          {raid.trophies.length > 0 && (
            <div className="badgesq" style={{ marginBottom: 14 }}>
              {raid.trophies.map((t) => (
                <div key={t.label} className={`badgeq${t.locked ? ' locked' : ''}`} style={{ position: 'relative' }}>
                  <span
                    className="x"
                    style={{ position: 'absolute', top: -4, right: 0, zIndex: 1, cursor: 'pointer' }}
                    onClick={() => removeTrophy(t.label)}
                  >✕</span>
                  {t.image
                    ? <img className="ic" src={t.image} alt={t.label} />
                    : <div className="ic">{t.icon}</div>}
                  <small>{t.label}</small>
                </div>
              ))}
            </div>
          )}
          <div className="lblq" style={{ marginBottom: 6 }}>UPLOAD THE ROLE BADGE IMAGE (OR TYPE AN EMOJI), NAME IT, ADD</div>
          <div className="row" style={{ gap: 8 }}>
            <span
              title={newTrophy.image ? 'Badge image picked — click to change' : 'Upload badge image'}
              style={{ width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', border: '2.5px solid var(--ink)', borderRadius: 12, cursor: 'pointer', background: '#fff', overflow: 'hidden' }}
              onClick={() => trophyImgRef.current?.click()}
            >
              {newTrophy.image
                ? <img src={newTrophy.image} alt="badge" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🖼'}
            </span>
            <input
              ref={trophyImgRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { void pickTrophyImage(e.target.files?.[0]); e.target.value = ''; }}
            />
            <input
              className="fieldq" style={{ width: 46, textAlign: 'center' }} value={newTrophy.icon}
              onChange={(e) => setNewTrophy({ ...newTrophy, icon: e.target.value })} placeholder="🏅"
            />
            <input
              className="fieldq" style={{ flex: 1, minWidth: 0 }} value={newTrophy.label}
              onChange={(e) => setNewTrophy({ ...newTrophy, label: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addTrophy()}
              placeholder="e.g. OG role"
            />
            <span className="btnq sm pink" onClick={addTrophy}>+ ADD</span>
          </div>
        </Modal>
      )}

      {modal === 'link' && (
        <Modal title="📎 LINKS — REF LINK, DAPP, DOCS, TWEET…" onClose={() => setModal(null)}>
          {raid.links.length > 0 && (
            <div className="chiprow" style={{ marginBottom: 14 }}>
              {raid.links.map((l) => (
                <span key={l.label} className="chipq cy">
                  <span className="click" onClick={() => l.url && window.open(l.url, '_blank')}>{l.label}</span>{' '}
                  <span className="x" onClick={() => removeLink(l.label)}>✕</span>
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <input className="fieldq" style={{ width: 110 }} value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} placeholder="Label" />
            <input
              className="fieldq" style={{ flex: 1 }} autoFocus value={newLink.url}
              onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addLink()}
              placeholder="https://…"
            />
            <span className="btnq sm pink" onClick={addLink}>+ ADD</span>
          </div>
        </Modal>
      )}
    </section>
  );
}
