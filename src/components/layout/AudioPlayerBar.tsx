import { useEffect, useRef, useCallback, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Loader2, X, Volume2, VolumeX, Headphones } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { useAuthStore } from '../../store/auth';
import { useGenerationStore } from '../../store/generation';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { track as jTrack } from '../../lib/journey';

/** Draggable progress bar — works with mouse and touch */
function ProgressScrubber({ progressPct, onSeek }: { progressPct: number; onSeek: (fraction: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState(0);

  const fractionFromEvent = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const f = fractionFromEvent(e.clientX);
      setDragPct(f * 100);
      onSeek(f);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, fractionFromEvent, onSeek]);

  const displayPct = dragging ? dragPct : progressPct;

  return (
    <div
      ref={barRef}
      className="h-3 sm:h-2 bg-white/10 cursor-pointer relative group touch-none select-none"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const f = fractionFromEvent(e.clientX);
        setDragPct(f * 100);
        setDragging(true);
        onSeek(f);
      }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-white rounded-r-full"
        style={{ width: `${displayPct}%`, transition: dragging ? 'none' : 'width 200ms' }}
      />
      <div
        className={cn(
          'absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md transition-opacity',
          dragging ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
        )}
        style={{ left: `calc(${displayPct}% - 8px)` }}
      />
    </div>
  );
}

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
  // currentChapterId may be a scene ID (prefixed 'scene-') during scene-level playback
  const currentChapter = chapters.find(c => c.id === currentChapterId)
    || (currentChapterId?.startsWith('scene-')
      ? chapters.find(c => (c as any).scenes?.some((s: any) => `scene-${s.id}` === currentChapterId))
      : undefined);
  const currentAudio = currentChapterId ? chapterAudio[currentChapterId] : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeUpdateRef = useRef(0);
  const sceneIndexRef = useRef(0);
  // Cumulative time of all scenes that have already finished playing in the
  // current chapter. For multi-scene chapters, audio.currentTime resets to 0
  // on each scene transition; we add this offset so the displayed currentTime
  // (and the progress bar) reflects total chapter progress instead of just
  // the current scene's progress.
  const sceneStartOffsetRef = useRef(0);
  const pendingPlayRef = useRef<string | null>(null); // URL queued for play (iOS fallback)

  // ========== Audio element setup (attach to hidden DOM <audio>) ==========
  useEffect(() => {
    // Use a real DOM <audio> element — iOS Safari doesn't support new Audio()
    let audio = document.getElementById('theodore-audio') as HTMLAudioElement;
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'theodore-audio';
      // 'auto' (vs 'none') lets the browser buffer aggressively so a locked
      // screen / backgrounded tab doesn't run out of data mid-playback. This
      // is the web-side equivalent of the mobile app's `shouldPlayInBackground`
      // audio-session flag — on iOS Safari, an audio element whose buffer
      // runs dry in the background will stop and not auto-resume.
      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      document.body.appendChild(audio);
    } else if (audio.preload !== 'auto') {
      audio.preload = 'auto';
    }
    audio.volume = volume;
    audioRef.current = audio;

    const onEnded = () => {
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      const cached = chId ? state.chapterAudio[chId] : null;

      if (cached?.sceneAudioUrls && sceneIndexRef.current < cached.sceneAudioUrls.length - 1) {
        // Advance the cumulative offset by the just-finished scene's duration
        // so the progress bar continues smoothly into the next scene.
        if (audio.duration && isFinite(audio.duration)) {
          sceneStartOffsetRef.current += audio.duration;
        }
        sceneIndexRef.current++;
        audio.src = cached.sceneAudioUrls[sceneIndexRef.current];
        audio.load();
        audio.play();
        return;
      }

      sceneIndexRef.current = 0;
      sceneStartOffsetRef.current = 0;

      // Auto-play next scene/chapter
      // If current is a scene (scene-{id}), find the next scene in the same chapter
      if (chId?.startsWith('scene-')) {
        const sceneId = chId.replace('scene-', '');
        const store = useStore.getState();
        const chapters = store.chapters
          .filter(c => c.projectId === store.activeProjectId && c.prose)
          .sort((a, b) => a.number - b.number);
        // Find which chapter contains this scene
        for (const ch of chapters) {
          const scenes = (ch as any).scenes || [];
          const sceneIdx = scenes.findIndex((s: any) => s.id === sceneId);
          if (sceneIdx >= 0) {
            // Try next scene in same chapter
            const nextScene = scenes[sceneIdx + 1];
            if (nextScene && state.chapterAudio[`scene-${nextScene.id}`]) {
              setCurrentChapter(`scene-${nextScene.id}`);
              const nextAudio = state.chapterAudio[`scene-${nextScene.id}`];
              audio.src = nextAudio.audioUrl;
              audio.load();
              audio.play();
              setPlaying(true);
              return;
            }
            // Try first scene of next chapter
            const chIdx = chapters.indexOf(ch);
            const nextCh = chapters[chIdx + 1];
            if (nextCh) {
              const nextScenes = (nextCh as any).scenes || [];
              if (nextScenes.length > 0 && state.chapterAudio[`scene-${nextScenes[0].id}`]) {
                setCurrentChapter(`scene-${nextScenes[0].id}`);
                const nextAudio = state.chapterAudio[`scene-${nextScenes[0].id}`];
                audio.src = nextAudio.audioUrl;
                audio.load();
                audio.play();
                setPlaying(true);
                return;
              }
            }
            break;
          }
        }
      }

      // Fall back to next chapter (for full-chapter audio)
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
        return;
      }

      setPlaying(false);
    };
    const onLoadedMetadata = () => {
      // Prefer stored durationEstimate over browser metadata (concatenated MP3s report wrong duration)
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      const cached = chId ? state.chapterAudio[chId] : null;
      const estimate = cached?.durationEstimate;
      if (estimate && estimate > 0) {
        setDuration(estimate);
      } else if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onDurationChange = () => {
      // Only use browser duration if we don't have an estimate
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      const cached = chId ? state.chapterAudio[chId] : null;
      if (!cached?.durationEstimate && audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onError = () => {
      const state = useAudioStore.getState();
      const chId = state.currentChapterId;
      if (chId && audio.src && audio.src !== window.location.href) {
        console.error('[AudioPlayer] Audio load failed for', chId, 'src:', audio.src);
        setPlaying(false);
        // Retry once after a short delay (handles temporary 502s during deploys)
        const src = audio.src;
        setTimeout(() => {
          console.log('[AudioPlayer] Retrying audio load...');
          audio.src = '';
          audio.src = src;
          audio.load();
          // If retry also fails, show error but DON'T delete the audio record
          audio.onerror = () => {
            console.error('[AudioPlayer] Retry failed for', chId);
            setError('Audio temporarily unavailable — try again in a moment');
          };
        }, 2000);
      }
    };
    const onTimeUpdate = () => {
      const now = Date.now();
      if (now - timeUpdateRef.current > 250) {
        timeUpdateRef.current = now;
        // For multi-scene chapters, audio.currentTime is per-scene; add the
        // cumulative offset of finished scenes so the bar reflects total
        // chapter progress.
        const ct = audio.currentTime + sceneStartOffsetRef.current;
        setCurrentTime(ct);
        // If currentTime exceeds our known duration, extend it
        const curDur = useAudioStore.getState().duration;
        if (ct > curDur && ct > 0) {
          setDuration(ct + 2);
        }
      }
    };

    // First-play + listen-duration tracking. We accumulate real wall-clock
    // time spent playing across pause/resume cycles so the journey timeline
    // shows "listened 2m 14s" instead of just "play started". Fires:
    //   - audio_play_started: once per chapter, on first play
    //   - audio_paused:       on pause, with seconds_listened in this session
    //   - audio_play_ended:   on end, with seconds_listened in this session
    const playStartedForChapter = { current: '' as string };
    const playSegmentStartMs = { current: 0 };
    const accumulatedListenSec = { current: 0 };

    const flushListenSec = () => {
      if (playSegmentStartMs.current > 0) {
        accumulatedListenSec.current += (Date.now() - playSegmentStartMs.current) / 1000;
        playSegmentStartMs.current = 0;
      }
    };

    const resetListenTracking = () => {
      flushListenSec();
      accumulatedListenSec.current = 0;
      playSegmentStartMs.current = 0;
    };

    const onPlay = () => {
      const chId = useAudioStore.getState().currentChapterId || '';
      // New chapter — reset accumulated listen time so we don't carry minutes
      // from a previous chapter into this one's stats.
      if (chId !== playStartedForChapter.current) {
        resetListenTracking();
        playStartedForChapter.current = chId;
        if (chId) jTrack('audio_play_started', { chapter_id: chId });
      }
      playSegmentStartMs.current = Date.now();
    };

    const onPause = () => {
      // Browsers also fire `pause` right before `ended`; the `ended` handler
      // covers the end-of-audio case so we skip emitting an extra paused
      // event in that scenario by checking `audio.ended`.
      if (audio.ended) return;
      flushListenSec();
      const chId = playStartedForChapter.current;
      if (chId && accumulatedListenSec.current >= 1) {
        const totalDur = audio.duration && isFinite(audio.duration) ? audio.duration : null;
        jTrack('audio_paused', {
          chapter_id: chId,
          seconds_listened: Math.round(accumulatedListenSec.current),
          total_duration_sec: totalDur ? Math.round(totalDur) : undefined,
          progress_pct: totalDur ? Math.round((accumulatedListenSec.current / totalDur) * 100) : undefined,
          current_time_sec: Math.round(audio.currentTime + sceneStartOffsetRef.current),
        });
      }
    };

    const onPlayEndedTrack = () => {
      flushListenSec();
      const chId = playStartedForChapter.current;
      if (chId && accumulatedListenSec.current >= 1) {
        const totalDur = audio.duration && isFinite(audio.duration) ? audio.duration : null;
        jTrack('audio_play_ended', {
          chapter_id: chId,
          seconds_listened: Math.round(accumulatedListenSec.current),
          total_duration_sec: totalDur ? Math.round(totalDur) : undefined,
          completed: true,
        });
      }
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('ended', onPlayEndedTrack);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('error', onError);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('ended', onPlayEndedTrack);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  // Media Session API — lock screen controls & metadata.
  // The artwork URL MUST be absolute — relative paths don't work for the OS
  // lock screen / car display since they fetch outside the browser context.
  // Also updates document.title as a fallback for systems that read it.
  useEffect(() => {
    if (!project) return;

    const chapterTitle = currentChapter?.title
      || (currentChapter ? `Chapter ${currentChapter.number}` : '')
      || (currentChapterId ? `Chapter` : '');
    const trackTitle = chapterTitle ? `${chapterTitle} — ${project.title}` : project.title;

    // Update document.title so lock screen / car display has the right text
    // even on browsers where MediaSession isn't fully supported.
    document.title = playing && chapterTitle
      ? `▶ ${trackTitle}`
      : 'Theodore — Story Engine';

    if (!('mediaSession' in navigator)) return;

    const relativeCover = (project.coverUrl && !project.coverUrl.startsWith('data:') ? project.coverUrl : null) || '/icons/icon-512.png';
    const absoluteCover = new URL(relativeCover, window.location.origin).href;

    const mediaTitle = currentChapter
      ? `Chapter ${currentChapter.number} · ${currentChapter.title || ''}`
      : chapterTitle || project.title;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediaTitle,
      artist: project.title,
      album: project.title,
      artwork: [
        { src: absoluteCover, sizes: '512x512', type: 'image/png' },
        { src: absoluteCover, sizes: '256x256', type: 'image/png' },
        { src: absoluteCover, sizes: '128x128', type: 'image/png' },
      ],
    });

    const audio = audioRef.current;
    navigator.mediaSession.setActionHandler('play', () => { audio?.play(); setPlaying(true); });
    navigator.mediaSession.setActionHandler('pause', () => { audio?.pause(); setPlaying(false); });
    navigator.mediaSession.setActionHandler('seekbackward', () => { if (audio) audio.currentTime = Math.max(0, audio.currentTime - 10); });
    navigator.mediaSession.setActionHandler('seekforward', () => { if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
    navigator.mediaSession.setActionHandler('seekto', (details) => { if (audio && details.seekTime != null) audio.currentTime = details.seekTime; });

    return () => {
      document.title = 'Theodore — Story Engine';
    };
  }, [currentChapterId, project?.id, project?.title, project?.coverUrl, currentChapter?.title, currentChapter?.number, playing]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ========== Keep-playing-in-background hardening ==========
  // Mirror the mobile app's `shouldPlayInBackground` + lock-screen activation.
  // Web equivalents:
  //  1. Set mediaSession.playbackState so iOS/CarPlay knows we're actively
  //     playing and keeps us alive under background memory pressure.
  //  2. Auto-resume when the tab becomes visible again if our React state
  //     still says playing=true but the audio element was paused by the
  //     browser (iOS Safari will sometimes pause after long screen-lock).
  //  3. Pagehide cleanup so we don't re-broadcast stale state.
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      } catch { /* older browsers don't support assignment */ }
    }
  }, [playing]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      const audio = audioRef.current;
      if (!audio) return;
      const shouldBePlaying = useAudioStore.getState().playing;
      if (shouldBePlaying && audio.paused && audio.src && audio.src !== window.location.href) {
        // Browser auto-paused while backgrounded — try to resume now that we
        // have a user-attention signal (visibilitychange counts in most
        // browsers for already-playing audio).
        audio.play().catch((err) => {
          console.warn('[AudioPlayer] visibility resume blocked:', err?.message || err);
        });
      }
    };
    const onAudioPause = () => {
      // Log unintended pauses (audio paused but our state says playing).
      // Useful for diagnosing future "audio stopped" reports.
      const audio = audioRef.current;
      const shouldBePlaying = useAudioStore.getState().playing;
      if (shouldBePlaying && audio?.paused) {
        console.log('[AudioPlayer] unintended pause detected (hidden=%s)', document.hidden);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const audio = audioRef.current;
    audio?.addEventListener('pause', onAudioPause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      audio?.removeEventListener('pause', onAudioPause);
    };
  }, []);

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
    let chapter = freshChapters.find(c => c.id === chapterId);
    if (!chapter?.prose) return;

    // Detect guest mode for TTS endpoint routing
    const isGuest = !useAuthStore?.getState?.()?.user;

    setGenerating(chapterId);
    setError(null);
    setCurrentChapter(chapterId);

    // Auto-decompose into scenes if none exist (needed for streaming playback).
    // We only decompose when the chapter has NO scenes yet. If scenes exist but
    // some are empty, we don't re-split — we fall back to chapter.prose for the
    // audio to avoid dropping the content the empty scenes correspond to.
    const allScenes = (chapter.scenes || []).slice().sort((a, b) => a.order - b.order);
    let scenes = allScenes.filter(s => s.prose?.trim());
    const hasEmptyScenes = allScenes.length > 0 && scenes.length < allScenes.length;

    if (allScenes.length === 0 && chapter.prose.length > 500) {
      useGenerationStore.getState().start({
        kind: 'generate-audio',
        label: `Ch. ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}`,
        subtitle: 'Breaking into scenes…',
        indeterminate: true,
      });
      try {
        const { runSceneDecomposition } = await import('../../lib/post-generation-pipeline');
        await (runSceneDecomposition as any)(chapterId);
        chapter = useStore.getState().chapters.find(c => c.id === chapterId) || chapter;
        const refreshedAll = (chapter.scenes || []).slice().sort((a, b) => a.order - b.order);
        scenes = refreshedAll.filter(s => s.prose?.trim());
      } catch (e) {
        console.warn('[AudioPlayer] Scene decomposition failed, generating as single chunk:', e);
      }
    }

    // Iterate scenes only when every scene has prose. If any scene is empty,
    // the per-scene path would silently drop that scene's content — instead
    // use the full chapter.prose so the audio is complete.
    const iterateScenes = scenes.length > 1 && !hasEmptyScenes;
    if (hasEmptyScenes) {
      console.info(`[AudioPlayer] ${allScenes.length - scenes.length} empty scenes on chapter ${chapterId}; using chapter.prose to avoid dropped content`);
    }

    useGenerationStore.getState().start({
      kind: 'generate-audio',
      label: `Ch. ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}`,
      subtitle: iterateScenes ? `Generating ${scenes.length} scenes…` : 'Generating audio…',
      // TTS server progress is unreliable; show indeterminate motion.
      indeterminate: true,
    });

    try {
      const versionSuffix = `-v${Date.now()}`;
      const { ttsProvider, ttsModel } = useAudioStore.getState();
      const effectiveProvider = ttsProvider || 'fish';
      const effectiveModel = ttsModel || 'fish-s2-pro';

      if (iterateScenes) {
        const firstScene = scenes[0];
        const firstSceneSFX = (firstScene.sfx || []).map((s: any) => ({
          prompt: s.prompt, audioUrl: s.audioUrl, position: s.position, enabled: s.enabled,
        }));
        const result = await api.ttsGenerate({
          chapterId: `${chapterId}-scene-${firstScene.id}${versionSuffix}`,
          prose: firstScene.prose,
          narratorVoice,
          model: effectiveModel,
          provider: isGuest ? 'openai' : effectiveProvider,
          speed: (effectiveProvider === 'openai' || effectiveProvider === 'fish') ? 1.0 : speed,
          sceneSFX: firstSceneSFX,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title || undefined,
          isGuest,
        });

        const audio = audioRef.current;
        if (audio) {
          // Only auto-play if nothing is currently playing — don't cut off
          // a chapter the user is already listening to.
          const alreadyPlaying = playing && !audio.paused && audio.currentTime > 0;
          if (!alreadyPlaying) {
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

        sceneIndexRef.current = 0;
        sceneStartOffsetRef.current = 0;
        const allUrls = [result.audioUrl];
        const allSceneIds = [firstScene.id];
        let totalDuration = result.durationEstimate;

        for (let i = 1; i < scenes.length; i++) {
          const scene = scenes[i];
          useGenerationStore.getState().setSubtitle(`Scene ${i + 1} of ${scenes.length}…`);
          try {
            const sceneSFXData = (scene.sfx || []).map((s: any) => ({
              prompt: s.prompt, audioUrl: s.audioUrl, position: s.position, enabled: s.enabled,
            }));
            const sceneResult = await api.ttsGenerate({
              chapterId: `${chapterId}-scene-${scene.id}${versionSuffix}`,
              prose: scene.prose,
              narratorVoice,
              model: effectiveModel,
              provider: isGuest ? 'openai' : effectiveProvider,
              speed: (effectiveProvider === 'openai' || effectiveProvider === 'fish') ? 1.0 : speed,
              sceneSFX: sceneSFXData,
              isGuest,
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
          model: effectiveModel,
          provider: isGuest ? 'openai' : effectiveProvider,
          speed: (effectiveProvider === 'openai' || effectiveProvider === 'fish') ? 1.0 : speed,
          sceneSFX: allSceneSFX,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title || undefined,
          isGuest,
        });

        addChapterAudio(chapterId, {
          chapterId,
          audioUrl: result.audioUrl,
          durationEstimate: result.durationEstimate,
          generatedAt: new Date().toISOString(),
        });

        const audio = audioRef.current;
        if (audio) {
          const alreadyPlaying = playing && !audio.paused && audio.currentTime > 0;
          if (!alreadyPlaying) {
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
      }
      useGenerationStore.getState().setPhase('done');
    } catch (e: any) {
      if (e.message?.includes('credits') || e.message?.includes('402')) {
        import('../../store/credits').then(m => m.useCreditsStore.getState().setShowUpgradeModal(true));
      }
      setError(e.message || 'Audio generation failed');
      useGenerationStore.getState().end();
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
      // For multi-scene chapters, the global target time may fall outside
      // the current scene's local timeline. Clamp the local seek so the
      // browser doesn't reject it; cross-scene seeking would need per-scene
      // durations stored on the cached audio entry.
      const targetGlobal = fraction * duration;
      const targetLocal = targetGlobal - sceneStartOffsetRef.current;
      const sceneDuration = audio.duration && isFinite(audio.duration) ? audio.duration : duration;
      const clamped = Math.max(0, Math.min(sceneDuration, targetLocal));
      audio.currentTime = clamped;
      setCurrentTime(sceneStartOffsetRef.current + clamped);
    }
  }, [duration]);

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const sceneDuration = audio.duration && isFinite(audio.duration) ? audio.duration : 0;
    const next = Math.max(0, Math.min(sceneDuration, audio.currentTime + seconds));
    audio.currentTime = next;
    setCurrentTime(sceneStartOffsetRef.current + next);
  }, []);

  // Listen for seek requests from NowPlayingPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const { fraction } = (e as CustomEvent).detail;
      if (typeof fraction === 'number') seekTo(fraction);
    };
    window.addEventListener('theodore:seekAudio', handler);
    return () => window.removeEventListener('theodore:seekAudio', handler);
  }, [seekTo]);

  // Listen for relative seek requests (e.g. rewind/forward 15s buttons)
  useEffect(() => {
    const handler = (e: Event) => {
      const { seconds } = (e as CustomEvent).detail;
      if (typeof seconds === 'number') seekBy(seconds);
    };
    window.addEventListener('theodore:seekBy', handler);
    return () => window.removeEventListener('theodore:seekBy', handler);
  }, [seekBy]);

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
      sceneStartOffsetRef.current = 0;
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
  // Use chapter image if available, otherwise fall back to the project cover
  const coverArt = currentChapter?.imageUrl || project?.coverUrl || null;
  const hasCoverArt = coverArt && !coverArt.startsWith('data:');
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isMuted = volume === 0;

  return (
    <div className="hidden sm:block fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
      <div className="bg-[#181818] text-white shadow-2xl">
        {/* Progress bar — draggable on desktop & mobile */}
        <ProgressScrubber progressPct={progressPct} onSeek={seekTo} />

        {/* Error banner */}
        {error && (
          <div className="px-4 py-1.5 bg-red-500/20 text-red-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-2 sm:px-5">
          {/* Cover art + track info — tap to expand fullscreen player on mobile */}
          <div
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer sm:cursor-default"
            onClick={() => window.dispatchEvent(new CustomEvent('theodore:expandPlayer'))}
          >
            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
              {hasCoverArt ? (
                <img src={coverArt} alt="" className="w-full h-full object-cover" />
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
              disabled={!currentChapterId}
              className="p-2.5 rounded-full bg-white text-[#181818] hover:scale-105 disabled:opacity-50 transition-all"
            >
              {playing ? (
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
