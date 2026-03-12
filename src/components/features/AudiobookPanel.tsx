import { useState, useRef, useEffect, useCallback } from 'react';
import { Headphones, Play, Pause, Download, Loader2, Volume2, User, Wand2, RotateCcw, ChevronDown, ChevronUp, Clock, Trash2, Layers } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useAudioStore } from '../../store/audio';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import { ELEVENLABS_VOICES, getVoiceName } from '../../lib/tts-types';
import type { ElevenLabsVoice } from '../../lib/tts-types';
import type { CharacterEntry } from '../../types/canon';
import { autoAssignVoice, voiceAssignmentReason } from '../../lib/voice-assign';

interface VoiceAssignment {
  characterId: string;
  characterName: string;
  voiceId: ElevenLabsVoice;
  reason?: string;
}

export function AudiobookPanel() {
  const { getActiveProject, getProjectChapters } = useStore();
  const { entries, updateEntry } = useCanonStore();
  const audioStore = useAudioStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose).sort((a, b) => a.number - b.number) : [];
  const characters = entries.filter(e => e.projectId === project?.id && e.type === 'character' && (e as any).character) as CharacterEntry[];

  const { narratorVoice, multiVoice, ttsModel, speed, chapterAudio, generating, error } = audioStore;

  const [voiceAssignments, setVoiceAssignments] = useState<VoiceAssignment[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showVoiceConfig, setShowVoiceConfig] = useState(true);
  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<string | null>(null);
  const [generatingScene, setGeneratingScene] = useState<string | null>(null); // sceneId being generated
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // Fetch preview URLs from ElevenLabs (free, cached server-side)
  useEffect(() => {
    api.ttsVoices().then(data => {
      const urls: Record<string, string> = {};
      for (const v of data.voices) {
        if (v.previewUrl) urls[v.id] = v.previewUrl;
      }
      setPreviewUrls(urls);
    }).catch(() => {});
  }, []);

  // Narrator voices — curated subset ideal for narration
  const narratorVoices = ELEVENLABS_VOICES.filter(v =>
    ['Matilda', 'George', 'Rachel', 'Adam', 'Daniel', 'Lily'].includes(v.name)
  );
  const allVoices = ELEVENLABS_VOICES;

  // ========== Auto-assign voices on mount ==========
  useEffect(() => {
    if (characters.length === 0) return;
    const assignments: VoiceAssignment[] = characters.map(char => {
      const existingVoice = char.character?.voiceId as ElevenLabsVoice | undefined;
      const voice = existingVoice || autoAssignVoice(char, narratorVoice);
      const reason = voiceAssignmentReason(char, voice);
      return { characterId: char.id, characterName: char.name, voiceId: voice, reason };
    });
    setVoiceAssignments(assignments);
    for (const a of assignments) {
      audioStore.setCharacterVoice(a.characterName, a.voiceId);
    }
  }, [characters.length, narratorVoice]);

  // ========== Voice assignment ==========
  const assignVoice = useCallback((charId: string, charName: string, voiceId: ElevenLabsVoice) => {
    setVoiceAssignments(prev => {
      const filtered = prev.filter(a => a.characterId !== charId);
      return [...filtered, { characterId: charId, characterName: charName, voiceId }];
    });
    audioStore.setCharacterVoice(charName, voiceId);

    const char = characters.find(c => c.id === charId);
    if (char) {
      const reason = voiceAssignmentReason(char, voiceId);
      updateEntry(charId, {
        character: { ...char.character, voiceId, voiceReason: reason },
      } as any);
    }
  }, [characters, updateEntry, audioStore]);

  const autoAssignAll = useCallback(() => {
    const assignments: VoiceAssignment[] = characters.map(char => {
      const voice = autoAssignVoice(char, narratorVoice);
      const reason = voiceAssignmentReason(char, voice);
      return { characterId: char.id, characterName: char.name, voiceId: voice, reason };
    });
    setVoiceAssignments(assignments);
    for (const assignment of assignments) {
      audioStore.setCharacterVoice(assignment.characterName, assignment.voiceId);
      const char = characters.find(c => c.id === assignment.characterId);
      if (char) {
        updateEntry(assignment.characterId, {
          character: { ...char.character, voiceId: assignment.voiceId, voiceReason: assignment.reason },
        } as any);
      }
    }
  }, [characters, updateEntry, audioStore]);

  // ========== Voice preview ==========
  const previewVoice = async (voiceId: ElevenLabsVoice) => {
    if (previewing === voiceId) {
      previewAudioRef.current?.pause();
      setPreviewing(null);
      return;
    }
    setPreviewing(voiceId);
    try {
      // Use free ElevenLabs preview URL if available (no credit cost)
      const previewUrl = previewUrls[voiceId];
      let url: string;

      if (previewUrl) {
        url = previewUrl;
      } else {
        // Fallback: generate via our API (costs credits)
        const res = await api.ttsPreview(voiceId);
        if (!res.ok) throw new Error('Preview failed');
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
      }

      if (previewAudioRef.current) previewAudioRef.current.pause();
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.addEventListener('ended', () => setPreviewing(null));
      audio.play();
    } catch {
      setPreviewing(null);
    }
  };

  // ========== Voice context builder (shared) ==========
  const buildVoiceParams = useCallback(() => {
    const charVoiceMap: Record<string, string> = {};
    const charDescriptions: Record<string, string> = {};
    for (const a of voiceAssignments) {
      charVoiceMap[a.characterName] = a.voiceId;
      const char = characters.find(c => c.id === a.characterId);
      if (char) {
        const c = char.character || {} as any;
        const personality = c.personality || {} as any;
        const parts: string[] = [];
        if (c.gender) parts.push(c.gender);
        if (c.age) parts.push(`${c.age} years old`);
        if (c.role) parts.push(`${c.role} character`);
        if (personality.speechPattern) parts.push(`Speech style: ${personality.speechPattern}`);
        if (personality.traits?.length) parts.push(`Personality: ${personality.traits.slice(0, 4).join(', ')}`);
        if (char.description) parts.push(char.description.slice(0, 120));
        if (parts.length > 0) charDescriptions[a.characterName] = parts.join('. ') + '.';
      }
    }
    return { charVoiceMap, charDescriptions };
  }, [voiceAssignments, characters]);

  // ========== Generation ==========

  /** Generate a single scene's audio */
  const generateScene = async (chapterId: string, sceneId: string) => {
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const scene = (chapter.scenes || []).find(s => s.id === sceneId);
    if (!scene?.prose?.trim()) return;

    setGeneratingScene(sceneId);
    audioStore.setError(null);

    try {
      const { charVoiceMap, charDescriptions } = buildVoiceParams();
      const versionSuffix = `-v${Date.now()}`;

      const result = await api.ttsGenerate({
        chapterId: `${chapterId}-scene-${sceneId}${versionSuffix}`,
        prose: scene.prose,
        narratorVoice,
        characterVoices: charVoiceMap,
        characterDescriptions: charDescriptions,
        model: ttsModel,
        speed,
        multiVoice,
      });

      // Store as scene-level audio (keyed by sceneId)
      audioStore.addChapterAudio(`scene-${sceneId}`, {
        chapterId: `scene-${sceneId}`,
        audioUrl: result.audioUrl,
        durationEstimate: result.durationEstimate,
        generatedAt: new Date().toISOString(),
      });

      // Auto-play the generated scene
      window.dispatchEvent(new CustomEvent('theodore:playChapter', {
        detail: { chapterId: `scene-${sceneId}` },
      }));
    } catch (e: any) {
      audioStore.setError(e.message || 'Scene generation failed');
    } finally {
      setGeneratingScene(null);
    }
  };

  /** Generate full chapter audio */
  const generateChapter = async (chapterId: string) => {
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    if (!chapter?.prose) return;

    audioStore.setGenerating(chapterId);
    audioStore.setError(null);

    try {
      const { charVoiceMap, charDescriptions } = buildVoiceParams();
      const versionSuffix = `-v${Date.now()}`;

      const result = await api.ttsGenerate({
        chapterId: `${chapterId}${versionSuffix}`,
        prose: chapter.prose,
        narratorVoice,
        characterVoices: charVoiceMap,
        characterDescriptions: charDescriptions,
        model: ttsModel,
        speed,
        multiVoice,
      });

      audioStore.addChapterAudio(chapterId, {
        chapterId,
        audioUrl: result.audioUrl,
        durationEstimate: result.durationEstimate,
        generatedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      audioStore.setError(e.message || 'Generation failed');
    } finally {
      audioStore.setGenerating(null);
    }
  };

  const generateAll = async () => {
    for (const ch of chapters) {
      if (!chapterAudio[ch.id]) {
        await generateChapter(ch.id);
        if (useAudioStore.getState().error) break;
      }
    }
  };

  // ========== Download ==========
  const downloadChapter = async (chapterId: string) => {
    const audio = chapterAudio[chapterId];
    if (!audio) return;
    const chapter = chapters.find(c => c.id === chapterId);
    const name = `${(project?.title || 'audiobook').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-ch${chapter?.number || 0}.mp3`;
    const response = await fetch(audio.audioUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const audioCount = Object.keys(chapterAudio).length;

  if (!project) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-black/5">
        <div className="flex items-center gap-2 mb-1">
          <Headphones size={18} />
          <h2 className="text-lg font-serif font-semibold">Audiobook Studio</h2>
        </div>
        <p className="text-xs text-text-tertiary">Generate narrated audio with ElevenLabs voices — multi-voice character support</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">
            {error}
            <button onClick={() => audioStore.setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Voice Configuration */}
        <div className="border-b border-black/5">
          <button
            onClick={() => setShowVoiceConfig(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-black/[0.02] transition-colors"
          >
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Voice Configuration</span>
            {showVoiceConfig ? <ChevronUp size={14} className="text-text-tertiary" /> : <ChevronDown size={14} className="text-text-tertiary" />}
          </button>

          {showVoiceConfig && (
            <div className="px-5 pb-4 space-y-4">
              {/* Narrator Voice */}
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Narrator</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {narratorVoices.map(voice => (
                    <button
                      key={voice.id}
                      onClick={() => { audioStore.setNarratorVoice(voice.id); previewVoice(voice.id); }}
                      className={cn(
                        'text-left p-2.5 rounded-xl transition-all text-xs relative group',
                        narratorVoice === voice.id ? 'bg-text-primary text-text-inverse' : 'glass-pill hover:bg-white/60'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{voice.name}</span>
                        {previewing === voice.id && <Volume2 size={9} className="animate-pulse" />}
                      </div>
                      <div className={cn('text-[10px]', narratorVoice === voice.id ? 'text-white/60' : 'text-text-tertiary')}>{voice.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Character Voices */}
              {characters.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Character Voices</label>
                    <button
                      onClick={autoAssignAll}
                      className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      <Wand2 size={10} />
                      Auto-assign
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {characters.map(char => {
                      const assignment = voiceAssignments.find(a => a.characterId === char.id);
                      const isExpanded = expandedCharacter === char.id;
                      const assignedVoiceName = assignment ? getVoiceName(assignment.voiceId) : null;

                      return (
                        <div key={char.id} className="glass-pill rounded-xl overflow-hidden">
                          <button
                            onClick={() => setExpandedCharacter(isExpanded ? null : char.id)}
                            className="w-full flex items-center gap-2 p-3 text-left hover:bg-white/40 transition-colors"
                          >
                            <User size={12} className="text-text-tertiary flex-shrink-0" />
                            <span className="text-xs font-medium flex-1 truncate">{char.name}</span>
                            {assignedVoiceName && (
                              <span className="text-[10px] text-text-tertiary flex-shrink-0">{assignedVoiceName}</span>
                            )}
                            {isExpanded ? <ChevronUp size={12} className="text-text-tertiary" /> : <ChevronDown size={12} className="text-text-tertiary" />}
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1">
                              {assignment?.reason && (
                                <p className="text-[10px] text-text-tertiary italic mb-2">{assignment.reason}</p>
                              )}
                              <div className="grid grid-cols-2 gap-1">
                                {allVoices.map(voice => (
                                  <button
                                    key={voice.id}
                                    onClick={() => { assignVoice(char.id, char.name, voice.id); previewVoice(voice.id); }}
                                    className={cn(
                                      'text-left p-2 rounded-lg text-[10px] transition-all relative group',
                                      assignment?.voiceId === voice.id ? 'bg-text-primary text-text-inverse' : 'bg-black/5 hover:bg-black/10'
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <div className="font-medium">{voice.name}</div>
                                      {previewing === voice.id && <Volume2 size={8} className="animate-pulse" />}
                                    </div>
                                    <div className={cn(assignment?.voiceId === voice.id ? 'text-white/50' : 'text-text-tertiary')}>
                                      {voice.desc}
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); previewVoice(voice.id); }}
                                      className={cn(
                                        'absolute top-1.5 right-1.5 p-0.5 rounded transition-all',
                                        previewing === voice.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                                        assignment?.voiceId === voice.id ? 'text-white/60 hover:text-white' : 'text-text-tertiary hover:text-text-primary'
                                      )}
                                    >
                                      <Volume2 size={8} />
                                    </button>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Settings row */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiVoice}
                    onChange={e => audioStore.setMultiVoice(e.target.checked)}
                    className="rounded border-black/20"
                  />
                  <span className="text-[10px] text-text-secondary">Multi-voice</span>
                </label>
                <select
                  value={ttsModel}
                  onChange={e => audioStore.setTtsModel(e.target.value as any)}
                  className="text-[10px] bg-black/5 rounded-lg px-2 py-1 border-0"
                >
                  <option value="eleven_multilingual_v2">HD Quality</option>
                  <option value="eleven_turbo_v2_5">Standard</option>
                  <option value="eleven_flash_v2_5">Fast</option>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-text-tertiary">{speed}x</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={e => audioStore.setSpeed(parseFloat(e.target.value))}
                    className="w-16 h-1 accent-black"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chapter List */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Chapters</label>
            <button
              onClick={generateAll}
              disabled={generating !== null || chapters.length === 0}
              className="text-xs font-medium px-3 py-1 rounded-lg bg-text-primary text-text-inverse hover:shadow-md transition-all disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate All'}
            </button>
          </div>
          <div className="space-y-1.5">
            {chapters.map(ch => {
              const audio = chapterAudio[ch.id];
              const isGenerating = generating === ch.id;
              const isPlaying = audioStore.playing && audioStore.currentChapterId === ch.id;
              const wordCount = ch.prose.split(/\s+/).length;
              const estMinutes = Math.ceil(wordCount / 150);
              const versions = audio?.versions || [];
              const hasMultipleVersions = versions.length > 1;
              const isVersionsExpanded = expandedVersions === ch.id;
              const isScenesExpanded = expandedScenes === ch.id;
              const scenes = (ch.scenes || []).filter((s: any) => s?.id && s.prose?.trim()).sort((a: any, b: any) => a.order - b.order);
              const hasScenes = scenes.length > 1;

              return (
                <div key={ch.id} className="rounded-xl overflow-hidden">
                  {/* Chapter header row */}
                  <div
                    className={cn(
                      'flex items-center gap-3 p-3 transition-all',
                      audioStore.currentChapterId === ch.id ? 'bg-black/[0.06]' : 'glass-pill'
                    )}
                  >
                    <button
                      onClick={() => {
                        if (audio) {
                          window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId: ch.id } }));
                        } else if (hasScenes) {
                          setExpandedScenes(isScenesExpanded ? null : ch.id);
                        } else {
                          generateChapter(ch.id);
                        }
                      }}
                      disabled={isGenerating}
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                        audio ? 'bg-text-primary text-text-inverse hover:shadow-md' : 'bg-black/5 hover:bg-black/10'
                      )}
                    >
                      {isGenerating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : audio ? (
                        isPlaying ? <Pause size={14} /> : <Play size={14} />
                      ) : (
                        <Headphones size={14} className="text-text-tertiary" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">Ch. {ch.number}: {ch.title}</div>
                      <div className="text-[10px] text-text-tertiary">
                        {isGenerating ? 'Generating...' :
                         audio ? `Audio ready · ~${formatTime(audio.durationEstimate)}` :
                         `${wordCount.toLocaleString()} words · ~${estMinutes} min`}
                        {hasScenes && !audio && ` · ${scenes.length} scenes`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Scene expand toggle */}
                      {hasScenes && (
                        <button
                          onClick={() => setExpandedScenes(isScenesExpanded ? null : ch.id)}
                          className={cn(
                            'p-1.5 rounded-lg transition-colors',
                            isScenesExpanded ? 'text-text-primary bg-black/5' : 'text-text-tertiary hover:text-text-primary'
                          )}
                          title={`${scenes.length} scenes`}
                        >
                          <Layers size={12} />
                        </button>
                      )}
                      {audio && (
                        <>
                          {hasMultipleVersions && (
                            <button
                              onClick={() => setExpandedVersions(isVersionsExpanded ? null : ch.id)}
                              className="px-1.5 py-0.5 rounded-md bg-black/5 text-[10px] font-medium text-text-tertiary hover:text-text-primary transition-colors"
                              title={`${versions.length} versions`}
                            >
                              v{audio.activeVersion}
                              <span className="text-text-tertiary/60 ml-0.5">/{versions.length}</span>
                            </button>
                          )}
                          <button
                            onClick={() => downloadChapter(ch.id)}
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                            title="Download MP3"
                          >
                            <Download size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Scene-level generation controls */}
                  {isScenesExpanded && hasScenes && (
                    <div className="bg-black/[0.02] border-t border-black/5 px-3 py-2 space-y-1.5">
                      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                        Generate by Scene
                      </div>
                      {scenes.map((scene: any) => {
                        const sceneAudio = chapterAudio[`scene-${scene.id}`];
                        const isSceneGenerating = generatingScene === scene.id;
                        const sceneWords = scene.prose.split(/\s+/).length;
                        const isScenePlaying = audioStore.playing && audioStore.currentChapterId === `scene-${scene.id}`;

                        return (
                          <div
                            key={scene.id}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/60 hover:bg-white/80 transition-all"
                          >
                            {/* Play/generate button */}
                            <button
                              onClick={() => {
                                if (sceneAudio) {
                                  window.dispatchEvent(new CustomEvent('theodore:playChapter', {
                                    detail: { chapterId: `scene-${scene.id}` },
                                  }));
                                } else {
                                  generateScene(ch.id, scene.id);
                                }
                              }}
                              disabled={isSceneGenerating}
                              className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                                sceneAudio ? 'bg-text-primary text-text-inverse' : 'bg-black/5 hover:bg-black/10'
                              )}
                            >
                              {isSceneGenerating ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : sceneAudio ? (
                                isScenePlaying ? <Pause size={10} /> : <Play size={10} />
                              ) : (
                                <Headphones size={10} className="text-text-tertiary" />
                              )}
                            </button>

                            {/* Scene info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-medium truncate">
                                Scene {scene.order}: {scene.title}
                              </div>
                              <div className="text-[9px] text-text-tertiary">
                                {isSceneGenerating ? 'Generating...' :
                                 sceneAudio ? `Ready · ~${formatTime(sceneAudio.durationEstimate)}` :
                                 `${sceneWords.toLocaleString()} words`}
                              </div>
                            </div>

                            {/* Regenerate if already generated */}
                            {sceneAudio && (
                              <button
                                onClick={() => generateScene(ch.id, scene.id)}
                                disabled={isSceneGenerating}
                                className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
                                title="Regenerate scene"
                              >
                                <RotateCcw size={10} />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Full chapter generation button */}
                      <div className="pt-1.5 border-t border-black/5 space-y-1">
                        <button
                          onClick={() => generateChapter(ch.id)}
                          disabled={isGenerating || !!generatingScene}
                          className={cn(
                            'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all',
                            audio
                              ? 'bg-black/5 text-text-secondary hover:bg-black/10'
                              : 'bg-text-primary text-text-inverse hover:shadow-md'
                          )}
                        >
                          {isGenerating ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <RotateCcw size={10} />
                          )}
                          {audio ? 'Regenerate Full Chapter' : 'Generate Full Chapter'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Version history */}
                  {isVersionsExpanded && versions.length > 0 && (
                    <div className="bg-black/[0.03] border-t border-black/5 px-3 py-2 space-y-1">
                      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">
                        Version History
                      </div>
                      {[...versions].reverse().map(v => {
                        const isActive = v.version === audio.activeVersion;
                        return (
                          <div
                            key={v.version}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] transition-all',
                              isActive ? 'bg-text-primary text-text-inverse' : 'bg-white/60 hover:bg-white/80'
                            )}
                          >
                            <button
                              onClick={() => {
                                audioStore.setActiveVersion(ch.id, v.version);
                                window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId: ch.id } }));
                              }}
                              className="p-1 rounded-full hover:bg-white/20 transition-colors"
                            >
                              {isActive && audioStore.playing && audioStore.currentChapterId === ch.id ? (
                                <Pause size={10} />
                              ) : (
                                <Play size={10} />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">v{v.version}</span>
                              {v.voiceConfig && (
                                <span className={cn('ml-1.5', isActive ? 'text-white/50' : 'text-text-tertiary')}>
                                  {v.voiceConfig.model === 'eleven_multilingual_v2' ? 'HD' : v.voiceConfig.model === 'eleven_turbo_v2_5' ? 'Std' : 'Fast'} · {v.voiceConfig.speed}x
                                </span>
                              )}
                            </div>
                            <div className={cn('flex items-center gap-1', isActive ? 'text-white/50' : 'text-text-tertiary')}>
                              <Clock size={9} />
                              <span>{formatDate(v.generatedAt)}</span>
                            </div>
                            <span className={cn(isActive ? 'text-white/50' : 'text-text-tertiary')}>
                              ~{formatTime(v.durationEstimate)}
                            </span>
                            {!isActive && (
                              <button
                                onClick={() => audioStore.removeAudioVersion(ch.id, v.version)}
                                className="p-0.5 rounded text-text-tertiary hover:text-red-500 transition-colors"
                                title="Delete version"
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {chapters.length === 0 && (
            <div className="py-8 text-center">
              <Headphones size={24} className="mx-auto mb-2 text-text-tertiary" />
              <p className="text-xs text-text-tertiary">Write some chapters first to generate audio</p>
            </div>
          )}

          {audioCount > 0 && (
            <div className="mt-4 pt-4 border-t border-black/5">
              <div className="text-[10px] text-text-tertiary text-center mb-2">
                {audioCount} of {chapters.length} chapters generated
              </div>
              <button
                onClick={async () => {
                  for (const ch of chapters) {
                    if (chapterAudio[ch.id]) await downloadChapter(ch.id);
                  }
                }}
                className="w-full py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all"
              >
                <Download size={16} />
                Download All ({audioCount} chapters)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
