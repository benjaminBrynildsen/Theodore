// Self-test for the continuity engine. Run from the mobile repo root:
//   npx tsx <path-to>/continuity.selftest.ts
// It needs nothing but the continuity/ folder next to it.
import assert from 'node:assert/strict';
import {
  applyContinuityExtraction, buildCanonAndMemory, buildContinuityExtractionPrompt,
  foldStoryState, needsReextraction, parseMemorySections, staleNoticeUpdates,
  type AnyCanonEntry, type Chapter,
} from './continuity';

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };

const character = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, projectId: 'p', type: 'character', name, description: '', tags: [], notes: '', version: 1, linkedCanonIds: [], createdAt: '', updatedAt: '',
  character: {
    fullName: name, aliases: [], age: '', gender: '', pronouns: '', species: '', occupation: '', role: 'supporting',
    appearance: { physical: '', distinguishingFeatures: '', style: '' },
    personality: { traits: [], strengths: [], flaws: [], fears: [], desires: [], values: [], quirks: [], speechPattern: '', innerVoice: '' },
    background: { birthplace: '', upbringing: '', family: [], education: '', formativeEvents: [], secrets: [], trauma: '', proudestMoment: '' },
    relationships: [],
    arc: { startingState: '', internalConflict: '', externalConflict: '', wantVsNeed: { want: '', need: '' }, growthDirection: '', currentState: '', endingState: '' },
    storyState: { alive: true, currentLocation: '', knowledgeState: [], emotionalState: 'Guarded but curious', allegiance: '', lastSeenChapter: 0 },
    ...extra,
  },
}) as unknown as AnyCanonEntry;

const canon = [
  character('c1', 'Maya Chen', { role: 'protagonist', pronouns: 'she/her' }),
  character('c2', 'Tim Alder'),
  { id: 'a1', projectId: 'p', type: 'artifact', name: 'The Brass Key', description: 'Opens the cellar', tags: [], notes: '', version: 1, linkedCanonIds: [], createdAt: '', updatedAt: '',
    artifact: { artifactType: 'key', physical: { appearance: '', material: '', size: '', weight: '', condition: '', distinguishingMarks: '' },
      properties: { abilities: [], limitations: [], activationMethod: '', sideEffects: '', power: '' },
      history: { creator: '', creationDate: '', purpose: '', previousOwners: [], legends: '', currentLocation: '', currentOwner: '' },
      storyRelevance: { firstAppearance: 1, significance: '', whoSeeksIt: [], prophecy: '' } } } as unknown as AnyCanonEntry,
];

const chapter = (id: string, number: number, meta: Record<string, unknown> = {}, extra: Partial<Chapter> = {}): Chapter => ({
  id, number, title: `T${number}`, prose: 'Maya held the brass key. Tim watched.', premise: { characters: ['Maya'] },
  referencedCanonIds: [], aiIntentMetadata: meta, ...extra,
});

const response = `SHORT_SUMMARY: Maya gives Tim the key.
RICH_SUMMARY:
Maya hands Tim the key on the porch.
OPEN_THREADS:
- Maya: wants to open the cellar
RESOLVED_THREAD_IDS:
CHARACTER_STATE:
- Maya | location: porch | mood: wary | learned: Tim lied | status: alive
ARTIFACT_STATE:
- the brass key | holder: Tim
FACTS:
- Tim: drives a green 1987 Corolla
CONTRADICTIONS:
`;

t('extraction prompt includes prior memory and full prose', () => {
  const ch1 = chapter('ch1', 1, parseMemorySections(response, 1, canon) as unknown as Record<string, unknown>);
  const ch2 = chapter('ch2', 2);
  const prompt = buildContinuityExtractionPrompt({ projectTitle: 'Larch Street', chapter: ch2, allChapters: [ch1, ch2], canon });
  assert.ok(prompt.includes('1987 Corolla') && prompt.includes('held by Tim') && prompt.includes('Maya held the brass key'));
});

t('apply extraction → metadata patch with memory + hashes', () => {
  const ch1 = chapter('ch1', 1);
  const applied = applyContinuityExtraction(response, ch1.prose, ch1, canon)!;
  const m = applied.metaPatch as Record<string, any>;
  assert.equal(m.summary, 'Maya gives Tim the key.');
  assert.equal(m.characterState[0].canonId, 'c1');
  assert.equal(m.artifactState[0].canonId, 'a1');
  assert.equal(m.facts.length, 1);
  assert.equal(needsReextraction(m, ch1.prose), false);
  assert.equal(applied.memoryChanges, null);
});

t('re-extraction keeps thread ids and flags later chapters on real changes', () => {
  const ch1 = chapter('ch1', 1);
  const first = applyContinuityExtraction(response, ch1.prose, ch1, canon)!;
  const ch1b = chapter('ch1', 1, first.metaPatch);
  const second = applyContinuityExtraction(response.replace('holder: Tim', 'holder: Kelly'), ch1.prose, ch1b, canon)!;
  const ids = (m: Record<string, any>) => m.openedThreads.map((x: { id: string }) => x.id);
  assert.deepEqual(ids(second.metaPatch), ids(first.metaPatch));
  assert.ok(second.memoryChanges?.changes.some((c) => c.includes('Kelly')));
  const later = chapter('ch2', 2, {}, { prose: 'The brass key was cold.' });
  const notices = staleNoticeUpdates(ch1b, [ch1b, later], second.memoryChanges!);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].chapterId, 'ch2');
});

t('prompt block: state + facts for the next chapter, no placeholders', () => {
  const ch1 = chapter('ch1', 1, applyContinuityExtraction(response, 'x', chapter('ch1', 1), canon)!.metaPatch);
  const ch2 = chapter('ch2', 2);
  const block = buildCanonAndMemory(canon, ch2, [ch1, ch2], true);
  assert.ok(block.includes('CURRENT STATE') && block.includes('ESTABLISHED FACTS') && block.includes('Pronouns: she/her'));
  assert.ok(!block.includes('Guarded but curious'));
  assert.equal(foldStoryState([ch1, ch2], 'ch2').asOfChapter, 1);
});

console.log(`\n${passed} passed`);
