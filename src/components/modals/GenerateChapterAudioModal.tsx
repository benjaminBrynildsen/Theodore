// Confirmation modal that surfaces voice settings before chapter+audio gen
// fires from the ChapterView "Generate Chapter + Audio" button.
//
// Multi-voice is gated to Writer+ subscribers. Voice assignment is
// PROJECT-WIDE and AUTO-ASSIGNED — top 8 main males and top 8 main females
// get unique Grok voices, everyone else falls back to the narrator. See
// docs/MULTI_VOICE.md for the full design and lib/character-voices.ts for
// the assignment algorithm.

import { useEffect, useMemo } from 'react';
import { X, Mic, Users, Sparkles, Check, Lock } from 'lucide-react';
import { useAudioStore } from '../../store/audio';
import { useCanonStore } from '../../store/canon';
import { useAuthStore } from '../../store/auth';
import {
  assignVoicesForProject,
  getVoiceLabel,
  getVoiceDescription,
  NARRATOR_VOICE,
} from '../../lib/character-voices';
import { isPaidPlan } from '../../lib/plan';
import type { CharacterEntry } from '../../types/canon';
import type { ElevenLabsVoice } from '../../lib/tts-types';

interface Props {
  isOpen: boolean;
  projectId: string;
  onCancel: () => void;
  onConfirm: () => void;
}

// Grok voice cards available for the narrator slot. Other Theodore TTS
// providers (ElevenLabs, OpenAI, Fish) are intentionally NOT shown here —
// multi-voice locks the character voices to Grok per the mobile spec, and
// mixing providers across a project sounds inconsistent.
//
// Original 5 (multilingual) + 12 from xAI's expanded English library,
// grouped by accent.
const NARRATOR_OPTIONS = [
  { id: 'grok:leo', name: 'Leo', desc: 'Authoritative · default' },
  { id: 'grok:sal', name: 'Sal', desc: 'Smooth & grounded' },
  { id: 'grok:rex', name: 'Rex', desc: 'Confident & clear' },
  { id: 'grok:ara', name: 'Ara', desc: 'Warm & inviting' },
  { id: 'grok:eve', name: 'Eve', desc: 'Energetic & bright' },
  { id: 'grok:6a41d324', name: 'Liam', desc: 'American · steady' },
  { id: 'grok:d11249e6', name: 'Emma', desc: 'American · mature' },
  { id: 'grok:f15c6a6a', name: 'Henry', desc: 'British · grounded' },
  { id: 'grok:bedd6226', name: 'Olivia', desc: 'British · bright' },
  { id: 'grok:a7b78b05', name: 'Sean', desc: 'Irish · warm' },
  { id: 'grok:355dca53', name: 'Niamh', desc: 'Irish · lyrical' },
  { id: 'grok:5d695b41', name: 'Marc', desc: 'South African · measured' },
  { id: 'grok:135ff7ec', name: 'Thandi', desc: 'South African · warm' },
  { id: 'grok:96819d0bd28d', name: 'Daniel', desc: 'English · clear' },
  { id: 'grok:78a495fdbb39', name: 'James', desc: 'English · youthful' },
  { id: 'grok:f8cf5c2c78d4', name: 'Grace', desc: 'English · young' },
  { id: 'grok:79f3a8b96d43', name: 'Claire', desc: 'English · poised' },
] as const;

export function GenerateChapterAudioModal({ isOpen, projectId, onCancel, onConfirm }: Props) {
  const audioStore = useAudioStore();
  const { entries } = useCanonStore();
  const user = useAuthStore((s) => s.user);
  const multiVoiceUnlocked = isPaidPlan(user?.plan);

  const characters = useMemo(
    () => entries.filter((e) => e.projectId === projectId && e.type === 'character' && (e as any).character) as CharacterEntry[],
    [entries, projectId],
  );

  // Compute the locked voice assignments. Pure function, derived from canon —
  // changes whenever a character is added/removed or their role/gender shifts.
  const assignments = useMemo(() => assignVoicesForProject(characters), [characters]);

  // Sync audio store characterVoices to match the computed assignments. Runs
  // when the modal opens AND whenever the assignments change. The audio
  // pipeline reads characterVoices from the store, so this is what makes the
  // server actually use these voices.
  useEffect(() => {
    if (!isOpen) return;
    for (const a of assignments) {
      // Only set non-fallback assignments. Fallback (= narrator) characters
      // don't need a per-character entry — they'll get narrator by default
      // when no characterVoices entry exists for them.
      if (a.isFallback) continue;
      if (audioStore.characterVoices[a.characterName] !== a.voice) {
        audioStore.setCharacterVoice(a.characterName, a.voice as ElevenLabsVoice);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, assignments]);

  if (!isOpen) return null;

  const lockedAssignments = assignments.filter((a) => !a.isFallback);
  const fallbackCount = assignments.length - lockedAssignments.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/5 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-serif font-semibold text-text-primary inline-flex items-center gap-2">
              <Sparkles size={16} className="text-amber-600" />
              Confirm voices
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              Voices apply to the whole project — same across every chapter.
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-black/5 text-text-tertiary shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {/* Narrator voice — user-pickable */}
          <section>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              <Mic size={12} />
              Narrator
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {NARRATOR_OPTIONS.map((v) => {
                const selected = audioStore.narratorVoice === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => audioStore.setNarratorVoice(v.id as ElevenLabsVoice)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      selected
                        ? 'border-text-primary bg-black/[0.04]'
                        : 'border-black/5 bg-white hover:bg-black/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-text-primary truncate">{v.name}</div>
                      {selected && <Check size={13} className="text-text-primary shrink-0" />}
                    </div>
                    <div className="text-[11px] text-text-tertiary mt-0.5 truncate">{v.desc}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Multi-voice toggle — Writer+ only */}
          <section className={`flex items-center justify-between p-3 rounded-xl border ${
            multiVoiceUnlocked ? 'bg-black/[0.02] border-black/5' : 'bg-amber-50/40 border-amber-200/60'
          }`}>
            <div className="flex items-start gap-2.5">
              {multiVoiceUnlocked ? (
                <Users size={14} className="text-text-tertiary mt-0.5 shrink-0" />
              ) : (
                <Lock size={14} className="text-amber-600 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-text-primary">Multi-voice characters</div>
                  {!multiVoiceUnlocked && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900">
                      Writer+
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  {multiVoiceUnlocked
                    ? 'Up to 16 characters get their own voice — auto-assigned by role and gender. Everyone else stays in the narrator voice.'
                    : 'Give each character their own voice. Available on Writer ($10/mo) and up.'}
                </div>
              </div>
            </div>
            <Toggle
              checked={multiVoiceUnlocked && audioStore.multiVoice}
              disabled={!multiVoiceUnlocked}
              onChange={audioStore.setMultiVoice}
            />
          </section>

          {/* Locked character voice assignments — read-only */}
          {multiVoiceUnlocked && audioStore.multiVoice && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                Character voices ({lockedAssignments.length} of {assignments.length})
              </div>

              {lockedAssignments.length === 0 ? (
                <div className="text-xs text-text-tertiary p-4 rounded-lg bg-black/[0.02] border border-dashed border-black/10">
                  No characters with a defined gender yet. Add characters in the canon panel and mark their role and gender — they'll get assigned voices here automatically.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {lockedAssignments.map((a) => (
                    <div
                      key={a.characterId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-50/40 border border-emerald-200/60"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{a.characterName}</div>
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider">
                          {a.gender}{a.role && ` · ${a.role}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-emerald-700">{getVoiceLabel(a.voice)}</div>
                        <div className="text-[10px] text-text-tertiary">{getVoiceDescription(a.voice)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {fallbackCount > 0 && (
                <div className="mt-2 text-[11px] text-text-tertiary px-1">
                  {fallbackCount} other character{fallbackCount === 1 ? ' uses' : 's use'} the narrator voice ({getVoiceLabel(NARRATOR_VOICE)}) — the pool fits 8 male + 8 female; beyond that, side characters share the narrator.
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-lg bg-text-primary text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-text-primary/90"
          >
            <Sparkles size={14} />
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        disabled ? 'bg-black/10 cursor-not-allowed opacity-60' : checked ? 'bg-emerald-600' : 'bg-black/15'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
