import { useState, useMemo } from 'react';
import { MessageSquareQuote, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { cn } from '../../lib/utils';

interface CharacterVoiceProfile {
  name: string;
  lineCount: number;
  avgWordCount: number;
  uniqueWords: number;
  topPhrases: string[];
  readingLevel: string;
  emotionTone: string;
  similarity: { name: string; score: number }[];
}

export function DialogueAnalyzer() {
  const { getActiveProject, getProjectChapters } = useStore();
  const { entries } = useCanonStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose) : [];
  const [analyzing, setAnalyzing] = useState(false);
  const [profiles, setProfiles] = useState<CharacterVoiceProfile[] | null>(null);
  const [compareMode, setCompareMode] = useState<[number, number] | null>(null);

  const analyze = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2000));

    // Mock profiles — real version extracts dialogue per character using AI
    setProfiles([
      {
        name: 'Elara Voss',
        lineCount: 24,
        avgWordCount: 12.3,
        uniqueWords: 186,
        topPhrases: ['I\'m sorry?', 'That\'s not possible', 'Let me think', 'How does'],
        readingLevel: 'College',
        emotionTone: 'Analytical, uncertain',
        similarity: [{ name: 'The Gardener', score: 42 }, { name: 'Dr. Webb', score: 68 }],
      },
      {
        name: 'The Gardener',
        lineCount: 18,
        avgWordCount: 8.7,
        uniqueWords: 142,
        topPhrases: ['The garden', 'You\'re early', 'It knows', 'Perhaps'],
        readingLevel: 'Literary',
        emotionTone: 'Cryptic, calm',
        similarity: [{ name: 'Elara Voss', score: 42 }, { name: 'Dr. Webb', score: 31 }],
      },
      {
        name: 'Dr. Marcus Webb',
        lineCount: 8,
        avgWordCount: 15.1,
        uniqueWords: 94,
        topPhrases: ['The data suggests', 'Scientifically speaking', 'Have you considered'],
        readingLevel: 'Academic',
        emotionTone: 'Pedantic, caring',
        similarity: [{ name: 'Elara Voss', score: 68 }, { name: 'The Gardener', score: 31 }],
      },
    ]);
    setAnalyzing(false);
  };

  // Find high-similarity warnings
  const warnings = profiles?.flatMap(p =>
    p.similarity.filter(s => s.score > 60).map(s => ({
      char1: p.name,
      char2: s.name,
      score: s.score,
    }))
  ).filter((w, i, arr) => arr.findIndex(a => 
    (a.char1 === w.char1 && a.char2 === w.char2) || (a.char1 === w.char2 && a.char2 === w.char1)
  ) === i) || [];

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Dialogue Analyzer</h3>
          <p className="text-xs text-text-tertiary">Do your characters sound distinct? Compare voice profiles side by side.</p>
        </div>
      </div>

      {!profiles && !analyzing && (
        <div className="text-center py-8">
          <MessageSquareQuote size={28} className="mx-auto mb-3 text-text-tertiary" />
          <p className="text-sm text-text-secondary mb-1">Analyze character voice patterns</p>
          <p className="text-xs text-text-tertiary mb-5">Extracts all dialogue per character and compares speech patterns.</p>
          <button onClick={analyze}
            className="px-5 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center gap-2 mx-auto hover:shadow-lg transition-all">
            <Sparkles size={15} /> Analyze Dialogue
          </button>
        </div>
      )}

      {analyzing && (
        <div className="text-center py-8 animate-fade-in">
          <Loader2 size={28} className="mx-auto mb-3 text-text-tertiary animate-spin" />
          <p className="text-sm text-text-secondary">Extracting and comparing character voices...</p>
        </div>
      )}

      {profiles && (
        <div className="space-y-4 animate-fade-in">
          {/* Similarity warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1.5">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-warning/5 border border-warning/10">
                  <AlertTriangle size={14} className="text-warning flex-shrink-0" />
                  <span className="text-xs text-text-secondary">
                    <strong>{w.char1}</strong> and <strong>{w.char2}</strong> sound {w.score}% similar — consider differentiating their speech patterns.
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Character cards */}
          <div className="space-y-3">
            {profiles.map((profile, i) => (
              <div key={i} className="glass-pill rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">{profile.name}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 text-text-tertiary">{profile.lineCount} lines</span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-xs font-mono font-semibold">{profile.avgWordCount}</div>
                    <div className="text-[9px] text-text-tertiary">Avg words/line</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono font-semibold">{profile.uniqueWords}</div>
                    <div className="text-[9px] text-text-tertiary">Unique words</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold">{profile.readingLevel}</div>
                    <div className="text-[9px] text-text-tertiary">Reading level</div>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="text-[10px] text-text-tertiary mb-1">Tone: <span className="text-text-secondary">{profile.emotionTone}</span></div>
                </div>

                <div className="mb-2">
                  <div className="text-[10px] text-text-tertiary mb-1">Signature phrases:</div>
                  <div className="flex flex-wrap gap-1">
                    {profile.topPhrases.map((phrase, j) => (
                      <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 italic">"{phrase}"</span>
                    ))}
                  </div>
                </div>

                {/* Similarity bars */}
                <div className="space-y-1">
                  {profile.similarity.map((sim, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className="text-[10px] text-text-tertiary w-24 truncate">vs {sim.name}</span>
                      <div className="flex-1 h-1.5 bg-black/5 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', sim.score > 60 ? 'bg-warning' : sim.score > 40 ? 'bg-blue-400' : 'bg-success')}
                          style={{ width: `${sim.score}%` }} />
                      </div>
                      <span className={cn('text-[10px] font-mono w-8', sim.score > 60 ? 'text-warning' : 'text-text-tertiary')}>{sim.score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button onClick={analyze} className="w-full py-2 rounded-xl glass-pill text-xs text-text-secondary hover:bg-white/60 flex items-center justify-center gap-1.5">
            <Sparkles size={12} /> Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
