// ========== Scene SFX Planner ==========
// Analyzes all scenes in a chapter and plans background ambience, intro, and outro SFX
// Reuses the same background across scenes when the setting doesn't change

import { generateText } from './generate';
import type { Scene, SceneSFX } from '../types';

interface SFXPlan {
  sceneId: string;
  background: string[];  // ambient descriptions for this scene
  intro?: string;        // intro sound (first scene only)
  outro?: string;        // outro sound (last scene only)
}

/**
 * Analyze all scenes in a chapter and plan SFX assignments.
 * - Background ambience for every scene (shared when settings match)
 * - Intro SFX for scene 1
 * - Outro SFX for last scene
 */
export async function planChapterSFX(
  scenes: Scene[],
  projectId: string,
  chapterId: string,
): Promise<SFXPlan[]> {
  if (scenes.length === 0) return [];

  const sceneSummaries = scenes
    .sort((a, b) => a.order - b.order)
    .map((s, i) => `Scene ${i + 1} "${s.title}": ${(s.prose || '').slice(0, 300)}`)
    .join('\n\n');

  const prompt = `You are an audiobook sound designer. Analyze these scenes and plan ambient background sounds, plus an intro and outro.

## Rules
1. EVERY scene MUST have exactly 1-2 background ambient sounds (rain, cafe chatter, forest birds, traffic, etc.) — no exceptions
2. If consecutive scenes share the same location/setting, reuse the EXACT SAME background sounds
3. The FIRST scene MUST have an "intro" sound — something that plays before narration begins to set the mood (e.g. "city street ambience with distant sirens", "gentle wind through trees")
4. The LAST scene MUST have an "outro" sound — something that closes the chapter (e.g. "fading footsteps", "door closing softly", "rain intensifying")
5. Keep descriptions short (3-6 words), specific enough to generate as sound effects
6. Only describe environmental/ambient sounds, NOT music

## Scenes
${sceneSummaries}

## Output
Return ONLY valid JSON array, one object per scene in order:
[
  { "sceneIndex": 0, "background": ["quiet diner ambience"], "intro": "busy city street at night" },
  { "sceneIndex": 1, "background": ["quiet diner ambience"] },
  { "sceneIndex": 2, "background": ["quiet diner ambience"], "outro": "door closing, rain outside" }
]`;

  const result = await generateText({
    prompt,
    model: 'gpt-4.1-mini',
    maxTokens: 500,
    temperature: 0.3,
    action: 'sfx-planning',
    projectId,
    chapterId,
  });

  try {
    // Extract JSON from response (handle markdown fences)
    let jsonText = result.text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];

    const sorted = scenes.sort((a, b) => a.order - b.order);
    return parsed.map((p: any, i: number) => ({
      sceneId: sorted[i]?.id || '',
      background: Array.isArray(p.background) ? p.background : [],
      intro: i === 0 ? p.intro : undefined,
      outro: i === sorted.length - 1 ? p.outro : undefined,
    })).filter((p: SFXPlan) => p.sceneId);
  } catch (e) {
    console.error('[SFXPlanner] Failed to parse AI response:', e);
    return [];
  }
}

/**
 * Apply an SFX plan to scenes — adds SFX entries that don't already exist.
 * Returns the scenes that were modified (with their new SFX arrays).
 */
export function applySFXPlan(
  scenes: Scene[],
  plan: SFXPlan[],
): { sceneId: string; sfx: SceneSFX[] }[] {
  const updates: { sceneId: string; sfx: SceneSFX[] }[] = [];

  for (const p of plan) {
    const scene = scenes.find(s => s.id === p.sceneId);
    if (!scene) continue;

    const existing = scene.sfx || [];
    const existingPrompts = new Set(existing.map(s => s.prompt.toLowerCase()));
    const newSfx: SceneSFX[] = [];

    // Add background sounds
    for (const bg of p.background) {
      if (!existingPrompts.has(bg.toLowerCase())) {
        newSfx.push({
          id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          prompt: bg,
          position: 'background',
          enabled: true,
          durationSeconds: 30,
          source: 'suggested',
        });
      }
    }

    // Add intro (first scene only)
    if (p.intro && !existing.some(s => s.position === 'start')) {
      newSfx.push({
        id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt: p.intro,
        position: 'start',
        enabled: true,
        durationSeconds: 5,
        source: 'suggested',
      });
    }

    // Add outro (last scene only)
    if (p.outro && !existing.some(s => s.position === 'end')) {
      newSfx.push({
        id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt: p.outro,
        position: 'end',
        enabled: true,
        durationSeconds: 5,
        source: 'suggested',
      });
    }

    if (newSfx.length > 0) {
      updates.push({
        sceneId: p.sceneId,
        sfx: [...existing, ...newSfx],
      });
    }
  }

  return updates;
}
