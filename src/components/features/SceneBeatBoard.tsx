import { useState } from 'react';
import { LayoutGrid, Plus, GripVertical, X, Sparkles, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { cn, generateId } from '../../lib/utils';

interface Beat {
  id: string;
  label: string;
  type: 'action' | 'dialogue' | 'reflection' | 'revelation' | 'transition';
  intensity: 'low' | 'medium' | 'high';
}

interface ChapterBeats {
  chapterId: string;
  chapterNumber: number;
  title: string;
  beats: Beat[];
}

const BEAT_COLORS: Record<string, string> = {
  action: 'bg-red-100 border-red-200 text-red-700',
  dialogue: 'bg-blue-100 border-blue-200 text-blue-700',
  reflection: 'bg-purple-100 border-purple-200 text-purple-700',
  revelation: 'bg-amber-100 border-amber-200 text-amber-700',
  transition: 'bg-gray-100 border-gray-200 text-gray-600',
};

export function SceneBeatBoard() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const [analyzing, setAnalyzing] = useState(false);
  const [dragBeat, setDragBeat] = useState<{ chapterIdx: number; beatIdx: number } | null>(null);
  const [dragOverChapter, setDragOverChapter] = useState<number | null>(null);

  const [chapterBeats, setChapterBeats] = useState<ChapterBeats[]>(() =>
    chapters.map(ch => ({
      chapterId: ch.id,
      chapterNumber: ch.number,
      title: ch.title,
      beats: ch.prose
        ? [
            { id: generateId(), label: 'Opening image', type: 'reflection', intensity: 'low' },
            { id: generateId(), label: 'Discovery moment', type: 'revelation', intensity: 'high' },
            { id: generateId(), label: 'Character introduction', type: 'dialogue', intensity: 'medium' },
            { id: generateId(), label: 'Rising tension', type: 'action', intensity: 'medium' },
          ].slice(0, 2 + Math.floor(Math.random() * 3))
        : [
            { id: generateId(), label: ch.premise?.purpose?.slice(0, 40) || 'Scene outline needed', type: 'transition', intensity: 'low' },
          ],
    }))
  );

  const analyzeBeats = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2000));
    // AI would analyze prose and extract beats
    setAnalyzing(false);
  };

  const handleDrop = (targetChapterIdx: number) => {
    if (!dragBeat) return;
    const { chapterIdx, beatIdx } = dragBeat;
    if (chapterIdx === targetChapterIdx) return;

    setChapterBeats(prev => {
      const updated = [...prev];
      const [beat] = updated[chapterIdx].beats.splice(beatIdx, 1);
      updated[targetChapterIdx].beats.push(beat);
      return updated;
    });
    setDragBeat(null);
    setDragOverChapter(null);
  };

  const removeBeat = (chapterIdx: number, beatIdx: number) => {
    setChapterBeats(prev => {
      const updated = [...prev];
      updated[chapterIdx].beats.splice(beatIdx, 1);
      return updated;
    });
  };

  const addBeat = (chapterIdx: number) => {
    setChapterBeats(prev => {
      const updated = [...prev];
      updated[chapterIdx].beats.push({
        id: generateId(),
        label: 'New beat',
        type: 'action',
        intensity: 'medium',
      });
      return updated;
    });
  };

  // Density analysis
  const avgBeats = chapterBeats.reduce((s, c) => s + c.beats.length, 0) / Math.max(1, chapterBeats.length);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Scene Beat Board</h3>
          <p className="text-xs text-text-tertiary">Drag beats between chapters to rebalance your story structure.</p>
        </div>
        <button
          onClick={analyzeBeats}
          disabled={analyzing}
          className="px-3 py-1.5 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {analyzing ? 'Analyzing...' : 'Auto-detect'}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(BEAT_COLORS).map(([type, cls]) => (
          <span key={type} className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', cls)}>{type}</span>
        ))}
      </div>

      {/* Board */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {chapterBeats.map((chapter, ci) => {
          const density = chapter.beats.length;
          const isDense = density > avgBeats * 1.5;
          const isSparse = density < avgBeats * 0.5 && density < 2;

          return (
            <div
              key={chapter.chapterId}
              onDragOver={e => { e.preventDefault(); setDragOverChapter(ci); }}
              onDrop={() => handleDrop(ci)}
              className={cn(
                'rounded-xl p-3 border transition-all',
                dragOverChapter === ci ? 'border-text-primary bg-black/[0.02]' : 'border-black/5',
                isDense && 'border-l-2 border-l-warning',
                isSparse && 'border-l-2 border-l-error/40',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-text-tertiary">Ch.{chapter.chapterNumber}</span>
                  <span className="text-xs font-medium truncate">{chapter.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isDense && <span className="text-[9px] text-warning">Dense</span>}
                  {isSparse && <span className="text-[9px] text-error/60">Thin</span>}
                  <span className="text-[10px] text-text-tertiary">{density} beats</span>
                  <button onClick={() => addBeat(ci)} className="p-0.5 text-text-tertiary hover:text-text-primary">
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {chapter.beats.map((beat, bi) => (
                  <div
                    key={beat.id}
                    draggable
                    onDragStart={() => setDragBeat({ chapterIdx: ci, beatIdx: bi })}
                    onDragEnd={() => { setDragBeat(null); setDragOverChapter(null); }}
                    className={cn(
                      'group flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-grab active:cursor-grabbing transition-all',
                      BEAT_COLORS[beat.type],
                      beat.intensity === 'high' && 'font-medium ring-1 ring-current/20',
                    )}
                  >
                    <GripVertical size={10} className="opacity-40" />
                    <span className="truncate max-w-[120px]">{beat.label}</span>
                    <button
                      onClick={() => removeBeat(ci, bi)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {chapter.beats.length === 0 && (
                  <span className="text-[10px] text-text-tertiary italic">No beats — drag some here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
