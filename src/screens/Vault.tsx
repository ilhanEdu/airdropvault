import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { ScreenTitle } from '../components/bits';
import { PROVIDER_DEFAULTS } from '../lib/brain';
import { buildMasterDossier, downloadText } from '../lib/dossier';
import { buildCsvTemplate, importCsvText } from '../lib/csv';
import { sybilFindings } from '../lib/sybil';
import { KEYLESS_CHAINS, SCANNABLE_CHAINS } from '../lib/chains';
import { buildBlank } from '../data/seed';
import { walletCount, type AiProvider, type AppState, type Identity } from '../types';

const PROVIDERS: { key: AiProvider; name: string; hint: string; needsKey: boolean }[] = [
  { key: 'local', name: 'LOCAL GHOSTWRITER', hint: 'Built-in, free, works offline — no key needed.', needsKey: false },
  { key: 'anthropic', name: 'ANTHROPIC · CLAUDE', hint: 'Default model: claude-sonnet-4-6 — great writing at a fair price. Type claude-opus-4-8 in MODEL if you want the maximum.', needsKey: true },
  { key: 'openai', name: 'OPENAI · CHATGPT', hint: 'Default model: gpt-4o-mini (cheap).', needsKey: true },
  { key: 'gemini', name: 'GOOGLE · GEMINI', hint: 'Default model: gemini-2.0-flash — has a generous free tier.', needsKey: true },
  { key: 'custom', name: 'CUSTOM / FREE (OPENAI-COMPATIBLE)', hint: 'OpenRouter free models, Groq, or local Ollama — set base URL + model. Key optional.', needsKey: false },
];

export default function Vault() {
  const { state, update, resetDemo, connected, dataPath } = useStore();
  const ui = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [newField, setNewField] = useState('');
  const [scanKeyDraft, setScanKeyDraft] = useState(state.etherscanKey);
  const [scanKeySaved, setScanKeySaved] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newIdent, setNewIdent] = useState('');
  const [addingIdent, setAddingIdent] = useState(false);
  const [editIdentId, setEditIdentId] = useState<string | null>(null);
  const [identName, setIdentName] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [newRule, setNewRule] = useState('');
  const [addingRule, setAddingRule] = useState(false);
  const [aiDraft, setAiDraft] = useState(state.ai);
  const [aiSaved, setAiSaved] = useState(false);
  const [imported, setImported] = useState('');

  const providerInfo = PROVIDERS.find((p) => p.key === aiDraft.provider) ?? PROVIDERS[0];
  const aiLive = state.ai.provider !== 'local' && (state.ai.apiKey || state.ai.provider === 'custom');

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `airdrop-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importBackup(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const parsed = JSON.parse(txt) as AppState;
        if (parsed.version !== 1 || !Array.isArray(parsed.raids)) throw new Error('bad file');
        if (!parsed.ai) parsed.ai = { provider: 'local', apiKey: '', model: '', baseUrl: '' };
        parsed.etherscanKey ??= '';
        update(() => parsed);
        setImported(`Imported ${f.name} ✓`);
      } catch {
        setImported('Import failed — not a vault backup');
      }
      setTimeout(() => setImported(''), 3000);
    });
  }

  // CSV import — the escape hatch from the spreadsheet every farmer starts with
  function importCsv(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const res = importCsvText(txt, state);
        update(() => res.next);
        const created = res.raidsCreated.length ? ` · ${res.raidsCreated.length} new raids (${res.raidsCreated.slice(0, 3).join(', ')}${res.raidsCreated.length > 3 ? '…' : ''})` : '';
        setImported(`Imported ${res.entriesAdded} moves${created}${res.skipped ? ` · ${res.skipped} rows skipped` : ''} ✓`);
      } catch (err) {
        setImported(`CSV import failed — ${err instanceof Error ? err.message : 'unreadable file'}`);
      }
      setTimeout(() => setImported(''), 6000);
    });
    e.target.value = '';
  }

  function saveScanKey() {
    update((s) => ({ ...s, etherscanKey: scanKeyDraft.trim() }));
    setScanKeySaved(true);
    setTimeout(() => setScanKeySaved(false), 2200);
  }

  const sybil = sybilFindings(state);

  function addIdentity() {
    const name = newIdent.trim().toUpperCase();
    if (!name) return;
    const colors: Identity['color'][] = ['yel', 'grn', 'cy', 'pink'];
    update((s) => ({
      ...s,
      identities: [...s.identities, {
        id: `id_${Date.now().toString(36)}`,
        name,
        color: colors[s.identities.length % colors.length],
        wallets: 0,
        addresses: [],
        main: false,
      }],
    }));
    setNewIdent('');
    setAddingIdent(false);
  }

  function patchIdentity(iid: string, fn: (i: Identity) => Identity) {
    update((s) => ({ ...s, identities: s.identities.map((i) => (i.id === iid ? fn(i) : i)) }));
  }

  function startEditIdentity(i: Identity) {
    setEditIdentId(i.id);
    setIdentName(i.name);
    setNewAddr('');
  }

  function saveIdentityName(iid: string) {
    const name = identName.trim().toUpperCase();
    if (name) patchIdentity(iid, (i) => ({ ...i, name }));
  }

  function addWallet(iid: string) {
    const addr = newAddr.trim();
    if (!addr) return;
    patchIdentity(iid, (i) => ({ ...i, addresses: [...(i.addresses ?? []), addr] }));
    setNewAddr('');
  }

  function removeWallet(iid: string, idx: number) {
    patchIdentity(iid, (i) => ({ ...i, addresses: (i.addresses ?? []).filter((_, j) => j !== idx) }));
  }

  function makeMain(iid: string) {
    update((s) => ({ ...s, identities: s.identities.map((i) => ({ ...i, main: i.id === iid })) }));
  }

  function deleteIdentity(iid: string) {
    if (state.identities.length <= 1) return;
    const ident = state.identities.find((i) => i.id === iid);
    if (!confirm(`Delete identity ${ident?.name}? Raids tagged with it keep their logs; the tag is removed.`)) return;
    update((s) => {
      let rest = s.identities.filter((i) => i.id !== iid);
      if (!rest.some((i) => i.main)) rest = rest.map((i, idx) => (idx === 0 ? { ...i, main: true } : i));
      return {
        ...s,
        identities: rest,
        raids: s.raids.map((r) => ({ ...r, identityIds: r.identityIds.filter((x) => x !== iid) })),
      };
    });
    setEditIdentId(null);
  }

  function toggleRule(rid: string) {
    const rule = state.trophyRules.find((r) => r.id === rid);
    if (!rule) return;
    const gained = rule.done ? -rule.xp : rule.xp;
    if (!rule.done) ui.juice(rule.xp);
    update((s) => ({
      ...s,
      xp: Math.max(0, s.xp + gained),
      trophyRules: s.trophyRules.map((r) => (r.id === rid ? { ...r, done: !r.done } : r)),
    }));
  }

  function addField() {
    if (!newField.trim()) return;
    update((s) => ({ ...s, customFields: [...s.customFields, newField.trim()] }));
    setNewField('');
    setAddingField(false);
  }

  function addRule() {
    if (!newRule.trim()) return;
    update((s) => ({
      ...s,
      trophyRules: [...s.trophyRules, { id: `tr_${Date.now().toString(36)}`, text: newRule.trim(), xp: 100, done: false }],
    }));
    setNewRule('');
    setAddingRule(false);
  }

  async function startFresh() {
    if (!confirm('Erase EVERYTHING — all raids, logs, screenshots, dossiers, and XP? This cannot be undone. (Export a backup first if unsure.)')) return;
    if (connected) {
      try { await fetch('/api/wipe', { method: 'POST' }); } catch { /* disk wipe failed — state below still resets */ }
    }
    try { localStorage.removeItem('airdrop-vault-v1'); } catch { /* private mode */ }
    update(() => buildBlank());
  }

  function saveAi() {
    update((s) => ({ ...s, ai: { ...aiDraft, apiKey: aiDraft.apiKey.trim(), model: aiDraft.model.trim(), baseUrl: aiDraft.baseUrl.trim() } }));
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2200);
  }

  return (
    <section className="screen active">
      <ScreenTitle title="THE VAULT" sub="YOUR DATA, YOUR DISK · FULLY CUSTOMIZABLE" />
      <div className="grid g12">

        {/* left column — storage, fields, AI engine */}
        <div className="s7" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="card">
            <h3>💾 LOCAL STORAGE {connected
              ? <span className="chipq grn end">● SYNCED TO MAC FILES</span>
              : <span className="chipq yel end">● BROWSER ONLY</span>}</h3>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {connected ? (
                <>🗂 Everything autosaves to real files on your Mac — <b>state.json</b>, one folder per protocol (media + <b>dossier.md</b>), and a <b>MASTER-DOSSIER.md</b> with every contribution. {state.entries.length} entries · {state.raids.length} raids. Nothing ever leaves your machine.</>
              ) : (
                <>🗂 Saving to this browser's local storage — {state.entries.length} entries · {state.raids.length} raids. Run the app with <b>npm run dev</b> to store everything as files on your Mac (screenshots included).</>
              )}
            </div>
            {connected && dataPath && (
              <div style={{ fontWeight: 700, fontSize: 11.5, color: 'var(--mut)', marginTop: 8, wordBreak: 'break-all' }}>📁 {dataPath}</div>
            )}
            <div className="chiprow" style={{ marginTop: 14 }}>
              <span className="btnq sm cy" onClick={() => downloadText(`master-dossier-${new Date().toISOString().slice(0, 10)}.md`, buildMasterDossier(state))}>⤓ MASTER DOSSIER .MD</span>
              <span className="btnq sm yel" onClick={exportBackup}>⤓ EXPORT BACKUP .JSON</span>
              <span className="btnq sm" onClick={() => fileRef.current?.click()}>⤒ IMPORT</span>
              <span className="btnq sm cy" onClick={() => csvRef.current?.click()}>⤒ IMPORT CSV</span>
              <span className="btnq sm" onClick={() => downloadText('airdrop-vault-template.csv', buildCsvTemplate(), 'text/csv')}>⤓ CSV TEMPLATE</span>
              <span className="btnq sm" onClick={() => { if (confirm('Reset to demo data? Your current vault will be replaced.')) resetDemo(); }}>↺ RESET DEMO DATA</span>
              <span className="btnq sm rose" onClick={() => void startFresh()}>🗑 START FRESH</span>
              <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importBackup} />
              <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={importCsv} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--mut)', marginTop: 8 }}>
              Coming from a spreadsheet? IMPORT CSV reads date / protocol / what / cost / minutes / chain / loot columns and creates raids automatically — grab the template to see the shape.
            </div>
            {imported && <div className="chipq grn" style={{ marginTop: 10 }}>{imported}</div>}
          </div>

          <div className="card white">
            <h3>🧩 CUSTOM FIELDS <span className="chipq end">MAKE IT YOURS</span></h3>
            <div className="chiprow">
              {state.customFields.map((f) => (
                <span key={f} className="chipq">{f} <span className="x" onClick={() => update((s) => ({ ...s, customFields: s.customFields.filter((x) => x !== f) }))}>✕</span></span>
              ))}
              {addingField ? (
                <span className="row" style={{ gap: 8 }}>
                  <input className="fieldq" style={{ width: 180, padding: '4px 11px', fontSize: 12, borderRadius: 99 }} autoFocus value={newField} onChange={(e) => setNewField(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && addField()} placeholder="E.G. UNLOCK DATE" />
                  <span className="btnq sm pink" onClick={addField}>ADD</span>
                </span>
              ) : (
                <span className="chipq pink click" onClick={() => setAddingField(true)}>+ NEW FIELD</span>
              )}
            </div>
          </div>

          <div className="card">
            <h3>✨ AI BRAIN ENGINE <span className={`chipq end ${aiLive ? 'grn' : ''}`}>{aiLive ? `⚡ LIVE ${PROVIDER_DEFAULTS[state.ai.provider]?.label ?? ''}` : 'LOCAL MODE'}</span></h3>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              The ghostwriter works offline out of the box. Plug in any provider that fits your budget — keys are stored only in this browser.
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div className="lblq">PROVIDER</div>
                <select className="fieldq" value={aiDraft.provider} onChange={(e) => setAiDraft({ ...aiDraft, provider: e.target.value as AiProvider })}>
                  {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </div>
              {aiDraft.provider !== 'local' && (
                <div>
                  <div className="lblq">MODEL {PROVIDER_DEFAULTS[aiDraft.provider]?.model ? `(DEFAULT: ${PROVIDER_DEFAULTS[aiDraft.provider].model})` : ''}</div>
                  <input className="fieldq" value={aiDraft.model} onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })} placeholder={PROVIDER_DEFAULTS[aiDraft.provider]?.model || 'e.g. llama-3.3-70b'} />
                </div>
              )}
              {aiDraft.provider === 'custom' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="lblq">BASE URL (OPENAI-COMPATIBLE)</div>
                  <input className="fieldq" value={aiDraft.baseUrl} onChange={(e) => setAiDraft({ ...aiDraft, baseUrl: e.target.value })} placeholder="https://openrouter.ai/api/v1 · https://api.groq.com/openai/v1 · http://localhost:11434/v1" />
                </div>
              )}
              {aiDraft.provider !== 'local' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="lblq">API KEY{providerInfo.needsKey ? '' : ' (OPTIONAL)'}</div>
                  <input className="fieldq" type="password" value={aiDraft.apiKey} onChange={(e) => setAiDraft({ ...aiDraft, apiKey: e.target.value })} placeholder={aiDraft.provider === 'anthropic' ? 'sk-ant-…' : aiDraft.provider === 'openai' ? 'sk-…' : aiDraft.provider === 'gemini' ? 'AIza…' : 'sk-or-… / gsk_… / blank for Ollama'} />
                </div>
              )}
            </div>
            <div className="row between wrap" style={{ marginTop: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 11.5, color: 'var(--mut)' }}>{providerInfo.hint}</span>
              <span className="btnq sm pink" onClick={saveAi}>{aiSaved ? 'SAVED ✓' : 'SAVE ENGINE'}</span>
            </div>
          </div>

          <div className="card white">
            <h3>⛓ WALLET TRACKER <span className={`chipq end ${state.etherscanKey ? 'grn' : 'cy'}`}>{state.etherscanKey ? '⚡ FULL COVERAGE' : '⚡ KEYLESS MODE'}</span></h3>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              Open any raid and hit <b>⛓ SCAN</b> to pull real on-chain moves into the quest log instead of typing them. {KEYLESS_CHAINS} chains (Ethereum, Base, Arbitrum, Ink…) work with <b>no key at all</b> via public explorers; a free Etherscan key (etherscan.io → API Dashboard) extends coverage to {SCANNABLE_CHAINS} chains. Heads-up: BSC needs a paid Etherscan plan — their free tier excludes it.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="fieldq" style={{ flex: 1 }} type="password" value={scanKeyDraft}
                onChange={(e) => setScanKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveScanKey()}
                placeholder="Etherscan API key…"
              />
              <span className="btnq sm pink" onClick={saveScanKey}>{scanKeySaved ? 'SAVED ✓' : 'SAVE'}</span>
            </div>
          </div>
        </div>

        {/* right column — identities, sybil shield, trophy rules */}
        <div className="s5" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className={`card${sybil.some((f) => f.level === 'high') ? ' pinkish' : sybil.length ? '' : ' mint'}`}>
            <h3>🛡 SYBIL SHIELD {sybil.length === 0
              ? <span className="chipq grn end">✓ AIRTIGHT</span>
              : <span className={`chipq end ${sybil.some((f) => f.level === 'high') ? 'rose' : 'yel'}`}>{sybil.length} FINDING{sybil.length === 1 ? '' : 'S'}</span>}</h3>
            {sybil.length === 0 ? (
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                No identity leaks detected — no shared wallets, no cross-identity raids, no mistagged logs. Keep each persona's wallets, funding, and farms fully separate.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sybil.map((f, i) => (
                  <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <span className={`chipq ${f.level === 'high' ? 'rose' : 'yel'}`} style={{ flex: 'none' }}>{f.level === 'high' ? '🚨' : '⚠'}</span>
                    <span
                      style={{ fontWeight: 700, fontSize: 12.5, cursor: f.raidId ? 'pointer' : undefined, textDecoration: f.raidId ? 'underline' : undefined }}
                      onClick={() => f.raidId && ui.openRaid(f.raidId)}
                    >{f.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card white">
            <h3>🪪 IDENTITIES <span className="chipq end">CLICK ✏️ TO EDIT</span></h3>
            {state.identities.map((i) => {
              const wc = walletCount(i);
              const editing = editIdentId === i.id;
              return (
                <div key={i.id} style={editing ? { border: '2.5px solid var(--ink)', borderRadius: 12, padding: '8px 10px', marginBottom: 8 } : undefined}>
                  <div className="kv" style={editing ? { borderBottom: 'none' } : undefined}>
                    <span className="row" style={{ gap: 9 }}>
                      <span className={`chipq ${i.color}`}>{i.name}</span>
                      <b>{i.main ? 'main' : 'alt'}</b>
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--mut)' }}>{wc} WALLET{wc === 1 ? '' : 'S'}</span>
                      <span className="btnq sm" onClick={() => (editing ? setEditIdentId(null) : startEditIdentity(i))}>{editing ? 'DONE' : '✏️'}</span>
                    </span>
                  </div>
                  {editing && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <input
                          className="fieldq" style={{ flex: 1 }} value={identName}
                          onChange={(e) => setIdentName(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && saveIdentityName(i.id)}
                          onBlur={() => saveIdentityName(i.id)}
                          placeholder="Profile name"
                        />
                        {!i.main && <span className="btnq sm yel" onClick={() => makeMain(i.id)}>★ MAKE MAIN</span>}
                        {state.identities.length > 1 && <span className="btnq sm rose" onClick={() => deleteIdentity(i.id)}>🗑</span>}
                      </div>
                      {(i.addresses ?? []).map((a, idx) => (
                        <div key={idx} className="chipq" style={{ alignSelf: 'flex-start', maxWidth: '100%', wordBreak: 'break-all' }}>
                          👛 {a.length > 24 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a}{' '}
                          <span className="x" onClick={() => removeWallet(i.id, idx)}>✕</span>
                        </div>
                      ))}
                      <div className="row" style={{ gap: 8 }}>
                        <input
                          className="fieldq" style={{ flex: 1 }} value={newAddr}
                          onChange={(e) => setNewAddr(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addWallet(i.id)}
                          placeholder="0x… / sol… wallet address"
                        />
                        <span className="btnq sm pink" onClick={() => addWallet(i.id)}>+ WALLET</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {addingIdent ? (
              <div className="row" style={{ marginTop: 12 }}>
                <input className="fieldq" autoFocus value={newIdent} onChange={(e) => setNewIdent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addIdentity()} placeholder="e.g. GHOST" />
                <span className="btnq sm" onClick={addIdentity}>ADD</span>
              </div>
            ) : (
              <span className="btnq sm" style={{ marginTop: 12 }} onClick={() => setAddingIdent(true)}>+ ADD IDENTITY</span>
            )}
          </div>

          <div className="card">
            <h3>🏅 TROPHY RULES</h3>
            {state.trophyRules.map((r) => (
              <div key={r.id} className={`quest${r.done ? ' on' : ''}`}>
                <span className="cb" onClick={() => toggleRule(r.id)}>{r.done ? '✓' : ''}</span>
                <span className="t">{r.text}</span>
                <span className="xp">+{r.xp} XP</span>
              </div>
            ))}
            {addingRule ? (
              <div className="row" style={{ marginTop: 10 }}>
                <input className="fieldq" autoFocus value={newRule} onChange={(e) => setNewRule(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRule()} placeholder="e.g. 5 wins in a season" />
                <span className="btnq sm" onClick={addRule}>ADD</span>
              </div>
            ) : (
              <div className="quest" style={{ cursor: 'pointer', marginBottom: 0 }} onClick={() => setAddingRule(true)}>
                <span className="cb"></span>
                <span className="t" style={{ color: 'var(--mut)' }}>Define your own…</span>
                <span className="xp">+? XP</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
