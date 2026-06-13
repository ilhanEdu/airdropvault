import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { kindLabel, search, type SearchResult } from '../lib/search';

export function Search() {
  const { state } = useStore();
  const ui = useUi();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => search(state, query), [state, query]);

  // Cmd/Ctrl+K focuses the bar from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // click-away closes the palette
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  function choose(r: SearchResult) {
    if (r.raidId) {
      ui.openRaid(r.raidId, r.entryId); // entryId → detail scrolls to & flashes that log row
    } else {
      ui.go(r.screen);
    }
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
  }

  // keep the active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const showPalette = open && query.trim().length > 0;

  return (
    <div className="searchwrap" ref={wrapRef}>
      <div className="searchbar">
        <span className="ico">🔎</span>
        <input
          ref={inputRef}
          value={query}
          placeholder="Search anything…"
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {query
          ? <span className="kbd clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>✕</span>
          : <span className="kbd">⌘K</span>}
      </div>

      {showPalette && (
        <div className="searchpop" ref={listRef}>
          {results.length === 0 && (
            <div className="searchempty">No matches for “{query}”.</div>
          )}
          {results.map((r, i) => (
            <div
              key={r.id}
              data-i={i}
              className={`searchrow${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(r); }}
            >
              <span className="ri">{r.icon}</span>
              <span className="rmain">
                <span className="rtitle">{r.title}</span>
                <span className="rsub">{r.subtitle}</span>
              </span>
              {r.badge && <span className="rbadge">{r.badge}</span>}
              <span className="rkind">{kindLabel(r.kind)}</span>
            </div>
          ))}
          {results.length > 0 && (
            <div className="searchfoot">↑↓ move · ↵ open · esc close</div>
          )}
        </div>
      )}
    </div>
  );
}
