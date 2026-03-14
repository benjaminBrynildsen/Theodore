import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Headphones, Play, Pause, Download, Loader2, Volume2, VolumeX, User, Wand2, RotateCcw, ChevronDown, ChevronUp, Clock, Trash2, Layers, Music, Sparkles, Zap, Tags, Mic } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useAudioStore } from '../../store/audio';
import { useMusicStore } from '../../store/music';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import { ELEVENLABS_VOICES, getVoiceName, resolveVoiceId } from '../../lib/tts-types';
import type { ElevenLabsVoice } from '../../lib/tts-types';
import type { CharacterEntry } from '../../types/canon';
import { autoAssignVoice, autoAssignVoiceFromPool, voiceAssignmentReason } from '../../lib/voice-assign';
import { analyzeChapterScenes, isMetadataStale } from '../../lib/emotion-analyzer';
import { tagDialogue } from '../../lib/dialogue-tagger';
import { tagSFX } from '../../lib/sfx-tagger';
import { tagDirections } from '../../lib/direction-tagger';
import { planChapterSFX, applySFXPlan } from '../../lib/scene-sfx-planner';
import { buildSunoPrompt, estimateSceneDuration } from '../../lib/suno-prompt-builder';
import { SceneSFXBadges } from './SceneSFXBadges';
import type { SceneEmotionalMetadata } from '../../types/music';
import { EMOTION_COLORS } from '../../types/music';

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
  const [showMusicConfig, setShowMusicConfig] = useState(true);
  const [analyzingChapter, setAnalyzingChapter] = useState<string | null>(null);
  const [taggingAll, setTaggingAll] = useState(false);
  const [taggingAllSFX, setTaggingAllSFX] = useState(false);
  const [taggingDirections, setTaggingDirections] = useState(false);
  const [generatingMusic, setGeneratingMusic] = useState<string | null>(null); // sceneId
  const [musicAvailable, setMusicAvailable] = useState<boolean | null>(null);
  const [sfxAvailable, setSfxAvailable] = useState<boolean | null>(null);

  const musicStore = useMusicStore();

  // Fetch voices from server (includes user's ElevenLabs library if available)
  const [serverVoices, setServerVoices] = useState<typeof ELEVENLABS_VOICES>([]);
  const preloadedAudioRef = useRef<Record<string, HTMLAudioElement>>({});
  useEffect(() => {
    api.ttsVoices().then(data => {
      const urls: Record<string, string> = {};
      // Use server voices as the exclusive source (user's ElevenLabs collection)
      if (data.voices.length > 0) {
        const ageMap: Record<string, 'child' | 'teen' | 'young' | 'middle' | 'old'> = {
          child: 'child', teen: 'teen', young: 'young', middle: 'middle', old: 'old',
          middle_aged: 'middle', elderly: 'old',
        };
        const voiceList = data.voices.map((v: any) => ({
          id: v.id,
          name: v.name,
          desc: v.desc || '',
          gender: (v.gender || 'neutral') as 'male' | 'female' | 'neutral',
          age: ageMap[v.age] || 'middle' as const,
          tone: v.tone || 'neutral',
          accent: v.accent || undefined,
          useCase: v.useCase || undefined,
          descriptive: v.descriptive || undefined,
          description: v.description || undefined,
        }));
        setServerVoices(voiceList);
      }
      for (const v of data.voices) {
        if (v.previewUrl) {
          urls[v.id] = v.previewUrl;
          // Preload audio element for instant playback
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = v.previewUrl;
          preloadedAudioRef.current[v.id] = audio;
        }
      }
      setPreviewUrls(urls);
    }).catch(() => {});
  }, []);

  // Check SFX availability on mount
  useEffect(() => {
    api.sfxStatus().then(d => setSfxAvailable(d.available)).catch(() => setSfxAvailable(false));
  }, []);

  // ========== Emotion Analysis ==========
  const analyzeChapter = useCallback(async (chapterId: string) => {
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    if (!chapter?.scenes?.length) return;

    setAnalyzingChapter(chapterId);
    try {
      const results = await analyzeChapterScenes(
        chapter.scenes.filter(s => s.prose?.trim()),
        {
          chapterEmotionalBeat: chapter.premise?.emotionalBeat,
          narrativeControls: project?.narrativeControls,
          projectId: project!.id,
          chapterId,
        },
        (idx, total) => {
          // Progress tracking could be added here
        },
      );

      // Persist emotional metadata to scenes + auto-create ambient SFX
      const { updateScene } = useStore.getState();
      for (const [sceneId, metadata] of results) {
        updateScene(chapterId, sceneId, { emotionalMetadata: metadata });

        // Auto-create background SFX from ambient suggestions
        if (metadata.suggestedAmbience?.length) {
          const scene = chapter.scenes!.find(s => s.id === sceneId);
          const existingSfx = scene?.sfx || [];
          const existingPrompts = new Set(existingSfx.map(s => s.prompt.toLowerCase()));

          const newSfx = metadata.suggestedAmbience
            .filter(amb => !existingPrompts.has(amb.toLowerCase()))
            .map(amb => ({
              id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              prompt: amb,
              position: 'background' as const,
              enabled: true,
              source: 'suggested' as const,
            }));

          if (newSfx.length > 0) {
            updateScene(chapterId, sceneId, {
              sfx: [...existingSfx, ...newSfx],
            });
          }
        }
      }
    } catch (e: any) {
      console.error('Emotion analysis failed:', e);
      audioStore.setError(`Emotion analysis failed: ${e.message}`);
    } finally {
      setAnalyzingChapter(null);
    }
  }, [project]);

  // ========== Batch Dialogue Tagging ==========
  const tagAllDialogue = useCallback(async () => {
    if (!project) return;
    setTaggingAll(true);
    try {
      const freshChapters = useStore.getState().chapters
        .filter(c => c.projectId === project.id && c.prose)
        .sort((a, b) => a.number - b.number);
      const characterEntries = entries.filter(e => e.projectId === project.id && e.type === 'character');
      const characterNames = characterEntries.map(e => e.name);
      if (characterNames.length === 0) return;

      const { updateScene, syncScenesToProse } = useStore.getState();
      for (const chapter of freshChapters) {
        const scenes = (chapter.scenes || []).filter(s => s.prose?.trim());
        for (const scene of scenes) {
          // Skip scenes that already have [Name] tags
          if (/\[[^\]]+\]\s*[\u201C"]/.test(scene.prose)) continue;
          try {
            const tagged = await tagDialogue(scene.prose, characterNames, project.id, chapter.id);
            updateScene(chapter.id, scene.id, { prose: tagged });
          } catch (e) {
            console.error(`Failed to tag scene ${scene.id}:`, e);
          }
        }
        syncScenesToProse(chapter.id);
      }
    } catch (e: any) {
      audioStore.setError(`Batch tagging failed: ${e.message}`);
    } finally {
      setTaggingAll(false);
    }
  }, [project, entries]);

  // ========== Batch SFX Tagging ==========
  const tagAllSFX = useCallback(async () => {
    if (!project) return;
    setTaggingAllSFX(true);
    try {
      const freshChapters = useStore.getState().chapters
        .filter(c => c.projectId === project.id && c.prose)
        .sort((a, b) => a.number - b.number);

      const { updateScene, syncScenesToProse } = useStore.getState();
      for (const chapter of freshChapters) {
        const scenes = (chapter.scenes || []).filter(s => s.prose?.trim());
        for (const scene of scenes) {
          // Skip scenes that already have {sfx:} tags
          if (/\{sfx:[^}]+\}/.test(scene.prose)) continue;
          try {
            const tagged = await tagSFX(scene.prose, project.id, chapter.id);
            updateScene(chapter.id, scene.id, { prose: tagged });
          } catch (e) {
            console.error(`Failed to tag SFX for scene ${scene.id}:`, e);
          }
        }
        syncScenesToProse(chapter.id);
      }
    } catch (e: any) {
      audioStore.setError(`Batch SFX tagging failed: ${e.message}`);
    } finally {
      setTaggingAllSFX(false);
    }
  }, [project]);


  const tagAllDirections = useCallback(async () => {
    if (!project) return;
    setTaggingDirections(true);
    try {
      const freshChapters = useStore.getState().chapters
        .filter(c => c.projectId === project.id && c.prose)
        .sort((a, b) => a.number - b.number);

      console.log(`[Directions] Found ${freshChapters.length} chapters to process`);
      const { updateScene, updateChapter, syncScenesToProse } = useStore.getState();
      for (const chapter of freshChapters) {
        const scenes = (chapter.scenes || []).filter(s => s.prose?.trim());
        console.log(`[Directions] Chapter "${chapter.title}": ${scenes.length} scenes`);

        // If no scenes, tag the chapter prose directly
        if (scenes.length === 0 && chapter.prose?.trim()) {
          console.log(`[Directions] No scenes — tagging chapter prose directly (${chapter.prose.length} chars)`);
          try {
            const tagged = await tagDirections(chapter.prose, project.id, chapter.id);
            if (tagged !== chapter.prose) {
              updateChapter(chapter.id, { prose: tagged });
              console.log(`[Directions] Updated chapter "${chapter.title}" prose`);
            }
          } catch (e: any) {
            console.error(`Failed to tag directions for chapter ${chapter.id}:`, e);
            audioStore.setError(`Direction tagging failed: ${e.message}`);
          }
          continue;
        }
        for (const scene of scenes) {
          // Skip scenes that already have direction tags
          if (/\[(whispering|sighs|thoughtful|excited|angry|sarcastic|pause|laughs|gasps)\]/i.test(scene.prose)) {
            console.log(`[Directions] Skipping scene ${scene.id} — already has tags`);
            continue;
          }
          try {
            console.log(`[Directions] Tagging scene "${scene.title}" (${scene.prose.length} chars)...`);
            const tagged = await tagDirections(scene.prose, project.id, chapter.id);
            console.log(`[Directions] Result: ${tagged.length} chars, original: ${scene.prose.length} chars`);
            if (tagged !== scene.prose) {
              updateScene(chapter.id, scene.id, { prose: tagged });
              console.log(`[Directions] Updated scene "${scene.title}"`);
            } else {
              console.log(`[Directions] No changes for scene "${scene.title}"`);
            }
          } catch (e: any) {
            console.error(`Failed to tag directions for scene ${scene.id}:`, e);
            audioStore.setError(`Direction tagging failed: ${e.message}`);
          }
        }
        syncScenesToProse(chapter.id);
      }
    } catch (e: any) {
      audioStore.setError(`Batch direction tagging failed: ${e.message}`);
    } finally {
      setTaggingDirections(false);
    }
  }, [project]);

  // ========== Auto SFX Planning ==========
  const [planningSFX, setPlanningSFX] = useState(false);

  /** Auto-plan background/intro/outro SFX for all scenes in a chapter.
   *  force=true always re-plans; force=false skips if all scenes have BG SFX */
  const planSFXForChapter = useCallback(async (chapterId: string, force = false) => {
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    const scenes = (chapter?.scenes || []).filter(s => s.prose?.trim());
    if (scenes.length === 0) return;

    if (!force) {
      const allHaveBg = scenes.every(s => (s.sfx || []).some(sfx => sfx.position === 'background' && sfx.enabled));
      const firstHasIntro = (scenes.sort((a, b) => a.order - b.order)[0]?.sfx || []).some(sfx => sfx.position === 'start');
      const lastHasOutro = (scenes.sort((a, b) => a.order - b.order)[scenes.length - 1]?.sfx || []).some(sfx => sfx.position === 'end');
      if (allHaveBg && firstHasIntro && lastHasOutro) {
        console.log('[SFXPlanner] All scenes have BG + intro + outro — skipping');
        return;
      }
    }

    // When forcing, clear existing suggested SFX so the planner starts fresh
    if (force) {
      const { updateScene } = useStore.getState();
      for (const scene of scenes) {
        const existing = scene.sfx || [];
        const manual = existing.filter(s => s.source === 'manual');
        if (manual.length !== existing.length) {
          updateScene(chapterId, scene.id, { sfx: manual });
        }
      }
    }

    console.log(`[SFXPlanner] Planning SFX for ${scenes.length} scenes in chapter "${chapter!.title}" (force=${force})`);
    setPlanningSFX(true);
    try {
      // Re-read scenes after potential cleanup
      const updatedChapters = useStore.getState().chapters;
      const updatedChapter = updatedChapters.find(c => c.id === chapterId);
      const updatedScenes = (updatedChapter?.scenes || []).filter(s => s.prose?.trim());

      const plan = await planChapterSFX(updatedScenes, project!.id, chapterId);
      console.log('[SFXPlanner] Plan:', plan);

      const updates = applySFXPlan(updatedScenes, plan);
      console.log('[SFXPlanner] Updates to apply:', updates.length);

      const { updateScene } = useStore.getState();
      for (const u of updates) {
        updateScene(chapterId, u.sceneId, { sfx: u.sfx });
      }
    } catch (e: any) {
      console.error('[SFXPlanner] Failed:', e);
    } finally {
      setPlanningSFX(false);
    }
  }, [project]);

  // ========== Prepare All (tags + SFX planning in one click) ==========
  const [preparingAll, setPreparingAll] = useState(false);

  const prepareAll = useCallback(async () => {
    if (!project) return;
    setPreparingAll(true);
    try {
      // 1. Tag dialogue
      await tagAllDialogue();
      // 2. Tag directions
      await tagAllDirections();
      // 3. Tag inline SFX
      await tagAllSFX();
      // 4. Plan background/intro/outro SFX for every chapter
      const freshChapters = useStore.getState().chapters
        .filter(c => c.projectId === project.id && c.prose)
        .sort((a, b) => a.number - b.number);
      for (const ch of freshChapters) {
        await planSFXForChapter(ch.id, true);
      }
    } catch (e: any) {
      console.error('[PrepareAll] Failed:', e);
      audioStore.setError(`Preparation failed: ${e.message}`);
    } finally {
      setPreparingAll(false);
    }
  }, [project, tagAllDialogue, tagAllDirections, tagAllSFX, planSFXForChapter]);

  // ========== Music Generation ==========
  const generateSceneMusic = useCallback(async (chapterId: string, sceneId: string) => {
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    const scene = chapter?.scenes?.find(s => s.id === sceneId);
    if (!scene?.prose?.trim()) return;

    setGeneratingMusic(sceneId);
    musicStore.setGenerating(sceneId);

    try {
      // Build music prompt from emotional metadata or fallback
      let prompt: string;
      let genre: string | undefined;
      let duration: number;

      if (scene.emotionalMetadata) {
        prompt = buildSunoPrompt(scene.emotionalMetadata);
        genre = scene.emotionalMetadata.suggestedGenre;
      } else {
        // Quick fallback prompt based on scene title/summary
        prompt = `Cinematic underscore, ${scene.title || 'dramatic scene'}, instrumental only, no vocals, moderate tempo, film score`;
      }
      duration = estimateSceneDuration(scene.prose.split(/\s+/).length);

      const result = await api.musicGenerate({
        sceneId,
        prompt,
        genre,
        durationHint: duration,
      });

      musicStore.addTrack(sceneId, {
        id: `track-${Date.now()}`,
        sceneId,
        audioUrl: result.audioUrl,
        title: result.title || scene.title || 'Background Music',
        prompt,
        genre: genre || 'cinematic',
        durationSeconds: result.durationSeconds,
        generatedAt: new Date().toISOString(),
        status: 'ready',
      });
    } catch (e: any) {
      console.error('Music generation failed:', e);
      audioStore.setError(`Music generation failed: ${e.message}`);
    } finally {
      setGeneratingMusic(null);
      musicStore.setGenerating(null);
    }
  }, [musicStore, audioStore]);

  // ========== Chapter-level music generation (flat prose, no scenes) ==========
  const generateChapterMusic = useCallback(async (chapterId: string) => {
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    if (!chapter?.prose?.trim()) return;

    const musicKey = `ch-${chapterId}`;
    setGeneratingMusic(chapterId);
    musicStore.setGenerating(chapterId);

    try {
      const wordCount = chapter.prose.split(/\s+/).length;
      const duration = estimateSceneDuration(wordCount);
      const prompt = `Cinematic underscore for "${chapter.title || 'chapter'}", instrumental only, no vocals, film score, moderate tempo, emotional depth`;

      const result = await api.musicGenerate({
        sceneId: musicKey,
        prompt,
        genre: 'cinematic',
        durationHint: Math.min(duration, 90), // max 90s to conserve credits
      });

      musicStore.addTrack(musicKey, {
        id: `track-${Date.now()}`,
        sceneId: musicKey,
        audioUrl: result.audioUrl,
        title: result.title || chapter.title || 'Background Music',
        prompt,
        genre: 'cinematic',
        durationSeconds: result.durationSeconds,
        generatedAt: new Date().toISOString(),
        status: 'ready',
      });
    } catch (e: any) {
      console.error('Chapter music generation failed:', e);
      audioStore.setError(`Music generation failed: ${e.message}`);
    } finally {
      setGeneratingMusic(null);
      musicStore.setGenerating(null);
    }
  }, [musicStore, audioStore]);

  // ========== Music Preview ==========
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewMusic = useCallback((audioUrl: string) => {
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current = null;
      musicStore.setMusicPlaying(false);
      return;
    }
    const audio = new Audio(audioUrl);
    audio.volume = musicStore.musicVolume;
    musicAudioRef.current = audio;
    musicStore.setMusicPlaying(true);
    audio.addEventListener('ended', () => {
      musicStore.setMusicPlaying(false);
      musicAudioRef.current = null;
    });
    audio.play();
  }, [musicStore]);

  // Keep music volume in sync
  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = musicStore.musicVolume;
    }
  }, [musicStore.musicVolume]);

  // Use ONLY the user's ElevenLabs collection; hardcoded list is just a fallback
  const allVoices = serverVoices.length > 0 ? serverVoices : ELEVENLABS_VOICES;
  const narratorVoices = allVoices;

  // ========== Auto-assign voices on mount (re-runs when server voices load) ==========
  useEffect(() => {
    if (characters.length === 0) return;
    const assignments: VoiceAssignment[] = characters.map(char => {
      const rawVoice = char.character?.voiceId as string | undefined;
      // Resolve legacy OpenAI voice IDs to ElevenLabs
      const existingVoice = rawVoice ? resolveVoiceId(rawVoice) : undefined;
      // Verify the resolved voice actually exists in our library
      const validVoice = existingVoice && allVoices.some(v => v.id === existingVoice) ? existingVoice : undefined;
      const voice = validVoice || (serverVoices.length > 0
        ? autoAssignVoiceFromPool(char, serverVoices, narratorVoice)
        : autoAssignVoice(char, narratorVoice));
      const reason = voiceAssignmentReason(char, voice);
      return { characterId: char.id, characterName: char.name, voiceId: voice, reason };
    });
    setVoiceAssignments(assignments);
    for (const a of assignments) {
      audioStore.setCharacterVoice(a.characterName, a.voiceId);
    }
  }, [characters.length, narratorVoice, serverVoices.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (characters.length === 0) return;
    const assignments: VoiceAssignment[] = characters.map(char => {
      // Always re-assign from scratch — ignore any existing voiceId
      const voice = serverVoices.length > 0
        ? autoAssignVoiceFromPool(char, serverVoices, narratorVoice)
        : autoAssignVoice(char, narratorVoice);
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
  }, [characters, narratorVoice, updateEntry, audioStore]);

  // ========== Voice preview ==========
  const previewVoice = async (voiceId: ElevenLabsVoice) => {
    if (previewing === voiceId) {
      previewAudioRef.current?.pause();
      setPreviewing(null);
      return;
    }
    setPreviewing(voiceId);
    try {
      // Stop any currently playing preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }

      // Use preloaded audio element for instant playback (no credit cost)
      const preloaded = preloadedAudioRef.current[voiceId];
      if (preloaded) {
        preloaded.currentTime = 0;
        previewAudioRef.current = preloaded;
        preloaded.onended = () => setPreviewing(null);
        preloaded.play();
        return;
      }

      // Fallback: use preview URL directly
      const previewUrl = previewUrls[voiceId];
      if (previewUrl) {
        const audio = new Audio(previewUrl);
        previewAudioRef.current = audio;
        audio.addEventListener('ended', () => setPreviewing(null));
        audio.play();
        return;
      }

      // Last resort: generate via our API (costs credits)
      const res = await api.ttsPreview(voiceId);
      if (!res.ok) throw new Error('Preview failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
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

  /** Show confirmation before generating */
  const confirmGenerateScene = (chapterId: string, sceneId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    const scene = (chapter?.scenes || []).find(s => s.id === sceneId);
    if (!scene?.prose?.trim()) return;
    const words = scene.prose.trim().split(/\s+/).length;
    const label = `Scene ${scene.order}: ${scene.title || 'Untitled'}`;
    if (window.confirm(`Generate audio for "${label}"?\n\n${words.toLocaleString()} words · ~${Math.ceil(words / 150)} min · ${ttsModel === 'eleven_v3' ? 'Eleven V3' : ttsModel}`)) {
      generateScene(chapterId, sceneId);
    }
  };

  const confirmGenerateChapter = (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter?.prose) return;
    const words = chapter.prose.trim().split(/\s+/).length;
    const label = `Ch ${chapter.number}: ${chapter.title}`;
    if (window.confirm(`Generate audio for "${label}"?\n\n${words.toLocaleString()} words · ~${Math.ceil(words / 150)} min · ${ttsModel === 'eleven_v3' ? 'Eleven V3' : ttsModel}`)) {
      generateChapter(chapterId);
    }
  };

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
      // Auto-plan SFX if this scene is missing background sounds
      await planSFXForChapter(chapterId);

      // Re-read scene data after SFX planning may have updated it
      const updatedChapters = useStore.getState().chapters;
      const updatedChapter = updatedChapters.find(c => c.id === chapterId);
      const updatedScene = (updatedChapter?.scenes || []).find(s => s.id === sceneId);

      const { charVoiceMap, charDescriptions } = buildVoiceParams();
      const versionSuffix = `-v${Date.now()}`;

      // Collect scene SFX for audio mixing
      const sceneSFXData = ((updatedScene || scene).sfx || []).map(s => ({
        prompt: s.prompt,
        audioUrl: s.audioUrl,
        position: s.position,
        enabled: s.enabled,
      }));

      const result = await api.ttsGenerate({
        chapterId: `${chapterId}-scene-${sceneId}${versionSuffix}`,
        prose: scene.prose,
        narratorVoice,
        characterVoices: charVoiceMap,
        characterDescriptions: charDescriptions,
        model: ttsModel,
        speed,
        multiVoice,
        sceneSFX: sceneSFXData,
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
      // Auto-plan SFX for all scenes before generating
      await planSFXForChapter(chapterId);

      const { charVoiceMap, charDescriptions } = buildVoiceParams();
      const versionSuffix = `-v${Date.now()}`;

      // Re-read chapter after SFX planning may have updated scenes
      const updatedChapters = useStore.getState().chapters;
      const updatedChapter = updatedChapters.find(c => c.id === chapterId) || chapter;

      // Collect all scene SFX across the chapter for audio mixing
      const allSceneSFX = (updatedChapter.scenes || []).flatMap(s =>
        (s.sfx || []).map(sfx => ({
          prompt: sfx.prompt,
          audioUrl: sfx.audioUrl,
          position: sfx.position,
          enabled: sfx.enabled,
        }))
      );

      const result = await api.ttsGenerate({
        chapterId: `${chapterId}${versionSuffix}`,
        prose: chapter.prose,
        narratorVoice,
        characterVoices: charVoiceMap,
        characterDescriptions: charDescriptions,
        model: ttsModel,
        speed,
        multiVoice,
        sceneSFX: allSceneSFX,
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
        <p className="text-xs text-text-tertiary">Generate narrated audio with ElevenLabs V3 voices</p>
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
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Narration</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
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

              {/* Speed control */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary">Speed: {speed}x</span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speed}
                  onChange={e => audioStore.setSpeed(parseFloat(e.target.value))}
                  className="w-24 h-1 accent-black"
                />
              </div>
            </div>
          )}
        </div>

        {/* Chapter List */}
        <div className="p-5">
          <div className="space-y-2 mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Chapters</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={prepareAll}
                  disabled={preparingAll || taggingAll || taggingAllSFX || taggingDirections || planningSFX || chapters.length === 0}
                  className="text-[11px] font-medium px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-fuchsia-500 text-white hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5 flex-1 justify-center"
                  title="Tag dialogue, directions, inline SFX, and plan background/intro/outro sounds for all chapters"
                >
                  {preparingAll || taggingAll || taggingAllSFX || taggingDirections || planningSFX ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Wand2 size={12} />
                  )}
                  {preparingAll ? 'Preparing...' : taggingAll ? 'Tagging dialogue...' : taggingAllSFX ? 'Tagging SFX...' : taggingDirections ? 'Adding directions...' : planningSFX ? 'Planning sounds...' : 'Prepare All'}
                </button>
                <button
                  onClick={generateAll}
                  disabled={generating !== null || chapters.length === 0}
                  className="text-[11px] font-medium px-3 py-2 rounded-lg bg-text-primary text-text-inverse hover:shadow-md transition-all disabled:opacity-50 flex-1 text-center"
                >
                  {generating ? 'Generating...' : 'Generate All'}
                </button>
              </div>
            </div>
            {/* Individual actions — collapsed by default */}
            <details className="group">
              <summary className="text-[9px] text-text-tertiary cursor-pointer hover:text-text-secondary select-none">
                Individual actions...
              </summary>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-black/5">
                <button
                  onClick={tagAllDialogue}
                  disabled={taggingAll || preparingAll || chapters.length === 0}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {taggingAll ? <Loader2 size={9} className="animate-spin" /> : <Tags size={9} />}
                  {taggingAll ? 'Tagging...' : 'Dialogue'}
                </button>
                <button
                  onClick={tagAllDirections}
                  disabled={taggingDirections || preparingAll || chapters.length === 0}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100 transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {taggingDirections ? <Loader2 size={9} className="animate-spin" /> : <Mic size={9} />}
                  {taggingDirections ? 'Tagging...' : 'Directions'}
                </button>
                <button
                  onClick={tagAllSFX}
                  disabled={taggingAllSFX || preparingAll || chapters.length === 0}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {taggingAllSFX ? <Loader2 size={9} className="animate-spin" /> : <Volume2 size={9} />}
                  {taggingAllSFX ? 'Tagging...' : 'Inline SFX'}
                </button>
                <button
                  onClick={async () => {
                    for (const ch of chapters) {
                      await planSFXForChapter(ch.id, true);
                    }
                  }}
                  disabled={planningSFX || preparingAll || chapters.length === 0}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {planningSFX ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                  {planningSFX ? 'Planning...' : 'Plan Sounds'}
                </button>
              </div>
            </details>
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
              const hasScenes = scenes.length > 0;

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
                          window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId: ch.id } }));
                        } else {
                          confirmGenerateChapter(ch.id);
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
                      <div className="text-[10px] text-text-tertiary flex items-center gap-1">
                        <span>
                          {isGenerating ? 'Generating...' :
                           audio ? `Audio ready · ~${formatTime(audio.durationEstimate)}` :
                           `${wordCount.toLocaleString()} words · ~${estMinutes} min`}
                          {hasScenes && !audio && ` · ${scenes.length} scenes`}
                        </span>
                        {scenes.some((s: any) => musicStore.sceneTracks[s.id]?.tracks?.length > 0) && (
                          <Music size={9} className="text-purple-400" title="Has background music" />
                        )}
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
                  {hasScenes && (
                    <div className="bg-black/[0.02] border-t border-black/5 px-3 py-2 space-y-1.5">
                      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                        Generate by Scene
                      </div>
                      {scenes.map((scene: any) => {
                        const sceneAudio = chapterAudio[`scene-${scene.id}`];
                        const isSceneGenerating = generatingScene === scene.id;
                        const sceneWords = scene.prose.split(/\s+/).length;
                        const isScenePlaying = audioStore.playing && audioStore.currentChapterId === `scene-${scene.id}`;
                        const sceneTrack = musicStore.sceneTracks[scene.id];
                        const activeSceneTrack = sceneTrack?.tracks?.find(t => t.id === sceneTrack.activeTrackId);
                        const sceneSfx = scene.sfx || [];

                        return (
                          <div key={scene.id} className="space-y-1">
                          <div
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
                                  confirmGenerateScene(ch.id, scene.id);
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
                              <div className="text-[11px] font-medium truncate flex items-center gap-1">
                                Scene {scene.order}: {scene.title}
                                {activeSceneTrack && <Music size={8} className="text-purple-400" />}
                              </div>
                              <div className="text-[9px] text-text-tertiary">
                                {isSceneGenerating ? 'Generating...' :
                                 sceneAudio ? `Ready · ~${formatTime(sceneAudio.durationEstimate)}` :
                                 `${sceneWords.toLocaleString()} words`}
                              </div>
                            </div>

                            {/* Music preview */}
                            {activeSceneTrack && (
                              <button
                                onClick={() => previewMusic(activeSceneTrack.audioUrl)}
                                className="p-1.5 rounded-lg text-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                title="Preview background music"
                              >
                                {musicStore.musicPlaying && musicAudioRef.current ? <Pause size={14} /> : <Music size={14} />}
                              </button>
                            )}

                            {/* Regenerate if already generated */}
                            {sceneAudio && (
                              <button
                                onClick={() => confirmGenerateScene(ch.id, scene.id)}
                                disabled={isSceneGenerating}
                                className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors"
                                title="Regenerate scene"
                              >
                                <RotateCcw size={10} />
                              </button>
                            )}
                          </div>
                          {/* SFX badges for this scene — always show when available */}
                          {sfxAvailable && (
                            <div className="px-2.5 pb-1">
                              <SceneSFXBadges chapterId={ch.id} sceneId={scene.id} sfx={sceneSfx} />
                            </div>
                          )}
                          </div>
                        );
                      })}

                      {/* Full chapter generation button */}
                      <div className="pt-1.5 border-t border-black/5 space-y-1">
                        <button
                          onClick={() => confirmGenerateChapter(ch.id)}
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
                                window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId: ch.id } }));
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
                                  {v.voiceConfig.model === 'eleven_v3' ? 'V3' : v.voiceConfig.model === 'eleven_multilingual_v2' ? 'HD' : v.voiceConfig.model === 'eleven_turbo_v2_5' ? 'Std' : 'Fast'} · {v.voiceConfig.speed}x
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

        {/* Sound Effects */}
        <div className="border-b border-black/5">
          <button
            onClick={() => setShowMusicConfig(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-black/[0.02] transition-colors"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              <Zap size={11} />
              Sound Effects
            </span>
            {showMusicConfig ? <ChevronUp size={14} className="text-text-tertiary" /> : <ChevronDown size={14} className="text-text-tertiary" />}
          </button>

          {showMusicConfig && (
            <div className="px-5 pb-4 space-y-4">
              {/* SFX status */}
              <div className="flex items-center gap-3 text-[10px]">
                <span className={cn('flex items-center gap-1', sfxAvailable ? 'text-green-600' : 'text-text-tertiary')}>
                  <Zap size={9} />
                  SFX {sfxAvailable ? 'Ready' : sfxAvailable === false ? 'Unavailable' : '...'}
                </span>
                <span className="text-text-tertiary/60">1 credit/sfx</span>
              </div>

              {/* Per-chapter SFX */}
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Scene Sound Effects</label>
                <div className="space-y-1.5">
                  {chapters.map(ch => {
                    const scenes = (ch.scenes || []).filter((s: any) => s?.id && s.prose?.trim()).sort((a: any, b: any) => a.order - b.order);
                    const hasScenes = scenes.length > 0;
                    const isAnalyzing = analyzingChapter === ch.id;

                    const analyzedCount = hasScenes ? scenes.filter((s: any) => s.emotionalMetadata && !isMetadataStale(s)).length : 0;
                    const allAnalyzed = hasScenes && analyzedCount === scenes.length;
                    const totalSfx = scenes.reduce((n: number, s: any) => n + (s.sfx?.length || 0), 0);

                    return (
                      <div key={ch.id} className="glass-pill rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 p-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">Ch. {ch.number}: {ch.title}</div>
                            <div className="text-[9px] text-text-tertiary">
                              {hasScenes
                                ? `${scenes.length} scenes · ${totalSfx} sound effects`
                                : 'No scenes'
                              }
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Analyze emotions → generates ambient SFX suggestions */}
                            {hasScenes && (
                              <button
                                onClick={() => analyzeChapter(ch.id)}
                                disabled={isAnalyzing}
                                className={cn(
                                  'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all',
                                  allAnalyzed
                                    ? 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                                    : 'bg-black/5 text-text-secondary hover:bg-black/10'
                                )}
                                title="Analyze scenes to auto-suggest ambient sound effects"
                              >
                                {isAnalyzing ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                                {isAnalyzing ? 'Analyzing...' : allAnalyzed ? 'Re-analyze' : 'Auto-suggest SFX'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Scene SFX details */}
                        {hasScenes && (
                          <div className="px-3 pb-2 space-y-1.5">
                            {scenes.map((scene: any) => {
                              const em: SceneEmotionalMetadata | undefined = scene.emotionalMetadata;
                              const sfx = scene.sfx || [];

                              return (
                                <div key={scene.id} className="rounded-xl bg-white/50 overflow-hidden">
                                  <div className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      {em && (
                                        <span
                                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: EMOTION_COLORS[em.primaryEmotion] || '#888' }}
                                          title={`${em.primaryEmotion} (${em.intensity}%)`}
                                        />
                                      )}
                                      <span className="text-[11px] font-medium flex-1 truncate">
                                        {scene.title || `Scene ${scene.order}`}
                                      </span>
                                      {em && (
                                        <span className="text-[9px] text-text-tertiary capitalize">{em.primaryEmotion}</span>
                                      )}
                                    </div>

                                    {em && (
                                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                                        {em.moodTags.slice(0, 3).map(tag => (
                                          <span key={tag} className="text-[8px] px-1 py-0.5 rounded bg-purple-50 text-purple-500">{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {sfx.length > 0 && (
                                    <div className="border-t border-black/5 px-3 py-1.5 space-y-1">
                                      {sfx.map((s: any) => (
                                        <button
                                          key={s.id}
                                          onClick={() => {
                                            if (s.audioUrl) {
                                              // Use DOM audio element for iOS compatibility
                                              let audio = document.getElementById('theodore-sfx-preview') as HTMLAudioElement;
                                              if (!audio) {
                                                audio = document.createElement('audio');
                                                audio.id = 'theodore-sfx-preview';
                                                audio.setAttribute('playsinline', '');
                                                document.body.appendChild(audio);
                                              }
                                              audio.src = s.audioUrl;
                                              audio.volume = 1.0;
                                              audio.currentTime = 0;
                                              audio.play().catch(() => {});
                                            }
                                          }}
                                          className="w-full flex items-center gap-2 text-left group hover:bg-black/5 rounded-lg px-1.5 py-0.5 transition-colors"
                                        >
                                          <Zap size={8} className={cn(
                                            'flex-shrink-0',
                                            s.audioUrl ? 'text-amber-500' : 'text-text-tertiary'
                                          )} />
                                          <span className="text-[9px] text-text-secondary flex-1 truncate">{s.prompt}</span>
                                          <span className={cn(
                                            'text-[8px] px-1 py-0 rounded',
                                            s.position === 'start' ? 'bg-blue-50 text-blue-500'
                                              : s.position === 'end' ? 'bg-amber-50 text-amber-500'
                                              : 'bg-green-50 text-green-500'
                                          )}>
                                            {s.position}
                                          </span>
                                          {s.source === 'suggested' && (
                                            <span className="text-[8px] px-1 py-0 rounded bg-purple-50 text-purple-400">auto</span>
                                          )}
                                          {s.audioUrl && (
                                            <Volume2 size={8} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  {sfxAvailable && (
                                    <div className="px-3 pb-1.5">
                                      <SceneSFXBadges chapterId={ch.id} sceneId={scene.id} sfx={sfx} />
                                    </div>
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
                  <p className="text-[10px] text-text-tertiary text-center py-3">Write chapters to add sound effects</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
