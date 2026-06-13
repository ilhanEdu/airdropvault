// Wallet scanner — reads public tx history, nothing is signed or sent.
//
// Two sources per chain, tried in order:
//   1. Etherscan V2 multichain (needs the user's free key; some chains —
//      BSC, Base, Optimism, Avalanche — are paid-plan only there)
//   2. A keyless Etherscan-compatible public explorer (Blockscout /
//      Routescan) — free, CORS-open, no key at all
// So most chains scan with zero setup, and the key upgrades coverage.

export interface ScannedTx {
  hash: string;
  date: string; // ISO
  method: string; // decoded function name, or TRANSFER IN/OUT
  direction: 'in' | 'out' | 'self';
  valueEth: number; // native coin amount
  failed: boolean;
}

interface ScanChain {
  name: string; // display name (select options)
  id: number; // EVM chain id (Etherscan V2 chainid)
  aliases: string[]; // how it might be typed on a raid
  etherscan: 'free' | 'paid' | null; // V2 tier; null = not on Etherscan at all
  fallback?: string; // keyless Etherscan-compatible API base
}

const CHAINS: ScanChain[] = [
  { name: 'Ethereum', id: 1, aliases: ['ethereum', 'eth', 'mainnet'], etherscan: 'free', fallback: 'https://eth.blockscout.com/api' },
  { name: 'Base', id: 8453, aliases: ['base'], etherscan: 'paid', fallback: 'https://base.blockscout.com/api' },
  { name: 'Arbitrum', id: 42161, aliases: ['arbitrum', 'arbitrum one', 'arb'], etherscan: 'free', fallback: 'https://arbitrum.blockscout.com/api' },
  { name: 'Optimism', id: 10, aliases: ['optimism', 'op'], etherscan: 'paid', fallback: 'https://explorer.optimism.io/api' },
  { name: 'Polygon', id: 137, aliases: ['polygon', 'matic'], etherscan: 'free', fallback: 'https://polygon.blockscout.com/api' },
  { name: 'BSC', id: 56, aliases: ['bsc', 'bnb', 'bnb chain', 'binance'], etherscan: 'paid' },
  { name: 'Avalanche', id: 43114, aliases: ['avalanche', 'avax'], etherscan: 'paid', fallback: 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api' },
  { name: 'zkSync', id: 324, aliases: ['zksync', 'zksync era'], etherscan: null, fallback: 'https://zksync.blockscout.com/api' },
  { name: 'Ink', id: 57073, aliases: ['ink'], etherscan: null, fallback: 'https://explorer.inkonchain.com/api' },
  { name: 'Gnosis', id: 100, aliases: ['gnosis'], etherscan: 'free', fallback: 'https://gnosis.blockscout.com/api' },
  { name: 'Linea', id: 59144, aliases: ['linea'], etherscan: 'free' },
  { name: 'Blast', id: 81457, aliases: ['blast'], etherscan: 'free' },
  { name: 'Mantle', id: 5000, aliases: ['mantle'], etherscan: 'free' },
  { name: 'Berachain', id: 80094, aliases: ['berachain', 'bera'], etherscan: 'free' },
  { name: 'Sonic', id: 146, aliases: ['sonic'], etherscan: 'free' },
  { name: 'Unichain', id: 130, aliases: ['unichain'], etherscan: 'free' },
  { name: 'Celo', id: 42220, aliases: ['celo'], etherscan: 'free' },
  { name: 'Fraxtal', id: 252, aliases: ['fraxtal'], etherscan: 'free' },
  { name: 'Taiko', id: 167000, aliases: ['taiko'], etherscan: 'free' },
  { name: 'World Chain', id: 480, aliases: ['world chain', 'worldchain'], etherscan: 'free' },
  { name: 'Abstract', id: 2741, aliases: ['abstract'], etherscan: 'free' },
  { name: 'HyperEVM', id: 999, aliases: ['hyperevm', 'hyperliquid'], etherscan: 'free' },
  { name: 'Moonbeam', id: 1284, aliases: ['moonbeam'], etherscan: 'free' },
  { name: 'opBNB', id: 204, aliases: ['opbnb'], etherscan: 'free' },
];

export const SCAN_CHAINS = CHAINS.map((c) => c.name);
export const SCANNABLE_CHAINS = CHAINS.length;
export const KEYLESS_CHAINS = CHAINS.filter((c) => c.fallback).length;

// "Multi" on a raid means multiple chains, not a chain name — callers
// should ask the user which specific chain to scan
export function isMultiChain(chainName: string): boolean {
  return /^(multi|multichain|multi-chain|multiple|omni|omnichain|cross-chain|crosschain|various|all|any)$/i.test(chainName.trim());
}

export function findChain(chainName: string): ScanChain | null {
  const k = chainName.trim().toLowerCase();
  return CHAINS.find((c) => c.name.toLowerCase() === k || c.aliases.includes(k)) ?? null;
}

// best chain to preselect in the scan picker for a raid
export function defaultScanChain(chainName: string): string {
  if (isMultiChain(chainName)) return 'Ethereum';
  return findChain(chainName)?.name ?? 'Ethereum';
}

interface ExplorerTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  functionName?: string;
  isError?: string;
}

function methodLabel(tx: ExplorerTx, direction: ScannedTx['direction']): string {
  const fn = (tx.functionName ?? '').split('(')[0].trim();
  if (fn) return fn.replace(/_/g, ' ').toUpperCase();
  if (direction === 'in') return 'TRANSFER IN';
  if (direction === 'self') return 'SELF TX';
  return 'TRANSFER OUT';
}

// handles both Etherscan ({status, message, result}) and Blockscout
// ({message, result}) shapes — result is an array when the call worked
async function fetchTxs(url: string, me: string): Promise<ScannedTx[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`explorer responded ${res.status}`);
  const data = (await res.json()) as { status?: string; message?: string; result: ExplorerTx[] | string | null };
  if (!Array.isArray(data.result)) {
    const msg = typeof data.result === 'string' ? data.result : data.message || 'explorer error';
    if (/no transactions/i.test(msg)) return [];
    throw new Error(msg);
  }
  return data.result.map((tx) => {
    const from = (tx.from ?? '').toLowerCase();
    const to = (tx.to ?? '').toLowerCase();
    const direction: ScannedTx['direction'] = from === me && to === me ? 'self' : from === me ? 'out' : 'in';
    return {
      hash: tx.hash,
      date: new Date(Number(tx.timeStamp) * 1000).toISOString(),
      method: methodLabel(tx, direction),
      direction,
      valueEth: Number(tx.value) / 1e18,
      failed: tx.isError === '1',
    };
  });
}

export async function scanWallet(address: string, chainName: string, apiKey: string, limit = 25): Promise<ScannedTx[]> {
  const addr = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) throw new Error('Not a valid EVM address (0x… 40 hex chars). Solana/other chains aren\'t scannable yet.');
  if (isMultiChain(chainName)) throw new Error('This raid is multi-chain — pick the specific chain to scan from the dropdown.');
  const chain = findChain(chainName);
  if (!chain) throw new Error(`"${chainName}" isn't in the chain map yet — pick one of the ${SCANNABLE_CHAINS} supported chains from the dropdown.`);

  const key = apiKey.trim();
  const params = `module=account&action=txlist&address=${addr}&page=1&offset=${limit}&sort=desc`;
  const sources: { url: string; label: string }[] = [];
  if (chain.etherscan && key) {
    sources.push({ url: `https://api.etherscan.io/v2/api?chainid=${chain.id}&${params}&apikey=${encodeURIComponent(key)}`, label: 'Etherscan' });
  }
  if (chain.fallback) {
    sources.push({ url: `${chain.fallback}?${params}`, label: 'public explorer' });
  }
  if (sources.length === 0) {
    throw new Error(
      chain.etherscan
        ? `${chain.name} needs an Etherscan API key${chain.etherscan === 'paid' ? ' on a PAID plan (their free tier excludes it), and no free public explorer covers it yet' : ' — add a free one in VAULT → WALLET TRACKER'}.`
        : `${chain.name} has no scannable explorer yet.`,
    );
  }

  const errors: string[] = [];
  for (const s of sources) {
    try {
      return await fetchTxs(s.url, addr.toLowerCase());
    } catch (err) {
      errors.push(`${s.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(errors.join(' · '));
}
