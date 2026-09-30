// Builds docs/mobile-port/continuity/ — a self-contained copy of Theodore's
// continuity engine for the mobile app. The web repo is the source of truth:
// edit src/lib/*, then run `npm run build:mobile-port` and copy the folder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/mobile-port/continuity');
mkdirSync(out, { recursive: true });

const banner = (src) => `// GENERATED from Theodore web ${src} by scripts/build-mobile-port.mjs.
// Do not edit here — change the web source and regenerate, so both apps
// keep writing and reading the same chapter memory.
`;

const MODULES = ['story-memory.ts', 'continuity-extraction.ts', 'continuity-context.ts'];
for (const file of MODULES) {
  let src = readFileSync(join(root, 'src/lib', file), 'utf8');
  src = src
    .replace(/from '\.\.\/types\/canon'/g, "from './types'")
    .replace(/from '\.\.\/types'/g, "from './types'");
  writeFileSync(join(out, file), banner(`src/lib/${file}`) + '\n' + src);
}

const canon = readFileSync(join(root, 'src/types/canon.ts'), 'utf8');
const chapterTypes = `
// ========== Chapter / Project (structural subset used by the continuity engine) ==========
// Matches the shape the Theodore API returns. If the app's own types differ,
// adapt at the call site rather than editing the engine.

export interface PremiseCard {
  purpose?: string;
  changes?: string;
  characters?: string[];
  emotionalBeat?: string;
  setupPayoff?: { setup: string; payoff: string }[];
  constraints?: string[];
}

export interface Chapter {
  id: string;
  projectId?: string;
  number: number;
  title: string;
  prose: string;
  premise?: PremiseCard;
  referencedCanonIds?: string[];
  scenes?: { summary?: string }[];
  /** Continuity memory lives here — same keys on web and mobile. */
  aiIntentMetadata?: Record<string, unknown> | null;
}

export interface Project {
  id: string;
  title: string;
}
`;
writeFileSync(join(out, 'types.ts'), banner('src/types/canon.ts (+ Chapter subset)') + '\n' + canon + chapterTypes);

writeFileSync(join(out, 'index.ts'), banner('(index)') + `
export * from './story-memory';
export * from './continuity-extraction';
export * from './continuity-context';
export type { Chapter, Project, PremiseCard, AnyCanonEntry, CharacterEntry, ArtifactEntry } from './types';
`);

console.log(`mobile port written to ${out}`);
