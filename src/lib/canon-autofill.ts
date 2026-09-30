// ========== AI Canon Auto-fill ==========
// Fills EMPTY canon fields with story-specific detail from one AI call.
// Never overwrites anything the author (or earlier prose) already set, and is
// grounded in the chapters written so far so profiles match the page.

import { generateText } from './generate';
import { foldStoryState, factsFor, isPlaceholderText } from './story-memory';
import type { Chapter, Project } from '../types';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';

type Json = Record<string, unknown>;

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return isPlaceholderText(v);
  if (Array.isArray(v)) return v.length === 0 || v.every((x) => isEmptyValue(x));
  if (typeof v === 'object') return Object.values(v as Json).every(isEmptyValue);
  return false; // numbers / booleans count as set
}

/**
 * Deep-merge `generated` into `existing`, only where `existing` is empty.
 * Keys and types follow `existing` (the schema), so stray AI keys are dropped.
 */
export function fillEmpty<T>(existing: T, generated: unknown): T {
  if (generated == null) return existing;
  if (typeof existing === 'string') {
    return (isPlaceholderText(existing) && typeof generated === 'string' && generated.trim()
      ? generated.trim()
      : existing) as T;
  }
  if (Array.isArray(existing)) {
    if (!isEmptyValue(existing) || !Array.isArray(generated)) return existing;
    const sample = existing[0];
    const items = generated.filter((g) =>
      sample === undefined ? typeof g === 'string' || (g && typeof g === 'object') : typeof g === typeof sample,
    );
    return (items.length ? items.slice(0, 12) : existing) as T;
  }
  if (existing && typeof existing === 'object') {
    if (!generated || typeof generated !== 'object' || Array.isArray(generated)) return existing;
    const out: Json = { ...(existing as Json) };
    for (const key of Object.keys(out)) {
      if (key in (generated as Json)) out[key] = fillEmpty(out[key], (generated as Json)[key]);
    }
    return out as T;
  }
  return existing;
}

/** Only the empty part of a schema, so the model knows exactly what to write. */
function emptySkeleton(value: unknown): unknown {
  if (typeof value === 'string') return isPlaceholderText(value) ? '' : undefined;
  if (Array.isArray(value)) return isEmptyValue(value) ? [] : undefined;
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      if (['voiceId', 'voiceReason', 'isActive', 'activeProfile', 'relationships', 'storyState'].includes(k)) continue;
      const sk = emptySkeleton(v);
      if (sk !== undefined && !(typeof sk === 'object' && sk !== null && !Array.isArray(sk) && Object.keys(sk).length === 0)) out[k] = sk;
    }
    return out;
  }
  return undefined;
}

function storySoFar(chapters: Chapter[], maxChars = 6000): string {
  const lines = [...chapters]
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .map((c) => {
      const meta = (c.aiIntentMetadata || {}) as Json;
      const text = (meta.richSummary as string) || (meta.summary as string) || c.premise?.purpose || '';
      return text ? `Ch.${c.number} ${c.prose?.trim() ? '(written)' : '(planned)'}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
  return lines.length > maxChars ? lines.slice(-maxChars) : lines;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in auto-fill response');
  return JSON.parse(raw.slice(start, end + 1));
}

function otherCanonSummary(entries: AnyCanonEntry[], exceptId?: string): string {
  return entries
    .filter((e) => e.id !== exceptId && ['character', 'location', 'artifact'].includes(e.type))
    .slice(0, 40)
    .map((e) => `- ${e.name} (${e.type}${e.type === 'character' ? `, ${(e as CharacterEntry).character?.role || 'unknown role'}` : ''})${e.description && !isPlaceholderText(e.description) ? `: ${e.description}` : ''}`)
    .join('\n');
}

export interface AutoFillContext {
  project: Project;
  chapters: Chapter[];
  canon: AnyCanonEntry[];
  model?: string;
}

/**
 * Fill one entry's empty fields. Returns the updated type-specific data object
 * (e.g. `entry.character`), or null when nothing was empty.
 */
export async function aiAutoFillEntry(entry: AnyCanonEntry, ctx: AutoFillContext): Promise<Json | null> {
  const data = ((entry as unknown as Json)[entry.type] || {}) as Json;
  const skeleton = emptySkeleton(data) as Json;
  const descriptionEmpty = isPlaceholderText(entry.description);
  if (!Object.keys(skeleton || {}).length && !descriptionEmpty) return null;

  const state = foldStoryState(ctx.chapters);
  const facts = factsFor(state, entry).map((f) => `- ${f.fact} [Ch.${f.chapter}]`).join('\n');
  const known = JSON.stringify(data, (_k, v) => (isEmptyValue(v) ? undefined : v));

  const prompt = `You are Theodore, story architect for "${ctx.project.title}" (${ctx.project.subtype || ctx.project.type}).

Fill in the EMPTY fields of this ${entry.type} profile with specific, story-appropriate detail.

${entry.type.toUpperCase()}: ${entry.name}
Description: ${descriptionEmpty ? '(empty — write one or two sentences)' : entry.description}
Already set (never contradict): ${known === '{}' ? '(nothing yet)' : known}
${facts ? `Established on the page (must match):\n${facts}\n` : ''}
Story so far / planned:
${storySoFar(ctx.chapters) || '(no chapters yet)'}

Other people, places and objects in this story:
${otherCanonSummary(ctx.canon, entry.id) || '(none)'}

Rules:
- Be concrete and particular to THIS story; no generic filler ("determined", "a defining experience").
${entry.type === 'character' ? '- Give them a voice that sounds different from the other characters: speechPattern should name real verbal habits (sentence length, vocabulary, tics).\n- Arc: startingState → endingState should be a real change that fits the story outline.\n' : ''}- Leave a field as "" or [] if the story gives no basis for it rather than inventing something that could conflict later.

Return ONLY JSON: {"description": "...", "data": <the object below with values filled in>}
${JSON.stringify(skeleton)}`;

  const result = await generateText({
    prompt,
    model: ctx.model || 'claude-sonnet',
    maxTokens: 2000,
    temperature: 0.7,
    action: 'auto-fill',
    projectId: ctx.project.id,
  });
  const parsed = extractJson(result.text || '') as { description?: string; data?: unknown };
  const filled = fillEmpty(data, parsed.data);
  if (descriptionEmpty && typeof parsed.description === 'string' && parsed.description.trim()) {
    return { __description: parsed.description.trim(), ...filled };
  }
  return filled;
}

/**
 * One call that gives every character with an empty personality a distinct,
 * story-specific profile. Used at project creation so Chapter 1 already has
 * real voices to write from. Returns updated entries (unsaved).
 */
export async function aiAutoFillCharacters(ctx: AutoFillContext): Promise<CharacterEntry[]> {
  const targets = ctx.canon.filter(
    (e): e is CharacterEntry => e.type === 'character' && isEmptyValue(e.character?.personality?.traits),
  );
  if (!targets.length) return [];

  const fields = {
    age: '', occupation: '',
    appearance: { physical: '', distinguishingFeatures: '', style: '' },
    personality: { traits: [], flaws: [], fears: [], desires: [], quirks: [], speechPattern: '', innerVoice: '' },
    arc: { startingState: '', internalConflict: '', wantVsNeed: { want: '', need: '' }, endingState: '' },
    background: { secrets: [] },
  };

  const prompt = `You are Theodore, story architect for "${ctx.project.title}" (${ctx.project.subtype || ctx.project.type}).

Write profiles for these characters. Make each one DISTINCT — different speech rhythms, vocabulary, habits, and wants — so they never sound alike on the page. Keep everything consistent with the outline and with details already given.

Characters:
${targets.map((c) => `- ${c.name} (${c.character?.role || 'unknown role'})${c.description && !isPlaceholderText(c.description) ? `: ${c.description}` : ''}${c.character?.age ? ` | age: ${c.character.age}` : ''}${c.character?.pronouns ? ` | pronouns: ${c.character.pronouns}` : ''}${c.character?.appearance?.physical && !isPlaceholderText(c.character.appearance.physical) ? ` | looks: ${c.character.appearance.physical}` : ''}`).join('\n')}

Story outline:
${storySoFar(ctx.chapters) || '(no outline yet)'}

Return ONLY JSON mapping each character's exact name to this shape (keep given details; use "" / [] where the story gives no basis):
{"<name>": ${JSON.stringify(fields)}}`;

  const result = await generateText({
    prompt,
    model: ctx.model || 'claude-sonnet',
    maxTokens: Math.min(6000, 700 + targets.length * 550),
    temperature: 0.8,
    action: 'auto-fill',
    projectId: ctx.project.id,
  });
  const parsed = extractJson(result.text || '') as Record<string, unknown>;
  const byName = new Map(Object.entries(parsed).map(([k, v]) => [k.trim().toLowerCase(), v]));

  const updated: CharacterEntry[] = [];
  for (const c of targets) {
    const gen = byName.get(c.name.trim().toLowerCase());
    if (!gen) continue;
    updated.push({ ...c, character: fillEmpty(c.character, gen) });
  }
  return updated;
}
