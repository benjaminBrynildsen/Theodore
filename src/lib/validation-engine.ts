// ========== Validation & Impact Engine ==========
// When any canon entry is edited, this engine:
// 1. Finds every chapter that references or mentions that entry
// 2. Checks for inconsistencies, plot holes, and broken continuity
// 3. Generates warnings with severity, explanation, and suggested fixes
// 4. Marks affected chapters as "out-of-alignment" until resolved

import type { AnyCanonEntry, CharacterEntry, LocationEntry } from '../types/canon';

export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  type: 'continuity' | 'plot-hole' | 'character-inconsistency' | 'timeline' | 'canon-conflict' | 'dead-reference' | 'logic';
  title: string;
  description: string;
  suggestion: string;
  canonEntryId: string;
  canonEntryName: string;
  affectedChapterIds: number[];
  field: string; // which field was changed
  oldValue: string;
  newValue: string;
  resolved: boolean;
  overridden: boolean;
  overrideReason?: string;
  createdAt: string;
}

export interface ImpactReport {
  canonEntryId: string;
  canonEntryName: string;
  changeDescription: string;
  issues: ValidationIssue[];
  affectedChapters: { number: number; title: string; severity: ValidationSeverity }[];
  timestamp: string;
}

// Detect what changed between old and new entry
export function detectChanges(oldEntry: AnyCanonEntry, newEntry: AnyCanonEntry): { field: string; oldValue: string; newValue: string }[] {
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  
  if (oldEntry.name !== newEntry.name) {
    changes.push({ field: 'name', oldValue: oldEntry.name, newValue: newEntry.name });
  }
  if (oldEntry.description !== newEntry.description) {
    changes.push({ field: 'description', oldValue: oldEntry.description, newValue: newEntry.description });
  }

  if (oldEntry.type === 'character' && newEntry.type === 'character') {
    const oldC = (oldEntry as CharacterEntry).character;
    const newC = (newEntry as CharacterEntry).character;

    if (oldC.storyState.alive !== newC.storyState.alive) {
      changes.push({ field: 'alive', oldValue: String(oldC.storyState.alive), newValue: String(newC.storyState.alive) });
    }
    if (oldC.storyState.currentLocation !== newC.storyState.currentLocation) {
      changes.push({ field: 'currentLocation', oldValue: oldC.storyState.currentLocation, newValue: newC.storyState.currentLocation });
    }
    if (oldC.role !== newC.role) {
      changes.push({ field: 'role', oldValue: oldC.role, newValue: newC.role });
    }
    if (oldC.arc.endingState !== newC.arc.endingState) {
      changes.push({ field: 'arc.endingState', oldValue: oldC.arc.endingState, newValue: newC.arc.endingState });
    }
    if (JSON.stringify(oldC.personality.traits) !== JSON.stringify(newC.personality.traits)) {
      changes.push({ field: 'personality.traits', oldValue: oldC.personality.traits.join(', '), newValue: newC.personality.traits.join(', ') });
    }
    if (JSON.stringify(oldC.relationships) !== JSON.stringify(newC.relationships)) {
      changes.push({ field: 'relationships', oldValue: 'previous', newValue: 'updated' });
    }
    if (oldC.personality.speechPattern !== newC.personality.speechPattern) {
      changes.push({ field: 'speechPattern', oldValue: oldC.personality.speechPattern, newValue: newC.personality.speechPattern });
    }
    if (oldC.background.upbringing !== newC.background.upbringing) {
      changes.push({ field: 'background.upbringing', oldValue: oldC.background.upbringing, newValue: newC.background.upbringing });
    }
    if (JSON.stringify(oldC.storyState.knowledgeState) !== JSON.stringify(newC.storyState.knowledgeState)) {
      changes.push({ field: 'knowledgeState', oldValue: oldC.storyState.knowledgeState.join(', '), newValue: newC.storyState.knowledgeState.join(', ') });
    }
  }

  if (oldEntry.type === 'location' && newEntry.type === 'location') {
    const oldL = (oldEntry as LocationEntry).location;
    const newL = (newEntry as LocationEntry).location;

    if (oldL.geography.region !== newL.geography.region) {
      changes.push({ field: 'geography.region', oldValue: oldL.geography.region, newValue: newL.geography.region });
    }
    if (JSON.stringify(oldL.history.ownership) !== JSON.stringify(newL.history.ownership)) {
      changes.push({ field: 'ownership', oldValue: 'previous', newValue: 'updated' });
    }
    if (oldL.storyRelevance.accessRules !== newL.storyRelevance.accessRules) {
      changes.push({ field: 'accessRules', oldValue: oldL.storyRelevance.accessRules, newValue: newL.storyRelevance.accessRules });
    }
  }

  return changes;
}

// Generate validation issues for a change
// In production: AI analyzes the full story context
// For now: rule-based checks that demonstrate the system
export function generateValidationIssues(
  entry: AnyCanonEntry,
  changes: { field: string; oldValue: string; newValue: string }[],
  chapterCount: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const now = new Date().toISOString();
  let issueNum = 0;

  for (const change of changes) {
    // Character dies
    if (change.field === 'alive' && change.newValue === 'false') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'critical',
        type: 'continuity',
        title: `${entry.name} marked as dead`,
        description: `${entry.name} has been marked as dead. Any chapters after their death that include dialogue or actions from this character need to be reviewed.`,
        suggestion: `Review all chapters after the death event. Remove or revise any scenes where ${entry.name} appears alive. Check if other characters react to the death.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Character location change
    if (change.field === 'currentLocation' && change.oldValue && change.newValue) {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'warning',
        type: 'continuity',
        title: `${entry.name} relocated`,
        description: `${entry.name} moved from "${change.oldValue}" to "${change.newValue}". Chapters where they were at the old location may need travel or transition scenes.`,
        suggestion: `Add a transition scene showing the move. Check that no chapters reference ${entry.name} being at "${change.oldValue}" after this point.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: Math.min(5, chapterCount) }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Role change
    if (change.field === 'role') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'warning',
        type: 'character-inconsistency',
        title: `${entry.name}'s role changed`,
        description: `${entry.name} changed from ${change.oldValue} to ${change.newValue}. This may affect their motivations, screen time, and arc across the entire story.`,
        suggestion: `Review ${entry.name}'s arc and ensure their new role is consistently reflected. Update chapter premises that feature this character.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Personality traits changed
    if (change.field === 'personality.traits') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'info',
        type: 'character-inconsistency',
        title: `${entry.name}'s personality updated`,
        description: `Core traits changed from [${change.oldValue}] to [${change.newValue}]. Dialogue and internal monologue may need adjustment to match the new personality.`,
        suggestion: `Review dialogue consistency. The Dialogue Pass AI agent can help identify lines that don't match the updated personality.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Speech pattern changed
    if (change.field === 'speechPattern') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'warning',
        type: 'character-inconsistency',
        title: `${entry.name}'s voice changed`,
        description: `Speech pattern updated. All existing dialogue for ${entry.name} should be reviewed for consistency with their new voice.`,
        suggestion: `Run a Dialogue Pass on all chapters featuring ${entry.name} to ensure voice consistency.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Knowledge state changed
    if (change.field === 'knowledgeState') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'error',
        type: 'plot-hole',
        title: `${entry.name}'s knowledge updated`,
        description: `What ${entry.name} knows has changed. This can create plot holes if they reference knowledge they shouldn't have yet, or fail to act on knowledge they now possess.`,
        suggestion: `Check the timeline of knowledge reveals. Ensure ${entry.name} doesn't use this knowledge before they learn it, and does act on it after.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Background/upbringing changed
    if (change.field === 'background.upbringing') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'warning',
        type: 'continuity',
        title: `${entry.name}'s backstory changed`,
        description: `${entry.name}'s upbringing has been modified. Any flashbacks, references to their past, or motivations rooted in their background may need updating.`,
        suggestion: `Search for backstory references in all chapters. Update any dialogue where ${entry.name} discusses their past.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Relationship changes
    if (change.field === 'relationships') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'warning',
        type: 'continuity',
        title: `${entry.name}'s relationships changed`,
        description: `Relationship dynamics have been updated. Interactions between affected characters may need revision across multiple chapters.`,
        suggestion: `Review scenes with the affected characters. Ensure dialogue and actions reflect the updated relationship dynamics.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Location access rules changed
    if (change.field === 'accessRules') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'error',
        type: 'logic',
        title: `Access rules changed for ${entry.name}`,
        description: `Location access rules have been modified. Characters who previously entered this location may no longer be able to, creating logic issues.`,
        suggestion: `Review all scenes set in ${entry.name}. Verify each character present has a valid reason to access the location under the new rules.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }

    // Name change (affects everything)
    if (change.field === 'name') {
      issues.push({
        id: `val-${Date.now()}-${issueNum++}`,
        severity: 'info',
        type: 'continuity',
        title: `Renamed: "${change.oldValue}" → "${change.newValue}"`,
        description: `This ${entry.type} has been renamed. All references in prose and premises should be updated.`,
        suggestion: `Find and replace "${change.oldValue}" with "${change.newValue}" across all chapters. Review for any indirect references.`,
        canonEntryId: entry.id,
        canonEntryName: entry.name,
        affectedChapterIds: Array.from({ length: chapterCount }, (_, i) => i + 1),
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        resolved: false,
        overridden: false,
        createdAt: now,
      });
    }
  }

  return issues;
}
