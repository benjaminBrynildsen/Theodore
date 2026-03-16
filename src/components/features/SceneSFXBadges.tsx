// ========== Scene SFX Badges ==========
// Shows sound effect markers in the chapter/scene view with toggle controls

import { useState, useRef } from 'react';
import { Volume2, VolumeX, Plus, X, Loader2, Pause } from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { SceneSFX } from '../../types';

interface Props {
  chapterId: string;
  sceneId: string;
  sfx: SceneSFX[];
}

const POSITION_LABELS: Record<string, string> = {
  start: 'Intro',
  end: 'Outro',
  background: 'Background',
  inline: 'One-shot',
};

const POSITION_COLORS: Record<string, string> = {
  start: 'bg-blue-50 text-blue-700 border-blue-200',
  end: 'bg-amber-50 text-amber-700 border-amber-200',
  background: 'bg-green-50 text-green-700 border-green-200',
  inline: 'bg-purple-50 text-purple-700 border-purple-200',
};

export function SceneSFXBadges({ chapterId, sceneId, sfx }: Props) {
  const { updateScene } = useStore();
  const [generating, setGenerating] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newPosition, setNewPosition] = useState<'start' | 'end' | 'background'>('background');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (sfx.length === 0 && !adding) return null;

  const toggleSFX = (sfxId: string) => {
    const updated = sfx.map(s =>
      s.id === sfxId ? { ...s, enabled: !s.enabled } : s
    );
    updateScene(chapterId, sceneId, { sfx: updated });
  };

  const removeSFX = (sfxId: string) => {
    // Stop if currently playing
    if (playingId === sfxId) stopPlayback();
    const updated = sfx.filter(s => s.id !== sfxId);
    updateScene(chapterId, sceneId, { sfx: updated });
  };

  const generateSFXAudio = async (sfxItem: SceneSFX, autoPlay = false) => {
    if (sfxItem.audioUrl) return; // already generated
    setGenerating(sfxItem.id);
    try {
      const result = await api.sfxGenerate({
        prompt: sfxItem.prompt,
        durationSeconds: sfxItem.durationSeconds,
      });
      const updatedSfx = sfx.map(s =>
        s.id === sfxItem.id ? { ...s, audioUrl: result.audioUrl, durationSeconds: result.durationSeconds } : s
      );
      updateScene(chapterId, sceneId, { sfx: updatedSfx });

      // Auto-play after generation
      if (autoPlay && result.audioUrl) {
        // Play directly — don't go through previewSFX which has stale state
        stopPlayback();
        let audio = document.getElementById('theodore-sfx-preview') as HTMLAudioElement;
        if (!audio) {
          audio = document.createElement('audio');
          audio.id = 'theodore-sfx-preview';
          audio.setAttribute('playsinline', '');
          document.body.appendChild(audio);
        }
        audio.src = result.audioUrl;
        audio.volume = 1.0;
        audio.currentTime = 0;
        audio.loop = sfxItem.position === 'background';
        audio.onended = () => { if (!audio.loop) { setPlayingId(null); audioRef.current = null; } };
        audio.onerror = () => { setPlayingId(null); audioRef.current = null; };
        audio.play().catch(() => {});
        audioRef.current = audio;
        setPlayingId(sfxItem.id);
      }
    } catch (e: any) {
      console.error('SFX generation failed:', e);
    } finally {
      setGenerating(null);
    }
  };

  const addSFX = () => {
    if (!newPrompt.trim()) return;
    const newSFX: SceneSFX = {
      id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: newPrompt.trim(),
      position: newPosition,
      enabled: true,
      durationSeconds: newPosition === 'background' ? 30 : 5,
    };
    updateScene(chapterId, sceneId, { sfx: [...sfx, newSFX] });
    setNewPrompt('');
    setAdding(false);
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const previewSFX = (sfxItem: SceneSFX) => {
    // If this one is already playing, stop it
    if (playingId === sfxItem.id) {
      stopPlayback();
      return;
    }

    // Stop any currently playing audio
    stopPlayback();

    if (!sfxItem.audioUrl) {
      // No URL at all — generate then auto-play
      generateSFXAudio(sfxItem, true);
      return;
    }

    // Play immediately in the user gesture context (required for iOS Safari)
    // Use a persistent DOM audio element
    let audio = document.getElementById('theodore-sfx-preview') as HTMLAudioElement;
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'theodore-sfx-preview';
      audio.setAttribute('playsinline', '');
      document.body.appendChild(audio);
    }

    audio.src = sfxItem.audioUrl;
    audio.volume = 1.0;
    audio.currentTime = 0;
    audio.loop = sfxItem.position === 'background';

    audio.onended = () => {
      if (!audio.loop) {
        setPlayingId(null);
        audioRef.current = null;
      }
    };

    // On error (404/missing file), auto-regenerate
    audio.onerror = () => {
      console.log(`[SFX] File missing, regenerating: ${sfxItem.prompt}`);
      setPlayingId(null);
      audioRef.current = null;
      generateSFXAudio(sfxItem);
    };

    audio.play().catch(() => {
      // iOS blocked — try regenerating
      generateSFXAudio(sfxItem);
    });
    audioRef.current = audio;
    setPlayingId(sfxItem.id);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mt-4 mb-2" onMouseUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {sfx.map(s => (
        <div
          key={s.id}
          className={cn(
            'inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-full text-sm font-medium border transition-all group shadow-sm',
            s.enabled ? POSITION_COLORS[s.position] : 'bg-black/5 text-text-tertiary border-black/10 line-through',
            playingId === s.id && 'ring-2 ring-green-400 shadow-md'
          )}
        >
          {/* Toggle enabled */}
          <button
            onClick={() => toggleSFX(s.id)}
            className="hover:opacity-70 transition-opacity"
            title={s.enabled ? 'Disable SFX' : 'Enable SFX'}
          >
            {s.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Label */}
          <span className="max-w-[140px] sm:max-w-[200px] truncate">{s.prompt}</span>
          <span className="opacity-50 text-xs">{POSITION_LABELS[s.position]}</span>

          {/* Generate / Play / Stop */}
          {s.enabled && !s.audioUrl && (
            <button
              onClick={() => generateSFXAudio(s)}
              disabled={generating === s.id}
              className="hover:opacity-70 transition-opacity"
              title="Generate audio"
            >
              {generating === s.id ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
            </button>
          )}
          {s.audioUrl && s.enabled && (
            <button
              onClick={() => previewSFX(s)}
              className="hover:opacity-70 transition-opacity"
              title={playingId === s.id ? 'Stop' : (s.position === 'background' ? 'Play (loops)' : 'Preview')}
            >
              {playingId === s.id ? <Pause size={16} /> : <Volume2 size={16} />}
            </button>
          )}

          {/* Remove */}
          <button
            onClick={() => removeSFX(s.id)}
            className="opacity-40 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500 transition-all"
            title="Remove SFX"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Add SFX inline form */}
      {adding ? (
        <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-white rounded-full px-2.5 sm:px-3.5 py-1.5 sm:py-2 border border-black/10 shadow-sm">
          <input
            type="text"
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSFX()}
            placeholder="rain, footsteps..."
            className="text-xs sm:text-sm w-24 sm:w-32 bg-transparent border-0 outline-none placeholder:text-text-tertiary"
            autoFocus
          />
          <select
            value={newPosition}
            onChange={e => setNewPosition(e.target.value as any)}
            className="text-xs bg-transparent border-0 outline-none text-text-tertiary"
          >
            <option value="background">BG</option>
            <option value="start">Intro</option>
            <option value="end">Outro</option>
          </select>
          <button onClick={addSFX} className="text-green-600 hover:text-green-700">
            <Plus size={16} />
          </button>
          <button onClick={() => { setAdding(false); setNewPrompt(''); }} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all"
          title="Add sound effect"
        >
          <Plus size={14} />
          SFX
        </button>
      )}
    </div>
  );
}
