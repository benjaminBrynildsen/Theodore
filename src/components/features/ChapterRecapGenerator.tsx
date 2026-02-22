import { useState } from 'react';
import { BookOpen, Copy, Check, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type RecapStyle = 'brief' | 'standard' | 'detailed';
type RecapTone = 'neutral' | 'dramatic' | 'casual';

const STYLE_INFO: Record<RecapStyle, { label: string; description: string }> = {
  brief: { label: 'Brief', description: '1 paragraph — quick refresher' },
  standard: { label: 'Standard', description: '3 paragraphs — key events and turns' },
  detailed: { label: 'Detailed', description: 'Full page — complete chapter-by-chapter' },
};

const MOCK_RECAPS: Record<RecapStyle, string> = {
  brief: `In the chapters leading up to this point, Eleanor discovered the hidden garden beneath the old library, where time-worn stones whispered secrets of the city's founding. She forged an uneasy alliance with Marcus, the archivist who held the only surviving map, and together they decoded the first of three cipher-locked doors — only to realize someone else had been there before them.`,
  standard: `Eleanor's journey began with the discovery of a sealed passage beneath the Harrowgate Library, hidden for over a century behind a false wall in the restricted archives. The garden she found there was no ordinary space — its plants bloomed in patterns that matched the old astronomical charts, and the air hummed with a frequency that made her teeth ache.

Marcus, the head archivist, proved both ally and enigma. His knowledge of the library's hidden history was encyclopedic, yet he refused to explain how he'd come by it. Together they decoded the cipher on the first of three iron doors using a key hidden in the library's founding charter — a document Marcus had supposedly never read.

The first door opened onto a chamber filled with preserved manuscripts, but the real revelation was what was missing: a gap in the shelves exactly the size of the Alderman Codex, the book Eleanor had been searching for. Someone had beaten them to it, and recently — the dust patterns told a story of their own.`,
  detailed: `**Chapter 1: The False Wall**
Eleanor Chen had spent three years cataloguing the restricted archives of Harrowgate Library, but it was a water stain that changed everything. Following the moisture trail behind shelf R-17, she discovered that what she'd assumed was a load-bearing wall was actually a sealed doorway, its mortar newer than the surrounding stonework by at least fifty years. Behind it lay a descending staircase, its steps worn smooth by feet that had walked them long before the library was built.

**Chapter 2: The Garden Below**
The underground garden defied every expectation. Bioluminescent moss covered the vaulted ceiling, casting a perpetual blue-green twilight over beds of impossible plants — species that shouldn't exist together, from different continents and different centuries. Eleanor noticed the planting patterns matched the astronomical charts in the Alderman Collection upstairs. The air carried a low hum, just below the threshold of hearing, that intensified near the three iron doors set into the far wall.

**Chapter 3: The Archivist's Secret**
Marcus Webb appeared at the garden entrance as if summoned. The head archivist's calm acceptance of the impossible space told Eleanor he'd known about it all along. He revealed that the three doors were cipher-locked, each requiring a different key hidden somewhere in the library's collection. His willingness to help came with a condition: Eleanor could never reveal the garden's existence to the board of directors. When she asked why, his answer — "Because they already know" — raised more questions than it answered.

**Chapter 4: The First Door**
The cipher on the first door proved to be a substitution code based on the library's founding charter of 1847. Marcus insisted he'd never read the charter, yet he guided Eleanor to the exact passage that held the key. The door opened onto a preservation chamber filled with manuscripts dating back to the fifteenth century. But Eleanor's attention fixed on a gap in the shelving — a rectangular absence in the dust, exactly the dimensions of the Alderman Codex. Someone had removed it recently, and the faint scent of modern cologne lingered in the sealed air.`,
};

export function ChapterRecapGenerator() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id) : [];

  const [style, setStyle] = useState<RecapStyle>('standard');
  const [tone, setTone] = useState<RecapTone>('neutral');
  const [upToChapter, setUpToChapter] = useState<number>(chapters.length);
  const [generating, setGenerating] = useState(false);
  const [recap, setRecap] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setRecap(MOCK_RECAPS[style]);
      setGenerating(false);
    }, 2000);
  };

  const handleCopy = () => {
    if (recap) {
      navigator.clipboard.writeText(recap);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <p>Open a project to generate recaps</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Chapter Recap</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          Generate "Previously on..." summaries to maintain continuity
        </p>

        {/* Controls */}
        <div className="glass-subtle rounded-2xl p-6 mb-6 space-y-5">
          {/* Style selector */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Recap Style</label>
            <div className="flex gap-2">
              {(Object.keys(STYLE_INFO) as RecapStyle[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    'flex-1 px-4 py-3 rounded-xl border transition-all text-left',
                    style === s
                      ? 'border-black/20 bg-black/[0.04]'
                      : 'border-black/5 hover:border-black/10'
                  )}
                >
                  <div className="text-sm font-medium">{STYLE_INFO[s].label}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">{STYLE_INFO[s].description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Tone</label>
            <div className="flex gap-2">
              {(['neutral', 'dramatic', 'casual'] as RecapTone[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    'px-4 py-2 rounded-xl border text-sm capitalize transition-all',
                    tone === t
                      ? 'border-black/20 bg-black/[0.04]'
                      : 'border-black/5 hover:border-black/10'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Chapter range */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">
              Recap up to Chapter {upToChapter}
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(chapters.length, 1)}
              value={upToChapter}
              onChange={e => setUpToChapter(Number(e.target.value))}
              className="w-full accent-black"
            />
            <div className="flex justify-between text-xs text-text-tertiary mt-1">
              <span>Ch 1</span>
              <span>Ch {Math.max(chapters.length, 1)}</span>
            </div>
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-black/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> Generating recap...</>
            ) : (
              <><Sparkles size={16} /> Generate Recap</>
            )}
          </button>
        </div>

        {/* Output */}
        {recap && (
          <div className="glass-subtle rounded-2xl p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">Previously on <em>{project.title}</em>...</h3>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="prose prose-sm max-w-none text-text-secondary leading-relaxed whitespace-pre-wrap">
              {recap.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <h4 key={i} className="font-semibold text-text-primary mt-4 mb-1 first:mt-0">{line.replace(/\*\*/g, '')}</h4>;
                }
                return line ? <p key={i} className="mb-3">{line}</p> : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
