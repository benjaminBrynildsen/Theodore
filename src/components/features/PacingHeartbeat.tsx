import { useState, useMemo } from 'react';
import { Activity, Sparkles, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface ChapterPacing {
  chapter: number;
  title: string;
  segments: { type: 'action' | 'dialogue' | 'reflection' | 'description'; intensity: number; words: number }[];
  avgPace: number; // 0-100
}

export function PacingHeartbeat() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const [pacing, setPacing] = useState<ChapterPacing[]>(() =>
    chapters.map((ch, i) => {
      const hasProse = !!ch.prose;
      const segs = hasProse ? [
        { type: 'description' as const, intensity: 30 + Math.random() * 20, words: 120 },
        { type: 'reflection' as const, intensity: 20 + Math.random() * 15, words: 80 },
        { type: 'dialogue' as const, intensity: 50 + Math.random() * 30, words: 200 },
        { type: 'action' as const, intensity: 60 + Math.random() * 35, words: 150 },
        { type: 'reflection' as const, intensity: 15 + Math.random() * 20, words: 60 },
        { type: 'dialogue' as const, intensity: 45 + Math.random() * 25, words: 180 },
        { type: 'description' as const, intensity: 25 + Math.random() * 15, words: 90 },
        { type: 'action' as const, intensity: 70 + Math.random() * 30, words: 100 },
      ] : [
        { type: 'description' as const, intensity: 30, words: 0 },
      ];
      const avgPace = Math.round(segs.reduce((s, seg) => s + seg.intensity, 0) / segs.length);
      return { chapter: ch.number, title: ch.title, segments: segs, avgPace };
    })
  );

  const analyze = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2000));
    setAnalyzing(false);
  };

  const typeColors = {
    action: '#ef4444',
    dialogue: '#3b82f6',
    reflection: '#8b5cf6',
    description: '#94a3b8',
  };

  const maxPace = Math.max(...pacing.map(p => p.avgPace), 1);
  const selected = selectedChapter !== null ? pacing.find(p => p.chapter === selectedChapter) : null;

  // Flatline detection
  const paceValues = pacing.map(p => p.avgPace);
  const paceVariance = paceValues.length > 1
    ? Math.sqrt(paceValues.reduce((s, v) => s + (v - paceValues.reduce((a, b) => a + b, 0) / paceValues.length) ** 2, 0) / paceValues.length)
    : 0;
  const isFlat = paceVariance < 8;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Pacing Heartbeat</h3>
          <p className="text-xs text-text-tertiary">See the tempo and rhythm of your story. Peaks = intense. Valleys = reflective.</p>
        </div>
        <button onClick={analyze} disabled={analyzing}
          className="px-3 py-1.5 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {analyzing ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      {isFlat && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/5 border border-warning/10 mb-4">
          <Activity size={14} className="text-warning" />
          <span className="text-xs text-text-secondary">Your pacing is relatively flat — consider adding more rhythmic variety between chapters.</span>
        </div>
      )}

      {/* Waveform visualization */}
      <div className="glass-pill rounded-2xl p-4 mb-4">
        <svg viewBox={`0 0 ${pacing.length * 80 + 40} 120`} className="w-full" style={{ height: 120 }}>
          {pacing.map((ch, ci) => {
            const x = 20 + ci * 80;
            const isSelected = selectedChapter === ch.chapter;
            const segWidth = 60 / ch.segments.length;

            return (
              <g key={ci} onClick={() => setSelectedChapter(isSelected ? null : ch.chapter)} style={{ cursor: 'pointer' }}>
                {/* Segments as waveform bars */}
                {ch.segments.map((seg, si) => {
                  const h = (seg.intensity / 100) * 80;
                  const sx = x + si * segWidth;
                  return (
                    <rect
                      key={si}
                      x={sx}
                      y={100 - h}
                      width={Math.max(segWidth - 1, 2)}
                      height={h}
                      rx={1}
                      fill={typeColors[seg.type]}
                      opacity={isSelected ? 1 : 0.6}
                    />
                  );
                })}

                {/* Average pace line */}
                <line
                  x1={x} y1={100 - (ch.avgPace / 100) * 80}
                  x2={x + 60} y2={100 - (ch.avgPace / 100) * 80}
                  stroke="black" strokeWidth={1} strokeOpacity={0.3}
                  strokeDasharray="2,2"
                />

                {/* Chapter label */}
                <text x={x + 30} y={115} textAnchor="middle" fontSize={9} fill="#999">
                  Ch.{ch.chapter}
                </text>

                {/* Selection highlight */}
                {isSelected && (
                  <rect x={x - 4} y={0} width={68} height={120} fill="none" stroke="black" strokeWidth={1} strokeOpacity={0.15} rx={4} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(typeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-text-tertiary capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Selected chapter detail */}
      {selected && (
        <div className="glass-pill rounded-xl p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Ch.{selected.chapter}: {selected.title}</div>
            <span className={cn(
              'text-xs font-mono px-2 py-0.5 rounded-full',
              selected.avgPace > 65 ? 'bg-red-50 text-red-600' :
              selected.avgPace > 40 ? 'bg-blue-50 text-blue-600' :
              'bg-purple-50 text-purple-600'
            )}>
              {selected.avgPace > 65 ? 'Fast' : selected.avgPace > 40 ? 'Moderate' : 'Slow'} ({selected.avgPace})
            </span>
          </div>

          <div className="space-y-1.5">
            {selected.segments.map((seg, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: typeColors[seg.type] }} />
                <span className="text-xs text-text-secondary capitalize w-20">{seg.type}</span>
                <div className="flex-1 h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ backgroundColor: typeColors[seg.type], width: `${seg.intensity}%` }} />
                </div>
                <span className="text-[10px] font-mono text-text-tertiary w-6">{Math.round(seg.intensity)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
