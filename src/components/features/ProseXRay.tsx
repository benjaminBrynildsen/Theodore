import { useState, useMemo } from 'react';
import { Scan, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type Layer = 'dialogue' | 'sentence-length' | 'adverbs' | 'passive' | 'repetition';

const LAYER_CONFIG: Record<Layer, { label: string; color: string; description: string }> = {
  'dialogue': { label: 'Dialogue vs Narration', color: '#3b82f6', description: 'Blue = dialogue, unmarked = narration' },
  'sentence-length': { label: 'Sentence Length', color: '#f59e0b', description: 'Darker = longer sentences' },
  'adverbs': { label: 'Adverb Density', color: '#ef4444', description: 'Red highlights on adverbs (-ly words)' },
  'passive': { label: 'Passive Voice', color: '#8b5cf6', description: 'Purple highlights on passive constructions' },
  'repetition': { label: 'Word Repetition', color: '#10b981', description: 'Green = repeated words within 50-word window' },
};

const COMMON_ADVERBS = new Set(['really', 'very', 'just', 'quite', 'rather', 'somewhat', 'extremely', 'incredibly', 'absolutely', 'completely', 'totally', 'barely', 'nearly', 'almost', 'simply']);
const PASSIVE_MARKERS = /\b(was|were|been|being|is|are|am)\s+(being\s+)?\w+ed\b/gi;

export function ProseXRay({ chapterId }: { chapterId: string }) {
  const { chapters } = useStore();
  const chapter = chapters.find(c => c.id === chapterId);
  const [activeLayers, setActiveLayers] = useState<Set<Layer>>(new Set(['dialogue']));

  const toggleLayer = (layer: Layer) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const analysis = useMemo(() => {
    if (!chapter?.prose) return null;
    const prose = chapter.prose;
    const sentences = prose.split(/(?<=[.!?])\s+/);
    const words = prose.split(/\s+/);

    // Stats
    const dialogueWords = (prose.match(/"[^"]*"/g) || []).join(' ').split(/\s+/).length;
    const totalWords = words.length;
    const dialogueRatio = Math.round((dialogueWords / totalWords) * 100);

    const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
    const avgSentence = Math.round(sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length);
    const maxSentence = Math.max(...sentenceLengths);
    const minSentence = Math.min(...sentenceLengths);
    const variance = Math.round(Math.sqrt(sentenceLengths.reduce((s, l) => s + (l - avgSentence) ** 2, 0) / sentenceLengths.length));

    const adverbs = words.filter(w => w.endsWith('ly') && w.length > 3 || COMMON_ADVERBS.has(w.toLowerCase()));
    const adverbDensity = Math.round((adverbs.length / totalWords) * 100 * 10) / 10;

    const passiveMatches = prose.match(PASSIVE_MARKERS) || [];
    const passiveCount = passiveMatches.length;

    // Word repetition (words appearing 3+ times, excluding common words)
    const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were', 'it', 'he', 'she', 'his', 'her', 'that', 'this', 'had', 'not', 'from', 'as', 'be', 'been', 'have', 'has', 'do', 'did', 'would', 'could', 'should', 'will', 'can', 'if', 'so', 'no', 'up', 'out', 'all', 'about', 'them', 'they', 'their', 'than', 'what', 'which', 'who', 'its', 'into', 'over', 'just', 'like', 'one', 'my', 'your', 'you', 'me', 'we', 'our', 'him', 'her', 'I', 'said']);
    const wordFreq = new Map<string, number>();
    words.forEach(w => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length > 3 && !STOP_WORDS.has(clean)) {
        wordFreq.set(clean, (wordFreq.get(clean) || 0) + 1);
      }
    });
    const repeatedWords = [...wordFreq.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return {
      totalWords, dialogueRatio, avgSentence, maxSentence, minSentence, variance,
      adverbCount: adverbs.length, adverbDensity, passiveCount,
      repeatedWords, sentenceLengths, adverbs: adverbs.map(a => a.toLowerCase()),
    };
  }, [chapter?.prose]);

  if (!chapter?.prose) {
    return (
      <div className="p-4 text-center text-text-tertiary text-xs">
        <Scan size={20} className="mx-auto mb-2 opacity-50" />
        Write or generate prose to use X-Ray analysis.
      </div>
    );
  }

  if (!analysis) return null;

  // Render highlighted prose
  const renderHighlightedProse = () => {
    const prose = chapter.prose;
    const segments: { text: string; highlights: Set<Layer> }[] = [];
    
    // Simple word-level highlighting
    const words = prose.split(/(\s+)/);
    let inDialogue = false;

    return words.map((word, i) => {
      if (word.includes('"')) inDialogue = !inDialogue;
      
      const highlights: string[] = [];

      if (activeLayers.has('dialogue') && (inDialogue || word.includes('"'))) {
        highlights.push('bg-blue-100');
      }
      if (activeLayers.has('adverbs') && (word.toLowerCase().replace(/[^a-z]/g, '').endsWith('ly') || COMMON_ADVERBS.has(word.toLowerCase().replace(/[^a-z]/g, '')))) {
        highlights.push('bg-red-100 underline decoration-red-300');
      }
      if (activeLayers.has('repetition')) {
        const clean = word.toLowerCase().replace(/[^a-z]/g, '');
        if (analysis.repeatedWords.some(([w]) => w === clean)) {
          highlights.push('bg-emerald-100');
        }
      }
      if (activeLayers.has('passive') && PASSIVE_MARKERS.test(word)) {
        highlights.push('bg-purple-100');
      }

      return (
        <span key={i} className={cn(highlights.join(' '), highlights.length > 0 && 'rounded px-0.5')}>
          {word}
        </span>
      );
    });
  };

  return (
    <div className="border-t border-black/5">
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scan size={14} className="text-text-tertiary" />
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Prose X-Ray</span>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        {(Object.entries(LAYER_CONFIG) as [Layer, typeof LAYER_CONFIG[Layer]][]).map(([layer, config]) => (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            className={cn(
              'text-[10px] px-2.5 py-1 rounded-full border transition-all',
              activeLayers.has(layer)
                ? 'border-current font-medium'
                : 'border-black/10 text-text-tertiary'
            )}
            style={activeLayers.has(layer) ? { color: config.color, borderColor: config.color, backgroundColor: config.color + '10' } : {}}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="px-5 pb-3 grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-sm font-mono font-semibold">{analysis.dialogueRatio}%</div>
          <div className="text-[9px] text-text-tertiary">Dialogue</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-mono font-semibold">{analysis.avgSentence}</div>
          <div className="text-[9px] text-text-tertiary">Avg words/sentence</div>
        </div>
        <div className="text-center">
          <div className={cn('text-sm font-mono font-semibold', analysis.adverbDensity > 3 ? 'text-red-500' : '')}>{analysis.adverbDensity}%</div>
          <div className="text-[9px] text-text-tertiary">Adverb density</div>
        </div>
        <div className="text-center">
          <div className={cn('text-sm font-mono font-semibold', analysis.passiveCount > 5 ? 'text-purple-500' : '')}>{analysis.passiveCount}</div>
          <div className="text-[9px] text-text-tertiary">Passive voice</div>
        </div>
      </div>

      {/* Repeated words */}
      {activeLayers.has('repetition') && analysis.repeatedWords.length > 0 && (
        <div className="px-5 pb-3">
          <div className="text-[10px] text-text-tertiary mb-1">Most repeated:</div>
          <div className="flex flex-wrap gap-1">
            {analysis.repeatedWords.map(([word, count]) => (
              <span key={word} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                {word} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Highlighted prose preview */}
      <div className="px-5 pb-4">
        <div className="glass-pill rounded-xl p-4 max-h-48 overflow-y-auto">
          <p className="text-xs font-serif leading-[1.8]">
            {renderHighlightedProse()}
          </p>
        </div>
      </div>
    </div>
  );
}
