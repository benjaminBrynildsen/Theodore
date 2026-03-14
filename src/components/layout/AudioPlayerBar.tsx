import { useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Loader2, X, Volume2, VolumeX, Headphones } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

export function AudioPlayerBar() {
  const { getActiveProject, getProjectChapters } = useStore();
  const {
    playing, currentChapterId, currentTime, duration, volume,
    chapterAudio, narratorVoice, speed,
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
  const pendingPlayRef = useRef<string | null>(null); // URL queued for play (iOS fallback)

  // ========== Audio element ==========
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    // iOS Safari requires audio.play() from a user gesture to "unlock" the element.
    // We play a silent data URI on first touch/click so subsequent programmatic plays work.
    const unlockAudio = () => {
      if (audio.dataset?.unlocked) return;
      // Tiny silent MP3 (< 1KB)
      audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1DEAAAH+ANoUAAABHwJcigAAAQCAABpAAAAMEBgaBoGAIAgGP/BwEP/EAQBAEAQBA7+sEAQBAEAR/WCAIAgCAI3rBAEAQBAEb//5cEP/BAEAQBAdYIAgCAIAjf/+XBD/wQBAEAQHf/lBD/+UEAx//9YIAgCAIAge//+sEAQDH///WCAIAgCB7///rBAEAwAAAAAAA';
      audio.play().then(() => {
        audio.pause();
        audio.src = '';
        audio.dataset.unlocked = '1';
        console.log('[AudioPlayer] iOS audio unlocked');
      }).catch(() => {});
      document.removeEventListener('touchstart', unlockAudio, true);
      document.removeEventListener('click', unlockAudio, true);
    };
    document.addEventListener('touchstart', unlockAudio, true);
    document.addEventListener('click', unlockAudio, true);

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
    audio.addEventListener('error', () => {
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      if (chId) {
        console.error('[AudioPlayer] Audio load failed for', chId, '— file may have been deleted after redeploy');
        setPlaying(false);
        setError('Audio file expired — please regenerate this chapter');
        // Remove stale cached audio so UI shows generate button instead of play
        useAudioStore.getState().removeChapterAudio?.(chId);
      }
    });
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - timeUpdateRef.current > 250) {
        timeUpdateRef.current = now;
        setCurrentTime(audio.currentTime);
      }
    });

    return () => {
      audio.pause();
      audio.src = '';
      document.removeEventListener('touchstart', unlockAudio, true);
      document.removeEventListener('click', unlockAudio, true);
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Handle play/pause toggle from MobilePlayer (preserves user gesture for iOS)
  useEffect(() => {
    const handler = () => {
      const audio = audioRef.current;
      if (!audio) return;

      // If there's a pending play URL (from iOS autoplay block), load it now
      if (pendingPlayRef.current) {
        const url = pendingPlayRef.current;
        pendingPlayRef.current = null;
        if (!audio.src || !audio.src.includes(url.replace(/^\//, ''))) {
          audio.src = url;
          audio.load();
        }
        audio.play().then(() => console.log('[AudioPlayer] Pending play succeeded'))
          .catch((err) => console.error('[AudioPlayer] Pending play failed:', err));
        setPlaying(true);
        return;
      }

      // If no src set yet, try to load from store
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      if ((!audio.src || audio.src === window.location.href) && chId) {
        const cached = state.chapterAudio[chId];
        if (cached) {
          audio.src = cached.sceneAudioUrls?.[0] || cached.audioUrl;
          audio.load();
        }
      }

      if (!audio.src || audio.src === window.location.href) return;

      if (audio.paused) {
        audio.play().then(() => console.log('[AudioPlayer] Toggle play succeeded'))
          .catch((err) => console.error('[AudioPlayer] Toggle play failed:', err));
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
    };
    window.addEventListener('theodore:togglePlayback', handler);
    return () => window.removeEventListener('theodore:togglePlayback', handler);
  }, []);

  // ========== Generate & play ==========

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
      const versionSuffix = `-v${Date.now()}`;

      if (scenes.length > 1) {
        const firstScene = scenes[0];
        const firstSceneSFX = (firstScene.sfx || []).map((s: any) => ({
          prompt: s.prompt, audioUrl: s.audioUrl, position: s.position, enabled: s.enabled,
        }));
        const result = await api.ttsGenerate({
          chapterId: `${chapterId}-scene-${firstScene.id}${versionSuffix}`,
          prose: firstScene.prose,
          narratorVoice,
          model: 'eleven_v3',
          speed,
          sceneSFX: firstSceneSFX,
        });

        const audio = audioRef.current;
        if (audio) {
          audio.src = result.audioUrl;
          audio.load();
          audio.play().then(() => {
            pendingPlayRef.current = null;
          }).catch(() => {
            pendingPlayRef.current = result.audioUrl;
            console.warn('[AudioPlayer] Post-generate play blocked, queued for user gesture');
          });
          setPlaying(true);
        }

        sceneIndexRef.current = 0;
        const allUrls = [result.audioUrl];
        const allSceneIds = [firstScene.id];
        let totalDuration = result.durationEstimate;

        for (let i = 1; i < scenes.length; i++) {
          const scene = scenes[i];
          try {
            const sceneSFXData = (scene.sfx || []).map((s: any) => ({
              prompt: s.prompt, audioUrl: s.audioUrl, position: s.position, enabled: s.enabled,
            }));
            const sceneResult = await api.ttsGenerate({
              chapterId: `${chapterId}-scene-${scene.id}${versionSuffix}`,
              prose: scene.prose,
              narratorVoice,
              model: 'eleven_v3',
              speed,
              sceneSFX: sceneSFXData,
            });
            allUrls.push(sceneResult.audioUrl);
            allSceneIds.push(scene.id);
            totalDuration += sceneResult.durationEstimate;
          } catch (e: any) {
            console.error(`Scene ${i + 1} generation failed:`, e);
          }
        }

        addChapterAudio(chapterId, {
          chapterId,
          audioUrl: allUrls[0],
          sceneAudioUrls: allUrls,
          sceneIds: allSceneIds,
          durationEstimate: totalDuration,
          generatedAt: new Date().toISOString(),
        });
      } else {
        const allSceneSFX = (chapter.scenes || []).flatMap((s: any) =>
          (s.sfx || []).map((sfx: any) => ({
            prompt: sfx.prompt, audioUrl: sfx.audioUrl, position: sfx.position, enabled: sfx.enabled,
          }))
        );
        const result = await api.ttsGenerate({
          chapterId: `${chapterId}${versionSuffix}`,
          prose: chapter.prose,
          narratorVoice,
          model: 'eleven_v3',
          speed,
          sceneSFX: allSceneSFX,
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
          audio.play().then(() => {
            pendingPlayRef.current = null;
          }).catch(() => {
            pendingPlayRef.current = result.audioUrl;
            console.warn('[AudioPlayer] Post-generate play blocked, queued for user gesture');
          });
          setPlaying(true);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Audio generation failed');
    } finally {
      setGenerating(null);
    }
  }, [chapters, project?.id, narratorVoice, speed]);

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

  // Removed: play/pause sync via useEffect — now handled by theodore:togglePlayback event
  // to preserve iOS user gesture context

  // Listen for play requests — reads fresh state from store to avoid stale closures
  useEffect(() => {
    const handler = (e: Event) => {
      const { chapterId } = (e as CustomEvent).detail;
      if (!chapterId) return;

      const audio = audioRef.current;
      if (!audio) return;

      const state = useAudioStore.getState();
      const cached = state.chapterAudio[chapterId];

      if (!cached) {
        generateAndPlay(chapterId);
        return;
      }

      if (state.currentChapterId === chapterId) {
        if (state.playing) {
          audio.pause();
          setPlaying(false);
        } else {
          audio.play().catch(() => {});
          setPlaying(true);
        }
        return;
      }

      sceneIndexRef.current = 0;
      const url = cached.sceneAudioUrls?.[0] || cached.audioUrl;
      audio.src = url;
      audio.load();
      audio.play().then(() => {
        pendingPlayRef.current = null;
        console.log('[AudioPlayer] Playing:', url);
      }).catch((err) => {
        console.warn('[AudioPlayer] play() blocked, queuing for user gesture:', err.message);
        pendingPlayRef.current = url;
      });
      setCurrentChapter(chapterId);
      setPlaying(true);
    };
    window.addEventListener('theodore:playChapter', handler);
    return () => window.removeEventListener('theodore:playChapter', handler);
  }, [generateAndPlay]);

  const skipPrev = useCallback(() => {
    if (!currentChapterId) return;
    const idx = chapters.findIndex(c => c.id === currentChapterId);
    if (idx > 0) {
      window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId: chapters[idx - 1].id } }));
    }
  }, [currentChapterId, chapters]);

  const skipNext = useCallback(() => {
    if (!currentChapterId) return;
    const idx = chapters.findIndex(c => c.id === currentChapterId);
    if (idx < chapters.length - 1) {
      window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId: chapters[idx + 1].id } }));
    }
  }, [currentChapterId, chapters]);

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
  // Component must always stay mounted so audio element + event listeners persist
  const shouldShow = !sidebarPlayerVisible && miniPlayerVisible && project && chapters.length > 0 && (currentChapterId || generating);

  if (!shouldShow) return <></>;

  const chapterIdx = currentChapterId ? chapters.findIndex(c => c.id === currentChapterId) : -1;
  const chapterImage = currentChapter?.imageUrl;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isMuted = volume === 0;

  return (
    <div className="fixed bottom-14 sm:bottom-0 inset-x-0 z-[55] sm:z-50 safe-area-bottom">
      <div className="bg-[#181818] text-white shadow-2xl">
        {/* Progress bar — touch-friendly on mobile */}
        <div
          className="h-2 sm:h-1 bg-white/10 cursor-pointer relative group"
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
                if (currentChapterId) window.dispatchEvent(new CustomEvent('theodore:togglePlayback'));
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
