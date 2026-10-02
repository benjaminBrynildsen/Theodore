// Applies a rename across the project: chapters (prose, scenes, title,
// premise, memory), the thread and arc maps, and other canon entries.

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { api } from './api';
import { proseContentHash, proseSignature, stripProductionTags } from './story-memory';
import { buildRenamePairs, countMentions, renameDeep, replaceNames, type RenamePair } from './rename';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import type { Chapter } from '../types';

// Past drafts stay as written; memory hashes are recomputed below.
const SKIP_META = new Set(['versionHistory', 'continuitySourceHash', 'continuitySourceSig', 'continuitySourceLength']);

export interface RenamePreview {
  pairs: RenamePair[];
  chapters: number;
  mentions: number;
  /** Another entry already uses the new name. */
  conflict?: string;
}

function chapterText(c: Chapter): string {
  return [c.title, c.prose, JSON.stringify(c.premise || {}), JSON.stringify(c.scenes || [])].join('\n');
}

export function previewRename(entry: AnyCanonEntry, oldName: string, newName: string): RenamePreview {
  const others = useCanonStore.getState().getProjectEntries(entry.projectId).filter((e) => e.id !== entry.id);
  const pairs = buildRenamePairs(oldName, newName, entry.type, others);
  let chapters = 0;
  let mentions = 0;
  for (const c of useStore.getState().getProjectChapters(entry.projectId)) {
    const n = countMentions(chapterText(c), pairs);
    if (n) { chapters++; mentions += n; }
  }
  const target = newName.trim().toLowerCase();
  const conflict = others.find((e) => e.name.trim().toLowerCase() === target)?.name;
  return { pairs, chapters, mentions, conflict };
}

export function applyRename(entry: AnyCanonEntry, pairs: RenamePair[]): number {
  if (!pairs.length) return 0;
  const store = useStore.getState();
  const canon = useCanonStore.getState();
  let changedChapters = 0;

  for (const c of store.getProjectChapters(entry.projectId)) {
    if (!countMentions(chapterText(c) + JSON.stringify(c.aiIntentMetadata || {}), pairs)) continue;
    const prose = replaceNames(c.prose || '', pairs);
    const scenes = renameDeep(c.scenes || [], pairs);
    const meta = renameDeep((c.aiIntentMetadata || {}) as Record<string, unknown>, pairs, SKIP_META);
    // Memory was renamed with the prose, so it still matches — no re-extraction needed.
    if (prose !== c.prose && meta.continuitySourceHash) {
      meta.continuitySourceHash = proseContentHash(prose);
      meta.continuitySourceSig = proseSignature(prose);
      meta.continuitySourceLength = stripProductionTags(prose).trim().length;
    }
    const updates: Partial<Chapter> = {
      title: replaceNames(c.title, pairs),
      premise: renameDeep(c.premise, pairs),
      scenes,
      aiIntentMetadata: meta as unknown as Chapter['aiIntentMetadata'],
      ...(prose !== c.prose ? { prose } : {}),
    };
    store.updateChapter(c.id, updates);
    // Send scenes with the prose: the server clears scenes on a prose-only update.
    if (prose !== c.prose) api.updateChapter(c.id, { prose, scenes }).catch(() => {});
    changedChapters++;
  }

  const project = store.projects.find((p) => p.id === entry.projectId);
  if (project && (project.threadPlan || project.arcPlan)) {
    store.updateProject(project.id, {
      ...(project.threadPlan ? { threadPlan: renameDeep(project.threadPlan, pairs) } : {}),
      ...(project.arcPlan ? { arcPlan: renameDeep(project.arcPlan, pairs) } : {}),
    });
  }

  for (const e of canon.getProjectEntries(entry.projectId)) {
    if (e.id === entry.id) {
      // The entry itself: full name follows, and the old name becomes an alias
      // only if the author wants it — leave aliases as they are.
      if (e.type === 'character') {
        const c = (e as CharacterEntry).character;
        canon.updateEntry(e.id, {
          name: pairs[0].to,
          description: replaceNames(e.description, pairs),
          character: renameDeep(c, pairs),
        } as Partial<AnyCanonEntry>);
      } else {
        canon.updateEntry(e.id, { name: pairs[0].to, description: replaceNames(e.description, pairs) });
      }
      continue;
    }
    const { id: _id, projectId: _p, type: _t, ...rest } = e as AnyCanonEntry & Record<string, unknown>;
    if (!countMentions(JSON.stringify(rest), pairs)) continue;
    canon.updateEntry(e.id, renameDeep(rest, pairs) as Partial<AnyCanonEntry>);
  }
  return changedChapters;
}
