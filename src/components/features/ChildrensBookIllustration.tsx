import { useState } from 'react';
import { ImageIcon, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { generateImageApi } from '../../lib/image-gen';
import { useCreditsStore } from '../../store/credits';
import { useSettingsStore } from '../../store/settings';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface Props {
  chapterId: string;
  projectId: string;
  imageUrl: string | null | undefined;
  onImageGenerated: (imageUrl: string) => void;
}

/**
 * Children's book page illustration. Calls /api/generate/image with
 * provider='openai' (gpt-image-1, gated to publisher tier server-side).
 *
 * Visibility is controlled at the call site by checking:
 *   - project.subtype === 'childrens-book'
 *   - settings.beta.childrensBookImages
 *   - plan.tier === 'publisher'
 *
 * The button is hidden entirely if the user isn't on publisher tier so they
 * don't see something they can't use.
 */
export function ChildrensBookIllustration({ chapterId, projectId, imageUrl, onImageGenerated }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = useSettingsStore((s) => s.settings);
  const planTier = useCreditsStore((s) => s.plan.tier);

  const enabled = settings.beta?.childrensBookImages && planTier === 'publisher';
  if (!enabled) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateImageApi({
        target: 'page',
        targetId: chapterId,
        projectId,
        provider: 'openai',
        aspectRatio: '1:1',
        style: 'illustration',
      });
      // Update credit display
      if (result.creditsUsed != null) {
        useCreditsStore.getState().recordUsage({
          action: 'generate-image',
          creditsUsed: result.creditsUsed,
          tokensInput: 0,
          tokensOutput: 0,
          model: 'gpt-image-1',
          creditsRemaining: result.creditsRemaining ?? null,
        });
      }
      onImageGenerated(result.imageUrl);
      // Persist the new imageUrl to the chapter immediately
      useStore.getState().updateChapter(chapterId, { imageUrl: result.imageUrl });
    } catch (e: any) {
      setError(e?.message || 'Image generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="my-6">
      {imageUrl ? (
        <div className="relative group rounded-2xl overflow-hidden shadow-lg">
          <img src={imageUrl} alt="Page illustration" className="w-full h-auto" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-xl bg-white/95 text-sm font-semibold text-text-primary shadow-md flex items-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Regenerating…
                </>
              ) : (
                <>
                  <RotateCcw size={14} /> Regenerate
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-8 rounded-2xl border-2 border-dashed transition-all',
            generating
              ? 'border-purple-300 bg-purple-50 text-purple-700 cursor-wait'
              : 'border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400',
          )}
        >
          {generating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span className="font-medium">Generating illustration…</span>
            </>
          ) : (
            <>
              <ImageIcon size={18} />
              <span className="font-medium">Generate Page Illustration</span>
              <span className="text-xs opacity-60">· 25 credits</span>
              <Sparkles size={12} className="opacity-60" />
            </>
          )}
        </button>
      )}
      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}
    </div>
  );
}
