import { useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Loader2, X, Volume2, VolumeX, Headphones } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { useCanonStore } from '../../store/canon';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { autoAssignVoice } from '../../lib/voice-assign';
import type { CharacterEntry } from '../../types/canon';

export function AudioPlayerBar() {
  const { getActiveProject, getProjectChapters } = useStore();
  const { entries } = useCanonStore();
  const {
    playing, currentChapterId, currentTime, duration, volume,
    chapterAudio, narratorVoice, characterVoices, multiVoice, ttsModel, speed,
    generating, error, miniPlayerVisible, sidebarPlayerVisible,
    setPlaying, setCurrentChapter, setCurrentTime, setDuration, setVolume,
    addChapterAudio, setGenerating, setError, setMiniPlayerVisible,
  } = useAudioStore();

  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c?.id && c.prose).sort((a, b) => a.number - b.number) : [];
  const currentChapter = chapters.find(c => c.id === currentChapterId);
  const currentAudio = currentChapterId ? chapterAudio[currentChapterId] : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeUpdateRef = useRef(0);
  const sceneIndexRef = useRef(0);

  // ========== Audio element ==========
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    audio.addEventListener('ended', () => {
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      const cached = chId ? state.chapterAudio[chId] : null;

      if (cached?.sceneAudioUrls && sceneIndexRef.current < cached.sceneAudioUrls.length - 1) {
        sceneIndexRef.current++;
        audio.src = cached.sceneAudioUrls[sceneIndexRef.current];
        audio.load();
        audio.play();
        return;
      }

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

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ========== Generate & play ==========
  const buildVoiceContext = useCallback(() => {
    const characters = entries.filter(e => e.projectId === project?.id && e.type === 'character' && (e as any).character) as CharacterEntry[];
    const voiceMap: Record<string, string> = { ...characterVoices };
    const descriptions: Record<string, string> = {};

    for (const char of characters) {
      if (!voiceMap[char.name]) {
        voiceMap[char.name] = char.character?.voiceId || autoAssignVoice(char, narratorVoice);
      }

      // Build a speech/personality description for voice acting instructions
      const c = char.character || {} as any;
      const personality = c.personality || {} as any;
      const parts: string[] = [];

      if (c.gender) parts.push(c.gender);
      if (c.age) parts.push(`${c.age} years old`);
      if (c.role) parts.push(`${c.role} character`);
      if (personality.speechPattern) parts.push(`Speech style: ${personality.speechPattern}`);
      if (personality.traits?.length) parts.push(`Personality: ${personality.traits.slice(0, 4).join(', ')}`);
      if (personality.innerVoice) parts.push(`Inner voice: ${personality.innerVoice}`);
      if (char.description) parts.push(char.description.slice(0, 120));

      if (parts.length > 0) {
        descriptions[char.name] = parts.join('. ') + '.';
      }
    }

    return { voiceMap, descriptions };
  }, [entries, project?.id, characterVoices]);

  const generateAndPlay = useCallback(async (chapterId: string) => {
    // Read latest chapter state from store (not stale closure)
    const freshChapters = useStore.getState().chapters;
    const chapter = freshChapters.find(c => c.id === chapterId);
    if (!chapter?.prose) return;

    const scenes = (chapter.scenes || []).filter(s => s.prose?.trim()).sort((a, b) => a.order - b.order);

    setGenerating(chapterId);
    setError(null);
    setCurrentChapter(chapterId);

    try {
      const { voiceMap, descriptions } = buildVoiceContext();
      const versionSuffix = `-v${Date.now()}`;

      if (scenes.length > 1) {
        const firstScene = scenes[0];
        const result = await api.ttsGenerate({
          chapterId: `${chapterId}-scene-${firstScene.id}${versionSuffix}`,
          prose: firstScene.prose,
          narratorVoice,
          characterVoices: voiceMap,
          characterDescriptions: descriptions,
          model: ttsModel,
          speed,
          multiVoice,
        });

        const audio = audioRef.current;
        if (audio) {
          audio.src = result.audioUrl;
          audio.load();
          audio.play();
          setPlaying(true);
        }

        const allUrls = [result.audioUrl];
        let totalDuration = result.durationEstimate;

        for (let i = 1; i < scenes.length; i++) {
          const scene = scenes[i];
          try {
            const sceneResult = await api.ttsGenerate({
              chapterId: `${chapterId}-scene-${scene.id}${versionSuffix}`,
              prose: scene.prose,
              narratorVoice,
              characterVoices: voiceMap,
              characterDescriptions: descriptions,
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

        addChapterAudio(chapterId, {
          chapterId,
          audioUrl: allUrls[0],
          sceneAudioUrls: allUrls,
          durationEstimate: totalDuration,
          generatedAt: new Date().toISOString(),
        });
      } else {
        const result = await api.ttsGenerate({
          chapterId: `${chapterId}${versionSuffix}`,
          prose: chapter.prose,
          narratorVoice,
          characterVoices: voiceMap,
          characterDescriptions: descriptions,
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
  }, [chapters, entries, project?.id, narratorVoice, characterVoices, ttsModel, speed, multiVoice, buildVoiceContext]);

  // Listen for generate requests from chapter header button
  useEffect(() => {
    const handler = (e: Event) => {
      const { chapterId } = (e as CustomEvent).detail;
      if (chapterId) generateAndPlay(chapterId);
    };
    window.addEventListener('theodore:generateAudio', handler);
    return () => window.removeEventListener('theodore:generateAudio', handler);
  }, [generateAndPlay]);

  const seekTo = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (audio && duration > 0) {
      audio.currentTime = fraction * duration;
      setCurrentTime(audio.currentTime);
    }
  }, [duration]);

  // Listen for seek requests from NowPlayingPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const { fraction } = (e as CustomEvent).detail;
      if (typeof fraction === 'number') seekTo(fraction);
    };
    window.addEventListener('theodore:seekAudio', handler);
    return () => window.removeEventListener('theodore:seekAudio', handler);
  }, [seekTo]);

  // Sync play/pause from external state changes
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

  // Listen for play requests (play cached audio or generate if missing)
  useEffect(() => {
    const handler = (e: Event) => {
      const { chapterId } = (e as CustomEvent).detail;
      if (chapterId) playChapter(chapterId);
    };
    window.addEventListener('theodore:playChapter', handler);
    return () => window.removeEventListener('theodore:playChapter', handler);
  }, [playChapter]);

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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const dismiss = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setPlaying(false);
    setMiniPlayerVisible(false);
  }, []);

  // ========== Visibility ==========
  // Hide bottom bar when sidebar player is showing
  if (sidebarPlayerVisible) return null;
  if (!miniPlayerVisible || !project || chapters.length === 0) return null;
  if (!currentChapterId && !generating) return null;

  const chapterIdx = currentChapterId ? chapters.findIndex(c => c.id === currentChapterId) : -1;
  const chapterImage = currentChapter?.imageUrl;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isMuted = volume === 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
      <div className="bg-[#181818] text-white shadow-2xl">
        {/* Progress bar — thin line at top */}
        <div
          className="h-1 bg-white/10 cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-white rounded-r-full transition-[width] duration-200"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progressPct}% - 6px)` }}
          />
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-1.5 bg-red-500/20 text-red-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-2 sm:px-5">
          {/* Cover art */}
          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
            {chapterImage ? (
              <img src={chapterImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
                <Headphones size={20} className="text-white/40" />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 min-w-0 mr-2">
            {generating ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-white/60" />
                <span className="text-sm text-white/70 truncate">
                  Generating Ch. {chapters.find(c => c.id === generating)?.number}...
                </span>
              </div>
            ) : currentChapter ? (
              <>
                <div className="text-sm font-medium truncate text-white">
                  Ch. {currentChapter.number}: {currentChapter.title}
                </div>
                <div className="text-[11px] text-white/50 truncate">
                  {project.title}
                  <span className="mx-1.5">·</span>
                  {formatTime(currentTime)} / {formatTime(duration || currentAudio?.durationEstimate || 0)}
                </div>
              </>
            ) : null}
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={skipPrev}
              disabled={chapterIdx <= 0 || !!generating}
              className="p-2 rounded-full text-white/60 hover:text-white disabled:opacity-30 transition-colors"
            >
              <SkipBack size={16} />
            </button>
            <button
              onClick={() => {
                if (currentChapterId) playChapter(currentChapterId);
              }}
              disabled={!currentChapterId || !!generating}
              className="p-2.5 rounded-full bg-white text-[#181818] hover:scale-105 disabled:opacity-50 transition-all"
            >
              {generating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : playing ? (
                <Pause size={18} />
              ) : (
                <Play size={18} className="ml-0.5" />
              )}
            </button>
            <button
              onClick={skipNext}
              disabled={chapterIdx >= chapters.length - 1 || !!generating}
              className="p-2 rounded-full text-white/60 hover:text-white disabled:opacity-30 transition-colors"
            >
              <SkipForward size={16} />
            </button>
          </div>

          {/* Volume control */}
          <div className="hidden sm:flex items-center gap-2 ml-2">
            <button
              onClick={() => setVolume(isMuted ? 1 : 0)}
              className="p-1.5 rounded-full text-white/50 hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 accent-white appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Close */}
          <button
            onClick={dismiss}
            className="p-1.5 rounded-full text-white/30 hover:text-white/60 transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
