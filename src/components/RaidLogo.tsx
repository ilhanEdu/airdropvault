import { useEffect, useMemo, useState } from 'react';
import type { Raid } from '../types';

const MONO_COLORS = ['#ff4fa3', '#48d6ff', '#ffd23e', '#15a35c', '#e8336e', '#8b5cf6', '#f97316', '#0ea5e9'];

export function logoSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// deterministic monogram color — shared with the canvas win card
export function monoColor(name: string): string {
  return MONO_COLORS[((name.charCodeAt(0) || 0) + name.length) % MONO_COLORS.length];
}

// same fallback chain the <RaidLogo> component walks — BASE_URL-aware so
// bundled logos resolve when the app is hosted under a subpath (GitHub Pages)
export function logoCandidates(raid: { name: string; logo?: string }): string[] {
  const slug = logoSlug(raid.name);
  const base = import.meta.env.BASE_URL || '/';
  return [...(raid.logo ? [raid.logo] : []), `${base}logos/${slug}.png`, `${base}logos/${slug}.svg`];
}

// Tries the raid's explicit logo, then /logos/<slug>.png, then .svg,
// and finally renders a monogram tile so cards never look broken.
export function RaidLogo({ raid, size = 38 }: { raid: Raid; size?: number }) {
  const candidates = useMemo(() => logoCandidates(raid), [raid.logo, raid.name]);
  const [idx, setIdx] = useState(0);

  // a freshly uploaded logo changes the candidate list — try it from the top
  useEffect(() => setIdx(0), [candidates]);

  const style = { width: size, height: size, borderRadius: Math.round(size * 0.32) };

  if (idx >= candidates.length) {
    const color = monoColor(raid.name);
    return (
      <span className="plogo mono" style={{ ...style, background: color, fontSize: size * 0.52 }}>
        {raid.name[0]?.toUpperCase() ?? '?'}
      </span>
    );
  }

  return (
    <img
      className="plogo"
      style={style}
      src={candidates[idx]}
      alt={`${raid.name} logo`}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
