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
import { parseNewCanon, buildLimitsBlock, currentLimit, foldStoryState, selectRelevantCanon, parseMemorySections, buildCanonAndMemory } from '../src/lib/story-memory';
import { buildRenamePairs, replaceNames, countMentions, renameDeep } from '../src/lib/rename';
import { stripDialogueSpeakerTags, isSceneBreakLine } from '../src/lib/clean-prose';
import { analyzeAttribution, needsDialogueClarityPass } from '../src/lib/dialogue-clarity';
import { buildNamingGuidance, nameWords, NAME_GROUPS, OVERUSED_NAMES } from '../src/lib/name-bank';
import { introductionsForChapter, buildIntroductionBlock } from '../src/lib/introductions';
import { cleanExtendMerge } from '../src/lib/extend-merge';
import { buildSynopsisPrompt, parseSynopsis, synopsisSourceKey } from '../src/lib/synopsis';
import { splitAtSceneBreaks, sanitizeAssignments, groupParagraphs, coversProse, ensureSceneCoverage, evenSplit } from '../src/lib/scene-split';
import { buildGenerationPrompt, buildSelectionEditPrompt, buildEditChatContext } from '../src/lib/prompt-builder';
import { normalizeDials, buildDialsBlock, formatWords, measureDialoguePct, DEFAULT_DIALS } from '../src/lib/chapter-dials';
import { parseStoryChanges, applyStoryChanges, buildStoryContext, buildStoryChangesPrompt, storyBasis, readChangeStream, countStreamedChanges, buildStoryChatSystem } from '../src/lib/story-chat';
import { applyFactBook, factRows, addFact, editFact, deleteFact, setSecret, markSeen, groupBySubject, setTimeline, setMeeting } from '../src/lib/fact-book';
import { insertionMap, reorderMap, planRenumber, renumberTitle } from '../src/lib/chapter-renumber';
import { buildLaterChaptersBlock } from '../src/lib/story-memory';
import { appendEvent, changedChars, revisedShare, chapterAuthorship, buildAuthorshipReport, renderAuthorshipHtml, describeEvent, changedFieldLabels } from '../src/lib/authorship';
import { splitNotes, buildRevisionBlock, parseNotesCheck, outstandingNotes } from '../src/lib/rebuild-notes';
import { splitParagraphs, parseTrackedEdits, applySuggestions, firstChangeRange } from '../src/lib/tracked-edits';
import { splitNarration, jitteredGap, speakingWpm, countWords, GAP_SECONDS, countSentenceBreaks, countClauseBreaks, stretchPauses, CLAUSE_PAUSE_SECONDS } from '../server/audio-assembly';
import { buildVoicePieces, markParagraphs, normalizeSceneBreakLines } from '../server/tts';
import { ProseLocks, PROSE_LOCK_ACTIONS } from '../server/generation-lock';
import { mergePace, paceWpm } from '../src/lib/tts-types';
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
  assert.equal(a1.metaPatch.continuityVersion, 3);
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

t('dialogue clarity: unattributed lines and subjectless beats are caught', () => {
  const names = ['Wes Garrity', 'Danny Garrity'];
  const bad = `"Can't," Wes said. "Inventory."\n\n"You don't know when I'm playing."\n\n"There's always inventory."\n\nHe chuckled. "Sure."\n\n"Right." — a dry laugh.\n\nDanny set the case down. "Memphis."`;
  assert.deepEqual(analyzeAttribution(bad, names), { dialogueParagraphs: 6, unattributed: 4, longestRun: 4 });
  assert.equal(needsDialogueClarityPass(bad, names), true);
  const good = `"Can't," Wes said.\n\nDanny frowned. "Why?"\n\n"Inventory."\n\n"There's always inventory," Danny said.`;
  assert.equal(needsDialogueClarityPass(good, names), false, 'one untagged line in a two-person exchange is standard');
});

t('name bank: varied sample by background and generation, overused and author names excluded', () => {
  const g = buildNamingGuidance({ avoid: ['Wes', 'Garrity', 'Brennan'], seed: 42 });
  const sample = g.split('Name sample:')[1];
  for (const grp of NAME_GROUPS) assert.ok(sample.includes(grp.label), grp.label);
  for (const bad of ['Marcus', 'Priya', 'Callie', 'Elena', 'Brennan']) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(sample), `${bad} must not be offered`);
  }
  assert.ok(g.includes('Do NOT use these names') && g.includes('Wes, Garrity'), 'author names listed to avoid');
  assert.notEqual(buildNamingGuidance({ seed: 1 }), buildNamingGuidance({ seed: 2 }), 'different books get different samples');
  assert.ok(g.length < 9000, `guidance stays compact (${g.length})`);
  assert.deepEqual(nameWords(['Wes Garrity', 'the courier', "O'Brien"]).sort(), ['Garrity', "O'Brien", 'Wes']);
  for (const grp of NAME_GROUPS) {
    for (const list of [grp.older, grp.middle, grp.younger, grp.child]) {
      assert.ok(list.every((n) => /\/(f|m)$/.test(n)), `${grp.label}: every first name carries /f or /m`);
    }
  }
  assert.ok(OVERUSED_NAMES.includes('Marcus'));
});

t('introductions: leads are introduced once, when they first appear; a cold open can move it', () => {
  const wes = baseChar('w', 'Wes Garrity', { role: 'protagonist', age: '38', occupation: 'night manager at Halvorsen\'s Market' });
  const ray = baseChar('r', 'Ray Garrity', { role: 'antagonist' });
  const kay = baseChar('k', 'Kayleigh Sutter');
  const ch = (n: number, prose = '', chars: string[] = []) => ({ id: 'i' + n, number: n, title: 'T', prose, premise: { characters: chars } }) as any;
  const c1 = ch(1, '', ['Kayleigh Sutter']), c2 = ch(2, '', ['Ray Garrity', 'Wes Garrity']);
  const i1 = introductionsForChapter({ chapter: c1, allChapters: [c1, c2], canon: [wes, ray, kay] });
  assert.deepEqual(i1.map((x) => x.name), ['Wes Garrity'], 'protagonist in Ch.1 by default; side characters never');
  assert.ok(i1[0].facts.includes('age 38') && i1[0].facts.some((f) => f.includes('night manager')));
  const block = buildIntroductionBlock(i1);
  assert.ok(block.includes('INTRODUCING') && block.includes('Wes Garrity (protagonist)') && block.includes('never a mirror scene'), block);
  const written1 = ch(1, 'Wes Garrity straightened the bananas.');
  const i2 = introductionsForChapter({ chapter: c2, allChapters: [written1, c2], canon: [wes, ray, kay] });
  assert.deepEqual(i2.map((x) => x.name), ['Ray Garrity'], 'Wes already on the page; Ray appears now');
  const plan = parseArcPlan(JSON.stringify({ characters: [{ name: 'Wes Garrity', role: 'protagonist', introduce: { chapter: 2, note: 'after the cold open' }, beats: [{ chapter: 2, type: 'setup' }, { chapter: 9, type: 'change' }] }] }), 10)!;
  assert.equal(plan.characters[0].introducedIn, 2);
  assert.deepEqual(introductionsForChapter({ chapter: c1, allChapters: [c1, c2], canon: [wes], plan }).map((x) => x.name), [], 'cold open: not in Ch.1');
  const i2p = introductionsForChapter({ chapter: c2, allChapters: [c1, c2], canon: [wes], plan });
  assert.equal(i2p[0]?.note, 'after the cold open');
  assert.equal(buildIntroductionBlock([]), '');
});

t('extend merge: a continuation that finishes a cut-off word keeps the fragment', () => {
  const base = 'The front door banged before she could answer.\n\nDanny came in, sh';
  const m = cleanExtendMerge(base, 'aggy hair, guitar case bumping the doorframe.');
  assert.equal(m.cleanedBase + m.joiner + m.cleanedExtension, 'The front door banged before she could answer.\n\nDanny came in, shaggy hair, guitar case bumping the doorframe.');
  const m2 = cleanExtendMerge('He waited. Then the door', 'opened slowly.');
  assert.equal(m2.cleanedBase + m2.joiner + m2.cleanedExtension, 'He waited. Then the door opened slowly.');
  const m3 = cleanExtendMerge('He waited. Then the door', 'The door opened.');
  assert.equal(m3.cleanedBase + m3.joiner + m3.cleanedExtension, 'He waited.\n\nThe door opened.', 'fresh sentence: dangling fragment trimmed');
  const m5 = cleanExtendMerge('He waited. Then the door', 'Then the door opened slowly.');
  assert.equal(m5.cleanedBase + m5.joiner + m5.cleanedExtension, 'He waited. Then the door opened slowly.', 'restated sentence stays in its paragraph');
  const m6 = cleanExtendMerge('He waited.\n\nDanny came in, sh', 'Danny came in, shaggy hair.');
  assert.equal(m6.cleanedBase + m6.joiner + m6.cleanedExtension, 'He waited.\n\nDanny came in, shaggy hair.');
  const m4 = cleanExtendMerge('It was late.', '## Chapter 3: Night\n\nIt was later.');
  assert.equal(m4.cleanedExtension, 'It was later.');
});

t('scene split: never loses text; scene breaks are exact boundaries', () => {
  const prose = 'A one.\n\nA two.\n\n***\n\nB one.\n\n# # #\n\nC one.\n\nC two.';
  assert.deepEqual(splitAtSceneBreaks(prose), ['A one.\n\nA two.', 'B one.', 'C one.\n\nC two.']);
  const paras = ['p1', 'p2', 'p3', 'p4', 'p5'];
  // bad model output: unknown 0, out of range 9, going backwards, too short
  const a = sanitizeAssignments([1, 0, 3, 2, 9], paras.length, 3);
  assert.deepEqual(a, [0, 0, 2, 2, 2], 'invalid numbers follow the previous paragraph; never backwards');
  assert.deepEqual(sanitizeAssignments([1, 2], 5, 3), [0, 1, 1, 1, 1], 'missing tail follows the last scene');
  const grouped = groupParagraphs(paras, a, 3);
  assert.ok(coversProse(paras.join('\n\n'), grouped), 'all paragraphs kept');
  assert.equal(coversProse('A. B. C.', ['A.', 'C.']), false);
  // A manual split that missed the opening is repaired from the scene breaks.
  const scenes = [{ order: 1, prose: 'A two.' }, { order: 2, prose: 'B one.' }, { order: 3, prose: 'C one.\n\nC two.' }];
  const fixed = ensureSceneCoverage(prose, scenes);
  assert.deepEqual(fixed.map((x) => x.prose), ['A one.\n\nA two.', 'B one.', 'C one.\n\nC two.']);
  assert.equal(ensureSceneCoverage(prose, fixed), fixed, 'complete scenes untouched');
  assert.deepEqual(evenSplit(paras, 2), ['p1\n\np2\n\np3', 'p4\n\np5']);
});

t('scene audio: published strictly in story order; failures skipped, not blocking', async () => {
  const { createOrderedPublisher } = await import('../src/lib/scene-audio');
  const seen: number[] = [];
  const pub = createOrderedPublisher<string>(4, (i) => seen.push(i));
  pub.settle(2, 'c');
  assert.deepEqual(seen, [], 'scene 3 waits for 1 and 2');
  pub.settle(0, 'a');
  assert.deepEqual(seen, [0]);
  pub.settle(1, null);
  assert.deepEqual(seen, [0, 2], 'failed scene skipped; scene 3 follows');
  pub.settle(3, 'd');
  assert.deepEqual(seen, [0, 2, 3]);
  assert.equal(pub.published, 4);
});

t('synopsis: principles in the prompt, ending kept separate, staleness tracked', () => {
  const chs = [
    { id: 's1', number: 1, title: 'Closing Walkthrough', prose: 'x', aiIntentMetadata: { richSummary: 'Wes finds a glass rod under the closet floor.' } },
    { id: 's2', number: 2, title: 'Tuesdays', prose: '', premise: { purpose: 'Wes tests the rod at Brookhaven.' } },
  ] as any;
  const project = { id: 'p', title: 'The Late Shift', narrativeControls: { genreEmphasis: ['literary', 'speculative'] } } as any;
  const prompt = buildSynopsisPrompt({ project, chapters: chs, canon: [maya] });
  assert.ok(prompt.includes('[WRITTEN]: Wes finds a glass rod') && prompt.includes('[PLANNED]: Wes tests the rod'), prompt);
  assert.ok(prompt.includes('Present tense') && prompt.includes('cause and effect') && prompt.includes('Tell the climax and the ending plainly'));
  assert.ok(prompt.includes('Maya Chen (protagonist)'));
  const key = synopsisSourceKey(project, chs);
  const syn = parseSynopsis('```json\n{"logline":"A night manager finds a rod.","body":["P1","P2"],"ending":"E1\n\nE2"}\n```', key, true)!;
  assert.deepEqual([syn.body, syn.ending, syn.fromOutline], [['P1', 'P2'], ['E1', 'E2'], true]);
  assert.equal(parseSynopsis('{"logline":"x","body":[]}', key, false), null, 'empty body rejected');
  const changed = [{ ...chs[0] }, { ...chs[1], premise: { purpose: 'Wes tests the rod at the lake.' } }];
  assert.notEqual(synopsisSourceKey(project, changed), key, 'premise change makes it stale');
  assert.equal(synopsisSourceKey(project, [...chs].reverse()), key, 'order-independent');
});

t('chapter edits see the thread map, the arc map and the whole chapter', () => {
  const threadPlan = parseThreadPlan(JSON.stringify({ threads: [
    { title: 'The frost closet', tier: 'major', question: 'What is behind the closet?', resolution: 'A buried freezer',
      beats: [{ chapter: 1, type: 'open', note: 'Wes finds frost' }, { chapter: 5, type: 'reveal', note: 'freezer found' }, { chapter: 6, type: 'close' }] },
  ] }), 6, 'now');
  const arcPlan = parseArcPlan(JSON.stringify({ characters: [
    { name: 'Wes', role: 'protagonist', want: 'close the sale', beats: [{ chapter: 1, type: 'establish', note: 'tired realtor' }, { chapter: 6, type: 'resolve' }] },
  ], artifacts: [] }), 6, 'now');
  assert.ok(threadPlan && arcPlan);
  const project: any = { id: 'p', title: 'Closing', type: 'book', subtype: 'novel', narrativeControls: {}, threadPlan, arcPlan };
  const prose = 'Wes checked the fridge. '.repeat(600) + 'THE LAST LINE.';
  const chapter: any = { id: 'c1', projectId: 'p', number: 1, title: 'Closing Walkthrough', prose, premise: { purpose: 'Wes notices the cold' } };
  const settings: any = { writingStyle: {}, ai: {} };
  const full = buildSelectionEditPrompt({ project, chapter, allChapters: [chapter], canonEntries: [], settings, instruction: 'more internal thought', selectedText: null, fullProse: prose, chatHistory: [] });
  assert.ok(full.includes('The frost closet'), 'thread map in edit prompt');
  assert.ok(full.includes('tired realtor'), 'arc map in edit prompt');
  assert.ok(full.includes('never reveal or resolve anything a thread is meant to keep open'));
  assert.ok(full.includes('THE LAST LINE.'), 'whole chapter sent, not the first 6000 chars');
  assert.ok(full.includes('[P1] Wes checked') && full.includes('"changes"'), 'full-chapter edits ask for tracked changes');
  const sel = buildSelectionEditPrompt({ project, chapter, allChapters: [chapter], canonEntries: [], settings, instruction: 'x', selectedText: 'Wes checked the fridge.', fullProse: prose, chatHistory: [] });
  assert.ok(sel.includes('The frost closet'), 'selection edits get the plan too');
  const chat = buildEditChatContext({ project, chapter, allChapters: [chapter], canonEntries: [] });
  assert.ok(chat.includes('The frost closet') && chat.includes('Wes notices the cold'));
});

t('condition & limits: canon sets it, the page can update or lift it, always reaches the writer', () => {
  const nana = baseChar('n', 'Ruth Hale', { role: 'supporting', condition: 'Advanced stroke: speaks a word or two at a time; bedridden' });
  const wes = baseChar('w', 'Wes Carter', { role: 'protagonist' });
  const canon = [nana, wes] as any[];
  const mk = (id: string, number: number, meta: any = {}) => ({ id, projectId: 'p', number, title: `C${number}`, prose: 'Wes visited Ruth Hale.', premise: { characters: ['Wes Carter', 'Ruth Hale'] }, aiIntentMetadata: meta } as any);
  const ch1 = mk('c1', 1);
  // No memory yet: the canon condition applies.
  const block = buildLimitsBlock(selectRelevantCanon(canon, ch1, [ch1]), foldStoryState([ch1], 'c1'));
  assert.ok(block.includes("WHAT CHARACTERS CAN AND CAN'T DO") && block.includes('Ruth Hale: Advanced stroke'));
  assert.ok(!block.includes('Wes Carter:'));
  // Included even when full canon cards are off.
  assert.ok(buildCanonAndMemory(canon, ch1, [ch1], false).includes('Ruth Hale: Advanced stroke'));
  // The page updates it, then lifts it.
  const parsed = parseMemorySections('CHARACTER_STATE:\n- Ruth Hale | location: hospital | capacity: can only squeeze a hand; no speech\n', 1, canon);
  assert.equal(parsed.characterState[0].capacity, 'can only squeeze a hand; no speech');
  const c1 = mk('c1', 1, { characterState: parsed.characterState });
  const c2 = mk('c2', 2, { characterState: [{ name: 'Ruth Hale', canonId: 'n', capacity: 'none now — recovered her speech' }] });
  const c3 = mk('c3', 3);
  assert.equal(currentLimit(nana as any, foldStoryState([c1, c2, c3], 'c2').characters.get('id:n')), 'can only squeeze a hand; no speech');
  assert.equal(currentLimit(nana as any, foldStoryState([c1, c2, c3], 'c3').characters.get('id:n')), null);
});

t('arc map: limits on arcs, a supporting cast with limits, no duplicates of arc characters', () => {
  const plan = parseArcPlan(JSON.stringify({
    characters: [{ name: 'Wes', role: 'protagonist', limits: 'none', beats: [{ chapter: 1, type: 'setup' }, { chapter: 4, type: 'change' }] }],
    artifacts: [],
    cast: [
      { name: 'Ruth Hale', who: "Wes's grandmother, 84, in hospice", limits: 'barely speaks; bedridden' },
      { name: 'Wes', who: 'dup' },
      { name: 'Dr. Ames', who: 'night doctor, brisk', limits: 'N/A' },
      { name: '', who: 'nameless' },
    ],
  }), 6, 'now')!;
  assert.equal(plan.characters[0].limits, undefined, '"none" is not a limit');
  assert.deepEqual(plan.cast, [
    { name: 'Ruth Hale', who: "Wes's grandmother, 84, in hospice", limits: 'barely speaks; bedridden' },
    { name: 'Dr. Ames', who: 'night doctor, brisk' },
  ]);
  const prompt = buildArcPlanPrompt({ title: 'T', chapters: [{ id: 'a', number: 1, title: 'A', premise: {} } as any, { id: 'b', number: 2, title: 'B', premise: {} } as any], canon: [baseChar('n', 'Ruth', { condition: 'bedridden' })] as any });
  assert.ok(prompt.includes('limits: bedridden') && prompt.includes('SUPPORTING CAST') && prompt.includes('"cast"'));
});

t('rebuild notes: split into items, numbered brief, per-note check', () => {
  assert.deepEqual(splitNotes('- Slow down the drive.\n- Danny leaves angrier\n3) Cut the diner scene'), ['Slow down the drive.', 'Danny leaves angrier', 'Cut the diner scene']);
  assert.deepEqual(splitNotes('Make Wes more scared. He should hear the fridge hum. Yes. Add a call from Mara at the end.'),
    ['Make Wes more scared.', 'He should hear the fridge hum. Yes.', 'Add a call from Mara at the end.']);
  assert.deepEqual(splitNotes('   '), []);
  const block = buildRevisionBlock(['Cut the diner scene', 'Danny leaves angrier'], true);
  assert.ok(block.includes('1. Cut the diner scene') && block.includes('outrank the current draft'));
  const check = parseNotesCheck('{"results":[{"n":1,"status":"done","detail":"diner gone"},{"n":2,"status":"partly"},{"n":9,"status":"done"}]}', ['Cut the diner scene', 'Danny leaves angrier', 'Add the call'], 'now')!;
  assert.deepEqual(check.results.map((r) => r.status), ['done', 'partly', 'missing']);
  assert.deepEqual(outstandingNotes(check), ['Danny leaves angrier', 'Add the call']);
  assert.equal(parseNotesCheck('nope', ['a']), null);
});

t('chapter-writing lock: retry of the same chapter supersedes, other chapters wait, stale locks never strand', () => {
  let now = 0;
  const locks = new ProseLocks(5 * 60_000, () => now);
  const a = locks.acquire('u', 'ch6');
  assert.ok(a.ok && !a.superseded);
  // Phone slept; the author taps Generate again on the same chapter.
  const b = locks.acquire('u', 'ch6');
  assert.ok(b.ok && b.superseded);
  assert.ok(a.ok && a.lock.abort.signal.aborted, 'abandoned run is cancelled');
  // A different chapter waits while ch6 is being written.
  const c = locks.acquire('u', 'ch7');
  assert.ok(!c.ok && c.busyChapterId === 'ch6');
  // The superseded run finishing late can't free its successor's lock.
  if (a.ok) locks.release('u', a.lock);
  assert.ok(!locks.acquire('u', 'ch7').ok);
  // After the TTL a lock no longer blocks, and its run is left alone.
  now += 5 * 60_000 + 1;
  const d = locks.acquire('u', 'ch7');
  assert.ok(d.ok && !d.superseded);
  assert.ok(b.ok && !b.lock.abort.signal.aborted);
  if (d.ok) locks.release('u', d.lock);
  assert.equal(locks.size, 0);
  // Only chapter writing is locked; edits and analysis never are.
  assert.ok(PROSE_LOCK_ACTIONS.has('generate-chapter') && !PROSE_LOCK_ACTIONS.has('inline-edit') && !PROSE_LOCK_ACTIONS.has('dialogue-clarity-pass'));
});

t('story chat: proposals checked against the book, applied only when accepted, written chapters flagged', () => {
  const threadPlan = parseThreadPlan(JSON.stringify({ threads: [
    { title: 'Who took the rod', tier: 'major', question: 'Who?', resolution: 'Danny', beats: [{ chapter: 1, type: 'open' }, { chapter: 3, type: 'hint', note: 'Danny lies' }, { chapter: 5, type: 'close' }] },
    { title: 'Stray dog', tier: 'hook', question: 'Whose dog?', beats: [{ chapter: 2, type: 'open' }, { chapter: 4, type: 'close' }] },
  ] }), 6, 'now')!;
  const arcPlan = parseArcPlan(JSON.stringify({ characters: [{ name: 'Ray', role: 'supporting', beats: [{ chapter: 1, type: 'setup' }, { chapter: 5, type: 'change' }] }], artifacts: [] }), 6, 'now')!;
  const project: any = { id: 'p', title: 'Late Shift', threadPlan, arcPlan, narrativeControls: {} };
  const mk = (n: number, written: boolean): any => ({ id: `c${n}`, number: n, title: `T${n}`, prose: written ? 'Words.' : '', premise: { purpose: `Purpose ${n}`, changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] } });
  const chapters = [mk(1, true), mk(2, true), mk(3, true), mk(4, false), mk(5, false), mk(6, false)];
  const [rod, dog] = threadPlan.threads;
  const ray = arcPlan.characters[0];
  const reply = JSON.stringify({ summary: 'Ray becomes the thief', changes: [
    { kind: 'thread', op: 'update', id: rod.id, why: 'Ray, not Danny', thread: { title: 'Who took the rod', tier: 'major', question: 'Who?', resolution: 'Ray', beats: [{ chapter: 1, type: 'open' }, { chapter: 3, type: 'hint', note: 'Danny lies' }, { chapter: 4, type: 'hint', note: 'Ray flinches' }, { chapter: 5, type: 'close' }] } },
    { kind: 'thread', op: 'remove', id: dog.id, why: 'Clutter' },
    { kind: 'thread', op: 'remove', id: 'th-nope' },
    { kind: 'character', op: 'update', id: ray.id, arc: { name: 'Ray', role: 'antagonist', shape: 'negative', limits: 'none', beats: [{ chapter: 1, type: 'setup' }, { chapter: 2, type: 'test', note: 'Ray steals' }, { chapter: 5, type: 'change' }] } },
    { kind: 'chapter', op: 'update', chapter: 4, premise: { purpose: 'Ray is nearly caught', emotionalBeat: 'dread' } },
    { kind: 'chapter', op: 'update', chapter: 9, premise: { purpose: 'out of range' } },
    { kind: 'chapter', op: 'update', chapter: 5, premise: { purpose: 'Purpose 5' } },
  ] });
  const set = parseStoryChanges(reply, project, chapters)!;
  assert.deepEqual(set.changes.map((c) => `${c.kind}:${c.op}`), ['thread:update', 'thread:remove', 'character:update', 'chapter:update']);
  assert.deepEqual(set.changes[0].chapters, [4, 5], 'only the chapters whose beats changed (new hint, close now names Ray)');
  assert.equal(set.basis, storyBasis(project, chapters));
  // Accept everything but the dog removal.
  const keep = new Set(set.changes.filter((c) => !(c.kind === 'thread' && c.op === 'remove')).map((c) => c.id));
  const out = applyStoryChanges(project, chapters, set.changes, keep, 'later');
  assert.equal(out.threadPlan!.threads.length, 2);
  assert.equal(out.threadPlan!.threads.find((t) => t.id === rod.id)!.resolution, 'Ray');
  assert.equal(out.arcPlan!.characters[0].role, 'antagonist');
  assert.deepEqual(out.premiseUpdates.map((u) => [u.chapterId, u.premise.purpose, u.premise.emotionalBeat, u.premise.changes]), [['c4', 'Ray is nearly caught', 'dread', '']]);
  assert.deepEqual(out.writtenChaptersAffected, [2], 'Ray now steals in written Ch 2');
  // Prompts carry ids and the conversation.
  const ctx = buildStoryContext({ project, chapters, canon: [] });
  assert.ok(ctx.includes(`[${rod.id}]`) && ctx.includes('[WRITTEN]') && ctx.includes('[PLANNED]'));
  assert.ok(buildStoryChangesPrompt(ctx, [{ role: 'user', content: 'Make Ray the thief', at: '' }], { threadPlan, arcPlan }).includes('Make Ray the thief'));
  assert.equal(parseStoryChanges('no json', project, chapters), null);
});

t('story chat drafts: patches, cut-off replies, sloppy JSON, and written chapters kept as canon', () => {
  const threadPlan = parseThreadPlan(JSON.stringify({ threads: [
    { title: 'The matchbook', tier: 'major', kind: 'mystery', question: 'Who wrote it?', resolution: 'Gil', beats: [{ chapter: 1, type: 'open', note: 'matchbook found' }, { chapter: 2, type: 'advance', note: 'Gil handwriting' }, { chapter: 6, type: 'close', note: 'Gil confesses' }] },
  ] }), 6, 'now')!;
  const project: any = { id: 'p', title: 'Late Shift', threadPlan, arcPlan: null, narrativeControls: {} };
  const mk = (n: number, written: boolean): any => ({ id: `c${n}`, number: n, title: `T${n}`, prose: written ? 'Words.' : '', premise: { purpose: `P${n}`, changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] } });
  const chapters = [mk(1, true), mk(2, true), mk(3, false), mk(4, false), mk(5, false), mk(6, false)];
  const th = threadPlan.threads[0];

  // A twist as a short patch: re-read Ch2 (written), remove its beat (not allowed), add a reveal in Ch5, re-resolve.
  const patch = { kind: 'thread', op: 'update', id: th.id, why: 'Bea forged it', patch: {
    resolution: 'Bea forged it',
    editBeats: [{ chapter: 2, type: 'advance', newType: 'hint', note: 'the handwriting is a forgery (in hindsight)' }],
    removeBeats: [{ chapter: 1, type: 'open' }],
    addBeats: [{ chapter: 5, type: 'reveal', note: 'Ray spots the forgery' }],
  } };
  const outline = { kind: 'chapter', op: 'update', chapter: 2, premise: { purpose: 'Rewrite Ch2' } };
  const future = { kind: 'chapter', op: 'update', chapter: 5, premise: { purpose: 'Ray spots the forgery' } };
  const reply = '{"summary":"Bea is the handler","changes":[' + JSON.stringify(patch) + ',' + JSON.stringify(outline) + ',' + JSON.stringify(future) + ']}';
  const locked = parseStoryChanges(reply, project, chapters, { canonLocked: true })!;
  assert.deepEqual(locked.changes.map((c) => c.kind), ['thread', 'chapter']);
  const t2 = locked.changes[0].thread!;
  assert.equal(t2.resolution, 'Bea forged it');
  assert.ok(t2.beats.some((b) => b.chapter === 1 && b.type === 'open'), 'written-chapter beat kept');
  assert.ok(t2.beats.some((b) => b.chapter === 2 && b.type === 'hint' && b.note.includes('forgery')), 're-described in place');
  assert.ok(t2.beats.some((b) => b.chapter === 5 && b.type === 'reveal'));
  assert.deepEqual(locked.changes[0].reinterprets, [2]);
  assert.deepEqual(locked.setAside, ['Outline change to Ch 2 (already written)']);
  assert.equal(locked.truncated, false);
  const applied = applyStoryChanges(project, chapters, locked.changes, new Set(locked.changes.map((c) => c.id)));
  assert.deepEqual(applied.reinterpretedChapters, [2]);

  // Unlocked: the written beat can go and the written outline can change.
  const open = parseStoryChanges(reply, project, chapters, { canonLocked: false })!;
  assert.deepEqual(open.changes.map((c) => c.kind), ['thread', 'chapter', 'chapter']);
  assert.ok(!open.changes[0].thread!.beats.some((b) => b.chapter === 1 && b.note === 'matchbook found'));

  // Cut off mid-way: the complete changes survive and it says so.
  const cut = reply.slice(0, reply.indexOf(JSON.stringify(future)) + 20);
  const partial = parseStoryChanges(cut, project, chapters, { canonLocked: false })!;
  assert.equal(partial.truncated, true);
  assert.equal(partial.changes.length, 2);
  assert.equal(countStreamedChanges(cut), 2);

  // Raw line breaks and trailing commas are tolerated.
  const sloppy = '```json\n{"summary":"s","changes":[{"kind":"chapter","op":"update","chapter":4,"why":"line one\nline two","premise":{"purpose":"New P4",},},]}\n```';
  const fixed = parseStoryChanges(sloppy, project, chapters)!;
  assert.equal(fixed.changes[0].premise!.purpose, 'New P4');
  assert.equal(readChangeStream('{"summary":"nothing","changes":[]}')!.complete, true);

  // Prompts carry the canon rule only when locked.
  assert.ok(buildStoryChatSystem({ canonLocked: true }).includes('WRITTEN CHAPTERS ARE CANON'));
  assert.ok(!buildStoryChatSystem({ canonLocked: false }).includes('WRITTEN CHAPTERS ARE CANON'));
  const p = buildStoryChangesPrompt('ctx', [], { threadPlan }, { canonLocked: true, alreadyDrafted: ['thread The matchbook'] });
  assert.ok(p.includes('"addBeats"') && p.includes('do NOT repeat them') && p.includes('WRITTEN CHAPTERS ARE CANON'));
});

t('authorship record: grouped typing, revised share, per-chapter counts, private export escapes text', () => {
  // Typing within 15 minutes is one session; a later burst is a new one.
  let log = appendEvent([], { at: '2026-10-07T10:00:00Z', kind: 'author-edit', chars: 40 });
  log = appendEvent(log, { at: '2026-10-07T10:05:00Z', kind: 'author-edit', chars: 60 });
  log = appendEvent(log, { at: '2026-10-07T11:00:00Z', kind: 'author-edit', chars: 5 });
  assert.equal(log.length, 2);
  assert.deepEqual([log[0].chars, log[0].since, log[0].at], [100, '2026-10-07T10:00:00Z', '2026-10-07T10:05:00Z']);
  assert.equal(changedChars('The cat sat.', 'The dog sat.'), 3);
  assert.equal(changedChars('same', 'same'), 0);
  // The rewritten sentence is 18 of the final text's 28 sentence characters.
  assert.equal(revisedShare('He waited. She left.', 'He waited. She ran home fast.'), 64);
  assert.equal(revisedShare(undefined, 'x'), null);

  const chapter: any = {
    id: 'c1', number: 1, title: 'Closing <Walkthrough>', prose: 'He waited. She ran home fast.',
    aiIntentMetadata: {
      versionHistory: [{ type: 'ai-generated', prose: 'He waited. She left.' }],
      authorship: [
        { at: '2026-10-07T09:00:00Z', kind: 'author-direction', note: 'Settings: 2,500 words' },
        { at: '2026-10-07T09:01:00Z', kind: 'ai-draft', model: 'claude-opus', words: 2500 },
        { at: '2026-10-07T09:30:00Z', kind: 'author-direction', note: 'Make Wes "more" scared & <tense>' },
        { at: '2026-10-07T09:31:00Z', kind: 'ai-edit', model: 'claude-fable' },
        { at: '2026-10-07T09:32:00Z', kind: 'author-review', accepted: 3, offered: 5 },
        ...log,
      ],
    },
  };
  const c = chapterAuthorship(chapter);
  assert.deepEqual([c.aiDrafts, c.aiEdits, c.directions.length, c.suggestionsAccepted, c.suggestionsOffered, c.typedSessions, c.typedChars, c.revisedPct],
    [1, 1, 2, 3, 5, 2, 105, 64]);
  assert.deepEqual(c.models, ['Claude Opus', 'Claude Fable']);
  const report = buildAuthorshipReport({ project: { title: 'Late Shift', storyChat: { messages: [{ role: 'user' }, { role: 'assistant' }], decisions: [] } } as any, chapters: [chapter, { id: 'c2', number: 2, title: 'Old', prose: 'Words here.' } as any], now: '2026-10-07T12:00:00Z' });
  assert.equal(report.trackingSince, '2026-10-07T09:00:00Z');
  assert.equal(report.storyChat.authorMessages, 1);
  assert.equal(report.chapters[1].events.length, 0);
  const html = renderAuthorshipHtml(report);
  assert.ok(html.includes('Closing &lt;Walkthrough&gt;') && html.includes('&quot;more&quot; scared &amp; &lt;tense&gt;'));
  assert.ok(!html.includes('<tense>'));
  assert.ok(html.includes('Written before detailed tracking began'));
  assert.equal(c.revisionRounds, 3, '1 AI edit + 2 typing sessions');
});

t('authorship record: first person, book-level development, export without dates', () => {
  assert.equal(describeEvent({ at: 'x', kind: 'ai-draft', model: 'claude-opus', words: 2500 }), 'I had the AI draft this chapter from my outline and settings (Claude Opus) — 2,500 words.');
  assert.equal(describeEvent({ at: 'x', kind: 'author-review', accepted: 4, offered: 6 }), 'I reviewed 6 suggested changes and kept 4.');
  assert.equal(describeEvent({ at: 'x', kind: 'author-canon-edit', subject: 'Ruth Hale', fields: ['condition & limits', 'appearance'] }), 'I developed “Ruth Hale” — condition & limits, appearance.');
  // Canon edits to the same entry within a session are one step with all fields.
  let log = appendEvent([], { at: '2026-10-07T10:00:00Z', kind: 'author-canon-edit', subject: 'Ruth Hale', entity: 'character', fields: ['age'] });
  log = appendEvent(log, { at: '2026-10-07T10:03:00Z', kind: 'author-canon-edit', subject: 'Ruth Hale', entity: 'character', fields: ['condition & limits', 'age'] });
  log = appendEvent(log, { at: '2026-10-07T10:04:00Z', kind: 'author-canon-edit', subject: 'Wes', entity: 'character', fields: ['occupation'] });
  assert.equal(log.length, 2);
  assert.deepEqual(log[0].fields, ['age', 'condition & limits']);
  assert.deepEqual(changedFieldLabels({ type: 'character', name: 'Ruth', character: { age: '80', condition: '' } } as any, { character: { age: '80', condition: 'bedridden' }, description: 'Grandmother' }), ['condition & limits', 'description']);

  const project: any = { title: 'Late Shift', authorship: [
    { at: '2026-10-07T09:00:00Z', kind: 'ai-plan-threads', model: 'claude-opus', note: '15 plot lines across 14 chapters' },
    { at: '2026-10-07T09:10:00Z', kind: 'author-plan-edit', subject: 'thread map', note: 'removed a plot line' },
    { at: '2026-10-07T09:20:00Z', kind: 'author-canon-create', subject: 'New Character', entity: 'character', ref: 'e-bea' },
    { at: '2026-10-07T09:21:00Z', kind: 'author-rename', subject: 'Bea', entity: 'character', ref: 'e-bea', note: '“New Character” to “Bea”' },
    ...log,
  ] };
  const r = buildAuthorshipReport({ project, chapters: [] });
  assert.deepEqual(r.development.plans.map((e) => e.kind), ['ai-plan-threads', 'author-plan-edit']);
  assert.deepEqual(r.development.entities.map((d) => [d.name, d.events.length]), [['Bea', 2], ['Ruth Hale', 1], ['Wes', 1]], 'a renamed entry stays one history under its new name');
  const withDates = renderAuthorshipHtml(r, { dates: true, steps: true });
  const noDates = renderAuthorshipHtml(r, { dates: false, steps: true });
  const summary = renderAuthorshipHtml(r, { dates: false, steps: false });
  assert.ok(withDates.includes('<time>') && !noDates.includes('<time>') && !noDates.includes('generated'));
  assert.ok(noDates.includes('I had the AI draft the thread map (Claude Opus): “15 plot lines across 14 chapters”'));
  assert.ok(noDates.includes('I renamed “New Character” to “Bea” everywhere in the book.'));
  assert.ok(!summary.includes('<ol class="log">'));
});

t('tracked edits: only marked paragraphs change; rejects leave the original; junk is dropped', () => {
  const prose = 'One.\n\nTwo.\n\n\nThree.\n\nFour.';
  const paras = splitParagraphs(prose);
  assert.deepEqual(paras, ['One.', 'Two.', 'Three.', 'Four.']);
  const reply = '```json\n{"summary":"Tightened","changes":[' +
    '{"op":"replace","p":2,"text":"[P2] Two, sharper.","why":"punchier"},' +
    '{"op":"insert_after","p":3,"text":"New beat.\n\nAnother."},' +
    '{"op":"delete","p":4},' +
    '{"op":"replace","p":2,"text":"second rewrite of 2 is ignored"},' +
    '{"op":"replace","p":1,"text":"One."},' +
    '{"op":"replace","p":9,"text":"out of range"},' +
    '{"op":"insert_after","p":0,"text":"Opening."}]}\n```';
  const r = parseTrackedEdits(reply, paras)!;
  assert.equal(r.summary, 'Tightened');
  assert.deepEqual(r.suggestions.map((x) => [x.op, x.p]), [['insert_after', 0], ['replace', 2], ['insert_after', 3], ['delete', 4]]);
  assert.equal(r.suggestions[1].after, 'Two, sharper.', 'stray [P#] label stripped');
  assert.equal(r.suggestions[1].before, 'Two.');
  const all = new Set(r.suggestions.map((x) => x.id));
  assert.equal(applySuggestions(paras, r.suggestions, all), 'Opening.\n\nOne.\n\nTwo, sharper.\n\nThree.\n\nNew beat.\n\nAnother.');
  const onlyRewrite = new Set([r.suggestions[1].id]);
  assert.equal(applySuggestions(paras, r.suggestions, onlyRewrite), 'One.\n\nTwo, sharper.\n\nThree.\n\nFour.');
  const range = firstChangeRange(paras, r.suggestions, onlyRewrite)!;
  assert.equal(applySuggestions(paras, r.suggestions, onlyRewrite).slice(range[0], range[1]), 'Two, sharper.');
  assert.equal(parseTrackedEdits('no json here', paras), null);
  assert.deepEqual(parseTrackedEdits('{"summary":"Fine as is","changes":[]}', paras), { summary: 'Fine as is', suggestions: [] });
});

t('chapter dials: saved values clamped, defaults fill gaps, prompt reflects the choice', () => {
  assert.deepEqual(normalizeDials(null), DEFAULT_DIALS);
  assert.deepEqual(normalizeDials({ words: 99999, dialoguePct: 3, pace: 9 }), { words: 6000, dialoguePct: 10, pace: 5 });
  assert.deepEqual(normalizeDials({ words: 2610, dialoguePct: 47 }), { words: 2500, dialoguePct: 45, pace: 3 });
  assert.equal(formatWords(2750), '2.75k');
  assert.equal(formatWords(3000), '3k');
  assert.equal(formatWords(750), '750');
  const heavy = buildDialsBlock({ words: 3000, dialoguePct: 60, pace: 5 });
  assert.ok(heavy.includes('about 60%') && heavy.includes('55–65%') && heavy.includes('dialogue-heavy') && heavy.includes('Fast and intense'));
  assert.ok(buildDialsBlock({ words: 2000, dialoguePct: 15, pace: 1 }).includes('Keep dialogue sparse'));
  assert.equal(measureDialoguePct('He waited. "Go now," she said. "Fine."'), 43);
});

// ---------- Audio pacing (real silence) ----------
t('normalizeSceneBreakLines keeps every break as a *** paragraph', () => {
  const out = normalizeSceneBreakLines('One.\n\n* * *\n\nTwo.\n\n---\n\nThree.\n#\nFour.');
  assert.equal(out, 'One.\n\n***\n\nTwo.\n\n***\n\nThree.\n\n***\n\nFour.');
});

t('splitNarration: title, paragraph, speaker and scene gaps; break never spoken', () => {
  const pieces = splitNarration('She walked in.\n\n"Hi."\n\n"Hello."\n\n***\n\nLater that night.', 'Chapter 1. The Door.');
  assert.deepEqual(pieces.map((p) => p.gapAfter), ['title', 'paragraph', 'speaker', 'scene', 'none']);
  assert.ok(pieces.every((p) => !/\*/.test(p.text)));
});

t('buildVoicePieces: quote and its tag stay together; paragraph and scene gaps', () => {
  const prose = markParagraphs(normalizeSceneBreakLines('He waited.\n\n"Go," she said.\n\n---\n\nMorning came.'));
  const [a, b] = prose.split('"Go,"');
  const segs = [
    { type: 'narration', text: a, voice: 'n' },
    { type: 'dialogue', text: '"Go,"', voice: 'v' },
    { type: 'narration', text: b, voice: 'n' },
  ] as any;
  const pieces = buildVoicePieces(segs);
  assert.deepEqual(pieces.map((p) => [p.text, p.gapAfter]), [
    ['He waited.', 'paragraph'],
    ['"Go,"', 'none'],
    ['she said.', 'scene'],
    ['Morning came.', 'none'],
  ]);
});

t('pauses inside a clip: sentence ends and commas stretched to match the text, word gaps untouched', () => {
  assert.equal(countSentenceBreaks('He waited, listening. Nothing moved! "Who?" she said. Then Dr. Ames came.'), 4);
  assert.equal(countSentenceBreaks('One sentence only.'), 0);
  assert.equal(countClauseBreaks('She paused — then, at last: "Fine; go." Wait... no.'), 5);
  // Synthetic 44.1 kHz PCM: tone / 0.12 s pause / tone / 0.22 s pause / tone / 0.05 s gap / tone.
  const sr = 44100;
  const tone = (sec: number) => { const b = Buffer.alloc(Math.round(sec * sr) * 2); for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 12000), i * 2); return b; };
  const gap = (sec: number) => Buffer.alloc(Math.round(sec * sr) * 2);
  const pcm = Buffer.concat([tone(0.8), gap(0.12), tone(0.8), gap(0.22), tone(0.8), gap(0.05), tone(0.8)]);
  const r = stretchPauses(pcm, 1, 0.6, CLAUSE_PAUSE_SECONDS, 1, 1);
  assert.deepEqual(r.pauses.map((x) => Math.round(x * 100) / 100), [0.28, 0.6], 'comma floor, sentence pause; 0.05 s gap not a pause');
  assert.ok(Math.abs((r.pcm.length - pcm.length) / 2 / sr - ((0.28 - 0.12) + (0.6 - 0.22))) < 0.03, 'only silence added');
  const noComma = stretchPauses(pcm, 1, 0.6, CLAUSE_PAUSE_SECONDS, 1, 0);
  assert.deepEqual(noComma.pauses.map((x) => Math.round(x * 100) / 100), [0.12, 0.6], 'a pause the text does not call for is left alone');
  assert.ok(GAP_SECONDS.paragraph > GAP_SECONDS.speaker && GAP_SECONDS.speaker > GAP_SECONDS.sentence);
});

t('jitteredGap is deterministic and stays within ±10%', () => {
  for (let i = 0; i < 50; i++) {
    const g = jitteredGap(GAP_SECONDS.paragraph, 'ch-1', i);
    assert.equal(g, jitteredGap(GAP_SECONDS.paragraph, 'ch-1', i));
    assert.ok(g >= GAP_SECONDS.paragraph * 0.9 - 1e-9 && g <= GAP_SECONDS.paragraph * 1.1 + 1e-9);
  }
  assert.equal(jitteredGap(0, 'ch-1', 3), 0);
});

t('pace: words per minute of speech, merged across scenes', () => {
  assert.equal(countWords('One two, three — four.'), 4);
  assert.equal(speakingWpm(300, 120), 150);
  const merged = mergePace({ words: 150, speechSeconds: 60, silenceSeconds: 10 }, { words: 160, speechSeconds: 60, silenceSeconds: 12 });
  assert.deepEqual(merged, { words: 310, speechSeconds: 120, silenceSeconds: 22 });
  assert.equal(paceWpm(merged), 155);
  assert.equal(paceWpm(undefined), 0);
});

t('facts & secrets: author corrections, deletions, world facts and secrets bind the prompt', () => {
  const ch = (n: number, meta: any) => ({ id: 'fb' + n, number: n, title: 'T' + n, prose: 'x', aiIntentMetadata: meta }) as any;
  const facts = Array.from({ length: 90 }, (_, i) => ({ subject: 'Town', fact: `Detail number ${i}`, chapter: 1 }));
  const c1 = ch(1, { facts: [{ subject: 'Mara', fact: 'Mara is 34', chapter: 1 }, { subject: 'Mara', fact: 'Drives a red truck', chapter: 1 }, ...facts],
    knowledge: [{ secret: 'Eli\'s father is alive', knownBy: ['Mara'], hiddenFrom: ['Eli'], chapter: 1 }] });
  const c2 = ch(2, {});
  const c3 = ch(3, { knowledge: [{ secret: 'Eli\'s father is alive', knownBy: ['Eli'], hiddenFrom: [], chapter: 3 }] });
  const all = [c1, c2, c3];

  let book = markSeen(null, []);
  const rows = factRows(foldStoryState(all), book);
  const age = rows.find((r) => r.fact === 'Mara is 34')!;
  const truck = rows.find((r) => r.fact === 'Drives a red truck')!;
  assert.equal(age.isNew, true);
  book = editFact(book, age, 'Mara', 'Mara is 36');
  book = deleteFact(book, truck);
  book = addFact(book, { kind: 'world', subject: '', fact: 'Magic costs the user a memory' });
  book = addFact(book, { kind: 'story', subject: 'The lake house', fact: 'Sits on the north shore' });
  const secret = foldStoryState([c1]).knowledge[0];
  book = setSecret(book, secret, { secret: "Eli's father is alive", knownBy: ['Mara', 'Jonah'], hiddenFrom: ['Eli'] });

  const after = factRows(foldStoryState(all), book);
  assert.ok(!after.some((r) => r.fact === 'Mara is 34' || r.fact === 'Drives a red truck'), 'corrected and deleted page facts are gone');
  assert.ok(after.some((r) => r.fact === 'Mara is 36' && r.source === 'author' && r.chapter === 1));
  assert.equal(groupBySubject(after.filter((r) => r.kind === 'story'))[0].subject, 'Mara');

  // Writing chapter 2: correction, world fact, author fact and secret all apply; nothing ages out.
  const block = buildCanonAndMemory([], c2, all, false, book);
  assert.ok(block.includes('Mara is 36') && !block.includes('Mara is 34') && !block.includes('red truck'));
  assert.ok(block.includes('WORLD FACTS') && block.includes('Magic costs the user a memory'));
  assert.ok(block.includes('Sits on the north shore'));
  assert.ok(block.includes('Detail number 0') && block.includes('Detail number 89'), 'early facts no longer drop off');
  assert.ok(/known by: Mara, Jonah \| NOT known by: Eli/.test(block), 'author secret wins');

  // A later chapter where Eli learns it wins over the author's earlier edit.
  const st = applyFactBook(foldStoryState(all), book);
  assert.deepEqual(st.knowledge.find((k) => /father/.test(k.secret))!.knownBy, ['Mara', 'Eli']);

  // Writing chapter 1: the chapter-1 correction doesn't leak backwards.
  assert.ok(!buildCanonAndMemory([], c1, all, false, book).includes('Mara is 36'));

  // Deleting a secret removes it.
  book = setSecret(book, secret, null);
  assert.ok(!/father/.test(buildCanonAndMemory([], c2, all, false, book)));
  // Extraction checks against the book too.
  assert.ok(buildContinuityExtractionPrompt({ projectTitle: 'B', chapter: c2, allChapters: all, canon: [], factBook: book }).includes('Magic costs the user a memory'));
});

t('timeline + who has met whom: parsed, folded, overridden, and in the prompt', () => {
  const mara = { id: 'm1', type: 'character', name: 'Mara Quinn', character: { aliases: ['Mara'] } } as any;
  const parsed = parseMemorySections([
    'STORY_CLOCK:', 'day: Day 3 | time: night | elapsed: one day | season: late autumn | weather: sleet',
    'TIMELINE:',
    '- age | Mara | age: 34',
    '- deadline | Pay back the Carvers | due: Day 10 | status: open',
    '- healing | Jonah | injury: broken wrist | since: Day 2 | expect: six weeks',
    '- date | The mill fire | when: ten years ago',
    '- nonsense | ignored',
    'MEETINGS:',
    '- Mara + Jonah | first: no | how: siblings | Mara calls Jonah: Jo | Jonah calls Mara: Mare',
    '- Mara + Eli | first: yes | how: met at the bar | Eli calls Mara: "ma\'am"',
    '- Mara + Mara | first: no',
    'NEW_CANON:',
  ].join('\n'), 3, [mara]);
  assert.equal(parsed.storyClock?.season, 'late autumn');
  assert.equal(parsed.timeline.length, 4);
  assert.deepEqual(parsed.timeline[0], { kind: 'age', subject: 'Mara Quinn', canonId: 'm1', detail: '34', when: undefined, status: undefined, chapter: 3 });
  assert.equal(parsed.timeline[2].when, 'since Day 2; heals in six weeks');
  assert.equal(parsed.meetings.length, 2);
  assert.deepEqual([parsed.meetings[0].a, parsed.meetings[0].aCalls, parsed.meetings[0].bCalls], ['Mara Quinn', 'Jo', 'Mare']);
  assert.equal(parsed.meetings[1].first, true);
  assert.equal(parsed.meetings[1].bCalls, "ma'am");

  const ch = (n: number, meta: any) => ({ id: 'tl' + n, number: n, title: 'T', prose: 'x', aiIntentMetadata: { continuityVersion: 3, ...meta } }) as any;
  const c3 = ch(3, { storyClock: parsed.storyClock, timeline: parsed.timeline, meetings: parsed.meetings });
  const c4 = ch(4, {
    timeline: [{ kind: 'deadline', subject: 'Pay back the Carvers', status: 'met', chapter: 4 }],
    meetings: [{ a: 'Jonah', b: 'Mara Quinn', how: 'siblings, estranged', aCalls: 'Mare', chapter: 4 }],
  });
  const c5 = ch(5, {});
  const all = [c3, c4, c5];
  const st = foldStoryState(all, 'tl5');
  assert.equal(st.timeline.find((x) => x.kind === 'deadline')!.status, 'met', 'later chapter settles the deadline');
  const sib = st.meetings.find((m) => m.how?.startsWith('siblings'))!;
  assert.equal(sib.firstChapter, 3);
  assert.equal(sib.a, 'Mara Quinn', 'order kept from first record');
  assert.equal(sib.bCalls, 'Mare', 'flipped record lands on the right person');
  assert.equal(sib.aCalls, 'Jo');
  assert.equal(st.meetingsComplete, true);
  assert.equal(foldStoryState([{ ...c3, aiIntentMetadata: { meetings: parsed.meetings } }, c5], 'tl5').meetingsComplete, false, 'an old-format chapter means unknown pairs');

  const sel = { primaryChars: [mara], secondaryChars: [], locations: [], artifacts: [], others: [], relevantNames: new Set(['mara quinn', 'mara', 'eli', 'jonah']) } as any;
  const block = buildStoryMemoryBlock(all, c5, sel, st);
  assert.ok(block.includes('Season: late autumn'));
  assert.ok(block.includes('Mara Quinn is 34 years old'));
  assert.ok(!block.includes('DEADLINE: Pay back'), 'met deadline left out of the writer prompt');
  assert.ok(block.includes('Jonah: broken wrist'));
  assert.ok(block.includes('The mill fire'));
  assert.ok(block.includes('WHO HAS MET WHOM') && block.includes('have NEVER met'));
  assert.ok(buildPriorMemoryForCheck(st).includes('MET: Mara Quinn & Eli'));

  // Author overrides: correct an age, add a meeting, unpair a wrong one.
  let book: any = setTimeline(null, st.timeline[0], { kind: 'age', subject: 'Mara Quinn', detail: '36' });
  book = setMeeting(book, null, { a: 'Eli', b: 'Jonah', how: 'army buddies' });
  book = setMeeting(book, st.meetings.find((m) => m.b === 'Eli')!, null);
  const applied = applyFactBook(foldStoryState(all, 'tl5'), book, 5);
  assert.equal(applied.timeline.find((x) => x.kind === 'age')!.detail, '36');
  assert.ok(applied.meetings.some((m) => m.how === 'army buddies' && m.firstChapter === 0));
  assert.ok(!applied.meetings.some((m) => m.key === 'eli & mara quinn'));
  assert.ok(buildPriorMemoryForCheck(applied).includes('MET: Eli & Jonah — met before the story (army buddies)'));
  assert.ok(buildCanonAndMemory([mara], { ...c5, premise: { characters: ['Mara'] } }, all, false, book).includes('Mara Quinn is 36'));
  // A later chapter's change to the age wins again.
  const c6 = ch(6, { timeline: [{ kind: 'age', subject: 'Mara Quinn', canonId: 'm1', detail: '37', chapter: 6 }] });
  const c7 = ch(7, {});
  assert.equal(applyFactBook(foldStoryState([...all, c6, c7], 'tl7'), book, 7).timeline.find((x) => x.kind === 'age')!.detail, '37');
});

t('inserting a chapter moves numbers, memory, maps and facts with each chapter', () => {
  const ch = (n: number, title: string, meta: any = {}) => ({ id: 'r' + n, projectId: 'p', number: n, title, prose: 'x', aiIntentMetadata: meta }) as any;
  const chapters = [
    ch(1, 'Chapter 1', { facts: [{ subject: 'June', fact: 'Drove the red car', chapter: 1 }], openedThreads: [{ id: 't', character: 'June', thread: 'the crash', introducedInChapter: 1 }] }),
    ch(2, 'The Funeral', { meetings: [{ a: 'Mara', b: 'Eli', chapter: 2 }], knowledge: [{ secret: 'x', knownBy: ['a'], hiddenFrom: [], chapter: 2 }], continuityStale: { fromChapter: 1, changes: [], at: '' } }),
  ];
  const project = {
    threadPlan: { version: 1, generatedAt: '', chapterCount: 2, threads: [{ id: 'a', title: 'Crash', question: '', resolution: '', tier: 'major', kind: 'mystery', opensIn: 1, closesIn: 2, characters: [], beats: [{ chapter: 1, type: 'open', note: 'o' }, { chapter: 2, type: 'close', note: 'c' }] }] },
    arcPlan: { version: 1, generatedAt: '', chapterCount: 2, characters: [{ id: 'c', name: 'June', introducedIn: 1, beats: [{ chapter: 2, type: 'turn', note: '' }] }], artifacts: [{ id: 'k', name: 'Key', introducedIn: 2, payoffIn: 2, beats: [] }] },
    factBook: { facts: [{ id: 'f', kind: 'story', subject: 'June', fact: 'x', chapter: 2, at: '' }], secrets: [], timeline: [], meetings: [{ id: 'm', a: 'A', b: 'B', firstChapter: 1, chapter: 2, at: '' }], hidden: [], seen: [] },
  };
  const plan = planRenumber(chapters, project, insertionMap(1), 3);
  const u = Object.fromEntries(plan.chapters.map((c) => [c.id, c.updates])) as any;
  assert.equal(u.r1.number, 2);
  assert.equal(u.r1.title, 'Chapter 2', 'default title follows the number');
  assert.equal(u.r2.title, undefined, 'a real title is kept');
  assert.equal(u.r1.aiIntentMetadata.facts[0].chapter, 2);
  assert.equal(u.r1.aiIntentMetadata.openedThreads[0].introducedInChapter, 2);
  assert.equal(u.r2.aiIntentMetadata.meetings[0].chapter, 3);
  assert.equal(u.r2.aiIntentMetadata.continuityStale.fromChapter, 2);
  const th = plan.project.threadPlan!.threads[0];
  assert.deepEqual([th.opensIn, th.closesIn, th.beats.map((b) => b.chapter), plan.project.threadPlan!.chapterCount], [2, 3, [2, 3], 3]);
  const arc = plan.project.arcPlan!;
  assert.deepEqual([arc.characters[0].introducedIn, arc.characters[0].beats[0].chapter, arc.artifacts[0].payoffIn], [2, 3, 3]);
  assert.deepEqual([plan.project.factBook!.facts[0].chapter, plan.project.factBook!.meetings[0].firstChapter, plan.project.factBook!.meetings[0].chapter], [3, 2, 3]);

  // Insert in the middle: only later chapters move.
  const mid = planRenumber(chapters, {}, insertionMap(2), 3);
  assert.deepEqual(mid.chapters.map((c) => [c.id, c.updates.number]), [['r2', 3]]);
  // Reorder: beats follow their chapter.
  const swap = planRenumber(chapters, project, reorderMap(chapters, ['r2', 'r1']), 2);
  assert.deepEqual(swap.project.threadPlan!.threads[0].beats.map((b) => [b.chapter, b.type]), [[1, 'close'], [2, 'open']]);
  assert.equal(renumberTitle('Page 4', 4, 5), 'Page 5');
  assert.equal(renumberTitle('Chapter 4', 3, 5), 'Chapter 4', 'only renumbers its own default title');
});

t('a prequel is written against the chapters that already follow it', () => {
  const ch = (n: number, meta: any, prose = 'x') => ({ id: 'q' + n, number: n, title: 'T' + n, prose, aiIntentMetadata: { continuityVersion: 3, ...meta } }) as any;
  const pre = ch(1, {}, '');
  const c2 = ch(2, { richSummary: 'Mara wakes in hospital after the crash.', facts: [{ subject: 'June', fact: 'Died in the crash on Route 9', chapter: 2 }], meetings: [{ a: 'Mara', b: 'Eli', chapter: 2 }], timeline: [{ kind: 'age', subject: 'Mara', detail: '17', chapter: 2 }] }, 'The hospital light was the first thing Mara saw.');
  const c3 = ch(3, { summary: 'Eli visits.' });
  const block = buildLaterChaptersBlock(pre, [pre, c2, c3]);
  assert.ok(block.includes('LATER CHAPTERS ARE ALREADY WRITTEN'));
  assert.ok(block.includes('Mara wakes in hospital') && block.includes('Eli visits.'));
  assert.ok(block.includes('June: Died in the crash on Route 9 [Ch.2]'));
  assert.ok(block.includes('Mara & Eli first meet in Ch.2'));
  assert.ok(block.includes('Mara is 17 as of Ch.2'));
  assert.ok(block.includes('The hospital light was the first thing Mara saw.'), 'next chapter opening for the handoff');
  assert.equal(buildLaterChaptersBlock(c3, [pre, c2, c3]), '', 'nothing after the last chapter');
  assert.ok(buildCanonAndMemory([], pre, [pre, c2, c3], false).includes('LATER CHAPTERS ARE ALREADY WRITTEN'));
  assert.ok(buildContinuityExtractionPrompt({ projectTitle: 'B', chapter: { ...pre, prose: 'p' }, allChapters: [pre, c2, c3], canon: [] }).includes('ESTABLISHED IN LATER CHAPTERS'));
});

console.log(`\n${passed} passed`);
