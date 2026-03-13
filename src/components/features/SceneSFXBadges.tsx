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

  const generateSFXAudio = async (sfxItem: SceneSFX) => {
    if (sfxItem.audioUrl) return; // already generated
    setGenerating(sfxItem.id);
    try {
      const result = await api.sfxGenerate({
        prompt: sfxItem.prompt,
        durationSeconds: sfxItem.durationSeconds,
      });
      const updated = sfx.map(s =>
        s.id === sfxItem.id ? { ...s, audioUrl: result.audioUrl, durationSeconds: result.durationSeconds } : s
      );
      updateScene(chapterId, sceneId, { sfx: updated });
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
    if (!sfxItem.audioUrl) return;

    // If this one is already playing, stop it
    if (playingId === sfxItem.id) {
      stopPlayback();
      return;
    }

    // Stop any currently playing audio
    stopPlayback();

    const audio = new Audio(sfxItem.audioUrl);
    audio.volume = 0.5;

    // Background SFX loops continuously
    if (sfxItem.position === 'background') {
      audio.loop = true;
    }

    audio.addEventListener('ended', () => {
      // Only clear state for non-looping (intro/outro) sounds
      if (!audio.loop) {
        setPlayingId(null);
        audioRef.current = null;
      }
    });

    audio.play();
    audioRef.current = audio;
    setPlayingId(sfxItem.id);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 mt-4 mb-2" onMouseUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {sfx.map(s => (
        <div
          key={s.id}
          className={cn(
            'inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium border transition-all group shadow-sm',
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
            {s.enabled ? <Volume2 size={14} className="sm:w-4 sm:h-4" /> : <VolumeX size={14} className="sm:w-4 sm:h-4" />}
          </button>

          {/* Label */}
          <span className="max-w-[120px] sm:max-w-[180px] truncate">{s.prompt}</span>
          <span className="opacity-50 text-[10px] sm:text-xs">{POSITION_LABELS[s.position]}</span>

          {/* Generate / Play / Stop */}
          {s.enabled && !s.audioUrl && (
            <button
              onClick={() => generateSFXAudio(s)}
              disabled={generating === s.id}
              className="hover:opacity-70 transition-opacity"
              title="Generate audio"
            >
              {generating === s.id ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
            </button>
          )}
          {s.audioUrl && s.enabled && (
            <button
              onClick={() => previewSFX(s)}
              className="hover:opacity-70 transition-opacity"
              title={playingId === s.id ? 'Stop' : (s.position === 'background' ? 'Play (loops)' : 'Preview')}
            >
              {playingId === s.id ? <Pause size={14} /> : <Volume2 size={14} />}
            </button>
          )}

          {/* Remove */}
          <button
            onClick={() => removeSFX(s.id)}
            className="opacity-40 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500 transition-all"
            title="Remove SFX"
          >
            <X size={12} className="sm:w-3.5 sm:h-3.5" />
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
