// ========== Prompt Builder ==========
// Builds AI prompts that incorporate ALL settings, canon, and project context
// Every generation call goes through here to ensure consistency

import type { Project, Chapter, PremiseCard, WritingMode, GenerationType, Scene, EditChatMessage } from '../types';
import type { AppSettings, WritingStyleSettings } from '../types/settings';
import type { AnyCanonEntry, CharacterEntry, LocationEntry } from '../types/canon';

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
    rules.push(`Use "${style.sceneBreakStyle}" for scene breaks within a chapter.`);
  } else {
    rules.push('Use a blank line (double line break) for scene breaks within a chapter.');
  }

  // Chapter start
  if (style.chapterStartStyle === 'drop-cap') {
    rules.push('Begin each chapter with a drop cap — make the first letter/word distinctive.');
  } else if (style.chapterStartStyle === 'small-caps') {
    rules.push('Begin each chapter with the first few words in small caps style.');
  }

  return rules.join('\n');
}

// ========== Narrative Controls → Tone Instructions ==========

function buildToneInstructions(project: Project): string {
  const nc = project.narrativeControls;
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

function buildCanonContext(entries: AnyCanonEntry[], chapter: Chapter): string {
  if (entries.length === 0) return '';

  const sections: string[] = ['=== CANON (established facts — do not contradict) ==='];

  // Characters
  const characters = entries.filter(e => e.type === 'character') as CharacterEntry[];
  if (characters.length > 0) {
    sections.push('\n## Characters');
    for (const c of characters) {
      const ch = c.character;
      const lines = [`### ${c.name}`];
      if (c.description) lines.push(c.description);
      if (ch.fullName && ch.fullName !== c.name) lines.push(`Full name: ${ch.fullName}`);
      if (ch.age) lines.push(`Age: ${ch.age}`);
      if (ch.role) lines.push(`Role: ${ch.role}`);
      if (ch.occupation) lines.push(`Occupation: ${ch.occupation}`);
      if (ch.personality.traits.length) lines.push(`Traits: ${ch.personality.traits.join(', ')}`);
      if (ch.personality.speechPattern) lines.push(`Speech pattern: ${ch.personality.speechPattern}`);
      if (ch.appearance.physical) lines.push(`Appearance: ${ch.appearance.physical}`);
      if (ch.storyState.currentLocation) lines.push(`Current location: ${ch.storyState.currentLocation}`);
      if (ch.storyState.emotionalState) lines.push(`Emotional state: ${ch.storyState.emotionalState}`);
      if (!ch.storyState.alive) lines.push('⚠ STATUS: DEAD');
      sections.push(lines.join('\n'));
    }
  }

  // Locations
  const locations = entries.filter(e => e.type === 'location') as LocationEntry[];
  if (locations.length > 0) {
    sections.push('\n## Locations');
    for (const l of locations) {
      const loc = l.location;
      const lines = [`### ${l.name}`];
      if (l.description) lines.push(l.description);
      if (loc.locationType) lines.push(`Type: ${loc.locationType}`);
      if (loc.currentState.atmosphere) lines.push(`Atmosphere: ${loc.currentState.atmosphere}`);
      if (loc.currentState.condition) lines.push(`Condition: ${loc.currentState.condition}`);
      if (loc.storyRelevance.accessRules) lines.push(`Access: ${loc.storyRelevance.accessRules}`);
      if (loc.storyRelevance.dangerLevel) lines.push(`Danger level: ${loc.storyRelevance.dangerLevel}`);
      sections.push(lines.join('\n'));
    }
  }

  // Systems, artifacts, rules, events
  const others = entries.filter(e => e.type !== 'character' && e.type !== 'location');
  if (others.length > 0) {
    sections.push('\n## World Rules & Elements');
    for (const e of others) {
      sections.push(`### ${e.name} (${e.type})\n${e.description || 'No description'}`);
    }
  }

  return sections.join('\n');
}

// ========== Chapter Outline Context ==========

function buildOutlineContext(chapters: Chapter[], currentChapter: Chapter): string {
  const lines = ['=== STORY OUTLINE ==='];
  for (const ch of chapters) {
    const marker = ch.id === currentChapter.id ? '→ ' : '  ';
    const status = ch.prose ? '(written)' : '(unwritten)';
    lines.push(`${marker}Ch ${ch.number}: ${ch.title} ${status}`);
    if (ch.premise.purpose) lines.push(`    Purpose: ${ch.premise.purpose}`);
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
  previousChapterProse?: string; // for context continuity
}

export function buildGenerationPrompt(ctx: PromptContext): string {
  const { project, chapter, allChapters, canonEntries, settings, writingMode, generationType, previousChapterProse } = ctx;

  const sections: string[] = [];

  // System role
  sections.push(`You are Theodore, an expert fiction writer and story architect. You are writing a ${project.subtype || project.type} titled "${project.title}".`);

  // Writing style rules (from settings)
  sections.push('\n=== WRITING STYLE RULES (follow precisely) ===');
  sections.push(buildStyleInstructions(settings.writingStyle));

  // Tone and narrative controls (from project)
  sections.push('\n=== TONE & NARRATIVE ===');
  sections.push(buildToneInstructions(project));

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

  // Canon context (characters, locations, world rules)
  if (settings.ai.includeCanonInPrompt && canonEntries.length > 0) {
    sections.push('\n' + buildCanonContext(canonEntries, chapter));
  }

  // Outline context
  if (settings.ai.includeOutlineInPrompt) {
    sections.push('\n' + buildOutlineContext(allChapters, chapter));
  }

  // Previous chapter context (for continuity)
  if (previousChapterProse) {
    const trimmed = previousChapterProse.slice(-2000); // Last ~2000 chars
    sections.push(`\n=== PREVIOUS CHAPTER ENDING ===\n...${trimmed}`);
  }

  // Chapter-specific instructions
  sections.push('\n=== CHAPTER TO WRITE ===');
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);

  if (chapter.premise.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);
  if (chapter.premise.changes) sections.push(`What changes: ${chapter.premise.changes}`);
  if (chapter.premise.emotionalBeat) sections.push(`Emotional beat: ${chapter.premise.emotionalBeat}`);
  if (chapter.premise.characters.length) sections.push(`Characters present: ${chapter.premise.characters.join(', ')}`);
  if (chapter.premise.constraints.length) sections.push(`Constraints:\n${chapter.premise.constraints.map(c => `- ${c}`).join('\n')}`);
  if (chapter.premise.setupPayoff.length) {
    sections.push('Setup/Payoff:');
    for (const sp of chapter.premise.setupPayoff) {
      sections.push(`- Setup: ${sp.setup} → Payoff: ${sp.payoff}`);
    }
  }

  // Generation type
  const typeInstructions: Record<GenerationType, string> = {
    'full-chapter': '\nWrite the COMPLETE chapter as finished prose. Include all scenes, dialogue, and transitions.',
    'scene-outline': '\nWrite a detailed SCENE-BY-SCENE OUTLINE for this chapter. For each scene: setting, characters present, what happens, emotional arc, and key dialogue beats.',
    'dialogue-first': '\nWrite this chapter DIALOGUE-FIRST. Start with all the conversations that need to happen, with minimal action beats. Narration and description can be added later.',
    'action-skeleton': '\nWrite the ACTION SKELETON — the sequence of events and physical actions without dialogue or internal monologue. Focus on what happens, in what order, with what physical consequences.',
  };
  sections.push(typeInstructions[generationType]);

  return sections.join('\n');
}

// ========== Scene Decomposition Prompt ==========

export function buildSceneDecompositionPrompt(ctx: PromptContext): string {
  const { project, chapter } = ctx;
  const sections: string[] = [];

  sections.push(`You are Theodore, an expert story architect working on "${project.title}" (a ${project.subtype || project.type}).`);
  sections.push(`\nDecompose the following chapter into 3-5 distinct scenes. Each scene should represent a clear narrative unit with its own setting, tension, and purpose.`);

  sections.push(`\n=== CHAPTER ===`);
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);
  if (chapter.premise.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);
  if (chapter.premise.changes) sections.push(`What changes: ${chapter.premise.changes}`);
  if (chapter.premise.emotionalBeat) sections.push(`Emotional beat: ${chapter.premise.emotionalBeat}`);
  if (chapter.premise.characters.length) sections.push(`Characters: ${chapter.premise.characters.join(', ')}`);

  if (chapter.prose?.trim()) {
    sections.push(`\n=== EXISTING PROSE (use this to inform scene boundaries) ===`);
    sections.push(chapter.prose.slice(0, 4000));
  }

  sections.push(`\nReturn ONLY a JSON array of scene objects. No markdown, no explanation. Format:
[
  { "title": "Scene Title", "summary": "2-3 sentence description of what happens", "order": 1 },
  ...
]

Rules:
- Generate 3-5 scenes
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

  sections.push(`\nSplit the prose into segments matching each scene. Preserve the EXACT original text — do not rewrite, summarize, or modify any words.

Return ONLY a JSON array. No markdown, no explanation. Format:
[
  { "order": 1, "prose": "exact text from the chapter belonging to scene 1..." },
  { "order": 2, "prose": "exact text from the chapter belonging to scene 2..." },
  ...
]

If prose doesn't clearly map to a scene, assign it to the nearest scene by narrative flow.`);

  return sections.join('\n');
}

// ========== Scene Edit Prompt ==========

export function buildSceneEditPrompt(
  ctx: PromptContext,
  scene: Scene,
  instruction: string,
  chatHistory: EditChatMessage[],
): string {
  const { project, chapter, canonEntries, settings } = ctx;
  const sections: string[] = [];

  sections.push(`You are Theodore, an expert fiction editor working on "${project.title}" (a ${project.subtype || project.type}).`);

  // Writing style
  sections.push('\n=== WRITING STYLE RULES ===');
  sections.push(buildStyleInstructions(settings.writingStyle));

  // Tone
  sections.push('\n=== TONE & NARRATIVE ===');
  sections.push(buildToneInstructions(project));

  // Canon context (brief)
  if (settings.ai.includeCanonInPrompt && canonEntries.length > 0) {
    sections.push('\n' + buildCanonContext(canonEntries, chapter));
  }

  // Chapter context
  sections.push(`\n=== CHAPTER CONTEXT ===`);
  sections.push(`Chapter ${chapter.number}: "${chapter.title}"`);
  if (chapter.premise.purpose) sections.push(`Purpose: ${chapter.premise.purpose}`);

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

// ========== Auto-fill Prompt (for canon entries) ==========

export function buildAutoFillPrompt(entry: AnyCanonEntry, project: Project, settings: AppSettings): string {
  return `You are Theodore, an expert story architect working on "${project.title}" (a ${project.subtype || project.type}).

Given this ${entry.type} entry:
Name: ${entry.name}
Description: ${entry.description || '(none yet)'}

Generate rich, detailed metadata for ALL fields. Be creative but consistent with the story's tone:
${buildToneInstructions(project)}

Return a complete JSON object matching the ${entry.type} schema. Every field should have meaningful content — no placeholders.`;
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
${chapters.map(ch => `Ch ${ch.number}: ${ch.title} — ${ch.premise.purpose || 'no premise'}`).join('\n')}

For each issue found, return:
- severity: critical | error | warning | info
- chapter(s) affected
- specific sentence or passage that conflicts
- suggested fix

If the changes are safe and create no continuity issues, return an empty array.`;
}
