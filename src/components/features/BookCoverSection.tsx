import { useState, useRef, useCallback } from 'react';
import { ImageIcon, Loader2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useStore } from '../../store';
import { useGenerationStore } from '../../store/generation';
import { generateCover } from '../../lib/cover-gen-ai';
import { cn } from '../../lib/utils';

const COVER_STYLES = [
  { id: 'illustrated', label: 'Illustrated' },
  { id: 'dark', label: 'Dark & Moody' },
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'iconic', label: 'Iconic Symbol' },
  { id: 'silhouette', label: 'Silhouette' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'typography', label: 'Bold Typography' },
  { id: 'lineart', label: 'Minimalist Line Art' },
] as const;

interface CoverOption {
  url: string;       // composited cover URL (uploaded)
  style: string;     // which style was used
}

// Persist cover history in localStorage so regenerating doesn't lose previous options
function loadCoverHistory(projectId: string): CoverOption[] {
  try {
    const raw = localStorage.getItem(`theodore:covers:${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveCoverHistory(projectId: string, options: CoverOption[]) {
  try {
    // Keep last 10 to avoid unbounded growth
    localStorage.setItem(`theodore:covers:${projectId}`, JSON.stringify(options.slice(-10)));
  } catch {}
}

interface Props {
  projectId: string;
}

export function BookCoverSection({ projectId }: Props) {
  const { getActiveProject, updateProject } = useStore();
  const project = getActiveProject();
  const [style, setStyle] = useState('illustrated');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<CoverOption[]>(() => loadCoverHistory(projectId));
  const [activeIndex, setActiveIndex] = useState(() => {
    // Default to the currently-kept cover if it's in the history
    const history = loadCoverHistory(projectId);
    const keptIdx = project?.coverUrl ? history.findIndex(o => o.url === project.coverUrl) : -1;
    return keptIdx >= 0 ? keptIdx : Math.max(0, history.length - 1);
  });
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!project || generating) return;
    setGenerating(true);
    setError(null);

    useGenerationStore.getState().start({
      kind: 'generate-image' as any,
      label: project.title,
      subtitle: 'Generating cover art…',
      indeterminate: true,
    });

    try {
      const chapters = useStore.getState().chapters
        .filter(c => c.projectId === projectId)
        .sort((a, b) => a.number - b.number)
        .slice(0, 3);
      const chapterHints = chapters
        .map(c => c.premise?.purpose)
        .filter(Boolean)
        .join('; ')
        .slice(0, 300);

      const coverUrl = await generateCover(project, chapterHints, style);

      const newOption: CoverOption = { url: coverUrl, style };
      setOptions(prev => {
        const next = [...prev, newOption];
        setActiveIndex(next.length - 1);
        saveCoverHistory(projectId, next);
        return next;
      });

      if (options.length === 0) {
        updateProject(projectId, { coverUrl });
      }

      useGenerationStore.getState().setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Cover generation failed');
      useGenerationStore.getState().end();
    } finally {
      setGenerating(false);
    }
  }, [project, projectId, style, generating, updateProject, options.length]);

  const keepCover = (url: string) => {
    updateProject(projectId, { coverUrl: url });
  };

  if (!project) return null;

  const currentCover = project.coverUrl;
  const hasAICover = currentCover && !currentCover.startsWith('data:');
  const hasOptions = options.length > 0;

  // Scroll carousel to a specific index
  const scrollTo = (idx: number) => {
    setActiveIndex(idx);
    const el = carouselRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div className="border-t border-black/5 p-4">
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Book Cover</h3>

      {/* Carousel of generated options */}
      {hasOptions && (
        <div className="mb-3">
          <div className="relative">
            <div
              ref={carouselRef}
              className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none"
              style={{ scrollbarWidth: 'none' }}
            >
              {options.map((opt, i) => {
                const isKept = currentCover === opt.url;
                return (
                  <div
                    key={opt.url}
                    className={cn(
                      'relative flex-shrink-0 snap-center rounded-xl overflow-hidden cursor-pointer transition-all',
                      options.length === 1 ? 'w-full max-w-[220px] mx-auto' : 'w-[160px]',
                      activeIndex === i ? 'ring-2 ring-text-primary ring-offset-2' : 'opacity-70 hover:opacity-100',
                    )}
                    onClick={() => scrollTo(i)}
                  >
                    <img src={opt.url} alt={`Cover ${i + 1}`} className="w-full aspect-square object-cover" />
                    {isKept && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                        <Check size={14} />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                      <span className="text-[9px] text-white/80 capitalize">{opt.style}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Nav arrows */}
            {options.length > 1 && (
              <>
                <button
                  onClick={() => scrollTo(Math.max(0, activeIndex - 1))}
                  disabled={activeIndex === 0}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-30 z-10"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => scrollTo(Math.min(options.length - 1, activeIndex + 1))}
                  disabled={activeIndex === options.length - 1}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-30 z-10"
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>

          {/* Keep / status for selected cover */}
          {options[activeIndex] && (
            <div className="flex items-center justify-center gap-2 mt-2">
              {currentCover === options[activeIndex].url ? (
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <Check size={12} /> Current cover
                </span>
              ) : (
                <button
                  onClick={() => keepCover(options[activeIndex].url)}
                  className="text-[10px] px-3 py-1 rounded-full bg-text-primary text-text-inverse font-medium hover:shadow-md transition-all"
                >
                  Use this cover
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show existing cover if no carousel options yet */}
      {!hasOptions && hasAICover && (
        <div className="rounded-xl overflow-hidden shadow-md mb-3 aspect-square max-w-[220px] mx-auto">
          <img src={currentCover} alt="Book cover" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Style selector */}
      <div className="flex flex-wrap gap-1 mb-3">
        {COVER_STYLES.map(s => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={cn(
              'text-[10px] px-2 py-1 rounded-md transition-all',
              style === s.id
                ? 'bg-text-primary text-text-inverse font-medium'
                : 'text-text-tertiary hover:text-text-primary hover:bg-black/5'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all',
          generating
            ? 'bg-purple-50 text-purple-700'
            : 'bg-text-primary text-text-inverse hover:shadow-md'
        )}
      >
        {generating ? (
          <><Loader2 size={14} className="animate-spin" /> Generating cover…</>
        ) : (
          <><ImageIcon size={14} /> {hasOptions ? 'Generate Another' : 'Generate Cover'}</>
        )}
      </button>

      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}
    </div>
  );
}
