// ========== Character introductions ==========
// Which main characters the reader properly meets in a chapter, and the
// prompt section that asks for a real introduction (name, rough age, what they
// do and where, a couple of physical details, what's missing in their life,
// who the people around them are to them).
//
// With an arc map, its planned introduce chapter decides (a cold open can push
// the protagonist to Ch.2). Without one, the protagonist and antagonist are
// introduced the first time they appear. Either way, a character already on
// the page in an earlier chapter is never re-introduced.
//
// Pure — portable to the mobile app.

import type { Chapter } from '../types';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import type { ArcPlan } from './story-arcs';
import { resolveCanonEntry } from './story-memory';

export interface IntroCandidate {
  name: string;
  role: string;
  note?: string;
  /** Known details to work in (from canon). */
  facts: string[];
}

function mentioned(text: string, name: string): boolean {
  const words = [name, name.split(/\s+/)[0]].filter((w) => w.length >= 2);
  return words.some((w) => new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text));
}

function factsFor(entry: AnyCanonEntry | undefined): string[] {
  if (!entry || entry.type !== 'character') return [];
  const c = (entry as CharacterEntry).character;
  return [
    c?.age && `age ${c.age}`,
    c?.occupation && c.occupation,
    c?.condition && `condition: ${c.condition}`,
    c?.appearance?.physical && `looks: ${c.appearance.physical}`,
    entry.description,
  ].filter((x): x is string => !!x && !!String(x).trim()).slice(0, 4).map((x) => x.slice(0, 160));
}

export function introductionsForChapter(args: {
  chapter: Chapter;
  allChapters: Chapter[];
  canon: AnyCanonEntry[];
  plan?: ArcPlan | null;
}): IntroCandidate[] {
  const { chapter, allChapters, canon, plan } = args;
  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const before = sorted.filter((c) => (c.number || 0) < (chapter.number || 0));
  const priorText = before.map((c) => c.prose || '').join('\n');
  const isFirstChapter = !before.length;
  const out: IntroCandidate[] = [];
  const seen = new Set<string>();
  const add = (name: string, role: string, note?: string) => {
    const key = name.toLowerCase();
    if (seen.has(key) || mentioned(priorText, name)) return;
    seen.add(key);
    out.push({ name, role, note, facts: factsFor(resolveCanonEntry(name, canon, ['character'])) });
  };

  const planned = (plan?.characters || []).filter((a) => a.role !== 'supporting' || a.introduction);
  for (const arc of planned) {
    const at = arc.introducedIn ?? arc.beats[0]?.chapter;
    if (at === chapter.number) add(arc.name, arc.role, arc.introduction);
  }

  // Leads the map doesn't schedule: introduce them when they first appear.
  const leads = canon.filter((e): e is CharacterEntry =>
    e.type === 'character' && ['protagonist', 'antagonist'].includes((e as CharacterEntry).character?.role));
  const present = (chapter.premise?.characters || []).map((n) => resolveCanonEntry(n, canon, ['character'])?.id);
  for (const e of leads) {
    if ((plan?.characters || []).some((a) => resolveCanonEntry(a.name, [e]) === e)) continue;
    const role = e.character.role;
    if (present.includes(e.id) || (isFirstChapter && role === 'protagonist')) add(e.name, role);
  }
  return out;
}

export function buildIntroductionBlock(intros: IntroCandidate[]): string {
  if (!intros.length) return '';
  const lines = intros.map((i) => {
    const bits = [i.note, i.facts.length ? `known: ${i.facts.join('; ')}` : ''].filter(Boolean);
    return `- ${i.name} (${i.role})${bits.length ? `: ${bits.join(' | ')}` : ''}`;
  });
  return `=== INTRODUCING (the reader meets these main characters properly in this chapter) ===
${lines.join('\n')}
Early in the stretch where each one appears, ground them the way a published novel does: their name; rough age; what they do and where; one or two concrete physical details; what is pressing or missing in their life; and what the people around them are to them (brother, boss, ex). In close point of view, deliver it through action, other characters' remarks and passing thought, never a mirror scene or a paragraph of biography. Introduce the person, not their secrets: anything the thread map keeps open stays open.`;
}
