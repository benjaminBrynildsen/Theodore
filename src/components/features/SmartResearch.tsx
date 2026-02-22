import { useState } from 'react';
import { Search, Sparkles, Loader2, ExternalLink, X, BookOpen } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ResearchResult {
  question: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  sources: { title: string; url: string }[];
  relatedQuestions: string[];
}

export function SmartResearch({ chapterId }: { chapterId: string }) {
  const [query, setQuery] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [researching, setResearching] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [history, setHistory] = useState<ResearchResult[]>([]);

  const research = async (q: string) => {
    if (!q.trim()) return;
    setResearching(true);
    setQuery(q);
    await new Promise(r => setTimeout(r, 2000));

    // Mock — real version uses search API + AI summary
    const mockResult: ResearchResult = {
      question: q,
      answer: q.toLowerCase().includes('plant') || q.toLowerCase().includes('botan')
        ? 'Botanical ecologists study plant communities and their interactions with the environment. Postdoctoral researchers in this field typically study root networks, mycorrhizal connections, and inter-species communication through chemical signaling. The concept of trees "talking" through root networks (the Wood Wide Web) was popularized by Suzanne Simard\'s research at the University of British Columbia.'
        : q.toLowerCase().includes('garden') || q.toLowerCase().includes('door')
        ? 'Hidden gardens appear throughout literary history as metaphors for secret knowledge and transformation. The most famous is Frances Hodgson Burnett\'s "The Secret Garden" (1911). In folklore, hidden doors in walls often represent liminal spaces — thresholds between the known and unknown world. Iron doors and gates frequently appear in fairy tales as barriers requiring specific keys or conditions to open.'
        : 'Based on available research: The context you\'re describing aligns with known patterns in the field. Key considerations include historical accuracy, cultural context, and internal story consistency. Further research may be needed for specific technical details.',
      confidence: q.length > 20 ? 'high' : 'medium',
      sources: [
        { title: 'Wikipedia — Relevant Topic', url: 'https://en.wikipedia.org' },
        { title: 'Academic paper — Related research', url: 'https://scholar.google.com' },
        { title: 'Britannica — Overview', url: 'https://www.britannica.com' },
      ],
      relatedQuestions: [
        'What specific species would grow in this type of garden?',
        'How would this look in the time period of the story?',
        'Are there real-world parallels to this concept?',
      ],
    };

    setResult(mockResult);
    setHistory(prev => [mockResult, ...prev].slice(0, 10));
    setResearching(false);
  };

  const confidenceColors = {
    high: 'bg-success/10 text-success',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-error/10 text-error',
  };

  return (
    <div className="border-t border-black/5">
      <div className="px-5 py-3 flex items-center gap-2">
        <Search size={14} className="text-text-tertiary" />
        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Research</span>
      </div>

      {/* Search input */}
      <div className="px-5 pb-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && research(query)}
            placeholder="Ask about accuracy, history, science..."
            className="flex-1 px-3 py-2 rounded-lg glass-input text-xs"
          />
          <button
            onClick={() => research(query)}
            disabled={!query.trim() || researching}
            className="px-3 py-2 rounded-lg bg-text-primary text-text-inverse text-xs disabled:opacity-50"
          >
            {researching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          </button>
        </div>

        {/* Quick research prompts */}
        {!result && !researching && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {['Is this historically accurate?', 'What plants grow here?', 'Check this science'].map(q => (
              <button key={q} onClick={() => research(q)}
                className="text-[10px] px-2 py-1 rounded-full glass-pill text-text-tertiary hover:text-text-primary">
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {researching && (
        <div className="px-5 pb-4 text-center animate-fade-in">
          <Loader2 size={20} className="mx-auto mb-2 text-text-tertiary animate-spin" />
          <p className="text-xs text-text-tertiary">Researching...</p>
        </div>
      )}

      {/* Result */}
      {result && !researching && (
        <div className="px-5 pb-4 animate-fade-in">
          <div className="glass-pill rounded-xl p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">{result.question}</span>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full capitalize', confidenceColors[result.confidence])}>
                {result.confidence}
              </span>
            </div>
            <p className="text-xs text-text-primary leading-relaxed mb-3">{result.answer}</p>

            {/* Sources */}
            <div className="space-y-1 mb-2">
              {result.sources.map((source, i) => (
                <a key={i} href={source.url} target="_blank" rel="noopener"
                  className="flex items-center gap-1.5 text-[10px] text-blue-600 hover:underline">
                  <ExternalLink size={9} />
                  {source.title}
                </a>
              ))}
            </div>

            {/* Related questions */}
            <div className="border-t border-black/5 pt-2 mt-2">
              <div className="text-[10px] text-text-tertiary mb-1">Related:</div>
              <div className="space-y-0.5">
                {result.relatedQuestions.map((q, i) => (
                  <button key={i} onClick={() => research(q)}
                    className="block text-[10px] text-text-secondary hover:text-text-primary">
                    → {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={() => setResult(null)} className="text-[10px] text-text-tertiary hover:text-text-primary">
            Clear result
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 1 && !result && (
        <div className="px-5 pb-4">
          <div className="text-[10px] text-text-tertiary mb-1">Recent searches:</div>
          <div className="space-y-1">
            {history.slice(0, 5).map((h, i) => (
              <button key={i} onClick={() => { setResult(h); setQuery(h.question); }}
                className="block text-[10px] text-text-secondary hover:text-text-primary truncate w-full text-left">
                {h.question}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
