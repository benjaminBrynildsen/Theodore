// Runs the canon cleanup: gathers proposals (heuristics + one AI review) and,
// once the author approves them, applies merges / moves / deletions and
// re-points chapter references at the surviving entries.

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { useSettingsStore } from '../store/settings';
import { generateText } from './generate';
import { analysisModel } from './models';
import {
  buildCleanupPrompt,
  combineProposals,
  heuristicCleanup,
  parseCleanupResponse,
  referenceRemap,
  remapReferences,
  type CleanupProposal,
} from './canon-cleanup';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import { recordProjectAuthorship } from './authorship-log';

export async function reviewCanon(projectId: string): Promise<CleanupProposal[]> {
  const entries = useCanonStore.getState().getProjectEntries(projectId);
  const heuristic = heuristicCleanup(entries);
  const removed = new Set(heuristic.map((p) => p.id));
  const remaining = entries.filter((e) => !removed.has(e.id));

  let ai: CleanupProposal[] = [];
  const project = useStore.getState().projects.find((p) => p.id === projectId);
  const chapters = useStore.getState().getProjectChapters(projectId);
  if (remaining.length) {
    const result = await generateText({
      prompt: buildCleanupPrompt({
        title: project?.title || 'Untitled',
        entries: remaining,
        outline: chapters.map((c) => ({
          number: c.number,
          title: c.title,
          summary: ((c.aiIntentMetadata || {}) as { summary?: string }).summary || c.premise?.purpose,
        })),
      }),
      model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel),
      maxTokens: 3000,
      action: 'canon-cleanup',
      projectId,
    });
    ai = parseCleanupResponse(result.text || '', remaining);
  }
  return combineProposals(heuristic, ai);
}

export function applyCleanup(projectId: string, proposals: CleanupProposal[]): void {
  if (proposals.length) {
    const n = (k: CleanupProposal['kind']) => proposals.filter((p) => p.kind === k).length;
    recordProjectAuthorship(projectId, { kind: 'author-canon-cleanup', note: `${n('merge')} merged, ${n('delete')} removed, ${n('retype')} recategorised` });
  }
  const canon = useCanonStore.getState();
  const byId = new Map(canon.getProjectEntries(projectId).map((e) => [e.id, e]));
  const retyped: Record<string, string> = {};

  for (const p of proposals) {
    const source = byId.get(p.id);
    if (!source) continue;
    if (p.kind === 'merge') {
      const target = byId.get(p.intoId);
      if (target?.type === 'character') {
        const t = target as CharacterEntry;
        const extra = [source.name, ...(source.type === 'character' ? (source as CharacterEntry).character?.aliases || [] : [])];
        const aliases = Array.from(new Set([...(t.character?.aliases || []), ...extra]))
          .filter((a) => a.toLowerCase() !== target.name.toLowerCase());
        canon.updateEntry(target.id, { character: { ...t.character, aliases } } as Partial<AnyCanonEntry>);
      }
    } else if (p.kind === 'retype') {
      const create = {
        character: canon.createCharacter, location: canon.createLocation, artifact: canon.createArtifact,
        system: canon.createSystem, media: canon.createMedia,
      }[p.toType];
      const entry = create(projectId, source.name);
      entry.description = source.description;
      entry.notes = source.notes;
      entry.tags = (source.tags || []).filter((t) => t !== 'auto-detected');
      entry.imageUrl = source.imageUrl;
      canon.addEntry(entry);
      retyped[p.id] = entry.id;
    }
  }

  const remap = referenceRemap(proposals, retyped);
  for (const id of remap.keys()) if (byId.has(id)) canon.deleteEntry(id);

  // Chapters and other entries that pointed at removed entries now point at
  // the survivors (or drop the reference).
  const store = useStore.getState();
  for (const ch of store.getProjectChapters(projectId)) {
    if (!(ch.referencedCanonIds || []).some((id) => remap.has(id))) continue;
    store.updateChapter(ch.id, { referencedCanonIds: remapReferences(ch.referencedCanonIds, remap) });
  }
  for (const e of useCanonStore.getState().getProjectEntries(projectId)) {
    if (!(e.linkedCanonIds || []).some((id) => remap.has(id))) continue;
    canon.updateEntry(e.id, { linkedCanonIds: remapReferences(e.linkedCanonIds, remap).filter((id) => id !== e.id) });
  }
}
