import { useState, useMemo } from 'react';
import { Waves, Sparkles, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface ToneProfile {
  chapter: number;
  title: string;
  dominantTone: string;
  toneScores: Record<string, number>; // tone category -> 0-100
  driftFromPrevious: number | null; // 0-100, null for first chapter
  flagged: boolean;
  intentional: boolean; // user can mark drifts as intentional
}

const TONE_COLORS: Record<string, string> = {
  'lyrical': '#8b5cf6',
  'atmospheric': '#6366f1',
  'tense': '#ef4444',
  'humorous': '#f59e0b',
  'dark': '#374151',
  'hopeful': '#10b981',
  'melancholic': '#64748b',
  'action': '#dc2626',
};

export function ToneDriftDetector() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const [analyzing, setAnalyzing] = useState(false);

  const [profiles, setProfiles] = useState<ToneProfile[]>(() =>
    chapters.map((ch, i) => {
      const tones = ['lyrical', 'atmospheric', 'tense', 'humorous', 'dark', 'hopeful', 'melancholic', 'action'];
      const scores: Record<string, number> = {};
      
      // Simulate tone variation with a "drift" in chapter 2
      tones.forEach(t => {
        let base = Math.random() * 30;
        if (t === 'lyrical') base += i === 0 ? 60 : i === 1 ? 15 : 55;
        if (t === 'atmospheric') base += i === 0 ? 50 : i === 1 ? 20 : 45;
        if (t === 'tense') base += i === 1 ? 70 : 25;
        if (t === 'action') base += i === 1 ? 55 : 15;
        scores[t] = Math.min(100, Math.max(0, Math.round(base)));
      });

      const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
      const drift = i === 0 ? null : i === 1 ? 72 : 18;
      
      return {
        chapter: ch.number,
        title: ch.title,
        dominantTone: dominant,
        toneScores: scores,
        driftFromPrevious: drift,
        flagged: drift !== null && drift > 50,
        intentional: false,
      };
    })
  );

  const analyze = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2500));
    setAnalyzing(false);
  };

  const markIntentional = (chapterNum: number) => {
    setProfiles(prev => prev.map(p => 
      p.chapter === chapterNum ? { ...p, intentional: true, flagged: false } : p
    ));
  };

  const flaggedCount = profiles.filter(p => p.flagged && !p.intentional).length;

  // Build gradient strip
  const gradientStops = profiles.map((p, i) => {
    const color = TONE_COLORS[p.dominantTone] || '#94a3b8';
    const pct = profiles.length > 1 ? (i / (profiles.length - 1)) * 100 : 50;
    return `${color} ${pct}%`;
  });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Tone Drift Detector</h3>
          <p className="text-xs text-text-tertiary">Flags unintentional tone shifts across your manuscript.</p>
        </div>
        <button onClick={analyze} disabled={analyzing}
          className="px-3 py-1.5 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {analyzing ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      {/* Overall status */}
      {flaggedCount > 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/5 border border-warning/10 mb-4">
          <AlertTriangle size={14} className="text-warning" />
          <span className="text-xs text-text-secondary">{flaggedCount} tone {flaggedCount === 1 ? 'drift' : 'drifts'} detected. Review and mark as intentional or fix.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success/5 border border-success/10 mb-4">
          <Check size={14} className="text-success" />
          <span className="text-xs text-text-secondary">Tone is consistent across your manuscript.</span>
        </div>
      )}

      {/* Gradient strip */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Tone Gradient</div>
        <div className="h-6 rounded-full overflow-hidden" style={{ background: `linear-gradient(to right, ${gradientStops.join(', ')})` }} />
        <div className="flex justify-between mt-1">
          {profiles.map(p => (
            <span key={p.chapter} className="text-[8px] text-text-tertiary">Ch.{p.chapter}</span>
          ))}
        </div>
      </div>

      {/* Chapter breakdown */}
      <div className="space-y-2">
        {profiles.map(profile => (
          <div key={profile.chapter} className={cn(
            'rounded-xl p-3 transition-all',
            profile.flagged && !profile.intentional ? 'bg-warning/5 border border-warning/10' : 'glass-pill'
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-tertiary">Ch.{profile.chapter}</span>
                <span className="text-xs font-medium truncate">{profile.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full capitalize"
                  style={{ backgroundColor: (TONE_COLORS[profile.dominantTone] || '#94a3b8') + '15', color: TONE_COLORS[profile.dominantTone] || '#94a3b8' }}>
                  {profile.dominantTone}
                </span>
                {profile.driftFromPrevious !== null && profile.driftFromPrevious > 30 && (
                  <span className={cn(
                    'text-[10px] font-mono',
                    profile.driftFromPrevious > 50 ? 'text-warning' : 'text-text-tertiary'
                  )}>
                    Δ{profile.driftFromPrevious}%
                  </span>
                )}
              </div>
            </div>

            {/* Tone bars */}
            <div className="flex gap-0.5 h-3 rounded overflow-hidden mb-1">
              {Object.entries(profile.toneScores)
                .sort((a, b) => b[1] - a[1])
                .filter(([, v]) => v > 10)
                .map(([tone, value]) => (
                  <div
                    key={tone}
                    className="rounded-sm"
                    style={{
                      backgroundColor: TONE_COLORS[tone] || '#94a3b8',
                      width: `${value}%`,
                      opacity: 0.7,
                    }}
                    title={`${tone}: ${value}%`}
                  />
                ))}
            </div>

            {/* Flag actions */}
            {profile.flagged && !profile.intentional && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => markIntentional(profile.chapter)}
                  className="text-[10px] text-text-tertiary hover:text-success flex items-center gap-1">
                  <Check size={10} /> Mark as intentional
                </button>
                <span className="text-[10px] text-warning">← Tone shifted significantly from previous chapter</span>
              </div>
            )}
            {profile.intentional && (
              <div className="text-[10px] text-success mt-1 flex items-center gap-1">
                <Check size={10} /> Intentional shift
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-4">
        {Object.entries(TONE_COLORS).map(([tone, color]) => (
          <div key={tone} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-text-tertiary capitalize">{tone}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
