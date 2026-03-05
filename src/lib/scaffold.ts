// ========== Story Scaffolding ==========
// Generates a full chapter skeleton (titles, premises, beats) from project metadata

import type { Project, Chapter, PremiseCard } from '../types';
import type { AnyCanonEntry } from '../types/canon';
import { getStructureById } from './story-structures';

export const CHAPTER_PRESETS = [
  { value: 8, label: '8 chapters', desc: 'Novella / Short Novel' },
  { value: 10, label: '10 chapters', desc: 'Tight Novel' },
  { value: 12, label: '12 chapters', desc: 'Standard Novel' },
  { value: 15, label: '15 chapters', desc: 'Full Novel' },
  { value: 20, label: '20 chapters', desc: 'Epic Novel' },
  { value: 25, label: '25 chapters', desc: 'Long Epic' },
] as const;

const TARGET_LENGTH_CHAPTERS: Record<Project['targetLength'], number> = {
  short: 8,
  medium: 12,
  long: 15,
  epic: 20,
};

export function getDefaultScaffoldChapterCount(
  project: Pick<Project, 'subtype' | 'targetLength'>,
  requestedCount?: number,
): number {
  if (typeof requestedCount === 'number' && Number.isFinite(requestedCount)) {
    return Math.max(3, Math.round(requestedCount));
  }
  if (project.subtype === 'childrens-book') return 5;
  return TARGET_LENGTH_CHAPTERS[project.targetLength] || 12;
}

export function buildScaffoldPrompt(
  project: Project,
  chapterCount: number,
  canonEntries: AnyCanonEntry[],
  existingChapters: Chapter[],
): string {
  const sections: string[] = [];

  sections.push(`You are Theodore, an expert story architect. Generate a complete ${chapterCount}-chapter outline for the following project.`);

  sections.push(`\n=== PROJECT ===`);
  sections.push(`Title: "${project.title}"`);
  sections.push(`Type: ${project.subtype || project.type}`);

  const nc = project.narrativeControls;
  if (nc) {
    if (nc.genreEmphasis?.length) sections.push(`Genres: ${nc.genreEmphasis.join(', ')}`);
    sections.push(`Pacing: ${nc.pacing}`);
    sections.push(`Focus: ${nc.focusMix.character}% character, ${nc.focusMix.plot}% plot, ${nc.focusMix.world}% world`);
    const tone = nc.toneMood;
    if (tone.lightDark > 60) sections.push('Tone: dark, tense');
    else if (tone.lightDark < 40) sections.push('Tone: light, warm');
    if (tone.hopefulGrim > 60) sections.push('Outlook: grim');
    else if (tone.hopefulGrim < 40) sections.push('Outlook: hopeful');
  }

  // Canon context (brief)
  const characters = canonEntries.filter(e => e.type === 'character');
  const locations = canonEntries.filter(e => e.type === 'location');
  if (characters.length > 0) {
    sections.push(`\n=== CHARACTERS ===`);
    for (const c of characters) {
      const data = (c as any).character || {};
      sections.push(`- ${c.name} (${data.role || 'unknown role'}): ${c.description || 'no description'}`);
    }
  }
  if (locations.length > 0) {
    sections.push(`\n=== KEY LOCATIONS ===`);
    for (const l of locations) {
      sections.push(`- ${l.name}: ${l.description || 'no description'}`);
    }
  }

  // Existing chapters (if any — scaffold around them)
  if (existingChapters.length > 0) {
    sections.push(`\n=== EXISTING CHAPTERS (keep these, fill gaps) ===`);
    for (const ch of existingChapters) {
      sections.push(`Ch ${ch.number}: "${ch.title}" — ${ch.premise.purpose || 'no premise'} ${ch.prose ? '(has prose)' : '(empty)'}`);
    }
    sections.push(`\nKeep existing chapters in place. Generate new chapters to fill the outline to ${chapterCount} total. Adjust numbering as needed.`);
  }

  sections.push(`\n=== INSTRUCTIONS ===`);
  sections.push(`Generate exactly ${chapterCount} chapters. For each chapter, provide:`);
  sections.push(`- A compelling, evocative title (not "Chapter 1" — a real title)`);
  sections.push(`- purpose: what this chapter accomplishes in the story (1-2 sentences)`);
  sections.push(`- changes: what changes by the end of this chapter`);
  sections.push(`- emotionalBeat: the emotional arc (e.g., "tension builds to dread", "relief gives way to suspicion")`);
  sections.push(`- characters: array of character names present in this chapter`);
  sections.push(`- constraints: any rules (e.g., "don't reveal the killer yet")`);
  // Story structure guidance
  const structure = getStructureById(project.storyStructureId || 'plot-pyramid');
  if (structure && !structure.isProcess) {
    sections.push(`\nThe outline MUST follow the "${structure.name}" story structure (${structure.author}):`);
    sections.push(`This structure has ${structure.beats.length} beats that should be distributed across the ${chapterCount} chapters:`);
    structure.beats.forEach((beat, i) => {
      sections.push(`  ${i + 1}. ${beat.name}: ${beat.description}`);
    });
    sections.push(`Distribute these beats proportionally across the chapters. Each beat should span roughly ${Math.max(1, Math.floor(chapterCount / structure.beats.length))} chapter(s).`);
  } else {
    sections.push(`\nThe outline should follow proper story structure:`);
    sections.push(`- Act 1 (~25%): Setup, inciting incident, establish stakes`);
    sections.push(`- Act 2 (~50%): Rising action, complications, midpoint shift, darkest moment`);
    sections.push(`- Act 3 (~25%): Climax, resolution, denouement`);
  }

  sections.push(`\nReturn ONLY a JSON array. No markdown, no explanation. Format:`);
  sections.push(`[
  {
    "number": 1,
    "title": "Chapter Title",
    "purpose": "What this chapter does",
    "changes": "What changes",
    "emotionalBeat": "Emotional arc",
    "characters": ["Name1", "Name2"],
    "constraints": ["constraint 1"]
  },
  ...
]`);

  return sections.join('\n');
}

export interface ScaffoldResult {
  number: number;
  title: string;
  purpose: string;
  changes: string;
  emotionalBeat: string;
  characters: string[];
  constraints: string[];
}

export function parseScaffoldResponse(text: string): ScaffoldResult[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  const parseItems = (raw: string): unknown[] => {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { chapters?: unknown[] }).chapters)) {
      return (parsed as { chapters: unknown[] }).chapters;
    }
    throw new Error('Response is not an array');
  };

  let items: unknown[];

  try {
    items = parseItems(candidate);
  } catch {
    const jsonMatch = candidate.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response');
    items = parseItems(jsonMatch[0]);
  }

  try {
    return items.map((item: any, i: number) => ({
      number: item.number || i + 1,
      title: String(item.title || `Chapter ${i + 1}`),
      purpose: String(item.purpose || ''),
      changes: String(item.changes || ''),
      emotionalBeat: String(item.emotionalBeat || item.emotional_beat || ''),
      characters: Array.isArray(item.characters) ? item.characters.map(String) : [],
      constraints: Array.isArray(item.constraints) ? item.constraints.map(String) : [],
    }));
  } catch (e) {
    throw new Error(`Failed to parse scaffold response: ${(e as Error).message}`);
  }
}

export function normalizeScaffoldResults(
  results: ScaffoldResult[],
  targetCount: number,
  fallbackChapters: Array<{ number?: number; title?: string; premise?: string }> = [],
): ScaffoldResult[] {
  const normalizedTarget = Math.max(3, Math.round(targetCount));
  const output: ScaffoldResult[] = [];
  const seenNumbers = new Set<number>();

  const pushUnique = (item: ScaffoldResult) => {
    const number = Math.max(1, Math.round(item.number || output.length + 1));
    if (seenNumbers.has(number)) return;
    seenNumbers.add(number);
    output.push({
      number,
      title: item.title || `Chapter ${number}`,
      purpose: item.purpose || '',
      changes: item.changes || '',
      emotionalBeat: item.emotionalBeat || '',
      characters: Array.isArray(item.characters) ? item.characters : [],
      constraints: Array.isArray(item.constraints) ? item.constraints : [],
    });
  };

  for (const result of results) {
    pushUnique(result);
    if (output.length >= normalizedTarget) break;
  }

  for (const fallback of fallbackChapters) {
    pushUnique({
      number: fallback.number || output.length + 1,
      title: fallback.title || `Chapter ${output.length + 1}`,
      purpose: fallback.premise || 'Advance character, conflict, and stakes.',
      changes: '',
      emotionalBeat: '',
      characters: [],
      constraints: [],
    });
    if (output.length >= normalizedTarget) break;
  }

  while (output.length < normalizedTarget) {
    const number = output.length + 1;
    pushUnique({
      number,
      title: `Chapter ${number}`,
      purpose: 'Advance character, conflict, and stakes.',
      changes: '',
      emotionalBeat: '',
      characters: [],
      constraints: [],
    });
  }

  return output
    .slice(0, normalizedTarget)
    .sort((a, b) => a.number - b.number)
    .map((item, index) => ({ ...item, number: index + 1 }));
}

export function createPremiseFromScaffold(result: ScaffoldResult): PremiseCard {
  return {
    purpose: result.purpose,
    changes: result.changes,
    emotionalBeat: result.emotionalBeat,
    characters: result.characters,
    setupPayoff: [],
    constraints: result.constraints,
  };
}

export function createChapterFromScaffold(
  projectId: string,
  result: ScaffoldResult,
  now: string,
): Omit<Chapter, 'id'> {
  return {
    projectId,
    number: result.number,
    title: result.title,
    timelinePosition: result.number,
    status: 'premise-only',
    premise: createPremiseFromScaffold(result),
    prose: '',
    referencedCanonIds: [],
    validationStatus: { isValid: true, checks: [] },
    createdAt: now,
    updatedAt: now,
  };
}
