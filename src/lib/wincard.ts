import type { LogEntry, Raid } from '../types';
import { fmtMoney } from './stats';
import { logoCandidates, monoColor } from '../components/RaidLogo';

// Shareable win card — a 1200×675 PNG (X/Twitter-native 16:9) drawn on a
// canvas in the app's quest style. PnL-sensitive: a confirmed win gets the
// green stamp, mint loot banner, and confetti; a red raid stays honest.
// The protocol's real logo (or its monogram tile) sits top-right.

const INK = '#16122b';
const PAPER = '#fff7e8';
const PINK = '#ff4fa3';
const ROSE = '#e8336e';
const YELLOW = '#ffd23e';
const GREEN = '#15a35c';
const MINT = '#c9f2da';
const WHITE = '#fffdf7';
const MUT = '#6b6390';
const CONFETTI = [PINK, YELLOW, '#48d6ff', GREEN, ROSE];

const W = 1200;
const H = 675;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// chunky tile with the hard offset shadow the whole UI uses
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, shadow = 8, r = 18) {
  ctx.fillStyle = INK;
  roundRect(ctx, x + shadow, y + shadow, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

const display = (px: number) => `${px}px 'Lilita One', 'Arial Black', sans-serif`;
const body = (px: number, weight = 800) => `${weight} ${px}px 'Rubik', 'Arial', sans-serif`;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// walk the same fallback chain as <RaidLogo>: explicit logo → /logos/<slug>
async function loadLogo(raid: Raid): Promise<HTMLImageElement | null> {
  for (const src of logoCandidates(raid)) {
    const img = await loadImage(src);
    if (img) return img;
  }
  return null;
}

// the protocol logo as a big tilted tile, image cover-fit or monogram letter
function drawLogoTile(ctx: CanvasRenderingContext2D, raid: Raid, img: HTMLImageElement | null, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  const half = size / 2;
  tile(ctx, -half, -half, size, size, img ? WHITE : monoColor(raid.name), 9, Math.round(size * 0.22));
  if (img) {
    ctx.save();
    roundRect(ctx, -half + 4, -half + 4, size - 8, size - 8, Math.round(size * 0.18));
    ctx.clip();
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    ctx.font = display(Math.round(size * 0.52));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = raid.name[0]?.toUpperCase() ?? '?';
    ctx.strokeText(letter, 0, 6);
    ctx.fillText(letter, 0, 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

// celebration specks for wins — deterministic so the same raid renders the same card
function drawConfetti(ctx: CanvasRenderingContext2D, seed: number) {
  for (let i = 0; i < 18; i++) {
    const r1 = ((seed + i * 137) % 100) / 100;
    const r2 = ((seed + i * 211) % 100) / 100;
    // keep specks in the margins so they never collide with text
    const x = i % 2 === 0 ? 40 + r1 * 240 + (i % 4 === 0 ? 760 : 0) : 880 + r1 * 280;
    const y = 30 + r2 * (i % 3 === 0 ? 120 : 590);
    const s = 9 + (i % 3) * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r1 * 3);
    ctx.fillStyle = CONFETTI[i % CONFETTI.length];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
  }
}

export async function drawWinCard(raid: Raid, entries: LogEntry[]): Promise<Blob> {
  // fonts + logo load in parallel before drawing
  const [logo] = await Promise.all([
    loadLogo(raid),
    document.fonts.ready.catch(() => undefined),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const ordered = [...entries].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const minutes = ordered.reduce((n, e) => n + e.minutes, 0);
  const hours = Math.round(minutes / 60);
  const m = raid.money;
  const net = m.looted - m.spent;
  const won = m.looted > 0;
  const inProfit = won && net >= 0;
  const roiText = m.spent > 0 ? `${Math.round((net / m.spent) * 100)}%` : won ? '∞' : '0%';
  const days = ordered.length >= 2
    ? Math.max(1, Math.round((Date.parse(ordered[ordered.length - 1].date) - Date.parse(ordered[0].date)) / 86400000))
    : ordered.length;

  // paper background + fat frame; profitable wins get a mint-washed paper
  ctx.fillStyle = won ? '#eefaf0' : PAPER;
  ctx.fillRect(0, 0, W, H);
  // faint diagonal stripes like the app background
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (let x = -H; x < W + H; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H * 0.7, H);
    ctx.stroke();
  }
  ctx.restore();
  if (won) drawConfetti(ctx, raid.name.length * 31 + (raid.name.charCodeAt(0) || 7));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, W - 14, H - 14);

  // protocol logo — big, tilted, top-right
  drawLogoTile(ctx, raid, logo, W - 160, 160, 168);

  // stamp — tilted chip, top-left; copy + color follow the PnL
  const stamp = won
    ? { text: '🏆 LOOT DROPPED!', bg: GREEN, fg: WHITE }
    : net < 0
      ? { text: '⚔️ RAID IN PROGRESS', bg: YELLOW, fg: INK }
      : { text: '⚔️ RAID REPORT', bg: WHITE, fg: INK };
  ctx.save();
  ctx.translate(78, 96);
  ctx.rotate(-0.06);
  ctx.font = body(26, 900);
  const sw = ctx.measureText(stamp.text).width + 48;
  tile(ctx, -24, -30, sw, 58, stamp.bg, 6);
  ctx.fillStyle = stamp.fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(stamp.text, 0, 2);
  ctx.restore();

  // raid name + sub
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = display(92);
  ctx.fillText(raid.name.toUpperCase().slice(0, 14), 64, 235);
  ctx.font = body(24, 800);
  ctx.fillStyle = MUT;
  ctx.fillText(`${raid.chain.toUpperCase()} · ${raid.narrative} · ${ordered.length} MOVES · ${days} DAYS IN THE TRENCHES`, 66, 280);

  // loot banner
  if (won) {
    ctx.font = display(54);
    const lootText = `${m.lootLabel}  ·  ${fmtMoney(m.looted)}`;
    const lw = Math.min(ctx.measureText(lootText).width + 72, W - 320);
    tile(ctx, 64, 318, lw, 96, MINT);
    ctx.fillStyle = GREEN;
    ctx.fillText('▲', 96, 384);
    ctx.fillStyle = INK;
    ctx.fillText(lootText, 146, 384);
  } else {
    ctx.font = display(44);
    const pendText = `${m.lootLabel} — STILL FARMING`;
    const lw = Math.min(ctx.measureText(pendText).width + 64, W - 320);
    tile(ctx, 64, 318, lw, 96, WHITE);
    ctx.fillStyle = INK;
    ctx.fillText(pendText, 96, 380);
  }

  // stat tiles — values carry the PnL colors
  const stats: { label: string; value: string; fill: string; color: string }[] = [
    { label: 'SPENT', value: fmtMoney(-m.spent), fill: WHITE, color: m.spent > 0 ? ROSE : INK },
    { label: 'LOOTED', value: fmtMoney(m.looted), fill: won ? MINT : WHITE, color: won ? GREEN : INK },
    { label: 'NET', value: fmtMoney(net, true), fill: net > 0 ? MINT : net < 0 ? '#ffe0ed' : WHITE, color: net > 0 ? GREEN : net < 0 ? ROSE : INK },
    { label: 'ROI', value: roiText, fill: inProfit ? YELLOW : WHITE, color: net < 0 ? ROSE : net > 0 ? GREEN : INK },
    { label: 'HOURS', value: `${hours}h`, fill: WHITE, color: INK },
  ];
  const gap = 24;
  const tw = (W - 128 - gap * (stats.length - 1)) / stats.length;
  stats.forEach((s, i) => {
    const x = 64 + i * (tw + gap);
    tile(ctx, x, 452, tw, 124, s.fill);
    ctx.fillStyle = MUT;
    ctx.font = body(17, 900);
    ctx.fillText(s.label, x + 22, 488);
    ctx.fillStyle = s.color;
    ctx.font = display(42);
    ctx.fillText(s.value.slice(0, 9), x + 22, 548);
  });

  // footer — the $ mark, drawn like the app logo
  ctx.save();
  ctx.translate(84, 622);
  ctx.rotate(-0.07);
  tile(ctx, -19, -19, 38, 38, PINK, 4, 12);
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.font = display(26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('$', 0, 2);
  ctx.fillText('$', 0, 2);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = display(22);
  ctx.fillStyle = INK;
  ctx.fillText('AIRDROP VAULT', 122, 631);
  ctx.font = body(17, 700);
  ctx.fillStyle = MUT;
  ctx.fillText('— receipts tracked from day one', 308, 631);
  // every shared card carries the way home
  ctx.textAlign = 'right';
  ctx.font = body(16, 800);
  ctx.fillStyle = MUT;
  ctx.fillText('github.com/ilhanEdu/airdropvault', W - 64, 631);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

export async function downloadWinCard(raid: Raid, entries: LogEntry[]): Promise<void> {
  const blob = await drawWinCard(raid, entries);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${raid.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-win-card.png`;
  a.click();
  URL.revokeObjectURL(a.href);
}
