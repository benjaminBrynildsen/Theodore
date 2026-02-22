import { useState } from 'react';
import { BarChart3, Sparkles, Loader2, BookOpen, GraduationCap, Clock, Brain, Users } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface ReadabilityScore {
  label: string;
  value: number;
  max: number;
  description: string;
  icon: typeof BarChart3;
}

interface AudienceMatch {
  label: string;
  age: string;
  match: number;
}

const MOCK_SCORES: ReadabilityScore[] = [
  { label: 'Flesch Reading Ease', value: 62, max: 100, description: 'Standard / fairly easy to read', icon: BookOpen },
  { label: 'Flesch-Kincaid Grade', value: 8.2, max: 16, description: '8th grade reading level', icon: GraduationCap },
  { label: 'Reading Time', value: 47, max: 120, description: '47 minutes for full manuscript', icon: Clock },
  { label: 'Vocabulary Complexity', value: 34, max: 100, description: '34% advanced vocabulary', icon: Brain },
];

const MOCK_AUDIENCES: AudienceMatch[] = [
  { label: 'Middle Grade', age: '8–12', match: 22 },
  { label: 'Young Adult', age: '13–18', match: 68 },
  { label: 'New Adult', age: '18–25', match: 89 },
  { label: 'Adult', age: '25+', match: 95 },
  { label: 'Literary Fiction', age: 'Genre', match: 78 },
  { label: 'Commercial Fiction', age: 'Genre', match: 85 },
];

interface SentenceStats {
  avg: number;
  shortest: number;
  longest: number;
  variation: number;
}

const MOCK_SENTENCE_STATS: SentenceStats = {
  avg: 16.4,
  shortest: 3,
  longest: 52,
  variation: 72,
};

interface ChapterBreakdown {
  chapter: string;
  gradeLevel: number;
  readingEase: number;
  avgSentence: number;
}

const MOCK_CHAPTER_BREAKDOWN: ChapterBreakdown[] = [
  { chapter: 'Ch 1: The False Wall', gradeLevel: 7.8, readingEase: 65, avgSentence: 15.2 },
  { chapter: 'Ch 2: The Garden Below', gradeLevel: 8.4, readingEase: 60, avgSentence: 17.1 },
  { chapter: 'Ch 3: The Archivist', gradeLevel: 9.1, readingEase: 55, avgSentence: 18.6 },
];

export function ReadabilityAnalyzer() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [targetAudience, setTargetAudience] = useState<string>('Adult');

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzed(true);
      setAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Readability Analyzer</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          Grade level, reading time, vocabulary complexity, and audience targeting
        </p>

        {!analyzed ? (
          <div className="glass-subtle rounded-2xl p-8 text-center">
            <BarChart3 size={48} strokeWidth={1} className="mx-auto mb-4 text-text-tertiary opacity-40" />
            <h3 className="text-lg font-serif mb-2">Analyze Your Manuscript</h3>
            <p className="text-sm text-text-tertiary mb-6 max-w-md mx-auto">
              Scans every chapter for readability metrics, sentence complexity, and audience fit
            </p>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-6 py-3 bg-black text-white rounded-xl hover:bg-black/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {analyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Analyzing...</>
              ) : (
                <><Sparkles size={16} /> Run Analysis</>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Score cards */}
            <div className="grid grid-cols-2 gap-4">
              {MOCK_SCORES.map(score => (
                <div key={score.label} className="glass-subtle rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <score.icon size={14} className="text-text-tertiary" />
                    <span className="text-xs font-medium text-text-secondary">{score.label}</span>
                  </div>
                  <div className="text-3xl font-light mb-1">
                    {score.label === 'Reading Time' ? `${score.value}m` : score.value}
                  </div>
                  <div className="text-xs text-text-tertiary mb-3">{score.description}</div>
                  <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black rounded-full transition-all duration-1000"
                      style={{ width: `${(score.value / score.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Audience targeting */}
            <div className="glass-subtle rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users size={14} className="text-text-tertiary" />
                <h3 className="text-sm font-medium">Audience Match</h3>
              </div>
              <div className="space-y-3">
                {MOCK_AUDIENCES.map(a => (
                  <div key={a.label} className="flex items-center gap-3">
                    <div className="w-36 text-sm">
                      <span className="font-medium">{a.label}</span>
                      <span className="text-text-tertiary text-xs ml-1.5">({a.age})</span>
                    </div>
                    <div className="flex-1 h-2 bg-black/5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-1000',
                          a.match >= 80 ? 'bg-emerald-500' : a.match >= 50 ? 'bg-amber-400' : 'bg-black/20'
                        )}
                        style={{ width: `${a.match}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-xs font-medium w-10 text-right',
                      a.match >= 80 ? 'text-emerald-600' : a.match >= 50 ? 'text-amber-600' : 'text-text-tertiary'
                    )}>
                      {a.match}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sentence statistics */}
            <div className="glass-subtle rounded-2xl p-6">
              <h3 className="text-sm font-medium mb-4">Sentence Statistics</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-light">{MOCK_SENTENCE_STATS.avg}</div>
                  <div className="text-xs text-text-tertiary mt-1">Avg words/sentence</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-light">{MOCK_SENTENCE_STATS.shortest}</div>
                  <div className="text-xs text-text-tertiary mt-1">Shortest</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-light">{MOCK_SENTENCE_STATS.longest}</div>
                  <div className="text-xs text-text-tertiary mt-1">Longest</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-light">{MOCK_SENTENCE_STATS.variation}%</div>
                  <div className="text-xs text-text-tertiary mt-1">Variation score</div>
                </div>
              </div>
            </div>

            {/* Per-chapter breakdown */}
            <div className="glass-subtle rounded-2xl p-6">
              <h3 className="text-sm font-medium mb-4">Chapter Breakdown</h3>
              <div className="space-y-1">
                <div className="flex text-[10px] font-medium text-text-tertiary uppercase tracking-wider px-3 pb-2">
                  <span className="flex-1">Chapter</span>
                  <span className="w-20 text-center">Grade</span>
                  <span className="w-20 text-center">Ease</span>
                  <span className="w-24 text-center">Avg Sentence</span>
                </div>
                {MOCK_CHAPTER_BREAKDOWN.map(ch => (
                  <div key={ch.chapter} className="flex items-center px-3 py-2.5 rounded-lg hover:bg-black/[0.02] transition-colors">
                    <span className="flex-1 text-sm">{ch.chapter}</span>
                    <span className="w-20 text-center text-sm font-medium">{ch.gradeLevel}</span>
                    <span className={cn('w-20 text-center text-sm font-medium', ch.readingEase >= 60 ? 'text-emerald-600' : 'text-amber-600')}>
                      {ch.readingEase}
                    </span>
                    <span className="w-24 text-center text-sm text-text-secondary">{ch.avgSentence} words</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Re-analyze */}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-black/10 rounded-xl text-sm hover:bg-black/[0.02] transition-colors disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Re-analyze
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
