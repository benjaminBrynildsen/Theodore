import { useState } from 'react';
import { ImageIcon, Loader2, Sparkles, X } from 'lucide-react';
import { generateImageApi, IMAGE_STYLES, ASPECT_RATIOS } from '../../lib/image-gen';
import type { ImageGenOptions } from '../../lib/image-gen';
import { cn } from '../../lib/utils';

interface Props {
  target: 'character' | 'location' | 'scene' | 'cover';
  targetId?: string;
  projectId?: string;
  currentImageUrl?: string | null;
  onImageGenerated?: (imageUrl: string) => void;
  compact?: boolean;
}

export function IllustrateButton({ target, targetId, projectId, currentImageUrl, onImageGenerated, compact }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [style, setStyle] = useState<string>('concept-art');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(currentImageUrl || null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const options: ImageGenOptions = {
        target,
        targetId,
        projectId,
        style: style as any,
        aspectRatio: aspectRatio as any,
      };
      if (customPrompt.trim()) {
        options.prompt = customPrompt.trim();
      }
      const result = await generateImageApi(options);
      setGeneratedImage(result.imageUrl);
      onImageGenerated?.(result.imageUrl);
      setShowOptions(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowOptions(!showOptions)}
          disabled={generating}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
            generating
              ? 'bg-purple-100 text-purple-700'
              : 'text-text-tertiary hover:text-purple-700 hover:bg-purple-50'
          )}
          title="Generate illustration"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
          {generating ? 'Generating...' : 'Illustrate'}
        </button>
        {showOptions && (
          <div className="absolute top-full left-0 mt-2 w-72 z-50 rounded-xl border border-black/10 bg-white shadow-lg p-3 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">AI Illustration</span>
              <button onClick={() => setShowOptions(false)} className="text-text-tertiary hover:text-text-primary"><X size={12} /></button>
            </div>
            <div className="flex flex-wrap gap-1">
              {IMAGE_STYLES.map(s => (
                <button key={s.value} onClick={() => setStyle(s.value)}
                  className={cn('px-2 py-0.5 rounded text-[10px] transition-all',
                    style === s.value ? 'bg-purple-100 text-purple-700 font-medium' : 'text-text-tertiary hover:bg-black/5'
                  )}>{s.label}</button>
              ))}
            </div>
            {error && <div className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">{error}</div>}
            <button onClick={handleGenerate} disabled={generating}
              className={cn('w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                generating ? 'bg-purple-100 text-purple-700' : 'bg-purple-600 text-white hover:bg-purple-700'
              )}>
              {generating ? <><Loader2 size={12} className="animate-spin" /> Generating...</> : <><Sparkles size={12} /> Generate (5 credits)</>}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Current/generated image */}
      {generatedImage && (
        <div className="relative mb-3 rounded-xl overflow-hidden group">
          <img
            src={generatedImage}
            alt="Generated illustration"
            className="w-full h-auto rounded-xl shadow-sm"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button
              onClick={() => setShowOptions(true)}
              className="px-3 py-1.5 rounded-lg bg-white/90 text-xs font-medium text-text-primary shadow-md"
            >
              <Sparkles size={12} className="inline mr-1" />
              Regenerate
            </button>
          </div>
        </div>
      )}

      {/* Generate button */}
      {!generatedImage && !showOptions && (
        <button
          onClick={() => setShowOptions(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 transition-all text-sm font-medium"
        >
          <ImageIcon size={16} />
          Generate Illustration
        </button>
      )}

      {/* Options panel */}
      {showOptions && (
        <div className="rounded-xl border border-black/10 bg-white/80 backdrop-blur-sm p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              <Sparkles size={12} className="inline mr-1 text-purple-500" />
              AI Illustration
            </h4>
            <button onClick={() => setShowOptions(false)} className="text-text-tertiary hover:text-text-primary">
              <X size={14} />
            </button>
          </div>

          {/* Style selector */}
          <div>
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 block">Style</label>
            <div className="flex flex-wrap gap-1">
              {IMAGE_STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] transition-all',
                    style === s.value
                      ? 'bg-purple-100 text-purple-700 font-medium'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-black/5'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 block">Aspect Ratio</label>
            <div className="flex gap-1">
              {ASPECT_RATIOS.map(ar => (
                <button
                  key={ar.value}
                  onClick={() => setAspectRatio(ar.value)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] transition-all',
                    aspectRatio === ar.value
                      ? 'bg-purple-100 text-purple-700 font-medium'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-black/5'
                  )}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom prompt override */}
          <div>
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 block">
              Custom Prompt (optional)
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={`Leave blank to auto-generate from ${target} data...`}
              className="w-full px-3 py-2 rounded-lg bg-black/5 text-xs text-text-primary placeholder:text-text-tertiary/50 resize-none border-none outline-none"
              rows={2}
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
              generating
                ? 'bg-purple-100 text-purple-700'
                : 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-md'
            )}
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generate (5 credits)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
