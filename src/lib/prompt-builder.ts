// ========== Prompt Builder ==========
// Builds AI prompts that incorporate ALL settings, canon, and project context
// Every generation call goes through here to ensure consistency

import type { Project, Chapter, PremiseCard, WritingMode, GenerationType, Scene, EditChatMessage } from '../types';
import type { AppSettings, WritingStyleSettings } from '../types/settings';
import type { AnyCanonEntry } from '../types/canon';
import { buildContinuityContext, formatContinuityBlock } from './continuity-context';
import { getDialogueTargetForProject, buildDialogueClause } from './dialogue-targets';
import { buildCanonAndMemory } from './story-memory';
import { buildThreadGuidanceBlock } from './story-threads';
import { buildArcGuidanceBlock } from './story-arcs';

// ========== Selection-Based Edit Prompt (Vibe Editor) ==========

export interface SelectionEditContext {
  project: Project;
  chapter: Chapter;
  allChapters: Chapter[];
  canonEntries: AnyCanonEntry[];
  settings: AppSettings;
  instruction: string;
  selectedText: string | null;
  fullProse: string;
  chatHistory: EditChatMessage[];
}

export function buildSelectionEditPrompt(ctx: SelectionEditContext): string {
  const { project, chapter, allChapters, canonEntries, settings, instruction, selectedText, fullProse, chatHistory } = ctx;
  const sections: string[] = [];
  const memoryBlock = buildCanonAndMemory(canonEntries || [], chapter, allChapters, false);
  const continuity = buildContinuityContext(project, allChapters, chapter.id);
  const continuityBlock = formatContinuityBlock(continuity);

  sections.push(`You are Theodore, an expert fiction editor working on "${project.title}" (a ${project.subtype || project.type}).`);

  // Writing style
  sections.push('\n=== WRITING STYLE RULES ===');
  sections.push(buildStyleInstructions(settings.writingStyle));

  // Tone
  sections.push('\n=== TONE & NARRATIVE ===');
  sections.push(buildToneInstructions(project));

  // Chapter context
  sections.push(`\n=== CHAPTER CONTEXT ===`);
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);
  if (chapter.premise?.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);
  if (chapter.premise?.emotionalBeat) sections.push(`Beat: ${chapter.premise.emotionalBeat}`);

  // Cross-chapter continuity (story so far, open threads, recent dialogue, prev chapter)
  if (continuityBlock) sections.push('\n' + continuityBlock);

  // Character/object state + established facts — edits must not contradict them
  if (memoryBlock) sections.push('\n' + memoryBlock);

  // Recent chat history
  if (chatHistory.length > 0) {
    sections.push(`\n=== RECENT CONVERSATION ===`);
    for (const msg of chatHistory.slice(-6)) {
      sections.push(`${msg.role === 'user' ? 'User' : 'Theodore'}: ${msg.content}`);
    }
  }

  if (selectedText) {
    // Selection mode — rewrite only the selected portion
    sections.push(`\n=== FULL CHAPTER PROSE (for context) ===`);
    // Show surrounding context, mark the selection
    const selIdx = fullProse.indexOf(selectedText);
    if (selIdx >= 0) {
      const contextBefore = fullProse.slice(Math.max(0, selIdx - 500), selIdx);
      const contextAfter = fullProse.slice(selIdx + selectedText.length, selIdx + selectedText.length + 500);
      if (contextBefore) sections.push(`...${contextBefore}`);
      sections.push(`\n>>> SELECTED TEXT (rewrite this) >>>\n${selectedText}\n<<< END SELECTION <<<`);
      if (contextAfter) sections.push(`${contextAfter}...`);
    } else {
      sections.push(fullProse.slice(0, 3000));
      sections.push(`\n>>> SELECTED TEXT (rewrite this) >>>\n${selectedText}\n<<< END SELECTION <<<`);
    }

    sections.push(`\n=== USER INSTRUCTION ===`);
    sections.push(instruction);

    sections.push(`\nRewrite ONLY the selected text according to the user's instruction. Return ONLY the replacement text — no explanations, no markdown, no quotes, no "here's the rewrite". Just the new prose that will replace the selection. Keep the same approximate length unless the user asks to expand or shorten. Maintain voice, tense, and POV consistency with the surrounding text.`);
  } else {
    // Full prose mode — edit the entire chapter
    sections.push(`\n=== CURRENT CHAPTER PROSE ===`);
    sections.push(fullProse.slice(0, 6000));

    sections.push(`\n=== USER INSTRUCTION ===`);
    sections.push(instruction);

    sections.push(`\nApply the user's instruction to the entire chapter. Return ONLY the updated full prose — no explanations, no markdown code blocks, no titles. Just the prose text.`);
  }

  return sections.join('\n');
}

// ========== Writing Style → Prompt Instructions ==========

function buildStyleInstructions(style: WritingStyleSettings): string {
  const rules: string[] = [];

  // Punctuation
  if (style.emDashEnabled) {
    rules.push('Use em dashes (—) for parenthetical statements and dramatic pauses.');
  } else {
    rules.push('Do NOT use em dashes (—). Use commas, semicolons, or separate sentences instead.');
  }

  if (style.smartQuotes) {
    rules.push('Use proper typographic quotes (" " and \' \').');
  }

  if (style.oxfordComma) {
    rules.push('Always use the Oxford comma in lists (e.g., "red, white, and blue").');
  } else {
    rules.push('Do NOT use the Oxford comma (e.g., "red, white and blue").');
  }

  if (style.ellipsisStyle === 'unicode') {
    rules.push('Use the Unicode ellipsis character (…) instead of three dots (...).');
  } else {
    rules.push('Use three separate dots (...) for ellipses, not the Unicode character.');
  }

  // Prose preferences
  if (style.avoidAdverbs) {
    rules.push('Minimize adverb usage. Prefer strong verbs over weak verb + adverb pairs. "She sprinted" not "She ran quickly."');
  }

  if (style.preferActiveVoice) {
    rules.push('Prefer active voice over passive voice. "She opened the door" not "The door was opened by her."');
  }

  if (style.avoidFilterWords) {
    rules.push('Avoid filter words: do NOT use "she felt," "he noticed," "it seemed," "she could see," "he heard." Instead, describe the sensation directly. Let the reader experience it without the character as intermediary.');
  }

  if (style.saidBookisms) {
    rules.push('Dialogue attribution can use alternatives to "said" when appropriate (whispered, murmured, exclaimed, snapped) — but use "said" as the default.');
  } else {
    rules.push('Use "said" for almost all dialogue attribution. Avoid said-bookisms (whispered, exclaimed, etc.) except in rare cases.');
  }

  if (style.contractionsAllowed) {
    rules.push('Contractions are allowed in narrative prose (don\'t, can\'t, won\'t).');
  } else {
    rules.push('Do NOT use contractions in narrative prose. Write out "do not," "cannot," "will not."');
  }

  // Paragraph style
  const paragraphMap = {
    'short': 'Keep paragraphs short — 2-4 sentences. Use white space for pacing and impact.',
    'mixed': 'Vary paragraph length naturally — mix short punchy paragraphs with longer flowing ones.',
    'long': 'Use longer, flowing paragraphs — 5-8 sentences. Prioritize immersive prose blocks.',
  };
  rules.push(paragraphMap[style.paragraphLength]);

  // Scene breaks
  if (style.sceneBreakStyle !== 'blank') {
    rules.push(`Use exactly "${style.sceneBreakStyle}" on its own line for scene breaks within a chapter — never any other marker.`);
  } else {
    rules.push('Use a blank line (double line break) for scene breaks within a chapter. NEVER write "---", "***", "#" or any line of symbols as a scene break.');
  }
  rules.push('This is book prose, not Markdown: no headings, no bold or italics markup, no horizontal rules, no bullet lists.');

  // Chapter start
  if (style.chapterStartStyle === 'drop-cap') {
    rules.push('Begin each chapter with a drop cap — make the first letter/word distinctive.');
  } else if (style.chapterStartStyle === 'small-caps') {
    rules.push('Begin each chapter with the first few words in small caps style.');
  }

  return rules.join('\n');
}

// ========== Craft Rules (fiction writing intelligence) ==========

function buildCraftRules(): string {
  return `=== CRAFT RULES (apply to all generation) ===

SCENES: Enter late, leave early. Start in the middle of action or tension, not with arrivals or greetings. End on a shift — a decision, a revelation, a door closing — not a resolution.

DIALOGUE: People rarely say what they mean. Layer subtext beneath the words. Use interruptions, deflections, non-answers. Never use dialogue to deliver backstory ("As you know, Tim...").
SPEAKER ATTRIBUTION — follow standard published-novel practice so the reader always knows who is talking:
- Start a new paragraph every time the speaker changes.
- Attribute the first line of every exchange, and attribute again EVERY time the speaker changes, with a tag ("Name said" / "she asked") or an action beat in the same paragraph that NAMES the speaker.
- With three or more characters in the scene, every spoken line carries attribution — no exceptions.
- Untagged lines are allowed only in a back-and-forth between exactly two people, at most two in a row, and only when the speaker is unmistakable. Then re-anchor with a tag.
- Default to "said" and "asked"; they're invisible to readers. Use names rather than "he"/"she" whenever two characters could be confused (for example, two men or two women in the scene).
- Vary placement so it reads naturally:
  (1) Inline tag — \`"Don't," Mara said, laughing under her breath.\`
  (2) Action beat naming the speaker — \`Mara set the cup down. "I'm leaving in the morning."\`
- When a speech act has a notable physical or emotional quality, NAME IT in the attribution. Prefer concrete cues that a listener could hear:
  • "...," she said, laughing softly.
  • "...," he whispered.
  • "...," she sighed.
  • He chuckled. "..."
  • Her voice dropped to a near-whisper. "..."
  • She exhaled slowly. "..."
  • "..." — a sharp, dry laugh.
  • He shouted over the wind, "..."
  These cues feed the audiobook layer. Vague cues ("she said quietly") help less than concrete ones ("she said, breath catching").
- Don't over-decorate. Roughly 1 in 3 spoken lines deserves an expressive cue; the rest still get clear attribution, just with plain "said" or a simple beat.

CHARACTERS: On first appearance in a chapter, anchor with ONE visceral sensory detail — not a full description. Show personality through choices and behavior, not adjectives. Interior monologue should conflict with exterior action.

EMOTION: Never name the emotion. No "she felt angry" or "fear gripped him." Show it through the body: clenched jaw, shortened breath, hands that won't stay still. Trust the reader to feel it.

PACING: Vary sentence length deliberately. Short sentences hit hard. Longer sentences carry the reader through stretches of reflection or description, building a rhythm that lulls before the next punch. Paragraph breaks are pacing tools — use them.

DESCRIPTION: Earn every adjective. One precise detail beats three vague ones. Anchor abstract moments in concrete sensory experience. "The room smelled of burnt coffee and old carpet" not "the room was unpleasant."

CAMERA TEST: Before ending a descriptive paragraph, ask: "Can a camera record this?" If yes, keep it. If no, rewrite it into a visible or audible concrete detail. Prefer "The coffee machine clicked," "A waitress wiped the counter," "Rain tapped the window" over abstract lines like "The past lingered in the room," "The night held its breath," or "Memories clung to the walls."

TRANSITIONS & FLOW: Play the story on the page. Every event the outline names, and every moment the story has set up (a confrontation, a decision, a reveal, a reunion), happens in scene — never skipped and summarized after the fact. Each scene follows from the one before: cause, then consequence. Only cut away when nothing important happens in between, and when you do, orient the reader in the first sentence of the new scene (when, where, who is present), e.g. "By the time they reached the ferry, the rain had stopped." A reader should never have to guess how the characters got here or what they missed.`;
}

// ========== Narrative Controls → Tone Instructions ==========

function buildToneInstructions(project: Project): string {
  // Older projects (pre-narrativeControls migration) and projects created via
  // partial flows may arrive without one or more sub-objects. Default each
  // missing field to its centered/balanced value so we never crash and the
  // model still gets a sensible signal.
  const ncRaw = project.narrativeControls || ({} as any);
  const nc = {
    toneMood: {
      lightDark: ncRaw.toneMood?.lightDark ?? 50,
      hopefulGrim: ncRaw.toneMood?.hopefulGrim ?? 50,
      whimsicalSerious: ncRaw.toneMood?.whimsicalSerious ?? 50,
    },
    pacing: ncRaw.pacing ?? 'balanced',
    dialogueWeight: ncRaw.dialogueWeight ?? 'balanced',
    focusMix: {
      character: ncRaw.focusMix?.character ?? 40,
      plot: ncRaw.focusMix?.plot ?? 40,
      world: ncRaw.focusMix?.world ?? 20,
    },
    genreEmphasis: Array.isArray(ncRaw.genreEmphasis) ? ncRaw.genreEmphasis : [],
  };
  const lines: string[] = [];

  // Tone mood (0 = left, 100 = right)
  const lightDark = nc.toneMood.lightDark;
  if (lightDark < 30) lines.push('Tone: predominantly light, warm, uplifting. Avoid dark or disturbing imagery.');
  else if (lightDark < 50) lines.push('Tone: mostly light with occasional shadows. Darkness serves as contrast, not the default.');
  else if (lightDark < 70) lines.push('Tone: balanced between light and dark. Moments of beauty exist alongside tension and threat.');
  else lines.push('Tone: predominantly dark, tense, foreboding. Light moments are rare and precious.');

  const hopefulGrim = nc.toneMood.hopefulGrim;
  if (hopefulGrim < 30) lines.push('Outlook: hopeful, optimistic. Characters believe things can get better, and the narrative rewards that belief.');
  else if (hopefulGrim > 70) lines.push('Outlook: grim, cynical. Hope is scarce or costly. The world resists easy answers.');
  else lines.push('Outlook: realistic, nuanced. Hope and despair coexist naturally.');

  const whimsicalSerious = nc.toneMood.whimsicalSerious;
  if (whimsicalSerious < 30) lines.push('Register: whimsical, playful, imaginative. Language can be inventive and surprising.');
  else if (whimsicalSerious > 70) lines.push('Register: serious, measured, literary. Every word carries weight.');
  else lines.push('Register: balanced — moments of levity alongside gravity.');

  // Pacing
  const pacingMap = {
    'slow': 'Pacing: slow and deliberate. Linger on sensory details, internal reflection, and atmospheric description. Let scenes breathe.',
    'balanced': 'Pacing: balanced. Mix action with reflection. Vary scene length and intensity naturally.',
    'fast': 'Pacing: fast and propulsive. Keep scenes tight, dialogue snappy, and momentum high. Cut anything that slows the story.',
  };
  lines.push(pacingMap[nc.pacing]);

  // Dialogue weight
  const dialogueMap = {
    'sparse': 'Dialogue: sparse. Most storytelling through narration and interiority. Dialogue is rare and impactful when it appears.',
    'balanced': 'Dialogue: balanced mix of dialogue and narration. Conversations advance plot and reveal character.',
    'heavy': 'Dialogue: heavy. The story is primarily told through conversation. Narration bridges dialogue scenes.',
  };
  lines.push(dialogueMap[nc.dialogueWeight]);

  // Focus mix
  const { character, plot, world } = nc.focusMix;
  const dominant = character >= plot && character >= world ? 'character'
    : plot >= character && plot >= world ? 'plot' : 'world';
  const focusMap = {
    'character': `Focus: character-driven (${character}%). Prioritize internal states, relationships, and character development over external events.`,
    'plot': `Focus: plot-driven (${plot}%). Prioritize events, conflict, and forward momentum. Characters serve the story.`,
    'world': `Focus: world-driven (${world}%). Prioritize setting, systems, and worldbuilding. The world is as much a character as the people.`,
  };
  lines.push(focusMap[dominant]);

  // Genre emphasis
  if (nc.genreEmphasis.length > 0) {
    lines.push(`Genre emphasis: ${nc.genreEmphasis.join(', ')}. Let these genres inform scene construction and tension.`);
  }

  return lines.join('\n');
}

// ========== Canon Context ==========

/**
 * Canon cards + state/fact memory for prompts built outside buildGenerationPrompt
 * (e.g. the creation-time Chapter 1), so every chapter sees the same profiles.
 */
export function buildCanonReferenceBlock(entries: AnyCanonEntry[], chapter: Chapter, allChapters: Chapter[]): string {
  return buildCanonAndMemory(entries, chapter, allChapters, true);
}

// ========== Chapter Outline Context ==========

function buildOutlineContext(chapters: Chapter[], currentChapter: Chapter): string {
  const lines = ['=== STORY OUTLINE (nearby chapters) ==='];
  
  // Show all chapter titles for structure, but only detail prev/current/next
  const currentIdx = chapters.findIndex(ch => ch.id === currentChapter.id);
  
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const isCurrent = ch.id === currentChapter.id;
    const isNearby = Math.abs(i - currentIdx) <= 1;
    const marker = isCurrent ? '→ ' : '  ';
    const status = ch.prose ? '✓' : '○';
    
    if (isNearby) {
      // Full detail for prev/current/next
      lines.push(`${marker}${status} Ch ${ch.number}: ${ch.title}`);
      if (ch.premise?.purpose) lines.push(`    Purpose: ${ch.premise.purpose}`);
      if (ch.premise?.changes) lines.push(`    Changes: ${ch.premise.changes}`);
      if (ch.premise?.emotionalBeat) lines.push(`    Beat: ${ch.premise.emotionalBeat}`);
    } else {
      // Just title for distant chapters (structural awareness without token cost)
      lines.push(`${marker}${status} Ch ${ch.number}: ${ch.title}`);
    }
  }
  return lines.join('\n');
}

// ========== AI Settings → Model Instructions ==========

function buildAIInstructions(settings: AppSettings): string {
  const ai = settings.ai;
  const lines: string[] = [];

  const lengthMap = {
    'concise': 'Keep the output concise — aim for the minimum word count that still tells the story effectively. Trim excess description.',
    'standard': 'Write at a natural length. Don\'t pad or compress — let the scene dictate its own length.',
    'verbose': 'Write expansively. Include rich description, extended internal monologue, and fully-developed scenes.',
  };
  lines.push(lengthMap[ai.generateLength]);

  return lines.join('\n');
}

// ========== Main Prompt Builders ==========

export interface PromptContext {
  project: Project;
  chapter: Chapter;
  allChapters: Chapter[];
  canonEntries: AnyCanonEntry[];
  settings: AppSettings;
  writingMode: WritingMode;
  generationType: GenerationType;
  previousChapterProse?: string; // DEPRECATED — use buildContinuityContext instead
  /** Extending an existing draft: continue it rather than write the chapter from the top. */
  continuation?: boolean;
}

export function buildGenerationPrompt(ctx: PromptContext): string {
  const { project, chapter, allChapters, canonEntries, settings, writingMode, generationType } = ctx;
  // Auto-build continuity context from chapters
  const continuity = buildContinuityContext(project, allChapters, chapter.id);
  const continuityBlock = formatContinuityBlock(continuity);

  // Children's book pages get a completely different prompt
  if (project.subtype === 'childrens-book') {
    return buildChildrensPagePrompt(ctx);
  }

  const sections: string[] = [];

  // System role
  sections.push(`You are Theodore, an expert fiction writer and story architect. You are writing a ${project.subtype || project.type} titled "${project.title}".`);

  // Writing style rules (from settings)
  sections.push('\n=== WRITING STYLE RULES (follow precisely) ===');
  sections.push(buildStyleInstructions(settings.writingStyle));

  // Craft rules (fiction writing intelligence)
  sections.push('\n' + buildCraftRules());

  // Tone and narrative controls (from project)
  sections.push('\n=== TONE & NARRATIVE ===');
  sections.push(buildToneInstructions(project));

  // Dialogue target — soft per-genre percentage (mirrors mobile)
  const dialogueTarget = getDialogueTargetForProject(project);
  sections.push('\n=== DIALOGUE TARGET ===');
  sections.push(buildDialogueClause(dialogueTarget));

  // Chapter-ending rule — cliffhanger on every chapter except the last
  const sortedChapters = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const isFinalChapter = sortedChapters.length > 0 && sortedChapters[sortedChapters.length - 1].id === chapter.id;
  sections.push('\n=== CHAPTER ENDING RULE ===');
  if (isFinalChapter) {
    sections.push(
      'This is the FINAL chapter of the novel. End on resolution — wrap the central arc, deliver the emotional payoff, ' +
      'and give the reader closure. Lingering ambiguity is fine; an unresolved cliffhanger is not.'
    );
    const seriesThreads = (project.threadPlan?.threads || []).filter((t) => t.continues);
    if (seriesThreads.length) {
      sections.push(
        `The book's own story closes completely, but the world does not: in the final pages, turn the series thread ` +
        `(${seriesThreads.map((t) => t.title).join('; ')}) so the larger question feels bigger than before — a quiet, ` +
        'resonant last note that leaves the reader wanting the next book. Do not answer it.'
      );
    }
  } else {
    sections.push(
      'End this chapter on a CLIFFHANGER — an unresolved hook that compels the reader to turn the page. ' +
      'Acceptable forms: a sudden revelation, a hard choice posed and not yet answered, a door opening on something unexpected, ' +
      'a line of dialogue that recontextualizes everything, a physical threat closing in, an interrupted moment. ' +
      'Do NOT resolve the chapter\'s central tension before the final paragraph. ' +
      'Cut on the highest-tension beat. Avoid soft fades, falling-action wrap-ups, or "and then they went to sleep" endings.'
    );
  }

  // Chapter-opening rule — pick up where the last chapter left off
  if ((chapter.number || 0) > 1 && !ctx.continuation) {
    sections.push('\n=== CHAPTER OPENING RULE ===');
    sections.push(
      'Open by picking up from the final moment of the previous chapter. If it ended on a cliffhanger, the reader ' +
      'sees what happens next: answer or carry forward that moment on the page before moving on. If time or place ' +
      'has changed, say so in the opening lines and briefly account for what happened in between. Do not open on an ' +
      'unrelated scene that leaves the previous ending hanging.'
    );
  }

  // AI behavior settings
  sections.push('\n=== GENERATION PREFERENCES ===');
  sections.push(buildAIInstructions(settings));

  // Writing mode
  const modeInstructions: Record<WritingMode, string> = {
    'draft': 'MODE: Draft — write freely and creatively. Prioritize flow and discovery over perfection. New ideas welcome.',
    'canon-safe': 'MODE: Canon-Safe — do NOT introduce any new facts, characters, locations, or systems not already in the canon. Only use what\'s established.',
    'exploration': 'MODE: Exploration — you may introduce new ideas, but FLAG them clearly with [NEW: description] so the user can approve or reject them.',
    'polish': 'MODE: Polish — rewrite/improve existing prose only. Do not change plot, events, or character actions. Focus on language, rhythm, and clarity.',
  };
  sections.push(`\n${modeInstructions[writingMode]}`);

  // Canon context (characters, locations, world rules) + state/fact memory
  const canonAndMemory = buildCanonAndMemory(canonEntries, chapter, allChapters, !!settings.ai.includeCanonInPrompt);
  if (canonAndMemory) {
    sections.push('\n' + canonAndMemory);
  }

  // Outline context
  if (settings.ai.includeOutlineInPrompt) {
    sections.push('\n' + buildOutlineContext(allChapters, chapter));
  }

  // Continuity context (story so far + open threads + recent dialogue + previous chapter ending)
  if (continuityBlock) {
    sections.push('\n' + continuityBlock);
  }

  // Thread map: what this chapter opens, hints, advances, reveals, closes, and must keep open
  const threadGuidance = buildThreadGuidanceBlock(project.threadPlan, chapter.number);
  if (threadGuidance) {
    sections.push('\n' + threadGuidance);
  }

  // Arc map: character arc beats and object journeys for this chapter
  const arcGuidance = buildArcGuidanceBlock(project.arcPlan, chapter.number);
  if (arcGuidance) {
    sections.push('\n' + arcGuidance);
  }

  // Chapter-specific instructions
  sections.push('\n=== CHAPTER TO WRITE ===');
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);

  if (chapter.premise?.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);
  if (chapter.premise?.changes) sections.push(`What changes: ${chapter.premise.changes}`);
  if (chapter.premise?.emotionalBeat) sections.push(`Emotional beat: ${chapter.premise.emotionalBeat}`);
  if (chapter.premise?.characters?.length) sections.push(`Characters present: ${chapter.premise.characters.join(', ')}`);
  if (chapter.premise?.constraints?.length) sections.push(`Constraints:\n${chapter.premise.constraints.map(c => `- ${c}`).join('\n')}`);
  if (chapter.premise?.setupPayoff?.length) {
    sections.push('Setup/Payoff:');
    for (const sp of chapter.premise.setupPayoff) {
      sections.push(`- Setup: ${sp.setup} → Payoff: ${sp.payoff}`);
    }
  }

  // Scene outline (if decomposed)
  if (chapter.scenes && chapter.scenes.length > 0) {
    sections.push('\nScene outline:');
    for (const scene of chapter.scenes) {
      const statusIcon = scene.prose ? '✓' : '○';
      sections.push(`  ${statusIcon} ${scene.order}. ${scene.title}: ${scene.summary}`);
    }
  }

  // Generation type
  const typeInstructions: Record<GenerationType, string> = {
    'full-chapter': '\nWrite the COMPLETE chapter as finished prose. Include all scenes, dialogue, and transitions.',
    'scene-outline': '\nWrite a detailed SCENE-BY-SCENE OUTLINE for this chapter. For each scene: setting, characters present, what happens, emotional arc, and key dialogue beats.',
    'dialogue-first': '\nWrite this chapter DIALOGUE-FIRST. Start with all the conversations that need to happen, with minimal action beats. Narration and description can be added later.',
    'action-skeleton': '\nWrite the ACTION SKELETON — the sequence of events and physical actions without dialogue or internal monologue. Focus on what happens, in what order, with what physical consequences.',
  };
  sections.push(ctx.continuation
    ? '\nCONTINUE the chapter draft provided below — do not restart it. Write the next events of this chapter in order, ' +
      'fully on the page, starting from where the draft stops. Do not jump ahead to later beats or rush to the ending; ' +
      'leave anything that does not fit for the next continuation.'
    : typeInstructions[generationType]);

  return sections.join('\n');
}

// ========== Scene Decomposition Prompt ==========

export function buildSceneDecompositionPrompt(ctx: PromptContext): string {
  const { project, chapter } = ctx;
  const sections: string[] = [];

  sections.push(`You are Theodore, an expert story architect working on "${project.title}" (a ${project.subtype || project.type}).`);
  const wordCount = chapter.prose ? chapter.prose.split(/\s+/).length : 0;
  const minScenes = Math.max(3, Math.floor(wordCount / 800));
  const maxScenes = Math.max(5, Math.ceil(wordCount / 400));
  sections.push(`\nDecompose the following chapter into ${minScenes}-${maxScenes} distinct scenes. Each scene should represent a clear narrative unit with its own setting, tension, and purpose. Longer chapters need more scenes — aim for roughly 400-600 words per scene.`);

  sections.push(`\n=== CHAPTER ===`);
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);
  if (chapter.premise?.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);
  if (chapter.premise?.changes) sections.push(`What changes: ${chapter.premise.changes}`);
  if (chapter.premise?.emotionalBeat) sections.push(`Emotional beat: ${chapter.premise.emotionalBeat}`);
  if (chapter.premise?.characters?.length) sections.push(`Characters: ${chapter.premise.characters.join(', ')}`);

  if (chapter.prose?.trim()) {
    sections.push(`\n=== EXISTING PROSE (use this to inform scene boundaries) ===`);
    sections.push(chapter.prose.slice(0, 8000));
  }

  sections.push(`\nReturn ONLY a JSON array of scene objects. No markdown, no explanation. Format:
[
  { "title": "Scene Title", "summary": "2-3 sentence description of what happens", "order": 1 },
  ...
]

Rules:
- Generate ${minScenes}-${maxScenes} scenes (scale with chapter length)
- Each scene should have a clear dramatic purpose
- Scenes should flow naturally from one to the next
- If existing prose is provided, match scene boundaries to natural breaks in the text`);

  return sections.join('\n');
}

// ========== Scene Prose Split Prompt ==========

export function buildSceneProseSplitPrompt(chapter: Chapter, scenes: { title: string; summary: string; order: number }[]): string {
  const sections: string[] = [];

  sections.push(`You are Theodore, a precise text analysis tool. Split the following chapter prose into segments that match the given scene outlines.`);

  sections.push(`\n=== SCENE OUTLINES ===`);
  for (const s of scenes) {
    sections.push(`Scene ${s.order}: "${s.title}" — ${s.summary}`);
  }

  sections.push(`\n=== CHAPTER PROSE ===`);
  sections.push(chapter.prose);

  sections.push(`\nIdentify where each scene starts in the prose. For each scene, find the EXACT first sentence where that scene begins and copy it VERBATIM (character-for-character) from the prose above. This will be used for string matching, so precision is critical.

Return ONLY a JSON array. No markdown, no explanation. Format:
[
  { "order": 1, "firstSentence": "copy the exact first sentence from the prose where scene 1 begins..." },
  { "order": 2, "firstSentence": "copy the exact first sentence from the prose where scene 2 begins..." },
  ...
]

Rules:
- Scene 1 always starts at the very beginning of the prose
- Copy sentences EXACTLY as they appear — same punctuation, same capitalization, same words
- Each firstSentence must be a complete sentence (ending with . or ! or ?)
- Do not paraphrase or summarize — COPY from the text above`);

  return sections.join('\n');
}

// ========== Scene Edit Prompt ==========

export function buildSceneEditPrompt(
  ctx: PromptContext,
  scene: Scene,
  instruction: string,
  chatHistory: EditChatMessage[],
): string {
  const { project, chapter, allChapters, canonEntries, settings } = ctx;
  const sections: string[] = [];
  const continuity = buildContinuityContext(project, allChapters, chapter.id);
  const continuityBlock = formatContinuityBlock(continuity);

  sections.push(`You are Theodore, an expert fiction editor working on "${project.title}" (a ${project.subtype || project.type}).`);

  // Writing style
  sections.push('\n=== WRITING STYLE RULES ===');
  sections.push(buildStyleInstructions(settings.writingStyle));

  // Craft rules
  sections.push('\n' + buildCraftRules());

  // Tone
  sections.push('\n=== TONE & NARRATIVE ===');
  sections.push(buildToneInstructions(project));

  // Canon context (smart-filtered) + state/fact memory
  const canonAndMemory = buildCanonAndMemory(canonEntries, chapter, allChapters, !!settings.ai.includeCanonInPrompt);
  if (canonAndMemory) sections.push('\n' + canonAndMemory);

  // Chapter context
  sections.push(`\n=== CHAPTER CONTEXT ===`);
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);
  if (chapter.premise?.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);

  // Cross-chapter continuity
  if (continuityBlock) sections.push('\n' + continuityBlock);

  // Current scene
  sections.push(`\n=== CURRENT SCENE ===`);
  sections.push(`Scene: "${scene.title}"`);
  sections.push(`Summary: ${scene.summary}`);
  if (scene.prose) {
    sections.push(`\nCurrent prose:\n${scene.prose}`);
  } else {
    sections.push(`\n(No prose written yet for this scene)`);
  }

  // Recent chat history (last 6 messages)
  const recentHistory = chatHistory.slice(-6);
  if (recentHistory.length > 0) {
    sections.push(`\n=== RECENT CONVERSATION ===`);
    for (const msg of recentHistory) {
      sections.push(`${msg.role === 'user' ? 'User' : 'Theodore'}: ${msg.content}`);
    }
  }

  // The instruction
  sections.push(`\n=== USER INSTRUCTION ===`);
  sections.push(instruction);

  sections.push(`\nApply the user's instruction to the scene. Return ONLY the updated prose text — no explanations, no markdown code blocks, no scene titles. Just the prose.`);

  return sections.join('\n');
}

// ========== Validation Prompt ==========

export function buildValidationPrompt(
  entry: AnyCanonEntry,
  changes: { field: string; oldValue: string; newValue: string }[],
  chapters: Chapter[],
  project: Project
): string {
  return `You are Theodore's Continuity Judge. A canon entry has been modified. Analyze the changes for potential continuity issues across the story.

Project: "${project.title}"
Canon entry: ${entry.name} (${entry.type})

Changes made:
${changes.map(c => `- ${c.field}: "${c.oldValue}" → "${c.newValue}"`).join('\n')}

Chapters that reference this entry or may be affected:
${chapters.map(ch => `Ch ${ch.number}: ${ch.title} — ${ch.premise?.purpose || 'no premise'}`).join('\n')}

For each issue found, return:
- severity: critical | error | warning | info
- chapter(s) affected
- specific sentence or passage that conflicts
- suggested fix

If the changes are safe and create no continuity issues, return an empty array.`;
}

// ========== Children's Book Page Prompt ==========

function buildChildrensPagePrompt(ctx: PromptContext): string {
  const { project, chapter, allChapters } = ctx;
  const continuity = buildContinuityContext(project, allChapters, chapter.id);
  const continuityBlock = formatContinuityBlock(continuity);
  const cbs = project.childrensBookSettings;
  const ageRange = cbs?.ageRange || '3-5';
  const hasRhyme = cbs?.hasRhyme || false;
  const wordsPerSpread = cbs?.wordsPerSpread || 40;
  const moralLesson = cbs?.moralLesson;

  // Word limits by age range
  const wordLimits: Record<string, { min: number; max: number; sentences: string }> = {
    '0-2': { min: 3, max: 15, sentences: '1-2 very short sentences' },
    '3-5': { min: 15, max: 50, sentences: '2-4 short, simple sentences' },
    '6-8': { min: 40, max: 100, sentences: '3-5 sentences' },
    '9-12': { min: 80, max: 200, sentences: '4-8 sentences' },
  };
  const limits = wordLimits[ageRange] || wordLimits['3-5'];

  const sections: string[] = [];

  sections.push(`You are Theodore, an expert children's book author. You are writing a picture book titled "${project.title}" for ages ${ageRange}.`);

  sections.push(`\n=== CRITICAL LENGTH RULES ===
This is a PICTURE BOOK PAGE, not a novel chapter. The illustration is the main content — text is secondary.
- Write EXACTLY ${limits.sentences}
- Target ${wordsPerSpread} words (absolute max: ${limits.max} words)
- Every word must earn its place — picture books are poetry, not prose
- The illustration will carry most of the storytelling
- DO NOT write more than ${limits.max} words under any circumstances`);

  if (hasRhyme) {
    sections.push(`\n=== RHYME ===
This book uses rhyming text. Write with consistent meter and rhyme scheme. Keep the rhythm bouncy and read-aloud friendly.`);
  }

  sections.push(`\n=== STYLE RULES ===
- Use simple, vivid language appropriate for ages ${ageRange}
- Short sentences, active voice, concrete imagery
- Present tense preferred for immediacy
- Sensory details a child can relate to (sounds, colors, textures)
- Each page should work as a standalone spread with its illustration
- End with a moment that makes the reader want to turn the page`);

  if (moralLesson) {
    sections.push(`\nMoral/theme to weave in naturally (don't be preachy): ${moralLesson}`);
  }

  // Story outline context
  if (allChapters.length > 1) {
    sections.push(`\n=== STORY PAGES ===`);
    for (const ch of allChapters) {
      const marker = ch.id === chapter.id ? '→ ' : '  ';
      const status = ch.prose ? '✓' : '○';
      sections.push(`${marker}${status} Page ${ch.number}: ${ch.title}${ch.premise?.purpose ? ' — ' + ch.premise.purpose : ''}`);
    }
  }

  // Continuity context (compact for picture books)
  if (continuityBlock) {
    sections.push('\n' + continuityBlock);
  }

  // Current page instructions
  sections.push(`\n=== PAGE TO WRITE ===`);
  sections.push(`Page ${chapter.number}: "${chapter.title}"`);
  if (chapter.premise?.purpose) sections.push(`What happens: ${chapter.premise.purpose}`);
  if (chapter.premise?.emotionalBeat) sections.push(`Feeling: ${chapter.premise.emotionalBeat}`);
  if (chapter.premise?.characters?.length) sections.push(`Characters: ${chapter.premise.characters.join(', ')}`);

  if (chapter.illustrationNotes) {
    sections.push(`Illustration note: ${chapter.illustrationNotes}`);
  }

  sections.push(`\nWrite ONLY the page text. No titles, no page numbers, no stage directions, no illustration notes. Just the ${limits.sentences} of children's book text. Remember: maximum ${limits.max} words.`);

  return sections.join('\n');
}
