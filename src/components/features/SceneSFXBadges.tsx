// ========== Scene SFX Badges ==========
// Shows sound effect markers in the chapter/scene view with toggle controls

import { useState } from 'react';
import { Volume2, VolumeX, Plus, X, Loader2 } from 'lucide-react';
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
};

const POSITION_COLORS: Record<string, string> = {
  start: 'bg-blue-50 text-blue-700 border-blue-200',
  end: 'bg-amber-50 text-amber-700 border-amber-200',
  background: 'bg-green-50 text-green-700 border-green-200',
};

export function SceneSFXBadges({ chapterId, sceneId, sfx }: Props) {
  const { updateScene } = useStore();
  const [generating, setGenerating] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newPosition, setNewPosition] = useState<'start' | 'end' | 'background'>('background');

  if (sfx.length === 0 && !adding) return null;

  const toggleSFX = (sfxId: string) => {
    const updated = sfx.map(s =>
      s.id === sfxId ? { ...s, enabled: !s.enabled } : s
    );
    updateScene(chapterId, sceneId, { sfx: updated });
  };

  const removeSFX = (sfxId: string) => {
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

  const previewSFX = (sfxItem: SceneSFX) => {
    if (!sfxItem.audioUrl) return;
    const audio = new Audio(sfxItem.audioUrl);
    audio.volume = 0.5;
    audio.play();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {sfx.map(s => (
        <div
          key={s.id}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border transition-all group',
            s.enabled ? POSITION_COLORS[s.position] : 'bg-black/5 text-text-tertiary border-black/10 line-through'
          )}
        >
          {/* Toggle enabled */}
          <button
            onClick={() => toggleSFX(s.id)}
            className="hover:opacity-70 transition-opacity"
            title={s.enabled ? 'Disable SFX' : 'Enable SFX'}
          >
            {s.enabled ? <Volume2 size={9} /> : <VolumeX size={9} />}
          </button>

          {/* Label */}
          <span className="max-w-[120px] truncate">{s.prompt}</span>
          <span className="opacity-50 text-[8px]">{POSITION_LABELS[s.position]}</span>

          {/* Generate / Play */}
          {s.enabled && !s.audioUrl && (
            <button
              onClick={() => generateSFXAudio(s)}
              disabled={generating === s.id}
              className="hover:opacity-70 transition-opacity"
              title="Generate audio"
            >
              {generating === s.id ? <Loader2 size={8} className="animate-spin" /> : <Volume2 size={8} />}
            </button>
          )}
          {s.audioUrl && s.enabled && (
            <button
              onClick={() => previewSFX(s)}
              className="hover:opacity-70 transition-opacity"
              title="Preview"
            >
              <Volume2 size={8} />
            </button>
          )}

          {/* Remove */}
          <button
            onClick={() => removeSFX(s.id)}
            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
            title="Remove SFX"
          >
            <X size={8} />
          </button>
        </div>
      ))}

      {/* Add SFX inline form */}
      {adding ? (
        <div className="inline-flex items-center gap-1 bg-white rounded-full px-2 py-1 border border-black/10 shadow-sm">
          <input
            type="text"
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSFX()}
            placeholder="rain, footsteps..."
            className="text-[10px] w-24 bg-transparent border-0 outline-none placeholder:text-text-tertiary"
            autoFocus
          />
          <select
            value={newPosition}
            onChange={e => setNewPosition(e.target.value as any)}
            className="text-[9px] bg-transparent border-0 outline-none text-text-tertiary"
          >
            <option value="background">BG</option>
            <option value="start">Intro</option>
            <option value="end">Outro</option>
          </select>
          <button onClick={addSFX} className="text-green-600 hover:text-green-700">
            <Plus size={10} />
          </button>
          <button onClick={() => { setAdding(false); setNewPrompt(''); }} className="text-text-tertiary hover:text-text-primary">
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[9px] text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all"
          title="Add sound effect"
        >
          <Plus size={8} />
          SFX
        </button>
      )}
    </div>
  );
}
