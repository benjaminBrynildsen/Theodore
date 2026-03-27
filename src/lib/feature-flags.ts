/**
 * Feature flags — toggle features on/off for different release versions.
 * V1: SFX disabled. V2: re-enable by flipping to true.
 */

export const FEATURES = {
  /** Sound effects: inline SFX tags, background ambience, intro/outro sounds */
  SFX_ENABLED: false,
  /** Multi-voice: character voice assignment, dialogue tagging, direction tagging */
  MULTI_VOICE_ENABLED: false,
} as const;
