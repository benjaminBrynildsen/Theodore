import { useState, useMemo } from 'react';
import { TrendingUp, Sparkles, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface ArcPoint {
  chapter: number;
  title: string;
  tension: number; // 0-100
  emotion: string;
  beat: 'setup' | 'rising' | 'midpoint' | 'crisis' | 'climax' | 'resolution' | 'denouement';
}

const BEAT_COLORS: Record<string, string> = {
  setup: '#94a3b8', rising: '#3b82f6', midpoint: '#8b5cf6',
  crisis: '#ef4444', climax: '#f59e0b', resolution: '#10b981', denouement: '#6b7280',
};

export function StoryArcVisualizer() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  // Generate arc points from chapters (mock — real version uses AI)
  const [arcPoints, setArcPoints] = useState<ArcPoint[]>(() => {
    if (chapters.length === 0) return [];
    return chapters.map((ch, i) => {
      const total = chapters.length;
      const pos = i / Math.max(1, total - 1);
      // Classic story arc curve
      let tension: number;
      if (pos < 0.15) tension = 15 + pos * 100; // Setup
      else if (pos < 0.4) tension = 30 + (pos - 0.15) * 120; // Rising
      else if (pos < 0.5) tension = 55 + (pos - 0.4) * 100; // Midpoint
      else if (pos < 0.7) tension = 60 + (pos - 0.5) * 100; // Crisis
      else if (pos < 0.85) tension = 75 + (pos - 0.7) * 166; // Climax
      else tension = 95 - (pos - 0.85) * 400; // Resolution

      tension = Math.max(5, Math.min(95, tension + (Math.random() - 0.5) * 10));

      const beat: ArcPoint['beat'] =
        pos < 0.15 ? 'setup' : pos < 0.4 ? 'rising' : pos < 0.5 ? 'midpoint' :
        pos < 0.7 ? 'crisis' : pos < 0.85 ? 'climax' : pos < 0.95 ? 'resolution' : 'denouement';

      const emotions = {
        setup: 'Curiosity', rising: 'Tension', midpoint: 'Revelation',
        crisis: 'Dread', climax: 'Peak intensity', resolution: 'Relief', denouement: 'Closure',
      };

      return { chapter: ch.number, title: ch.title, tension: Math.round(tension), emotion: emotions[beat], beat };
    });
  });

  const analyzeArc = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2000));
    // In production: AI analyzes actual prose and returns arc data
    setAnalyzing(false);
  };

  const handleDrag = (idx: number, e: React.MouseEvent<SVGCircleElement>) => {
    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const y = ev.clientY - rect.top;
      const h = rect.height - 60; // padding
      const tension = Math.max(5, Math.min(95, 100 - ((y - 30) / h) * 100));
      setArcPoints(prev => prev.map((p, i) => i === idx ? { ...p, tension: Math.round(tension) } : p));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragging(null);
    };
    setDragging(idx);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (chapters.length === 0) {
    return (
      <div className="p-6 text-center text-text-tertiary text-sm">
        <TrendingUp size={24} className="mx-auto mb-2 opacity-50" />
        Add chapters to visualize your story arc.
      </div>
    );
  }

  const width = 600;
  const height = 250;
  const padX = 40;
  const padY = 30;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const points = arcPoints.map((p, i) => ({
    x: padX + (i / Math.max(1, arcPoints.length - 1)) * plotW,
    y: padY + plotH - (p.tension / 100) * plotH,
    ...p,
  }));

  // Smooth curve path
  const pathD = points.length > 1
    ? points.reduce((d, p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = points[i - 1];
        const cpx = (prev.x + p.x) / 2;
        return `${d} C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
      }, '')
    : '';

  // Gradient fill path
  const fillD = pathD + ` L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Story Arc</h3>
          <p className="text-xs text-text-tertiary">Drag points to reshape. Theodore adjusts prose to match.</p>
        </div>
        <button
          onClick={analyzeArc}
          disabled={analyzing}
          className="px-3 py-1.5 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center gap-1.5 hover:shadow-md transition-all disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {analyzing ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      <div className="glass-pill rounded-2xl p-4 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 'auto' }}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(v => {
            const y = padY + plotH - (v / 100) * plotH;
            return (
              <g key={v}>
                <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="black" strokeOpacity={0.05} />
                <text x={padX - 8} y={y + 3} textAnchor="end" fontSize={8} fill="#999">{v}</text>
              </g>
            );
          })}

          {/* Fill under curve */}
          <defs>
            <linearGradient id="arcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#000" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {points.length > 1 && <path d={fillD} fill="url(#arcGrad)" />}

          {/* Curve */}
          {points.length > 1 && (
            <path d={pathD} fill="none" stroke="black" strokeWidth={2} strokeOpacity={0.6} />
          )}

          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x} cy={p.y} r={dragging === i ? 7 : 5}
                fill={BEAT_COLORS[p.beat]}
                stroke="white" strokeWidth={2}
                style={{ cursor: 'ns-resize' }}
                onMouseDown={(e) => handleDrag(i, e)}
              />
              {/* Chapter label */}
              <text x={p.x} y={padY + plotH + 16} textAnchor="middle" fontSize={8} fill="#999">
                Ch.{p.chapter}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Beat legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(BEAT_COLORS).filter(([k]) => k !== 'denouement').map(([beat, color]) => (
          <div key={beat} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-text-tertiary capitalize">{beat}</span>
          </div>
        ))}
      </div>

      {/* Chapter details */}
      <div className="mt-4 space-y-1">
        {arcPoints.map(p => (
          <div key={p.chapter} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/[0.02]">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BEAT_COLORS[p.beat] }} />
            <span className="text-xs text-text-secondary flex-1 truncate">Ch.{p.chapter}: {p.title}</span>
            <span className="text-[10px] text-text-tertiary">{p.emotion}</span>
            <span className="text-[10px] font-mono text-text-tertiary w-6 text-right">{p.tension}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
