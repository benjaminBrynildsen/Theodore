// Confirmation modal that surfaces voice settings before chapter+audio gen
// fires from the ChapterView "Generate Chapter + Audio" button. Lets the
// user (a) confirm the narrator voice, (b) toggle multi-voice, and (c) when
// multi-voice is on, pick a voice per character (auto-suggested by gender,
// editable). Settings persist in audioStore so chapter 2, 3, … keep them.
//
// Auto-first-chapter at project creation does NOT fire this modal — it
// generates with default voices silently. Modal is gated by an explicit
// user click on the chapter-view button.

import { useState, useMemo, useEffect } from 'react';
import { X, Mic, Users, Sparkles, Check } from 'lucide-react';
import { useAudioStore } from '../../store/audio';
import { useCanonStore } from '../../store/canon';
import { ELEVENLABS_VOICES, OPENAI_TTS_VOICES, GROK_VOICES, FISH_AUDIO_VOICES } from '../../lib/tts-types';
import { autoAssignVoice, autoAssignVoiceFromPool } from '../../lib/voice-assign';
import type { CharacterEntry } from '../../store/canon';
import type { ElevenLabsVoice } from '../../lib/tts-types';

interface Props {
  isOpen: boolean;
  projectId: string;
  onCancel: () => void;
  onConfirm: () => void;
}

interface VoiceOption {
  id: string;
  name: string;
  desc: string;
  gender?: string;
}

export function GenerateChapterAudioModal({ isOpen, projectId, onCancel, onConfirm }: Props) {
  const audioStore = useAudioStore();
  const { entries } = useCanonStore();

  const characters = useMemo(
    () => entries.filter((e) => e.projectId === projectId && e.type === 'character' && (e as any).character) as CharacterEntry[],
    [entries, projectId],
  );

  const provider = audioStore.ttsProvider;
  const narratorVoices = useMemo<VoiceOption[]>(() => {
    if (provider === 'openai') return OPENAI_TTS_VOICES.map((v) => ({ id: v.id, name: v.name, desc: v.desc }));
    if (provider === 'grok') return GROK_VOICES.map((v) => ({ id: v.id, name: v.name, desc: v.desc, gender: v.gender }));
    if (provider === 'fish') return FISH_AUDIO_VOICES.map((v) => ({ id: v.id, name: v.name, desc: v.desc, gender: v.gender }));
    return ELEVENLABS_VOICES.map((v) => ({ id: v.id, name: v.name, desc: v.desc, gender: v.gender }));
  }, [provider]);

  // Auto-assign character voices on first open if none are set yet. Never
  // overwrites user choices — only fills gaps.
  useEffect(() => {
    if (!isOpen) return;
    if (!audioStore.multiVoice) return;
    for (const char of characters) {
      if (audioStore.characterVoices[char.name]) continue;
      const voiceId = autoAssignVoice(char as any, audioStore.narratorVoice);
      audioStore.setCharacterVoice(char.name, voiceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, audioStore.multiVoice, characters.length]);

  if (!isOpen) return null;

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
          <div>
            <h2 className="text-lg font-serif font-semibold text-text-primary inline-flex items-center gap-2">
              <Sparkles size={16} className="text-amber-600" />
              Confirm voices before generating
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              Pick the narrator and (optionally) per-character voices. Saved for the rest of this project.
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-black/5 text-text-tertiary">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {/* Narrator voice */}
          <section>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              <Mic size={12} />
              Narrator
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {narratorVoices.slice(0, 9).map((v) => {
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

          {/* Multi-voice toggle */}
          <section className="flex items-center justify-between p-3 rounded-xl bg-black/[0.02] border border-black/5">
            <div className="flex items-start gap-2.5">
              <Users size={14} className="text-text-tertiary mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-text-primary">Multi-voice characters</div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  Each character speaks in their own voice. Narration stays in the narrator voice.
                </div>
              </div>
            </div>
            <Toggle checked={audioStore.multiVoice} onChange={audioStore.setMultiVoice} />
          </section>

          {/* Character voices */}
          {audioStore.multiVoice && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Character voices ({characters.length})
                </div>
                {characters.length > 0 && (
                  <button
                    onClick={() => {
                      for (const char of characters) {
                        const voiceId = autoAssignVoice(char as any, audioStore.narratorVoice);
                        audioStore.setCharacterVoice(char.name, voiceId);
                      }
                    }}
                    className="text-[11px] text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-black/5"
                  >
                    Auto-assign all
                  </button>
                )}
              </div>

              {characters.length === 0 ? (
                <div className="text-xs text-text-tertiary p-4 rounded-lg bg-black/[0.02] border border-dashed border-black/10">
                  No characters in canon yet — add them to the canon panel and they'll show up here next time.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {characters.map((char) => {
                    const currentVoice = audioStore.characterVoices[char.name];
                    return (
                      <CharacterVoiceRow
                        key={char.id}
                        characterName={char.name}
                        characterGender={(char as any).character?.gender || ''}
                        currentVoice={currentVoice}
                        voices={narratorVoices}
                        onChange={(v) => audioStore.setCharacterVoice(char.name, v as ElevenLabsVoice)}
                      />
                    );
                  })}
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-emerald-600' : 'bg-black/15'
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

function CharacterVoiceRow({
  characterName,
  characterGender,
  currentVoice,
  voices,
  onChange,
}: {
  characterName: string;
  characterGender: string;
  currentVoice: string | undefined;
  voices: VoiceOption[];
  onChange: (voiceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = voices.find((v) => v.id === currentVoice);
  return (
    <div className="rounded-lg border border-black/5 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-black/[0.02]"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-text-primary truncate">{characterName}</div>
          {characterGender && (
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider">{characterGender}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-text-secondary">{current?.name || '— pick a voice —'}</div>
          {current?.desc && <div className="text-[10px] text-text-tertiary truncate max-w-[180px]">{current.desc}</div>}
        </div>
      </button>
      {open && (
        <div className="px-2 pb-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 border-t border-black/5 pt-2">
          {voices.map((v) => {
            const selected = currentVoice === v.id;
            return (
              <button
                key={v.id}
                onClick={() => { onChange(v.id); setOpen(false); }}
                className={`text-left p-2 rounded-lg border text-[11px] ${
                  selected ? 'border-text-primary bg-black/[0.04]' : 'border-black/5 bg-white hover:bg-black/[0.02]'
                }`}
              >
                <div className="font-semibold text-text-primary inline-flex items-center gap-1">
                  {selected && <Check size={11} />}
                  {v.name}
                </div>
                <div className="text-text-tertiary mt-0.5 truncate">{v.desc}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
