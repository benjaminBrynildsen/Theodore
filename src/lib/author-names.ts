// Names of the leads (protagonists and antagonists) in the author's other
// books — new books don't reuse them. Supporting names may repeat.
import { useCanonStore } from '../store/canon';
import { nameWords } from './name-bank';
import type { CharacterEntry } from '../types/canon';

export function authorNamesToAvoid(excludeProjectId?: string): string[] {
  const leads = useCanonStore.getState().entries.filter((e) => {
    if (e.type !== 'character' || e.projectId === excludeProjectId) return false;
    const role = (e as CharacterEntry).character?.role;
    return role === 'protagonist' || role === 'antagonist';
  });
  return nameWords(leads.map((e) => e.name)).slice(0, 150);
}
