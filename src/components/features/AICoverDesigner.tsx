import { useState } from 'react';
import { Image, Sparkles, Loader2, RotateCcw, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStore } from '../../store';

type CoverView = 'front' | 'back' | 'spine' | 'full';

const TRIM_SIZES: { label: string; w: number; h: number }[] = [
  { label: '6" × 9"', w: 6, h: 9 },
  { label: '5.5" × 8.5"', w: 5.5, h: 8.5 },
  { label: '5" × 8"', w: 5, h: 8 },
  { label: '5.25" × 8"', w: 5.25, h: 8 },
  { label: '8.5" × 11"', w: 8.5, h: 11 },
];

const GENRES = [
  'Literary Fiction', 'Thriller', 'Romance', 'Fantasy', 'Sci-Fi',
  'Horror', 'Mystery', 'Historical', 'Non-Fiction', 'Memoir',
];

const MOCK_STYLES = [
  { id: 'minimal', label: 'Minimalist', bg: 'bg-gradient-to-br from-gray-900 to-gray-800' },
  { id: 'bold', label: 'Bold Type', bg: 'bg-gradient-to-br from-red-900 to-red-700' },
  { id: 'elegant', label: 'Elegant', bg: 'bg-gradient-to-br from-amber-50 to-amber-100' },
  { id: 'dark', label: 'Dark Mood', bg: 'bg-gradient-to-br from-slate-950 to-indigo-950' },
  { id: 'nature', label: 'Nature', bg: 'bg-gradient-to-br from-emerald-800 to-teal-900' },
  { id: 'retro', label: 'Retro', bg: 'bg-gradient-to-br from-orange-200 to-yellow-100' },
];

function calculateSpine(pageCount: number): number {
  // KDP spine width: white paper = 0.002252" per page
  return pageCount * 0.002252;
}

export function AICoverDesigner() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();

  const [genre, setGenre] = useState('Literary Fiction');
  const [trimSize, setTrimSize] = useState(0);
  const [pageCount, setPageCount] = useState(280);
  const [selectedStyle, setSelectedStyle] = useState('minimal');
  const [view, setView] = useState<CoverView>('front');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [prompt, setPrompt] = useState('');

  const trim = TRIM_SIZES[trimSize];
  const spineWidth = calculateSpine(pageCount);
  const style = MOCK_STYLES.find(s => s.id === selectedStyle) || MOCK_STYLES[0];
  const title = project?.title || 'Untitled Novel';
  const author = 'Your Name';
  const isLight = ['elegant', 'retro'].includes(selectedStyle);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerated(true);
      setGenerating(false);
    }, 3000);
  };

  const coverAspect = trim.h / trim.w;
  const downloadCoverPackage = () => {
    const payload = [
      `Title: ${title}`,
      `Author: ${author}`,
      `Genre: ${genre}`,
      `Trim: ${trim.label}`,
      `Page Count: ${pageCount}`,
      `Spine Width (in): ${spineWidth.toFixed(3)}`,
      `Style: ${style.label}`,
      `View: ${view}`,
      '',
      'Prompt Direction:',
      prompt || '(none)',
    ].join('\n');

    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'cover'}-print-spec.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Image size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Cover Designer</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          AI-generated covers at KDP-ready specifications
        </p>

        <div className="flex gap-8">
          {/* Left: Controls */}
          <div className="w-72 flex-shrink-0 space-y-5">
            {/* Genre */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Genre</label>
              <select
                value={genre}
                onChange={e => setGenre(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm"
              >
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Trim size */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Trim Size</label>
              <select
                value={trimSize}
                onChange={e => setTrimSize(Number(e.target.value))}
                className="w-full glass-input px-3 py-2 rounded-xl text-sm"
              >
                {TRIM_SIZES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
              </select>
            </div>

            {/* Page count */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Page Count — <span className="text-text-tertiary">{pageCount} pages</span>
              </label>
              <input
                type="range"
                min={50}
                max={800}
                value={pageCount}
                onChange={e => setPageCount(Number(e.target.value))}
                className="w-full accent-black"
              />
              <div className="text-xs text-text-tertiary mt-1">
                Spine width: {spineWidth.toFixed(3)}" ({(spineWidth * 25.4).toFixed(1)}mm)
              </div>
            </div>

            {/* Style */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Style</label>
              <div className="grid grid-cols-3 gap-2">
                {MOCK_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStyle(s.id)}
                    className={cn(
                      'aspect-[2/3] rounded-lg border-2 transition-all',
                      s.bg,
                      selectedStyle === s.id ? 'border-black ring-2 ring-black/10' : 'border-transparent'
                    )}
                  >
                    <span className="sr-only">{s.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-xs text-text-tertiary mt-1.5 text-center">{style.label}</div>
            </div>

            {/* Custom prompt */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Additional Direction</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g., A lone figure standing at the edge of a forest at twilight..."
                className="w-full glass-input px-3 py-2 rounded-xl text-sm h-20 resize-none"
              />
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-black/90 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Generating...</>
              ) : generated ? (
                <><RotateCcw size={16} /> Regenerate</>
              ) : (
                <><Sparkles size={16} /> Generate Cover</>
              )}
            </button>

            {generated && (
              <button
                onClick={downloadCoverPackage}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-black/10 rounded-xl text-sm hover:bg-black/[0.02] transition-colors"
              >
                <Download size={14} />
                Download Print-Ready PDF
              </button>
            )}
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex flex-col items-center">
            {/* View tabs */}
            <div className="flex gap-1 mb-6 glass-subtle rounded-xl p-1">
              {(['front', 'spine', 'back', 'full'] as CoverView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-xs capitalize transition-all',
                    view === v ? 'bg-black text-white' : 'text-text-tertiary hover:text-text-primary'
                  )}
                >
                  {v === 'full' ? 'Full Wrap' : v}
                </button>
              ))}
            </div>

            {/* Cover preview */}
            <div className="glass-subtle rounded-2xl p-8 w-full flex items-center justify-center min-h-[500px]">
              {view === 'full' ? (
                /* Full wrap: back + spine + front */
                <div className="flex shadow-2xl">
                  {/* Back */}
                  <div
                    className={cn('relative flex flex-col justify-between p-6', style.bg)}
                    style={{ width: 200, height: 200 * coverAspect }}
                  >
                    <div />
                    <div className={cn('text-[8px] leading-relaxed', isLight ? 'text-gray-700' : 'text-white/70')}>
                      <p>In a world where time flows differently beneath the surface, one woman discovers that the garden she's been tending holds secrets older than the city itself.</p>
                      <p className="mt-2 font-semibold">ISBN 978-0-000000-00-0</p>
                    </div>
                    <div className={cn('w-12 h-8 border flex items-center justify-center text-[6px]', isLight ? 'border-gray-400 text-gray-600' : 'border-white/30 text-white/50')}>
                      BARCODE
                    </div>
                  </div>
                  {/* Spine */}
                  <div
                    className={cn('flex items-center justify-center', style.bg, isLight ? 'border-x border-gray-300' : 'border-x border-white/10')}
                    style={{ width: Math.max(24, spineWidth * 40), height: 200 * coverAspect }}
                  >
                    <div className={cn('text-[7px] font-semibold whitespace-nowrap', isLight ? 'text-gray-800' : 'text-white')} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {title}
                    </div>
                  </div>
                  {/* Front */}
                  <div
                    className={cn('relative flex flex-col items-center justify-center p-6', style.bg)}
                    style={{ width: 200, height: 200 * coverAspect }}
                  >
                    <div className={cn('text-lg font-serif font-bold text-center leading-tight', isLight ? 'text-gray-900' : 'text-white')}>
                      {title}
                    </div>
                    <div className={cn('text-[10px] mt-3 tracking-widest uppercase', isLight ? 'text-gray-600' : 'text-white/60')}>
                      {author}
                    </div>
                  </div>
                </div>
              ) : view === 'spine' ? (
                <div
                  className={cn('flex items-center justify-center shadow-2xl rounded-sm', style.bg)}
                  style={{ width: Math.max(40, spineWidth * 60), height: 380 }}
                >
                  <div className={cn('text-xs font-serif font-semibold', isLight ? 'text-gray-800' : 'text-white')} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {title} — {author}
                  </div>
                </div>
              ) : (
                /* Front or Back */
                <div
                  className={cn('relative flex flex-col items-center justify-center shadow-2xl rounded-sm', style.bg)}
                  style={{ width: 260, height: 260 * coverAspect }}
                >
                  {view === 'front' ? (
                    <>
                      <div className={cn('text-xl font-serif font-bold text-center leading-tight px-6', isLight ? 'text-gray-900' : 'text-white')}>
                        {title}
                      </div>
                      <div className={cn('text-xs mt-4 tracking-widest uppercase', isLight ? 'text-gray-600' : 'text-white/60')}>
                        {author}
                      </div>
                      {!generated && (
                        <div className={cn('absolute inset-0 flex items-center justify-center', isLight ? 'bg-white/40' : 'bg-black/40')}>
                          <span className="text-xs text-white/80 glass-pill px-3 py-1">Generate to see AI artwork</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={cn('px-8 text-center', isLight ? 'text-gray-700' : 'text-white/80')}>
                      <p className="text-[10px] leading-relaxed">
                        In a world where time flows differently beneath the surface, one woman discovers that the garden she's been tending holds secrets older than the city itself. A haunting debut novel about memory, loss, and the roots we put down in unexpected places.
                      </p>
                      <div className="mt-6 pt-4 border-t border-white/10">
                        <div className={cn('w-16 h-10 mx-auto border flex items-center justify-center text-[7px]', isLight ? 'border-gray-400 text-gray-600' : 'border-white/30 text-white/50')}>
                          BARCODE
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Specs */}
            <div className="mt-4 flex gap-4 text-xs text-text-tertiary">
              <span>Trim: {trim.label}</span>
              <span>·</span>
              <span>Spine: {spineWidth.toFixed(3)}"</span>
              <span>·</span>
              <span>Full wrap: {(trim.w * 2 + spineWidth + 0.25).toFixed(2)}" × {(trim.h + 0.25).toFixed(2)}"</span>
              <span>·</span>
              <span>300 DPI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
