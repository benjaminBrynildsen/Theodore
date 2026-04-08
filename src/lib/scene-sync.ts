// Redistribute updated chapter prose back into existing scenes.
// Used after an inline-edit changes the chapter prose, so each scene's
// .prose stays in sync with the chapter as a whole.
//
// Calls the AI scene-split prompt against the existing scene titles +
// summaries. The model returns either a `firstSentence` boundary per scene
// (so we can slice the prose locally) or a per-scene `prose` payload.

import { generateText } from './generate';
import { buildSceneProseSplitPrompt } from './prompt-builder';
import { useStore } from '../store';
import type { Scene } from '../types';

export async function redistributeProseToScenes(
  chapterId: string,
  model: string,
): Promise<void> {
  const store = useStore.getState();
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter || !chapter.prose?.trim()) return;
  const scenes = chapter.scenes || [];
  if (scenes.length === 0) return;

  const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);

  const splitPrompt = buildSceneProseSplitPrompt(
    chapter,
    sortedScenes.map((s) => ({ title: s.title, summary: s.summary || '', order: s.order })),
  );

  const result = await generateText({
    prompt: splitPrompt,
    model,
    maxTokens: 4000,
    action: 'generate-chapter-outline',
    projectId: chapter.projectId,
    chapterId,
  });

  const splitText = (result.text || '').trim();
  const splitJsonMatch = splitText.match(/\[[\s\S]*\]/);
  if (!splitJsonMatch) return;

  let splitParsed: { order: number; firstSentence?: string; prose?: string }[];
  try {
    splitParsed = JSON.parse(splitJsonMatch[0]);
  } catch {
    return;
  }
  splitParsed.sort((a, b) => a.order - b.order);

  const updatedScenes: Scene[] = sortedScenes.map((s) => ({ ...s }));

  if (splitParsed[0]?.firstSentence) {
    // Boundary-based split: locate each firstSentence in the chapter prose
    // and slice between boundaries.
    const fullProse = chapter.prose;
    const boundaries: { order: number; startIndex: number }[] = [];
    for (const seg of splitParsed) {
      if (!seg.firstSentence) continue;
      const idx = fullProse.indexOf(seg.firstSentence);
      if (idx >= 0) boundaries.push({ order: seg.order, startIndex: idx });
    }
    if (boundaries.length === 0) return;
    boundaries.sort((a, b) => a.startIndex - b.startIndex);
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i].startIndex;
      const end = i + 1 < boundaries.length ? boundaries[i + 1].startIndex : fullProse.length;
      const sceneProse = fullProse.slice(start, end).trim();
      const targetIdx = updatedScenes.findIndex((s) => s.order === boundaries[i].order);
      if (targetIdx >= 0 && sceneProse) {
        updatedScenes[targetIdx] = {
          ...updatedScenes[targetIdx],
          prose: sceneProse,
          status: 'drafted',
        };
      }
    }
  } else {
    // Direct prose split: AI returned { order, prose } objects
    for (const seg of splitParsed) {
      if (!seg.prose) continue;
      const targetIdx = updatedScenes.findIndex((s) => s.order === seg.order);
      if (targetIdx >= 0) {
        updatedScenes[targetIdx] = {
          ...updatedScenes[targetIdx],
          prose: seg.prose,
          status: 'drafted',
        };
      }
    }
  }

  useStore.getState().setChapterScenes(chapterId, updatedScenes);
}
