// ========== Book synopsis ==========
// A one-page synopsis written the way agents and editors expect one: present
// tense, third person, the protagonist and what they want, the inciting
// incident and stakes, the key turns told as cause and effect, the inner arc
// alongside the plot, and the ending — a synopsis is not a teaser. The ending
// is kept separate so the book page can hide it behind a tap.
//
// Pure — portable to the mobile app.

import type { Chapter, Project } from '../types';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';

export interface Synopsis {
  version: 1;
  generatedAt: string;
  /** Fingerprint of the story it was written from; changes mean it may be out of date. */
  sourceKey: string;
  logline: string;
  body: string[];
  ending: string[];
  /** Written from outline premises for some chapters (book not finished). */
  fromOutline: boolean;
}

interface MemoryLike { summary?: string; richSummary?: string }

function chapterLine(c: Chapter): { text: string; written: boolean } {
  const meta = (c.aiIntentMetadata || {}) as MemoryLike;
  const written = !!c.prose?.trim();
  const text = written
    ? (meta.richSummary || meta.summary || c.premise?.purpose || '')
    : [c.premise?.purpose, c.premise?.changes].filter(Boolean).join(' — ');
  return { text: text.trim(), written };
}

/** Changes whenever a chapter's summary/premise, the chapter list or the maps change. */
export function synopsisSourceKey(project: Pick<Project, 'threadPlan' | 'arcPlan'>, chapters: Chapter[]): string {
  const parts = [...chapters]
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .map((c) => `${c.number}|${c.title}|${chapterLine(c).text}`);
  parts.push(project.threadPlan?.generatedAt || '', project.arcPlan?.generatedAt || '');
  let h = 5381;
  for (const ch of parts.join('\n')) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export function buildSynopsisPrompt(args: { project: Project; chapters: Chapter[]; canon: AnyCanonEntry[] }): string {
  const { project, canon } = args;
  const chapters = [...args.chapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const outline = chapters.map((c) => {
    const { text, written } = chapterLine(c);
    return `Ch ${c.number} "${c.title}" ${written ? '[WRITTEN]' : '[PLANNED]'}: ${text || '(no summary)'}`;
  }).join('\n');

  const leads = canon
    .filter((e): e is CharacterEntry => e.type === 'character' && ['protagonist', 'antagonist', 'supporting'].includes((e as CharacterEntry).character?.role))
    .sort((a, b) => (a.character.role === 'protagonist' ? -1 : 0) - (b.character.role === 'protagonist' ? -1 : 0))
    .slice(0, 8)
    .map((e) => `- ${e.name} (${e.character.role})${e.description ? `: ${e.description.slice(0, 160)}` : ''}`)
    .join('\n');

  const arcs = (project.arcPlan?.characters || [])
    .filter((a) => a.role !== 'supporting')
    .map((a) => `- ${a.name}: wants ${a.want || '?'}; needs ${a.need || '?'}; flaw ${a.flaw || '?'}; ends ${a.endState || '?'}`)
    .join('\n');
  const threads = (project.threadPlan?.threads || [])
    .filter((t) => t.tier === 'major' || t.tier === 'series')
    .map((t) => `- ${t.title}${t.continues ? ' (left open for a sequel)' : ''}: ${t.question}${t.resolution ? ` → ${t.resolution}` : ''}`)
    .join('\n');
  const genre = project.narrativeControls?.genreEmphasis?.join(', ');

  return `You are Theodore, writing the synopsis of the novel "${project.title}"${genre ? ` (${genre})` : ''} — the one-page synopsis an editor or agent would expect.

CHAPTERS:
${outline}
${leads ? `\nMAIN CHARACTERS:\n${leads}\n` : ''}${arcs ? `\nCHARACTER ARCS:\n${arcs}\n` : ''}${threads ? `\nMAJOR PLOT LINES:\n${threads}\n` : ''}
HOW TO WRITE IT:
- 400-600 words. Present tense, third person, in the book's tone. Plain, vivid prose — no headings, no bullet points, no chapter-by-chapter retelling.
- Open with the protagonist: who they are, their world, and what they want or what is missing in their life.
- Then the inciting incident, the central conflict, and the stakes — what they stand to lose.
- Tell the key turning points in order as cause and effect ("because… but… so…"), never "and then… and then…". Keep subplots out unless they change the main story.
- Weave in the protagonist's inner change alongside the plot: what they believe at the start, what breaks it, who they become.
- Name only the main characters (no more than four or five); describe anyone else by role.
- Tell the climax and the ending plainly. A synopsis is not a teaser: no rhetorical questions, no cliffhangers, no marketing language ("in a world where…", "gripping", "must"). If a plot line is left open for a sequel, say so in a sentence.
- Chapters marked [PLANNED] are not written yet; tell the story as planned.

Return ONLY JSON, no markdown:
{"logline":"one sentence: protagonist + goal + obstacle + stakes","body":["paragraph", "..."],"ending":["the climax and resolution, in one or two paragraphs"]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawJson = any;

/** Models sometimes put raw line breaks inside JSON strings; escape them so JSON.parse accepts it. */
function escapeNewlinesInStrings(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === '\n') { out += '\\n'; continue; }
      else if (ch === '\r') continue;
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

export function parseSynopsis(text: string, sourceKey: string, fromOutline: boolean, now = new Date().toISOString()): Synopsis | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: RawJson;
  try { parsed = JSON.parse(escapeNewlinesInStrings(raw.slice(start, end + 1))); } catch { return null; }
  const paras = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n\s*\n/) : [])
    .map((p: unknown) => String(p ?? '').trim()).filter(Boolean);
  const body = paras(parsed?.body);
  const ending = paras(parsed?.ending);
  if (!body.length) return null;
  return {
    version: 1,
    generatedAt: now,
    sourceKey,
    logline: String(parsed?.logline || '').trim(),
    body,
    ending,
    fromOutline,
  };
}
