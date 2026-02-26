// ========== Story Scaffolding ==========
// Generates a full chapter skeleton (titles, premises, beats) from project metadata

import type { Project, Chapter, PremiseCard } from '../types';
import type { AnyCanonEntry } from '../types/canon';

export const CHAPTER_PRESETS = [
  { value: 8, label: '8 chapters', desc: 'Novella / Short Novel' },
  { value: 10, label: '10 chapters', desc: 'Tight Novel' },
  { value: 12, label: '12 chapters', desc: 'Standard Novel' },
  { value: 15, label: '15 chapters', desc: 'Full Novel' },
  { value: 20, label: '20 chapters', desc: 'Epic Novel' },
  { value: 25, label: '25 chapters', desc: 'Long Epic' },
] as const;

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
  sections.push(`\nThe outline should follow proper story structure:`);
  sections.push(`- Act 1 (~25%): Setup, inciting incident, establish stakes`);
  sections.push(`- Act 2 (~50%): Rising action, complications, midpoint shift, darkest moment`);
  sections.push(`- Act 3 (~25%): Climax, resolution, denouement`);

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
  // Try to extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in response');

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) throw new Error('Response is not an array');

    return parsed.map((item: any, i: number) => ({
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
