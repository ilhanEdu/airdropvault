import type { AppState } from '../types';

// Sybil hygiene — the checks a paranoid farmer runs in their head, automated.
// Identities are supposed to be airtight compartments; these findings flag
// every place two personas touch the same wallet, raid, or log.

export interface SybilFinding {
  level: 'high' | 'med';
  text: string;
  raidId?: string; // set when the finding points at one raid
}

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function sybilFindings(state: AppState): SybilFinding[] {
  const findings: SybilFinding[] = [];
  const idName = (id: string) => state.identities.find((i) => i.id === id)?.name ?? '?';

  // 1 — the cardinal sin: one wallet address attached to two identities
  const owners = new Map<string, string[]>(); // lowercased address → identity names
  for (const ident of state.identities) {
    for (const a of ident.addresses ?? []) {
      const k = a.trim().toLowerCase();
      if (!k) continue;
      owners.set(k, [...(owners.get(k) ?? []), ident.name]);
    }
  }
  for (const [addr, names] of owners) {
    if (names.length > 1) {
      findings.push({
        level: 'high',
        text: `Wallet ${short(addr)} is attached to ${names.join(' AND ')} — one address can't serve two identities. Split it now.`,
      });
    }
  }

  // 2 — multiple identities farming the same raid: linkable if the protocol
  // ever cross-references wallets (same IP, same funding path, same timing)
  for (const raid of state.raids) {
    if (raid.identityIds.length > 1) {
      findings.push({
        level: 'med',
        raidId: raid.id,
        text: `${raid.name} is farmed by ${raid.identityIds.map(idName).join(' + ')} — fine if wallets/funding never touch, but it's your most linkable surface.`,
      });
    }
  }

  // 3 — a log entry filed under an identity that isn't assigned to the raid:
  // either the tag is wrong or a persona just leaked into the wrong farm
  const flagged = new Set<string>();
  for (const e of state.entries) {
    const raid = state.raids.find((r) => r.id === e.raidId);
    if (!raid || raid.identityIds.length === 0) continue;
    if (!raid.identityIds.includes(e.identityId)) {
      const key = `${raid.id}:${e.identityId}`;
      if (flagged.has(key)) continue;
      flagged.add(key);
      findings.push({
        level: 'med',
        raidId: raid.id,
        text: `${raid.name} has moves logged as ${idName(e.identityId)}, but that identity isn't assigned to the raid — mistag or cross-contamination?`,
      });
    }
  }

  return findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
}
