import { useEffect, useState } from 'react';
import type { Raid } from '../types';

// Live token pricing via CoinGecko's free, keyless endpoint. Cached for
// 5 minutes per id set so screens can call the hook freely without
// hammering the API (free tier is ~30 req/min).

const TTL = 5 * 60 * 1000;

let cache: { ids: string; prices: Record<string, number>; at: number } | null = null;
let inflight: Promise<Record<string, number>> | null = null;

export async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
  const wanted = [...new Set(ids.map((i) => i.trim().toLowerCase()).filter(Boolean))].sort();
  if (wanted.length === 0) return {};
  const key = wanted.join(',');
  if (cache && cache.ids === key && Date.now() - cache.at < TTL) return cache.prices;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(key)}&vs_currencies=usd`);
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = (await res.json()) as Record<string, { usd?: number }>;
      const prices: Record<string, number> = {};
      for (const [id, v] of Object.entries(data)) {
        if (typeof v?.usd === 'number') prices[id] = v.usd;
      }
      cache = { ids: key, prices, at: Date.now() };
      return prices;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Prices for every raid that has a CoinGecko id attached. Failures resolve
// to {} — live pricing is a bonus layer, never a blocker.
export function useLivePrices(raids: Raid[]): Record<string, number> {
  const ids = raids.map((r) => r.token?.id ?? '').filter(Boolean);
  const key = [...new Set(ids)].sort().join(',');
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchPrices(key.split(','))
      .then((p) => { if (alive) setPrices(p); })
      .catch(() => { /* offline or rate-limited — UI just skips live values */ });
    return () => { alive = false; };
  }, [key]);

  return prices;
}

export function liveLootValue(raid: Raid, prices: Record<string, number>): number | null {
  if (!raid.token) return null;
  const price = prices[raid.token.id.trim().toLowerCase()];
  return typeof price === 'number' ? raid.token.qty * price : null;
}
