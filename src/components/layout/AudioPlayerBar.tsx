import { useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Headphones, Loader2, X, Volume2 } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { useCanonStore } from '../../store/canon';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { CharacterEntry } from '../../types/canon';

export function AudioPlayerBar() {
  const { getActiveProject, getProjectChapters } = useStore();
  const { entries } = useCanonStore();
  const {
    playing, currentChapterId, currentTime, duration,
    chapterAudio, narratorVoice, characterVoices, multiVoice, ttsModel, speed,
    generating, error,
    setPlaying, setCurrentChapter, setCurrentTime, setDuration,
    addChapterAudio, setGenerating, setError,
  } = useAudioStore();

  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose).sort((a, b) => a.number - b.number) : [];
  const currentChapter = chapters.find(c => c.id === currentChapterId);
  const currentAudio = currentChapterId ? chapterAudio[currentChapterId] : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeUpdateRef = useRef(0);
  const sceneIndexRef = useRef(0); // track which scene audio is playing

  // ========== Audio element ==========
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener('ended', () => {
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      const cached = chId ? state.chapterAudio[chId] : null;

      // If playing scene-by-scene, advance to next scene
      if (cached?.sceneAudioUrls && sceneIndexRef.current < cached.sceneAudioUrls.length - 1) {
        sceneIndexRef.current++;
        audio.src = cached.sceneAudioUrls[sceneIndexRef.current];
        audio.load();
        audio.play();
        return;
      }

      // Otherwise auto-advance to next chapter
      setPlaying(false);
      sceneIndexRef.current = 0;
      const chs = useStore.getState().chapters
        .filter(c => c.projectId === useStore.getState().activeProjectId && c.prose)
        .sort((a, b) => a.number - b.number);
      const idx = chs.findIndex(c => c.id === chId);
      const next = chs[idx + 1];
      if (next && state.chapterAudio[next.id]) {
        setCurrentChapter(next.id);
        const nextAudio = state.chapterAudio[next.id];
        audio.src = nextAudio.sceneAudioUrls?.[0] || nextAudio.audioUrl;
        audio.load();
        audio.play();
        setPlaying(true);
      }
    });
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - timeUpdateRef.current > 250) {
        timeUpdateRef.current = now;
        setCurrentTime(audio.currentTime);
      }
    });

    return () => { audio.pause(); audio.src = ''; };
  }, []);

  // ========== Generate & play ==========
  const buildVoiceMap = useCallback(() => {
    const characters = entries.filter(e => e.projectId === project?.id && e.type === 'character' && (e as any).character) as CharacterEntry[];
    const voiceMap: Record<string, string> = { ...characterVoices };
    for (const char of characters) {
      if (!voiceMap[char.name] && char.character?.voiceId) {
        voiceMap[char.name] = char.character.voiceId;
      }
    }
    return voiceMap;
  }, [entries, project?.id, characterVoices]);

  const generateAndPlay = useCallback(async (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    if (!chapter?.prose) return;

    const scenes = (chapter.scenes || []).filter(s => s.prose?.trim()).sort((a, b) => a.order - b.order);

    setGenerating(chapterId);
    setError(null);
    setCurrentChapter(chapterId);

    try {
      const voiceMap = buildVoiceMap();

      if (scenes.length > 1) {
        // Scene-by-scene: generate first scene, play immediately, queue rest
        const firstScene = scenes[0];
        const result = await api.ttsGenerate({
          chapterId: `${chapterId}-scene-${firstScene.id}`,
          prose: firstScene.prose,
          narratorVoice,
          characterVoices: voiceMap,
          model: ttsModel,
          speed,
          multiVoice,
        });

        // Play first scene immediately
        const audio = audioRef.current;
        if (audio) {
          audio.src = result.audioUrl;
          audio.load();
          audio.play();
          setPlaying(true);
        }

        // Generate remaining scenes in background, concatenate URLs
        const allUrls = [result.audioUrl];
        let totalDuration = result.durationEstimate;

        for (let i = 1; i < scenes.length; i++) {
          const scene = scenes[i];
          try {
            const sceneResult = await api.ttsGenerate({
              chapterId: `${chapterId}-scene-${scene.id}`,
              prose: scene.prose,
              narratorVoice,
              characterVoices: voiceMap,
              model: ttsModel,
              speed,
              multiVoice,
            });
            allUrls.push(sceneResult.audioUrl);
            totalDuration += sceneResult.durationEstimate;
          } catch (e: any) {
            console.error(`Scene ${i + 1} generation failed:`, e);
          }
        }

        // Store all scene audio URLs for sequential playback
        addChapterAudio(chapterId, {
          chapterId,
          audioUrl: allUrls[0], // first scene for immediate play
          sceneAudioUrls: allUrls,
          durationEstimate: totalDuration,
          generatedAt: new Date().toISOString(),
        });
      } else {
        // Single scene or no scenes — generate whole chapter
        const result = await api.ttsGenerate({
          chapterId,
          prose: chapter.prose,
          narratorVoice,
          characterVoices: voiceMap,
          model: ttsModel,
          speed,
          multiVoice,
        });

        addChapterAudio(chapterId, {
          chapterId,
          audioUrl: result.audioUrl,
          durationEstimate: result.durationEstimate,
          generatedAt: new Date().toISOString(),
        });

        const audio = audioRef.current;
        if (audio) {
          audio.src = result.audioUrl;
          audio.load();
          audio.play();
          setPlaying(true);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Audio generation failed');
    } finally {
      setGenerating(null);
    }
  }, [chapters, entries, project?.id, narratorVoice, characterVoices, ttsModel, speed, multiVoice, buildVoiceMap]);

  // Listen for generate requests from chapter header button
  useEffect(() => {
    const handler = (e: Event) => {
      const { chapterId } = (e as CustomEvent).detail;
      if (chapterId) generateAndPlay(chapterId);
    };
    window.addEventListener('theodore:generateAudio', handler);
    return () => window.removeEventListener('theodore:generateAudio', handler);
  }, [generateAndPlay]);

  // Sync play/pause from external state changes (e.g. chapter header button)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentAudio) return;
    if (playing && audio.paused) {
      if (!audio.src || audio.src !== currentAudio.audioUrl) {
        audio.src = currentAudio.audioUrl;
        audio.load();
      }
      audio.play();
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
  }, [playing, currentAudio]);

  const playChapter = useCallback((chapterId: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    const cached = chapterAudio[chapterId];
    if (!cached) {
      generateAndPlay(chapterId);
      return;
    }

    if (currentChapterId === chapterId) {
      if (playing) { audio.pause(); setPlaying(false); }
      else { audio.play(); setPlaying(true); }
      return;
    }

    audio.src = cached.audioUrl;
    audio.load();
    audio.play();
    setCurrentChapter(chapterId);
    setPlaying(true);
  }, [chapterAudio, currentChapterId, playing, generateAndPlay]);

  const skipPrev = useCallback(() => {
    if (!currentChapterId) return;
    const idx = chapters.findIndex(c => c.id === currentChapterId);
    if (idx > 0) playChapter(chapters[idx - 1].id);
  }, [currentChapterId, chapters, playChapter]);

  const skipNext = useCallback(() => {
    if (!currentChapterId) return;
    const idx = chapters.findIndex(c => c.id === currentChapterId);
    if (idx < chapters.length - 1) playChapter(chapters[idx + 1].id);
  }, [currentChapterId, chapters, playChapter]);

  const seekTo = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (audio && duration > 0) {
      audio.currentTime = fraction * duration;
      setCurrentTime(audio.currentTime);
    }
  }, [duration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ========== Determine what to show ==========
  // Show bar if: we have audio playing/paused, or are generating, or there's a current chapter
  const isActive = currentChapterId || generating;

  // Show "Generate Audio" prompt when there's a project with chapters but no audio activity
  const showGeneratePrompt = project && chapters.length > 0 && !isActive;

  if (!project || chapters.length === 0) return null;

  // Generate prompt state
  if (showGeneratePrompt) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 sm:bottom-0">
        <div className="mx-auto max-w-xl px-4 pb-4 sm:pb-4">
          <button
            onClick={() => {
              const first = chapters[0];
              if (first) generateAndPlay(first.id);
            }}
            disabled={!!generating}
            className="w-full py-3.5 px-6 rounded-2xl bg-black text-white text-sm font-medium flex items-center justify-center gap-3 shadow-2xl hover:shadow-3xl hover:scale-[1.02] transition-all active:scale-[0.98]"
          >
            {generating ? (
              <><Loader2 size={18} className="animate-spin" /> Generating audio...</>
            ) : (
              <><Headphones size={18} /> Generate Audio</>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (!isActive) return null;

  const chapterIdx = currentChapterId ? chapters.findIndex(c => c.id === currentChapterId) : -1;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
      <div className="glass-strong border-t border-white/30 backdrop-blur-xl">
        {/* Error banner */}
        {error && (
          <div className="px-4 py-1.5 bg-red-50 text-red-700 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}

        {/* Progress bar */}
        <div
          className="h-1 bg-black/5 cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-black rounded-r-full transition-all duration-200"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
          {/* Chapter info */}
          <div className="flex-1 min-w-0">
            {generating ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-text-tertiary" />
                <span className="text-xs text-text-secondary truncate">Generating Ch. {chapters.find(c => c.id === generating)?.number}...</span>
              </div>
            ) : currentChapter ? (
              <>
                <div className="text-xs font-medium truncate">Ch. {currentChapter.number}: {currentChapter.title}</div>
                <div className="text-[10px] text-text-tertiary">
                  {formatTime(currentTime)} / {formatTime(duration || currentAudio?.durationEstimate || 0)}
                </div>
              </>
            ) : null}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={skipPrev}
              disabled={chapterIdx <= 0 || !!generating}
              className="p-2 rounded-full text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            >
              <SkipBack size={16} />
            </button>
            <button
              onClick={() => {
                if (currentChapterId) playChapter(currentChapterId);
              }}
              disabled={!currentChapterId || !!generating}
              className="p-3 rounded-full bg-black text-white hover:shadow-lg disabled:opacity-50 transition-all"
            >
              {generating ? (
                <Loader2 size={20} className="animate-spin" />
              ) : playing ? (
                <Pause size={20} />
              ) : (
                <Play size={20} />
              )}
            </button>
            <button
              onClick={skipNext}
              disabled={chapterIdx >= chapters.length - 1 || !!generating}
              className="p-2 rounded-full text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            >
              <SkipForward size={16} />
            </button>
          </div>

          {/* Volume / speed indicator */}
          <div className="flex-1 flex justify-end min-w-0">
            <div className="flex items-center gap-2">
              <Volume2 size={12} className="text-text-tertiary" />
              <span className="text-[10px] text-text-tertiary">{speed}x</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
