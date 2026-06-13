import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig, AppState, BrainAngle, BrainDraftPost, BrainFormat, LogEntry, Raid } from '../types';
import { fmtMoney } from './stats';

export interface BrainRequest {
  entry: LogEntry;
  raid: Raid;
  format: BrainFormat;
  angle: BrainAngle;
  state: AppState;
  seed: number; // reroll variance
  dossier?: string; // win mode — the raid's full contribution record (markdown)
}

// ---------------------------------------------------------------------------
// Local ghostwriter — template-based, shaped by the voice dials & memory bank.
// Works fully offline; the Claude path below replaces it when a key is set.
// ---------------------------------------------------------------------------

const pick = <T,>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];

export function generateLocal(req: BrainRequest): BrainDraftPost[] {
  if (req.dossier) return generateLocalWin(req);
  const { entry, raid, format, angle, state, seed } = req;
  const v = state.voice;
  const degen = v.tone < 50;
  const emoji = (...es: string[]) => {
    if (v.emoji < 15) return '';
    const n = v.emoji > 70 ? 2 : 1;
    return ' ' + es.slice(0, n).join('');
  };
  const signOff = state.memory.find((m) => m.includes('sign-off')) ? ' 🫡' : '';
  const cost = entry.cost > 0 ? fmtMoney(-entry.cost) : '$0';
  const chainTag = raid.chain;
  const verb = degen ? pick(['aped', 'threw', 'degened'], seed) : pick(['allocated', 'deployed', 'committed'], seed);

  const hooks: Record<BrainAngle, string[]> = {
    alpha: [
      `${verb} into ${raid.name} to farm ${raid.narrative.toLowerCase()} on ${chainTag} before everyone wakes up${emoji('👀')} here's the exact play + what it cost me${format === 'thread' ? ' 🧵' : ''}`,
      `quietly farming ${raid.name} (${raid.sub.toLowerCase()}) — ${degen ? 'this one smells like a real drop' : 'the setup looks asymmetric'}${emoji('🤫', '👀')}`,
    ],
    story: [
      `day in the life of an airdrop farmer: ${entry.what.toLowerCase()}${emoji('😅')}`,
      `so I ${degen ? 'did a thing' : 'made a move'} on ${raid.name} today — ${entry.what.toLowerCase()}`,
    ],
    tutorial: [
      `how to position for a ${raid.name} drop in ${v.length > 50 ? 'detail' : '5 minutes'} — step by step${format === 'thread' ? ' 🧵' : ''}${emoji('📚')}`,
      `${raid.name} farming guide: what I actually did, what it cost, what to skip${emoji('🛠')}`,
    ],
    hottake: [
      `unpopular opinion: most people farming ${raid.narrative.toLowerCase()} are doing it wrong. ${raid.name} is the exception${emoji('🌶')}`,
      `${raid.name} will filter the lazy farmers and that's exactly why it'll pay${emoji('🔥')}`,
    ],
  };

  const receipts = `${entry.what}. ${entry.cost > 0 ? `burnt ${cost} doing it` : 'cost me nothing'}${entry.minutes >= 60 ? ` over ~${Math.round(entry.minutes / 60)}h` : ''} — ${degen ? 'real activity the team actually weights:' : 'verifiable on-chain activity the team weights:'}`;

  const why = raid.brief.why || `${raid.brief.investors !== '—' ? `${raid.brief.investors}-backed, ` : ''}${raid.narrative.toLowerCase()} on ${chainTag}.`;
  const whyLine = `${why} ${degen ? 'quality > spray.' : 'Focused effort beats spreading thin.'} NFA, I just log everything${signOff}`;

  const spiceCap = v.spice > 60 ? (s: string) => s : (s: string) => s.replace(/before everyone wakes up/g, 'early');

  if (format === 'single') {
    return [{
      tag: 'SINGLE POST',
      text: spiceCap(`${pick(hooks[angle], seed)}\n\n${receipts}\n\n${whyLine}`),
      proof: entry.proofs[0],
    }];
  }

  if (format === 'longform') {
    return [{
      tag: 'LONG-FORM',
      text: spiceCap(
        `# ${raid.name}: ${angle === 'tutorial' ? 'the playbook' : 'why I’m farming it'}\n\n` +
        `${pick(hooks[angle], seed)}\n\n## The move\n${receipts}\n\n` +
        `## The thesis\n${why}\n\n## Cost so far\n${fmtMoney(-raid.money.spent)} spent · ${fmtMoney(raid.money.staked)} staked · loot ${raid.money.looted > 0 ? raid.money.lootLabel : 'pending'}.\n\n${whyLine}`,
      ),
      proof: entry.proofs[0],
    }];
  }

  const posts: BrainDraftPost[] = [
    { tag: '1/4 · HOOK', text: spiceCap(pick(hooks[angle], seed)) },
    { tag: '2/4 · RECEIPTS', text: receipts, proof: entry.proofs[0] ?? 'AUTO-ATTACHED PROOF SCREENSHOT' },
    { tag: '3/4 · WHY IT MATTERS', text: whyLine },
    {
      tag: '4/4 · CTA',
      text: degen
        ? `tracking every raid in my vault — costs, loot, the Ls too. follow if you want the receipts${emoji('📒')}${signOff}`
        : `I track every position — cost, time, and outcome. Follow along for the honest numbers${signOff}`,
    },
  ];
  return v.length < 35 ? posts.slice(0, 3) : posts;
}

// Win mode without a live provider — a grounded eligibility/win recap built
// from the raid's real totals (the dossier itself is the receipts).
function generateLocalWin(req: BrainRequest): BrainDraftPost[] {
  const { raid, format, state, seed } = req;
  const v = state.voice;
  const degen = v.tone < 50;
  const entries = state.entries.filter((e) => e.raidId === raid.id);
  const minutes = entries.reduce((n, e) => n + e.minutes, 0);
  const hours = Math.max(1, Math.round(minutes / 60));
  const won = raid.money.looted > 0;
  const signOff = state.memory.find((m) => m.includes('sign-off')) ? ' 🫡' : '';

  const hook = won
    ? pick([
        `${raid.name} airdrop just hit. ${raid.money.lootLabel} for ${entries.length} logged moves over ~${hours}h${degen ? ' — farming pays when you actually show up' : ' of focused effort'}.`,
        `it finally dropped: ${raid.name} paid out ${raid.money.lootLabel}. full receipts below — every move logged${degen ? ', the Ls too' : ''}.`,
      ], seed)
    : pick([
        `eligibility confirmed for ${raid.name}. ${entries.length} contributions, ${fmtMoney(-raid.money.spent)} spent, ~${hours}h invested — here's exactly how I positioned.`,
        `made the ${raid.name} snapshot. the playbook: ${entries.length} logged moves on ${raid.chain}, ${fmtMoney(-raid.money.spent)} all-in.`,
      ], seed);

  const receipts = `the numbers: ${fmtMoney(-raid.money.spent)} spent · ${fmtMoney(raid.money.staked)} staked · ${entries.length} moves · ~${hours}h grinding ${raid.narrative.toLowerCase()} on ${raid.chain}. every single one logged with proof.`;
  const lesson = degen
    ? `lesson: pick a narrative, log everything, touch the protocol like you mean it. quality > spray${signOff}`
    : `Takeaway: consistent, verifiable activity on one thesis beats spreading thin. Track everything — the dossier writes the win post for you${signOff}`;

  if (format === 'single') return [{ tag: 'SINGLE POST', text: `${hook}\n\n${receipts}\n\n${lesson}` }];
  if (format === 'longform') {
    return [{
      tag: 'LONG-FORM',
      text: `# ${raid.name}: ${won ? 'the payout' : 'eligibility locked'} — full breakdown\n\n${hook}\n\n## Receipts\n${receipts}\n\n## What actually mattered\n${raid.brief.why || raid.sub}\n\n${lesson}`,
    }];
  }
  return [
    { tag: '1/3 · HOOK', text: hook },
    { tag: '2/3 · RECEIPTS', text: receipts, proof: entries.find((e) => e.proofs.length)?.proofs[0] },
    { tag: '3/3 · LESSON', text: lesson },
  ];
}

// ---------------------------------------------------------------------------
// Live model path — provider configured in Vault → AI Brain Engine.
// Calls run directly from the browser (local personal tool; keys stay on-device).
// ---------------------------------------------------------------------------

export const PROVIDER_DEFAULTS: Record<string, { model: string; label: string }> = {
  anthropic: { model: 'claude-sonnet-4-6', label: 'CLAUDE' },
  openai: { model: 'gpt-4o-mini', label: 'CHATGPT' },
  gemini: { model: 'gemini-2.0-flash', label: 'GEMINI' },
  custom: { model: '', label: 'CUSTOM' },
};

function buildPrompts(req: BrainRequest): { system: string; user: string } {
  const { entry, raid, format, angle, state } = req;
  const v = state.voice;

  const formatSpec =
    format === 'thread' ? 'an X (Twitter) thread of 3-4 posts'
    : format === 'single' ? 'a single X (Twitter) post'
    : 'a long-form post (markdown, ~300 words)';

  const skills = state.skillFiles.filter((f) => f.content.trim());
  const skillBlock = skills.length
    ? '\nStyle guides written by the author — follow them strictly:\n' +
      skills.map((f) => `--- ${f.name} ---\n${f.content.slice(0, 2500)}`).join('\n')
    : '';

  const system = [
    'You ghostwrite crypto-twitter content for an airdrop farmer. Write in their voice:',
    `- Tone: ${v.tone < 35 ? 'full degen, lowercase, casual' : v.tone < 65 ? 'casual but sharp' : 'professional, measured'}`,
    `- Length: ${v.length < 35 ? 'punchy, short lines' : v.length < 65 ? 'balanced' : 'deep, detailed'}`,
    `- Emoji: ${v.emoji < 25 ? 'none' : v.emoji < 60 ? 'sparing' : 'heavy'}`,
    `- Hook spice: ${v.spice < 35 ? 'subtle' : v.spice < 65 ? 'medium' : 'maximum — bold claims, curiosity gaps'}`,
    `Facts about the author: ${state.memory.join('; ')}.`,
    'Never invent numbers — only use the figures provided. Always end the final post respecting the sign-off habit if one exists.',
    'Output ONLY the post text. Separate multiple posts with a line containing exactly "---". No preamble, no labels.',
  ].join('\n') + skillBlock;

  // Win mode: the model gets the protocol's entire contribution record and
  // writes the eligibility/payout post from the full history, not one move.
  const user = req.dossier
    ? [
        `The author just ${raid.money.looted > 0 ? `received the ${raid.name} airdrop (${raid.money.lootLabel})` : `confirmed eligibility for the ${raid.name} airdrop`}.`,
        `Write ${formatSpec} with a "${angle}" angle announcing it. Ground every claim in the full contribution dossier below — use its real numbers, dates, and timeline of moves. Tell the story of the grind: what was done, what it cost, what paid off.`,
        '',
        '--- FULL CONTRIBUTION DOSSIER ---',
        req.dossier.slice(0, 14000),
      ].join('\n')
    : [
        `Write ${formatSpec} with a "${angle}" angle about this logged contribution:`,
        `Project: ${raid.name} (${raid.sub}) on ${raid.chain}, narrative ${raid.narrative}.`,
        `Thesis: ${raid.brief.why || 'n/a'}. Investors: ${raid.brief.investors}.`,
        `What I did: ${entry.what}. Why: ${entry.why || 'n/a'}. Cost: $${entry.cost}. Time: ${entry.minutes} min.`,
        `Project totals: spent $${raid.money.spent}, staked $${raid.money.staked}, loot ${raid.money.looted > 0 ? raid.money.lootLabel : 'pending'}.`,
      ].join('\n');

  return { system, user };
}

async function callAnthropic(system: string, user: string, ai: AiConfig): Promise<string> {
  const client = new Anthropic({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: ai.model || PROVIDER_DEFAULTS.anthropic.model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// OpenAI and any OpenAI-compatible endpoint (OpenRouter, Groq, Ollama, …)
async function callOpenAICompatible(system: string, user: string, ai: AiConfig): Promise<string> {
  const base = (ai.provider === 'openai' ? 'https://api.openai.com/v1' : ai.baseUrl).replace(/\/+$/, '');
  if (!base) throw new Error('Set a base URL for the custom provider (e.g. https://openrouter.ai/api/v1)');
  const model = ai.model || (ai.provider === 'openai' ? PROVIDER_DEFAULTS.openai.model : '');
  if (!model) throw new Error('Set a model name for the custom provider');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ai.apiKey) headers.Authorization = `Bearer ${ai.apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2048,
    }),
  });
  if (!res.ok) throw new Error(`${ai.provider === 'openai' ? 'OpenAI' : 'API'} error ${res.status}: ${(await res.text()).slice(0, 140)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from model');
  return text.trim();
}

async function callGemini(system: string, user: string, ai: AiConfig): Promise<string> {
  const model = ai.model || PROVIDER_DEFAULTS.gemini.model;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ai.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 140)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

export async function generateRemote(req: BrainRequest, ai: AiConfig): Promise<BrainDraftPost[]> {
  const { system, user } = buildPrompts(req);
  let text: string;
  switch (ai.provider) {
    case 'anthropic': text = await callAnthropic(system, user, ai); break;
    case 'openai':
    case 'custom': text = await callOpenAICompatible(system, user, ai); break;
    case 'gemini': text = await callGemini(system, user, ai); break;
    default: throw new Error('No live provider configured');
  }

  const { entry, format } = req;
  const parts = text.split(/\n-{3,}\n/).map((p) => p.trim()).filter(Boolean);
  if (format === 'thread') {
    return parts.map((p, i) => ({
      tag: `${i + 1}/${parts.length}${i === 0 ? ' · HOOK' : i === 1 ? ' · RECEIPTS' : ''}`,
      text: p,
      proof: i === 1 ? entry.proofs[0] ?? 'AUTO-ATTACHED PROOF SCREENSHOT' : undefined,
    }));
  }
  return [{ tag: format === 'single' ? 'SINGLE POST' : 'LONG-FORM', text: parts.join('\n\n'), proof: entry.proofs[0] }];
}
