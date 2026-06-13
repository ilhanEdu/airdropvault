import { useEffect, type ReactNode } from 'react';

// Small input modal — cards stay clean, a ✏️ in the header opens one of these.
// Backdrop click or Esc closes it.
export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card white" style={{ width: 'min(540px, 94vw)', maxHeight: '82vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3>{title} <span className="end"><span className="btnq sm" onClick={onClose}>✕</span></span></h3>
        {children}
      </div>
    </div>
  );
}

// Streak/heatmap cells: count → cell class (white / yellow / pink)
export function Cells({ counts, columns }: { counts: number[]; columns: number }) {
  return (
    <div className="cells" style={{ gridTemplateColumns: `repeat(${columns},1fr)`, flex: 1 }}>
      {counts.map((c, i) => (
        <i key={i} className={c >= 2 ? 'f' : c === 1 ? 'g' : ''} />
      ))}
    </div>
  );
}

export function ScreenTitle({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="screenttl">
      <h1>{title}</h1>
      <span className="sub">{sub}</span>
      {children}
    </div>
  );
}

const dayMs = 86400000;
export function whenLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((+today - +that) / dayMs);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 0) return `TODAY · ${hm}`;
  if (diff === 1) return `YESTERDAY · ${hm}`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, ' ');
}

export function minutesLabel(min: number): string {
  if (min < 60) return `${min} MIN`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}H ${m}M` : `${h}H`;
}

// Proofs are stored verbatim (full URL / tx hash) — shorten only for display
export const isLink = (p: string): boolean => /^https?:\/\//i.test(p);
export const proofLabel = (p: string): string =>
  p.length > 28 ? `${p.slice(0, 14)}…${p.slice(-8)}` : p;

// Links display as what they are ("X POST", "TX PROOF"), not raw URLs —
// the full URL stays in the title tooltip and stays openable
export const linkLabel = (p: string): string => {
  if (!isLink(p)) return proofLabel(p);
  try {
    const h = new URL(p).hostname.replace(/^www\./, '');
    if (h === 'x.com' || h === 'twitter.com') return 'X POST';
    if (/scan\.|scan$|explorer|\.etherscan|etherscan\./.test(h) || /(ether|bsc|base|arb|polygon|snow|block|ink|line|opt)scan/.test(h)) return 'TX PROOF';
    if (h === 'github.com') return 'GITHUB';
    if (h === 'discord.com' || h === 'discord.gg') return 'DISCORD';
    if (h === 'medium.com' || h === 'mirror.xyz' || h === 'paragraph.xyz') return 'ARTICLE';
    if (h === 'youtube.com' || h === 'youtu.be') return 'VIDEO';
    return h.toUpperCase();
  } catch {
    return proofLabel(p);
  }
};
