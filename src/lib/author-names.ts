// Character names the author already used in their other books — new books avoid them.
import { useCanonStore } from '../store/canon';
import { nameWords } from './name-bank';

export function authorNamesToAvoid(excludeProjectId?: string): string[] {
  const entries = useCanonStore.getState().entries
    .filter((e) => e.type === 'character' && e.projectId !== excludeProjectId);
  return nameWords(entries.map((e) => e.name)).slice(0, 150);
}
