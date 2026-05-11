// ========== Dialogue Targets ==========
// Web port of theodore-mobile-app/lib/dialogue-targets.ts — kept value-identical
// so web and mobile produce the same dialogue ratios for the same project.
// Tune values here AND in mobile together; don't drift them silently.
//
// Per-genre soft targets (v1, ported 2026-05-11):
//   Mystery 0.52, Thriller 0.42, Fantasy 0.35, Horror 0.32, Family 0.52, general 0.45

export type DialogueTemplate =
  | 'mystery'
  | 'thriller'
  | 'fantasy'
  | 'horror'
  | 'family'
  | 'general';

export const DIALOGUE_TARGET_BY_TEMPLATE: Record<DialogueTemplate, number> = {
  mystery: 0.52,
  thriller: 0.42,
  fantasy: 0.35,
  horror: 0.32,
  family: 0.52,
  general: 0.45,
};

// Free-form genre string → template. Permissive matcher — accepts whatever the
// outline pipeline / GenreEmphasis enum / free-form `genre` field hands us.
export function mapGenreToTemplate(genreLike: string | undefined | null): DialogueTemplate {
  if (!genreLike) return 'general';
  const g = String(genreLike).toLowerCase();
  if (/(mystery|detective|whodunit|cozy)/.test(g)) return 'mystery';
  if (/(thriller|suspense|crime|noir|spy|action|adventure)/.test(g)) return 'thriller';
  if (/(fantasy|epic|sword|magic|fae|mythic)/.test(g)) return 'fantasy';
  if (/(horror|gothic|supernatural|ghost|haunt)/.test(g)) return 'horror';
  if (/(family|drama|contemporary|literary|romance|relationship|coming.of.age|domestic|philosophical)/.test(g)) return 'family';
  return 'general';
}

// Resolve the dialogue target for a project. Order:
//   1. Explicit project.dialogueTarget (0..1) — future UI override
//   2. project.narrativeControls.genreEmphasis[0]
//   3. Free-form top-level `genre` string
//   4. Fallback (general, 0.45)
export function getDialogueTargetForProject(project: any): number {
  const explicit = project?.dialogueTarget;
  if (typeof explicit === 'number' && explicit > 0 && explicit < 1) {
    return explicit;
  }
  const emphasis: string[] = project?.narrativeControls?.genreEmphasis || [];
  if (emphasis.length > 0) {
    return DIALOGUE_TARGET_BY_TEMPLATE[mapGenreToTemplate(emphasis[0])];
  }
  if (typeof project?.genre === 'string') {
    return DIALOGUE_TARGET_BY_TEMPLATE[mapGenreToTemplate(project.genre)];
  }
  return DIALOGUE_TARGET_BY_TEMPLATE.general;
}

// Soft-target clause. Phrased as guidance, not enforcement — real novels vary
// dramatically scene-to-scene (action ~15–20%, confrontation 70%+).
export function buildDialogueClause(target: number): string {
  const pct = Math.round(target * 100);
  return (
    `Across the whole novel, aim for roughly ${pct}% dialogue as a soft target. ` +
    `Individual scenes should vary naturally — action scenes ~15–20%, ` +
    `confrontation scenes 70%+. Don't force the percentage into every chapter; ` +
    `let the scene's needs drive the ratio. Stay within a 10–15% band across the ` +
    `whole book — internal consistency matters more than hitting the exact number.`
  );
}
