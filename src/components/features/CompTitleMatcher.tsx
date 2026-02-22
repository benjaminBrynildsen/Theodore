import { useState } from 'react';
import { BookCopy, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface CompTitle {
  title: string;
  author: string;
  year: number;
  matchScore: number;
  reasons: string[];
  categories: string[];
  pitch: string; // "Your book × This book" format
}

export function CompTitleMatcher() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const [searching, setSearching] = useState(false);
  const [comps, setComps] = useState<CompTitle[] | null>(null);
  const [generatedPitch, setGeneratedPitch] = useState<string | null>(null);

  const findComps = async () => {
    setSearching(true);
    await new Promise(r => setTimeout(r, 2500));

    // Mock — real version analyzes prose themes, tone, structure
    setComps([
      {
        title: 'The Night Circus',
        author: 'Erin Morgenstern',
        year: 2011,
        matchScore: 92,
        reasons: ['Mysterious sentient setting', 'Lyrical prose style', 'Slow-burn discovery narrative'],
        categories: ['Fantasy', 'Literary Fiction'],
        pitch: 'The Night Circus meets The Secret Garden',
      },
      {
        title: 'Piranesi',
        author: 'Susanna Clarke',
        year: 2020,
        matchScore: 88,
        reasons: ['Protagonist exploring impossible architecture', 'Single mysterious location', 'Philosophical undertone'],
        categories: ['Fantasy', 'Literary Fiction'],
        pitch: 'Piranesi meets botanical horror',
      },
      {
        title: 'The Secret Garden',
        author: 'Frances Hodgson Burnett',
        year: 1911,
        matchScore: 85,
        reasons: ['Hidden garden as central metaphor', 'Transformation through nature', 'Classic discovery structure'],
        categories: ['Literary Fiction', 'Fantasy'],
        pitch: 'A modern, darker Secret Garden',
      },
      {
        title: 'Annihilation',
        author: 'Jeff VanderMeer',
        year: 2014,
        matchScore: 78,
        reasons: ['Scientist protagonist in alien ecosystem', 'Nature as unknowable force', 'Creeping unease'],
        categories: ['Science Fiction', 'Horror'],
        pitch: 'Annihilation but beautiful instead of terrifying',
      },
      {
        title: 'The Overstory',
        author: 'Richard Powers',
        year: 2018,
        matchScore: 72,
        reasons: ['Plant intelligence as theme', 'Literary treatment of ecology', 'Interconnected natural world'],
        categories: ['Literary Fiction'],
        pitch: 'The Overstory meets portal fantasy',
      },
    ]);

    setGeneratedPitch('For fans of The Night Circus and Piranesi — a botanical ecologist discovers a sentient garden that remembers everything, in this lyrical fantasy about the conversations between humans and the natural world.');
    setSearching(false);
  };

  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Comp Title Matcher</h3>
        <p className="text-xs text-text-tertiary">Find published books similar to yours for query letters, KDP categories, and marketing.</p>
      </div>

      {!comps && !searching && (
        <div className="text-center py-8">
          <BookCopy size={28} className="mx-auto mb-3 text-text-tertiary" />
          <p className="text-sm text-text-secondary mb-4">Theodore analyzes your prose, themes, and structure to find comparable titles.</p>
          <button
            onClick={findComps}
            disabled={!project}
            className="px-5 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center gap-2 mx-auto hover:shadow-lg transition-all"
          >
            <Sparkles size={15} /> Find Comp Titles
          </button>
        </div>
      )}

      {searching && (
        <div className="text-center py-8 animate-fade-in">
          <Loader2 size={28} className="mx-auto mb-3 text-text-tertiary animate-spin" />
          <p className="text-sm text-text-secondary">Analyzing themes, tone, and structure...</p>
        </div>
      )}

      {comps && (
        <div className="space-y-4 animate-fade-in">
          {/* Generated pitch */}
          {generatedPitch && (
            <div className="glass-pill rounded-xl p-4">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Generated Pitch Line</div>
              <p className="text-sm font-serif italic leading-relaxed">"{generatedPitch}"</p>
            </div>
          )}

          {/* Comp list */}
          <div className="space-y-2">
            {comps.map((comp, i) => (
              <div key={i} className="glass-pill rounded-xl p-4 hover:bg-white/60 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold">{comp.title}</div>
                    <div className="text-xs text-text-tertiary">{comp.author} · {comp.year}</div>
                  </div>
                  <div className={cn(
                    'text-sm font-mono font-semibold px-2 py-0.5 rounded-lg',
                    comp.matchScore >= 85 ? 'bg-success/10 text-success' : comp.matchScore >= 75 ? 'bg-blue-50 text-blue-600' : 'bg-black/5 text-text-tertiary'
                  )}>
                    {comp.matchScore}%
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mb-2">
                  {comp.categories.map(cat => (
                    <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 text-text-tertiary">{cat}</span>
                  ))}
                </div>

                <ul className="space-y-0.5">
                  {comp.reasons.map((reason, j) => (
                    <li key={j} className="text-xs text-text-secondary flex items-start gap-1.5">
                      <span className="text-text-tertiary mt-0.5">·</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Suggested KDP categories */}
          <div>
            <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Suggested KDP Categories</div>
            <div className="flex flex-wrap gap-1.5">
              {['Fantasy > Contemporary', 'Literary Fiction > Magical Realism', 'Science Fiction > Botanical', 'Fiction > Gothic'].map(cat => (
                <span key={cat} className="text-xs px-3 py-1.5 rounded-lg glass-pill">{cat}</span>
              ))}
            </div>
          </div>

          <button onClick={findComps} className="w-full py-2 rounded-xl glass-pill text-xs text-text-secondary hover:bg-white/60 flex items-center justify-center gap-1.5">
            <Sparkles size={12} /> Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
