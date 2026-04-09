import { useState, useRef, useCallback } from 'react';
import { ImageIcon, Loader2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useStore } from '../../store';
import { useGenerationStore } from '../../store/generation';
import { generateImageApi } from '../../lib/image-gen';
import { cn } from '../../lib/utils';

const COVER_STYLES = [
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'illustrated', label: 'Illustrated' },
  { id: 'dark', label: 'Dark & Moody' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'bold', label: 'Bold Graphic' },
] as const;

/**
 * Composites the book title onto a background image using Canvas.
 * Returns a base64 data URL of the final cover (1024x1024 square).
 */
async function compositeTitle(
  backgroundUrl: string,
  title: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Draw background, scaled to cover the square
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

      // Bottom gradient overlay for text readability
      const grad = ctx.createLinearGradient(0, size * 0.55, 0, size);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Title text — auto-size to fit, max 3 lines
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      const maxWidth = size * 0.82;
      const words = title.split(/\s+/);

      let fontSize = 72;
      let lines: string[] = [];
      for (; fontSize >= 28; fontSize -= 2) {
        ctx.font = `800 ${fontSize}px Georgia, serif`;
        lines = [];
        let currentLine = '';
        for (const word of words) {
          const test = currentLine ? `${currentLine} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = test;
          }
        }
        if (currentLine) lines.push(currentLine);
        if (lines.length <= 3) break;
      }

      const lineHeight = fontSize * 1.15;
      const totalHeight = lines.length * lineHeight;
      const startY = size - 80 - totalHeight + fontSize;

      for (let i = 0; i < lines.length; i++) {
        ctx.font = `800 ${fontSize}px Georgia, serif`;
        ctx.fillText(lines[i], size / 2, startY + i * lineHeight);
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load cover background'));
    img.src = backgroundUrl;
  });
}

interface CoverOption {
  url: string;       // composited cover URL (uploaded)
  style: string;     // which style was used
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
  const [options, setOptions] = useState<CoverOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
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

      const result = await generateImageApi({
        target: 'cover',
        projectId,
        aspectRatio: '1:1',
        style: style as any,
        provider: 'openai',
        prompt: chapterHints ? `Story context: ${chapterHints}` : undefined,
      });

      useGenerationStore.getState().setSubtitle('Adding title…');

      const composited = await compositeTitle(result.imageUrl, project.title);

      const uploadRes = await fetch('/api/upload/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image: composited, projectId }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

      const newOption: CoverOption = { url: uploadData.coverUrl, style };
      setOptions(prev => {
        const next = [...prev, newOption];
        // Auto-select the new one
        setActiveIndex(next.length - 1);
        return next;
      });

      // Auto-keep the first generated cover; subsequent ones are browseable
      if (options.length === 0) {
        updateProject(projectId, { coverUrl: uploadData.coverUrl });
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
