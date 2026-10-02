// Tests for story memory (src/lib/story-memory.ts), prompt assembly, and the
// auto-fill merge. Run: npm run test:story-memory
import assert from 'node:assert/strict';
import {
  parseMemorySections, foldStoryState, selectRelevantCanon, buildStoryMemoryBlock,
  renderCharacterCard, renderWorldCard, needsReextraction, proseContentHash, proseSignature,
  stripProductionTags, diffChapterMemory, proseForExtraction, isPlaceholderText, resolveCanonEntry,
  mergeKnowledge, knowledgeFor, memoryOutdated, buildPriorMemoryForCheck, characterTimeline,
} from '../src/lib/story-memory';
import { applyContinuityExtraction, buildContinuityExtractionPrompt } from '../src/lib/continuity-extraction';
import { junkNameReason, heuristicCleanup, parseCleanupResponse, combineProposals, referenceRemap, remapReferences, buildCleanupPrompt } from '../src/lib/canon-cleanup';
import { parseNewCanon } from '../src/lib/story-memory';
import { buildRenamePairs, replaceNames, countMentions, renameDeep } from '../src/lib/rename';
import { stripDialogueSpeakerTags, isSceneBreakLine } from '../src/lib/clean-prose';
import { buildGenerationPrompt } from '../src/lib/prompt-builder';
import {
  parseThreadPlan, threadsForChapter, buildThreadGuidanceBlock, analyzeThreadPlan, threadStatus, buildThreadPlanPrompt, retimeThread,
} from '../src/lib/story-threads';
import {
  parseArcPlan, arcsForChapter, buildArcGuidanceBlock, analyzeArcPlan, buildArcPlanPrompt, artifactHolderBefore,
} from '../src/lib/story-arcs';

// canon-autofill -> generate -> stores touch browser globals at import time.
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).window = globalThis;
const { fillEmpty } = await import('../src/lib/canon-autofill');
const { threadMapPct, expectedThreadCount } = await import('../src/lib/thread-planner');

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };

const baseChar = (id: string, name: string, extra: any = {}) => ({
  id, projectId: 'p', type: 'character', name, description: '', tags: [], notes: '', version: 1, linkedCanonIds: [], createdAt: '', updatedAt: '',
  character: {
    fullName: name, aliases: [], age: '', gender: '', pronouns: '', species: '', occupation: '', role: 'supporting',
    appearance: { physical: '', distinguishingFeatures: '', style: '' },
    personality: { traits: [], strengths: [], flaws: [], fears: [], desires: [], values: [], quirks: [], speechPattern: '', innerVoice: '' },
    background: { birthplace: '', upbringing: '', family: [], education: '', formativeEvents: [], secrets: [], trauma: '', proudestMoment: '' },
    relationships: [],
    arc: { startingState: '', internalConflict: '', externalConflict: '', wantVsNeed: { want: '', need: '' }, growthDirection: '', currentState: '', endingState: '' },
    storyState: { alive: true, currentLocation: '', knowledgeState: [], emotionalState: '', allegiance: '', lastSeenChapter: 0 },
    ...extra,
  },
}) as any;

const maya = baseChar('c1', 'Maya Chen', { role: 'protagonist', pronouns: 'she/her', aliases: ['May'],
  appearance: { physical: 'Tall, cropped black hair', distinguishingFeatures: 'scar over left eyebrow', style: '' },
  arc: { startingState: 'runs from family', internalConflict: '', externalConflict: '', wantVsNeed: { want: 'the truth', need: 'to forgive' }, growthDirection: '', currentState: '', endingState: 'forces a reckoning' },
  background: { birthplace: '', upbringing: '', family: [], education: '', formativeEvents: [], secrets: ['she read the letter first'], trauma: '', proudestMoment: '' } });
const tim = baseChar('c2', 'Tim Alder');
const legacy = baseChar('c3', 'Old Default', {
  age: 'Early 30s',
  personality: { traits: ['Determined', 'Guarded', 'Observant'], strengths: [], flaws: ['Isolates when stressed'], fears: [], desires: [], values: [], quirks: [],
    speechPattern: 'Tends to be precise with words. Uses metaphors from their background.', innerVoice: 'Self-critical but quietly hopeful. Often argues with themselves.' },
  appearance: { physical: "[AI will describe Old Default's physical appearance based on story context]", distinguishingFeatures: '', style: '' },
  storyState: { alive: true, currentLocation: '', knowledgeState: [], emotionalState: 'Guarded but curious', allegiance: '', lastSeenChapter: 0 },
});
const key = { id: 'a1', projectId: 'p', type: 'artifact', name: 'The Brass Key', description: 'Opens the cabin cellar', tags: [], notes: '', version: 1, linkedCanonIds: [], createdAt: '', updatedAt: '',
  artifact: { artifactType: 'key', physical: { appearance: 'Tarnished brass, three teeth', material: '', size: '', weight: '', condition: 'Operational', distinguishingMarks: '' },
    properties: { abilities: [], limitations: ['only opens the cellar'], activationMethod: '', sideEffects: '', power: '' },
    history: { creator: '', creationDate: '', purpose: '', previousOwners: [], legends: '', currentLocation: '', currentOwner: 'Maya Chen' },
    storyRelevance: { firstAppearance: 1, significance: '', whoSeeksIt: [], prophecy: '' } } } as any;
const cabin = { id: 'l1', projectId: 'p', type: 'location', name: 'The Cabin', description: 'Family cabin', tags: [], notes: '', version: 1, linkedCanonIds: [], createdAt: '', updatedAt: '',
  location: { fullName: '', aliases: [], locationType: 'cabin', geography: {}, history: {}, currentState: { atmosphere: '[AI will describe the mood and feeling of The Cabin]', condition: '', sensoryDetails: { sights: '', sounds: '', smells: 'pine', textures: '' } }, storyRelevance: { accessRules: '', dangerLevel: '' } } } as any;
const canon = [maya, tim, legacy, key, cabin];

const extraction = `SHORT_SUMMARY: Maya finds the key.
RICH_SUMMARY:
Maya finds the key and gives it to Tim.
OPEN_THREADS:
- Maya: wants to open the cellar
RESOLVED_THREAD_IDS:
CHARACTER_STATE:
- Maya | location: the cabin loft | with: Tim | mood: shaken | learned: Kelly lied; the key is old | physical: split lip | status: alive | arc: stopped running
- Tim | location: porch | status: alive
ARTIFACT_STATE:
- the brass key | holder: Tim | location: his coat pocket | condition: bent
FACTS:
- Tim: drives a green 1987 Corolla
- Maya: scar over left eyebrow
CONTRADICTIONS:
- high | "her blue eyes" | Maya's eyes were brown in Ch.1 | change to brown`;

t('parse memory sections + name resolution', () => {
  const m = parseMemorySections(extraction, 2, canon);
  assert.equal(m.characterState.length, 2);
  assert.equal(m.characterState[0].canonId, 'c1');          // "Maya" -> Maya Chen via first token
  assert.deepEqual(m.characterState[0].learned, ['Kelly lied', 'the key is old']);
  assert.equal(m.characterState[1].canonId, 'c2');
  assert.equal(m.artifactState[0].canonId, 'a1');            // "the brass key" -> The Brass Key
  assert.equal(m.artifactState[0].holder, 'Tim');
  assert.equal(m.facts.length, 2);
  assert.equal(m.facts[0].canonId, 'c2');
  assert.equal(m.continuityIssues.length, 1);
  assert.equal(m.continuityIssues[0].severity, 'high');
  assert.equal(m.continuityIssues[0].quote, 'her blue eyes');
});

const mkChapter = (id: string, number: number, meta: any = {}, extra: any = {}) => ({
  id, projectId: 'p', number, title: `T${number}`, timelinePosition: number, status: 'draft-generated',
  premise: { purpose: '', changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] },
  prose: 'Some prose.', referencedCanonIds: [], validationStatus: { isValid: true, checks: [] }, createdAt: '', updatedAt: '',
  aiIntentMetadata: meta, ...extra,
}) as any;

t('fold state as of chapter (later wins, learned accumulates, stops before current)', () => {
  const m2 = parseMemorySections(extraction, 2, canon);
  const m3 = parseMemorySections(`CHARACTER_STATE:\n- Maya Chen | location: the harbour | learned: Kelly lied; Tim is her brother\nARTIFACT_STATE:\n- The Brass Key | holder: Maya\nFACTS:\n- Tim: drives a green 1987 Corolla`, 3, canon);
  const chapters = [mkChapter('ch1', 1), mkChapter('ch2', 2, m2), mkChapter('ch3', 3, m3), mkChapter('ch4', 4)];
  const at4 = foldStoryState(chapters, 'ch4');
  const mayaState = at4.characters.get('id:c1')!;
  assert.equal(mayaState.location, 'the harbour');
  assert.equal(mayaState.mood, 'shaken');                     // carried from ch2
  assert.deepEqual(mayaState.learned, ['Kelly lied', 'the key is old', 'Tim is her brother']);
  assert.equal(at4.artifacts.get('id:a1')!.holder, 'Maya');
  assert.equal(at4.facts.length, 2);                           // duplicate Corolla fact deduped
  const at3 = foldStoryState(chapters, 'ch3');                 // regenerating ch3 must not see ch3's own state
  assert.equal(at3.characters.get('id:c1')!.location, 'the cabin loft');
  assert.equal(at3.asOfChapter, 2);
});

t('placeholders never reach cards', () => {
  const card = renderCharacterCard(legacy);
  assert.ok(!/Early 30s|Determined|Guarded but curious|AI will|precise with words|quietly hopeful|Isolates/.test(card), card);
  const cabinCard = renderWorldCard(cabin);
  assert.ok(!/AI will/.test(cabinCard) && /pine/.test(cabinCard), cabinCard);
  const keyCard = renderWorldCard(key);
  assert.ok(!/Operational/.test(keyCard) && /Held by: Maya Chen/.test(keyCard) && /only opens the cellar/.test(keyCard), keyCard);
  assert.ok(isPlaceholderText('Auto-detected from chapter prose.'));
});

t('rich character card has pronouns, features, secrets, arc', () => {
  const card = renderCharacterCard(maya, { chapterNumber: 3, totalChapters: 12 });
  for (const s of ['Pronouns: she/her', 'scar over left eyebrow', 'Also called: May', 'Secrets', 'Wants: the truth / Needs: to forgive', 'starts: runs from family', 'ends: forces a reckoning', 'Ch.3 of 12'])
    assert.ok(card.includes(s), `missing ${s}\n${card}`);
});

t('selection: refs + recent chapters widen, artifacts held by primary included', () => {
  const ch1 = mkChapter('ch1', 1, {}, { referencedCanonIds: ['c2'] });
  const ch2 = mkChapter('ch2', 2, {}, { premise: { purpose: 'Maya returns to the cabin', changes: '', characters: ['Maya'], emotionalBeat: '', setupPayoff: [], constraints: [] } });
  const sel = selectRelevantCanon(canon, ch2, [ch1, ch2]);
  assert.deepEqual(sel.primaryChars.map((c) => c.id), ['c1']);
  assert.ok(sel.secondaryChars.some((c) => c.id === 'c2'), 'Tim from previous chapter refs');
  assert.ok(sel.locations.some((l) => l.id === 'l1'), 'cabin mentioned in premise');
  assert.ok(sel.artifacts.some((a) => a.id === 'a1'), 'key held by Maya');
  // no premise, no refs -> protagonists only, not everything
  const bare = mkChapter('x', 1);
  const sel2 = selectRelevantCanon(canon, bare, [bare]);
  assert.deepEqual(sel2.primaryChars.map((c) => c.id), ['c1']);
});

t('memory block renders state + facts', () => {
  const m2 = parseMemorySections(extraction, 2, canon);
  const ch2 = mkChapter('ch2', 2, m2);
  const ch3 = mkChapter('ch3', 3, {}, { premise: { purpose: '', changes: '', characters: ['Maya Chen'], emotionalBeat: '', setupPayoff: [], constraints: [] } });
  const all = [mkChapter('ch1', 1), ch2, ch3];
  const block = buildStoryMemoryBlock(all, ch3, selectRelevantCanon(canon, ch3, all, foldStoryState(all, 'ch3')));
  assert.ok(block.includes('CURRENT STATE (as of the end of Ch.2)'), block);
  assert.ok(block.includes('Maya Chen') && block.includes('split lip'));
  assert.ok(block.includes('The Brass Key') && block.includes('held by Tim'));
  assert.ok(block.includes('ESTABLISHED FACTS') && block.includes('1987 Corolla'));
});

t('re-extraction gating ignores tags/typos, catches real rewrites', () => {
  const prose = Array.from({ length: 300 }, (_, i) => `Sentence number ${i} about Maya and the cabin in winter.`).join(' ');
  const meta: any = { continuitySourceHash: proseContentHash(prose), continuitySourceSig: proseSignature(prose), continuitySourceLength: stripProductionTags(prose).trim().length };
  assert.equal(needsReextraction(meta, prose), false);
  assert.equal(needsReextraction(meta, prose.replace('Sentence number 5', '[Maya] "Hi." {sfx:door creak} Sentence number 5')), false, 'tags only');
  assert.equal(needsReextraction(meta, prose.replace('winter', 'wintr')), false, 'typo');
  assert.equal(needsReextraction(meta, prose + ' ' + 'A whole new scene happens here. '.repeat(40)), true, 'extend');
  const rewritten = prose.split('. ').map((s, i) => (i % 3 === 0 ? `Totally different event ${i} at the harbour with Tim` : s)).join('. ');
  assert.equal(needsReextraction(meta, rewritten), true, 'rewrite');
  assert.equal(needsReextraction({}, prose), true, 'never extracted');
});

t('extraction text keeps the ending of long chapters', () => {
  const long = 'A'.repeat(50000) + 'THE ENDING';
  const out = proseForExtraction(long, 30000);
  assert.ok(out.endsWith('THE ENDING') && out.length < 30100);
});

t('memory diff flags only meaningful changes', () => {
  const prev: any = { facts: [{ subject: 'Tim', fact: 'drives a green 1987 Corolla', chapter: 2 }], artifactState: [{ name: 'Key', holder: 'Tim' }], characterState: [{ name: 'Maya', status: 'alive' }] };
  const reworded: any = { facts: [{ subject: 'Tim', fact: 'drives a green 1987 Corolla with a dent', chapter: 2 }], artifactState: [{ name: 'Key', holder: 'Tim' }], characterState: [{ name: 'Maya', status: 'alive' }] };
  assert.equal(diffChapterMemory(prev, reworded).changes.length, 0);
  const changed: any = { facts: [{ subject: 'Tim', fact: 'rides a red motorbike', chapter: 2 }], artifactState: [{ name: 'Key', holder: 'Kelly' }], characterState: [{ name: 'Maya', status: 'dead' }] };
  const d = diffChapterMemory(prev, changed);
  assert.equal(d.changes.length, 3);
  assert.deepEqual(d.subjects.sort(), ['Key', 'Maya', 'Tim']);
});

t('resolveCanonEntry avoids ambiguous first names', () => {
  const a = baseChar('x1', 'Sam Reed'), b = baseChar('x2', 'Sam Ortiz');
  assert.equal(resolveCanonEntry('Sam', [a, b]), undefined);
  assert.equal(resolveCanonEntry('Sam Reed', [a, b])?.id, 'x1');
});

t('full generation prompt includes canon cards + memory, no placeholders', () => {
  const m2 = parseMemorySections(extraction, 2, canon);
  const ch2 = mkChapter('ch2', 2, { ...m2, summary: 'Maya finds the key.', richSummary: 'Maya finds the key and gives it to Tim.' });
  const ch3 = mkChapter('ch3', 3, {}, { prose: '', premise: { purpose: 'Maya confronts Tim about the key', changes: '', characters: ['Maya'], emotionalBeat: '', setupPayoff: [], constraints: [] } });
  const project: any = { id: 'p', title: 'Larch Street', type: 'book', subtype: 'novel', narrativeControls: { toneMood: { lightDark: 50, hopefulGrim: 50, whimsicalSerious: 50 }, pacing: 'balanced', dialogueWeight: 'balanced', focusMix: { character: 40, plot: 40, world: 20 }, genreEmphasis: [] } };
  const settings: any = { writingStyle: { emDashEnabled: false, smartQuotes: true, oxfordComma: true, ellipsisStyle: 'three-dots', paragraphLength: 'mixed', sceneBreakStyle: '***', chapterStartStyle: 'normal' }, ai: { includeCanonInPrompt: true, includeOutlineInPrompt: true, generateLength: 'standard' } };
  const prompt = buildGenerationPrompt({ project, chapter: ch3, allChapters: [mkChapter('ch1', 1), ch2, ch3], canonEntries: canon, settings, writingMode: 'draft', generationType: 'full-chapter' });
  for (const s of ['=== CANON', 'Pronouns: she/her', 'Held by: Tim', 'CURRENT STATE', 'ESTABLISHED FACTS', '1987 Corolla', 'Maya finds the key and gives it to Tim.', 'CHAPTER TO WRITE'])
    assert.ok(prompt.includes(s), `missing ${s}`);
  assert.ok(!/AI will|Guarded but curious|Operational/.test(prompt));
});


t('auto-fill merge fills only empty fields', () => {
  (globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  (globalThis as any).window = globalThis;
  const existing = { age: '', occupation: 'baker', personality: { traits: [], speechPattern: 'Tends to be precise with words. Uses metaphors from their background.', quirks: ['hums'] }, arc: { wantVsNeed: { want: '', need: 'rest' } } };
  const gen = { age: '42', occupation: 'pilot', personality: { traits: ['wry', 'stubborn'], speechPattern: 'Clipped, no contractions', quirks: ['taps table'] }, arc: { wantVsNeed: { want: 'money', need: 'love' } }, extra: 'dropped' };
  const out: any = fillEmpty(existing, gen);
  assert.equal(out.age, '42');
  assert.equal(out.occupation, 'baker');               // never overwritten
  assert.deepEqual(out.personality.traits, ['wry', 'stubborn']);
  assert.equal(out.personality.speechPattern, 'Clipped, no contractions'); // placeholder replaced
  assert.deepEqual(out.personality.quirks, ['hums']);  // existing list kept
  assert.equal(out.arc.wantVsNeed.want, 'money');
  assert.equal(out.arc.wantVsNeed.need, 'rest');
  assert.ok(!('extra' in out));
});

t('thread plan: parse, clamp, every thread opens and closes in order', () => {
  const raw = JSON.stringify({ threads: [
    { title: 'Who killed Dad', tier: 'major', kind: 'twist', question: 'Who?', resolution: 'Uncle did',
      beats: [{ chapter: 1, type: 'open', note: 'Dad dies' }, { chapter: 3, type: 'hint', note: 'Uncle lies' }, { chapter: 6, type: 'hint', note: 'ring' },
              { chapter: 9, type: 'reveal', note: 'Uncle confesses' }, { chapter: 11, type: 'hint', note: 'late hint dropped' }, { chapter: 12, type: 'close', note: 'justice' }] },
    { title: 'Missing dog', tier: 'hook', beats: [{ chapter: 5, type: 'open' }] },                // no close -> closes at last beat
    { title: 'Backwards', tier: 'subplot', beats: [{ chapter: 8, type: 'open' }, { chapter: 4, type: 'close' }] }, // swapped
    { title: 'Out of range', tier: 'nonsense', beats: [{ chapter: 0, type: 'open' }, { chapter: 99, type: 'close' }] },
    { title: '' },
  ] });
  const plan = parseThreadPlan('```json\n' + raw + '\n```', 12)!;
  assert.equal(plan.threads.length, 4);
  const [major, dog, back, oor] = plan.threads;
  assert.equal(major.opensIn, 1); assert.equal(major.closesIn, 12);
  assert.ok(!major.beats.some((b) => b.note === 'late hint dropped'), 'hints after the reveal are dropped');
  assert.equal(dog.opensIn, 5); assert.equal(dog.closesIn, 5);
  assert.equal(back.opensIn, 4); assert.equal(back.closesIn, 8);
  assert.equal(oor.tier, 'subplot'); assert.equal(oor.opensIn, 1); assert.equal(oor.closesIn, 12);
  for (const th of plan.threads) {
    assert.equal(th.beats[0].type, 'open'); assert.equal(th.beats.at(-1)!.type, 'close');
    assert.equal(th.beats.filter((b) => b.type === 'open').length, 1);
  }
  assert.equal(parseThreadPlan('not json', 5), null);
});

t('thread plan: per-chapter guidance tells the writer what to open, hint, close and keep open', () => {
  const plan = parseThreadPlan(JSON.stringify({ threads: [
    { title: 'Twist', tier: 'major', kind: 'twist', beats: [{ chapter: 1, type: 'open', note: 'mysterious letter' }, { chapter: 3, type: 'hint', note: 'smudged postmark' }, { chapter: 8, type: 'reveal', note: 'mom wrote it' }, { chapter: 10, type: 'close' }] },
    { title: 'Hook A', tier: 'hook', beats: [{ chapter: 3, type: 'open', note: 'door is locked' }, { chapter: 4, type: 'close', note: 'key found' }] },
  ] }), 10)!;
  const a3 = threadsForChapter(plan, 3);
  assert.deepEqual(a3.opening.map((x) => x.title), ['Hook A']);
  assert.equal(a3.hinting[0].note, 'smudged postmark');
  const g5 = buildThreadGuidanceBlock(plan, 5);
  assert.ok(g5.includes('KEEP OPEN') && g5.includes('Twist (closes Ch.10)'), g5);
  const g3 = buildThreadGuidanceBlock(plan, 3);
  assert.ok(g3.includes('OPEN [hook] Hook A: door is locked') && g3.includes('HINT [major, twist] Twist: smudged postmark'), g3);
  assert.ok(!g3.includes('KEEP OPEN'), 'a thread hinted this chapter is not listed again as keep-open');
  assert.ok(buildThreadGuidanceBlock(plan, 4).includes('CLOSE [hook] Hook A: key found'));
  assert.equal(buildThreadGuidanceBlock(null, 3), '');
});

t('thread plan: status and health warnings', () => {
  const plan = parseThreadPlan(JSON.stringify({ threads: [
    { title: 'Late major', tier: 'major', kind: 'twist', beats: [{ chapter: 7, type: 'open' }, { chapter: 9, type: 'reveal' }, { chapter: 10, type: 'close' }] },
  ] }), 10)!;
  const w = analyzeThreadPlan(plan, 12).map((x) => x.message).join('\n');
  assert.ok(w.includes('built for 10 chapters'));
  assert.ok(w.includes('starts late'));
  assert.ok(w.includes('without at least two earlier hints'));
  assert.ok(w.includes('No thread activity'));
  const ch = (n: number, prose = '') => ({ id: 'c' + n, number: n, prose }) as any;
  assert.equal(threadStatus(plan.threads[0], [ch(7, 'x')]), 'open');
  assert.equal(threadStatus(plan.threads[0], [ch(7, 'x'), ch(10, 'y')]), 'resolved');
  assert.equal(threadStatus(plan.threads[0], [ch(7)]), 'planned');
});

t('thread plan prompt includes written chapters and tier rules', () => {
  const chs = [
    { id: 'a', number: 1, title: 'One', prose: 'x', premise: { purpose: 'p1' }, aiIntentMetadata: { richSummary: 'Kid runs away.', openedThreads: [{ character: 'Kid', thread: 'find the speed force' }] } },
    { id: 'b', number: 2, title: 'Two', prose: '', premise: { purpose: 'p2', changes: 'c2' } },
  ] as any;
  const p = buildThreadPlanPrompt({ title: 'Fast', chapters: chs, canon: [] });
  assert.ok(p.includes('[WRITTEN] Kid runs away.') && p.includes('find the speed force') && p.includes('[PLANNED] p2 — c2'));
  assert.ok(p.includes('"major"') && p.includes('"hook"') && p.includes("don't move events"));
});

t('retimeThread keeps beats inside the new span', () => {
  const plan = parseThreadPlan(JSON.stringify({ threads: [{ title: 'X', beats: [{ chapter: 2, type: 'open' }, { chapter: 4, type: 'hint' }, { chapter: 8, type: 'advance' }, { chapter: 9, type: 'close' }] }] }), 10)!;
  const r = retimeThread(plan.threads[0], 3, 6, 10);
  assert.deepEqual(r.beats.map((b) => [b.chapter, b.type]), [[3, 'open'], [4, 'hint'], [6, 'close']]);
  const swapped = retimeThread(plan.threads[0], 7, 2, 10);
  assert.equal(swapped.opensIn, 2); assert.equal(swapped.closesIn, 7);
});

t('thread map progress: creeps while reading, fills by threads found, never hits 100 early', () => {
  assert.equal(expectedThreadCount(12), 14);
  assert.equal(threadMapPct('reading', 0, 0, 14), 0);
  const r60 = threadMapPct('reading', 60_000, 0, 14);
  assert.ok(r60 > 10 && r60 < 20, String(r60));
  assert.ok(threadMapPct('reading', 600_000, 0, 14) <= 20);
  assert.equal(threadMapPct('mapping', 0, 7, 14), Math.round(20 + 37.5));
  assert.equal(threadMapPct('mapping', 0, 40, 14), 95);
  assert.equal(threadMapPct('saving', 0, 14, 14), 98);
});

t('series threads stay open past the book; everything else closes', () => {
  const plan = parseThreadPlan(JSON.stringify({ threads: [
    { title: 'Who harvests the speed force', tier: 'series', kind: 'mystery', beats: [{ chapter: 2, type: 'open', note: 'strange static' }, { chapter: 7, type: 'reveal', note: 'a lab exists' }, { chapter: 10, type: 'close', note: 'should not close' }] },
    { title: 'Save the Hendersons', tier: 'major', beats: [{ chapter: 1, type: 'open' }, { chapter: 3, type: 'hint' }, { chapter: 6, type: 'hint' }, { chapter: 9, type: 'reveal' }, { chapter: 10, type: 'close' }] },
  ] }), 10)!;
  const series = plan.threads[0];
  assert.equal(series.continues, true);
  assert.equal(series.closesIn, 10);
  assert.ok(!series.beats.some((b) => b.type === 'close'), 'no close beat');
  assert.ok(series.beats.some((b) => b.chapter === 10 && b.type === 'advance'), 'stray close becomes a partial answer');
  const last = threadsForChapter(plan, 10);
  assert.deepEqual(last.closing.map((x) => x.title), ['Save the Hendersons']);
  const g10 = buildThreadGuidanceBlock(plan, 10);
  assert.ok(g10.includes('SERIES THREADS (stay open past this book)') && g10.includes('not a cliffhanger'), g10);
  const g5 = buildThreadGuidanceBlock(plan, 5);
  assert.ok(g5.includes('SERIES THREADS (never resolve in this book') && !g5.includes('KEEP OPEN (do not resolve or reveal yet): Who harvests'), g5);
  const ch = (n: number, prose = 'x') => ({ id: 'c' + n, number: n, prose }) as any;
  assert.equal(threadStatus(series, [ch(2), ch(10)]), 'continues');
  assert.equal(retimeThread(series, 4, 6, 10).closesIn, 10, 'series end is pinned to the last chapter');
  const w = analyzeThreadPlan(plan, 10).map((x) => x.message).join('\n');
  assert.ok(!w.includes('No series thread') && !w.includes('may not feel finished'), w);
  const noSeries = parseThreadPlan(JSON.stringify({ threads: [{ title: 'A', tier: 'major', beats: [{ chapter: 1, type: 'open' }, { chapter: 3, type: 'close' }] }] }), 10)!;
  const w2 = analyzeThreadPlan(noSeries, 10).map((x) => x.message).join('\n');
  assert.ok(w2.includes('No series thread') && w2.includes('may not feel finished'), w2);
});

t('arc map: parse, normalize, per-chapter guidance', () => {
  const plan = parseArcPlan('```json\n' + JSON.stringify({
    characters: [
      { name: 'Maya Chen', role: 'protagonist', shape: 'positive', want: 'the truth', need: 'to forgive', flaw: 'trusts no one',
        beats: [{ chapter: 8, type: 'change', note: 'she lets him in' }, { chapter: 1, type: 'setup', note: 'shuts out her brother' }, { chapter: 3, type: 'setup', note: 'dup' },
          { chapter: 5, type: 'turn', note: 'reads his side' }, { chapter: 7, type: 'crisis' }, { chapter: 9, type: 'test', note: 'after the change, dropped' }] },
      { name: '', beats: [{ chapter: 1, type: 'setup' }] },
    ],
    artifacts: [
      { name: 'Brass Key', description: 'heavy, green with age', significance: 'opens the vault',
        beats: [{ chapter: 6, type: 'payoff', note: 'opens the vault' }, { chapter: 2, type: 'use', note: 'found in a drawer', holder: 'Maya Chen' }, { chapter: 4, type: 'handoff', note: 'stolen', holder: 'Ezra' }] },
    ],
  }) + '\n```', 10)!;
  assert.equal(plan.characters.length, 1, 'nameless arc dropped');
  const maya = plan.characters[0];
  assert.deepEqual(maya.beats.map((b) => `${b.chapter}${b.type}`), ['1setup', '5turn', '7crisis', '8change'], 'one setup, nothing after change');
  const key = plan.artifacts[0];
  assert.equal(key.beats[0].type, 'introduce', 'first beat becomes the introduction');
  assert.equal(key.introducedIn, 2);
  assert.equal(key.payoffIn, 6);
  assert.equal(artifactHolderBefore(key, 5), 'Ezra');

  const a1 = arcsForChapter(plan, 1);
  assert.equal(a1.arcBeats[0].beat.type, 'setup');
  assert.deepEqual(a1.artifactsNotYet.map((x) => x.name), ['Brass Key']);
  const g1 = buildArcGuidanceBlock(plan, 1);
  assert.ok(g1.includes('Maya Chen — SETUP: shuts out her brother') && g1.includes('NOT YET ON THE PAGE (do not mention): Brass Key (appears Ch.2)'), g1);
  const g2 = buildArcGuidanceBlock(plan, 2);
  assert.ok(g2.includes('Brass Key — APPEARS') && g2.includes('it matters in Ch.6') && g2.includes('held by Maya Chen'), g2);
  const g3 = buildArcGuidanceBlock(plan, 3);
  assert.ok(g3.includes("where they stand: last setup in Ch.1") && g3.includes('still lacks: to forgive'), g3);
  assert.ok(g3.includes('Brass Key — in play, held by Maya Chen'), g3);
  const g9 = buildArcGuidanceBlock(plan, 9);
  assert.ok(!g9.includes('Maya Chen') && !g9.includes('Brass Key'), 'arc complete and object paid off: nothing to carry');
  assert.equal(analyzeArcPlan(plan, 10).filter((w) => w.level === 'warning').length, 0);
});

t('arc map: health checks and prompt', () => {
  const plan = parseArcPlan(JSON.stringify({
    characters: [{ name: 'Ezra', role: 'protagonist', beats: [{ chapter: 4, type: 'setup' }, { chapter: 5, type: 'change' }] }],
    artifacts: [{ name: 'Letter', beats: [{ chapter: 3, type: 'introduce' }] }],
  }), 10)!;
  const w = analyzeArcPlan(plan, 12).map((x) => x.message).join('\n');
  assert.ok(w.includes('built for 10 chapters'), w);
  assert.ok(w.includes('too quickly') && w.includes('without a turn or crisis'), w);
  assert.ok(w.includes('Letter is introduced in Ch.3 but never pays off'), w);
  assert.equal(parseArcPlan('not json', 10), null);
  const prompt = buildArcPlanPrompt({
    title: 'Book', chapters: [{ id: 'a', number: 1, title: 'One', premise: { purpose: 'begin', characters: ['Maya Chen'] } } as any],
    canon: [maya], threadPlan: { version: 1, generatedAt: '', chapterCount: 1, threads: [{ id: 't', title: 'The vault', tier: 'major', kind: 'mystery', question: '', resolution: '', opensIn: 1, closesIn: 1, characters: [], beats: [{ chapter: 1, type: 'reveal', note: '' }] }] },
  });
  assert.ok(prompt.includes('Maya Chen: protagonist') && prompt.includes('needs: to forgive') && prompt.includes('[major] The vault: Ch.1–1, reveal Ch.1'), prompt);
});

t('story clock + who knows what: parse, fold, prompt', () => {
  const resp = (clock: string, knowledge: string) => `SHORT_SUMMARY: Things happen.
RICH_SUMMARY:
Stuff.
OPEN_THREADS:
RESOLVED_THREAD_IDS:
CHARACTER_STATE:
- Maya Chen | location: the docks
ARTIFACT_STATE:
FACTS:
CONTRADICTIONS:
STORY_CLOCK:
${clock}
KNOWLEDGE:
${knowledge}`;
  const ch = (n: number, prose = 'Some prose here.') => ({ id: 'k' + n, number: n, title: 'T' + n, prose, aiIntentMetadata: {} }) as any;
  const c1 = ch(1);
  const a1 = applyContinuityExtraction(resp('day: Day 1 | time: late evening | elapsed: one afternoon', '- Ezra stole the key | known by: Ezra | hidden from: Maya Chen; Theo\n- The vault exists | known by: no one'), c1.prose, c1, [maya])!;
  assert.deepEqual(a1.metaPatch.storyClock, { day: 'Day 1', time: 'late evening', elapsed: 'one afternoon' });
  assert.equal((a1.metaPatch.knowledge as any[]).length, 1, 'a secret no one knows or is kept from is dropped');
  assert.equal(a1.metaPatch.continuityVersion, 2);
  c1.aiIntentMetadata = a1.metaPatch;
  assert.equal(memoryOutdated(c1), false);
  assert.equal(memoryOutdated({ ...c1, aiIntentMetadata: { summary: 'x' } }), true, 'old extraction is outdated');
  assert.equal(memoryOutdated({ ...c1, prose: '' }), false, 'unwritten chapters never need catch-up');

  const c2 = ch(2);
  const a2 = applyContinuityExtraction(resp('- day: Day 2 | time: dawn', '- Ezra stole the brass key | known by: Maya Chen'), c2.prose, c2, [maya])!;
  c2.aiIntentMetadata = a2.metaPatch;
  const c3 = ch(3, '');
  const state = foldStoryState([c1, c2, c3], 'k3');
  assert.equal(state.clock?.day, 'Day 2');
  assert.equal(state.clock?.chapter, 2);
  assert.equal(state.knowledge.length, 1);
  assert.deepEqual(state.knowledge[0].knownBy, ['Ezra', 'Maya Chen'], 'learned it: added to who knows');
  assert.deepEqual(state.knowledge[0].hiddenFrom, ['Theo'], 'no longer hidden from Maya');
  assert.equal(state.knowledge[0].chapter, 2);

  const kf = knowledgeFor(state, maya);
  assert.equal(kf.knows.length, 1);
  const theo = baseChar('c9', 'Theo Park');
  assert.equal(knowledgeFor(state, theo).doesNotKnow.length, 1, 'first-name match');

  const block = buildStoryMemoryBlock([c1, c2, c3], c3, selectRelevantCanon([maya], c3, [c1, c2, c3], state), state);
  assert.ok(block.includes('=== STORY CLOCK ===') && block.includes('Ch.2 ended: Day 2, dawn'), block);
  assert.ok(block.includes('WHO KNOWS WHAT') && block.includes('NOT known by: Theo'), block);
  const check = buildPriorMemoryForCheck(state);
  assert.ok(check.includes('STORY CLOCK: Ch.2 ended Day 2, dawn') && check.includes('SECRET: Ezra stole the brass key'), check);
  const prompt = buildContinuityExtractionPrompt({ projectTitle: 'B', chapter: c3, allChapters: [c1, c2, c3], canon: [maya] });
  assert.ok(prompt.includes('STORY_CLOCK:') && prompt.includes('KNOWLEDGE:') && prompt.includes('SECRET: Ezra'), 'extractor sees prior clock + secrets');

  const merged = mergeKnowledge([], [{ secret: 'A plan', knownBy: [], hiddenFrom: ['X'], chapter: 1 }]);
  assert.equal(merged[0].hiddenFrom[0], 'X');
});

t('canon cleanup: junk names from the scanner are caught, real names pass', () => {
  for (const junk of ["We'll", 'Three', 'Then Elena', 'Okay', 'And Marcus', 'twenty', "I'm", 'just a word']) {
    assert.ok(junkNameReason(junk), `${junk} should be junk`);
  }
  for (const real of ['Iris Kowalski', 'Iris', 'Soren Thrace', 'David', 'Agnes', 'Devon Okafor', 'Larkspur Drive', "O'Donnell", "Jehovah's Witnesses", 'Marcus Chen']) {
    assert.equal(junkNameReason(real), null, `${real} should pass the name check`);
  }
});

t('canon cleanup: heuristics delete junk, merge first names and prefixed names', () => {
  const ent = (id: string, name: string, type = 'character', extra: any = {}) => ({ ...baseChar(id, name), type, ...extra }) as any;
  const entries = [
    ent('1', 'Iris Kowalski', 'character', { description: 'lead' }), ent('2', 'Iris'), ent('3', "We'll"), ent('4', 'Three'),
    ent('5', 'Elena Park'), ent('6', 'Then Elena'), ent('7', 'David'), ent('8', 'Larkspur Drive'),
    ent('9', 'Soren Thrace'), ent('10', 'Soren Thrace'), ent('11', 'Marcus Chen'), ent('12', 'Marcus Webb'), ent('13', 'Marcus'),
  ];
  const props = heuristicCleanup(entries);
  const by = (id: string) => props.find((p) => p.id === id);
  assert.equal(by('3')?.kind, 'delete');
  assert.equal(by('4')?.kind, 'delete');
  assert.deepEqual([by('6')?.kind, (by('6') as any)?.intoId], ['merge', '5'], 'Then Elena → Elena Park');
  assert.deepEqual([by('2')?.kind, (by('2') as any)?.intoId], ['merge', '1'], 'Iris → Iris Kowalski');
  assert.equal(by('10')?.kind, 'merge', 'exact duplicate merged');
  assert.equal(by('13'), undefined, 'ambiguous first name (two Marcuses) left for review');
  assert.equal(by('7'), undefined);
  assert.equal(by('8'), undefined, 'type problems are for the AI review');

  const prompt = buildCleanupPrompt({ title: 'B', entries, outline: [{ number: 1, title: 'One' }] });
  assert.ok(prompt.includes('8. [character] Larkspur Drive'), prompt);
  const ai = parseCleanupResponse(JSON.stringify({ actions: [
    { n: 8, action: 'move', type: 'location', reason: 'a street' },
    { n: 3, action: 'delete' }, { n: 13, action: 'merge', into: 2, reason: 'into Iris, which is itself merging' },
    { n: 7, action: 'move', type: 'character' }, { n: 99, action: 'delete' }, { n: 7, action: 'delete' },
  ] }), entries);
  assert.equal(ai.length, 4, 'no-op move and out-of-range dropped; first valid action per entry wins');
  const combined = combineProposals(props, ai);
  assert.equal(combined.filter((p) => p.id === '3').length, 1, 'one proposal per entry');
  const chain = combined.find((p) => p.id === '13') as any;
  assert.deepEqual([chain.kind, chain.intoId], ['merge', '1'], 'merge into a merging entry follows to the survivor');
  assert.ok(combined.some((p) => p.kind === 'retype' && p.id === '8'));

  const remap = referenceRemap(combined, { 8: 'loc-8' });
  assert.deepEqual(remapReferences(['2', '3', '8', '1', '7', '11'], remap), ['1', 'loc-8', '11'], 'refs follow merges and moves, junk dropped, no duplicates');
});

t('new canon from the extractor: validated and not already known', () => {
  const text = `NEW_CANON:
- character | Devon Okafor | the new neighbor
- character | We'll | junk
- location | Larkspur Drive | the street where they live
- object | Brass Compass | grandfather's compass
- character | Maya | already known by first name
- character | Then Elena | junk`;
  const found = parseNewCanon(text, [maya]);
  assert.deepEqual(found.map((f) => `${f.type}:${f.name}`), ['character:Devon Okafor', 'location:Larkspur Drive', 'artifact:Brass Compass']);
  assert.equal(found[0].description, 'the new neighbor');
});

t('sanity: relationships + character timeline; open threads deduped; style defaults fill gaps', async () => {
  const mk = (n: number, line: string, threads: any[] = []) => ({ id: 'r' + n, number: n, title: 'T', prose: 'x',
    aiIntentMetadata: { characterState: parseMemorySections(`CHARACTER_STATE:\n${line}\nFACTS:`, n, [maya]).characterState, openedThreads: threads } }) as any;
  const th = (n: number, text: string) => ({ id: `t${n}`, character: 'Maya', thread: text, introducedInChapter: n });
  const chs = [
    mk(1, '- Maya | mood: guarded | arc: shuts everyone out | relationships: Ezra: distrustful', [th(1, 'find the vault')]),
    mk(2, '- Maya Chen | arc: lets Theo help once', [th(2, 'find the vault'), th(3, 'repay the debt')]),
    mk(3, '- Maya | relationships: Ezra: wary allies; Theo: trusts him'),
    { id: 'r4', number: 4, title: 'T', prose: '' } as any,
  ];
  const state = foldStoryState(chs, 'r4');
  const m = [...state.characters.values()][0];
  assert.equal(m.relationships, 'Ezra: wary allies; Theo: trusts him', 'latest relationships win');
  assert.equal(m.arc, 'lets Theo help once', 'arc kept when a later chapter omits it');
  const tl = characterTimeline(chs, maya);
  assert.deepEqual(tl.map((x) => x.chapter), [1, 2, 3]);
  assert.equal(tl[0].relationships, 'Ezra: distrustful');
  const block = buildStoryMemoryBlock(chs, chs[3], selectRelevantCanon([maya], chs[3], chs, state), state);
  assert.ok(block.includes('relationships: Ezra: wary allies'), block);

  const p = buildGenerationPrompt({ project: { id: 'p', title: 'B', type: 'book', subtype: 'novel', narrativeControls: {} } as any, chapter: chs[3], allChapters: chs, canonEntries: [],
    settings: { ai: { includeOutlineInPrompt: false }, writingStyle: { emDashEnabled: true } } as any, writingMode: 'draft', generationType: 'full-chapter' });
  assert.ok(!p.includes('undefined'), 'missing style fields fall back to defaults');
  assert.ok(p.includes('Use exactly "***" on its own line for scene breaks'), 'default is a visible scene break');
  const open = p.split('=== OPEN NARRATIVE THREADS (must respect / can resolve) ===')[1]?.split('\n===')[0] || '';
  assert.equal((open.match(/find the vault/g) || []).length, 1, 'repeated thread listed once');
  assert.ok(open.includes('repay the debt'));
});

t('rename everywhere: whole words, partial names, shared surnames left alone', () => {
  const others = [baseChar('d', 'Danny Garrity'), baseChar('r', 'Ray Garrity')];
  const pairs = buildRenamePairs('Wes Garrity', 'Cal Barlow', 'character', others);
  assert.deepEqual(pairs.map((p) => `${p.from}>${p.to}`), ['Wes Garrity>Cal Barlow', 'Wes>Cal'], 'Garrity is shared, so the surname stays');
  const text = `[Wes Garrity] Wes checked the date. "Hey, Wes," Danny said. Wes's truck. WES GARRITY. Westward. Wesley stayed.`;
  assert.equal(replaceNames(text, pairs), `[Cal Barlow] Cal checked the date. "Hey, Cal," Danny said. Cal's truck. CAL BARLOW. Westward. Wesley stayed.`);
  assert.equal(countMentions(text, pairs), 5);
  const solo = buildRenamePairs('Iris Kowalski', 'June Novak', 'character', others);
  assert.deepEqual(solo.map((p) => p.from), ['Iris Kowalski', 'Iris', 'Kowalski']);
  assert.equal(replaceNames('Kowalski and Iris met Iris Kowalski.', solo), 'Novak and June met June Novak.', 'no chained replacement');
  assert.deepEqual(buildRenamePairs('Halvorsen\'s Market', 'Kessler\'s Market', 'location'), [{ from: "Halvorsen's Market", to: "Kessler's Market" }]);
  assert.deepEqual(buildRenamePairs('Same', 'Same', 'character'), []);
  const meta = renameDeep({ summary: 'Wes finds a rod', versionHistory: [{ prose: 'Wes old draft' }], characterState: [{ name: 'Wes Garrity' }] }, pairs, new Set(['versionHistory']));
  assert.equal(meta.summary, 'Cal finds a rod');
  assert.equal(meta.characterState[0].name, 'Cal Barlow');
  assert.equal(meta.versionHistory[0].prose, 'Wes old draft', 'past drafts untouched');
});

t('reader/export cleanup: narration tags stripped, scene breaks recognized', () => {
  assert.equal(stripDialogueSpeakerTags('[Wes Garrity] Wes checked.\n[Narrator] The table.\n[NEW: idea] kept'), 'Wes checked.\nThe table.\n[NEW: idea] kept');
  assert.deepEqual(['***', '* * *', '#', '# # #', '---', 'Hi', '- item'].map(isSceneBreakLine), [true, true, true, true, true, false, false]);
});

t('nicknames: the extractor\'s "called" list is parsed for aliases', () => {
  const mem = parseMemorySections(`CHARACTER_STATE:
- Maya Chen | mood: tense | called: "Wesley" (by Ray); Store, May
FACTS:`, 1, [maya]);
  assert.deepEqual(mem.characterState[0].called, ['Wesley', 'Store', 'May']);
  assert.equal(mem.characterState[0].canonId, 'c1');
});

console.log(`\n${passed} passed`);
