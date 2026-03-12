// ========== Emotional X-Ray Overlay ==========
// Visualizes scene emotional metadata: color bands, intensity heatmap, transitions, music status

import { useState } from 'react';
import { Activity, Loader2, Music, Zap, ArrowRight } from 'lucide-react';
import { useStore } from '../../store';
import { useMusicStore } from '../../store/music';
import { cn } from '../../lib/utils';
import { EMOTION_COLORS, TEMPO_BPM } from '../../types/music';
import type { SceneEmotionalMetadata, EmotionCategory } from '../../types/music';
import type { Scene } from '../../types';

interface Props {
  chapterId: string;
}

function EmotionPill({ emotion, size = 'sm' }: { emotion: EmotionCategory; size?: 'sm' | 'md' }) {
  const color = EMOTION_COLORS[emotion] || '#888';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium capitalize',
        size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      )}
      style={{ backgroundColor: color + '20', color, border: `1px solid ${color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {emotion}
    </span>
  );
}

function IntensityBar({ value }: { value: number }) {
  const hue = 240 - (value / 100) * 240; // 240=blue, 0=red
  return (
    <div className="w-full h-1.5 rounded-full bg-black/5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${value}%`, backgroundColor: `hsl(${hue}, 70%, 50%)` }}
      />
    </div>
  );
}

function TransitionMarker({ smoothness }: { smoothness?: number }) {
  if (smoothness == null) return null;
  const label = smoothness >= 70 ? 'Smooth' : smoothness >= 30 ? 'Shift' : 'Jarring';
  const color = smoothness >= 70 ? 'text-green-600 bg-green-50' : smoothness >= 30 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return (
    <div className="flex items-center justify-center py-1">
      <span className={cn('text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', color)}>
        <ArrowRight size={8} className="inline mr-0.5" />
        {label} ({smoothness})
      </span>
    </div>
  );
}

function SceneEmotionCard({ scene, metadata, index }: { scene: Scene; metadata: SceneEmotionalMetadata; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const musicStore = useMusicStore();
  const hasTrack = !!musicStore.getSceneTracks(scene.id);
  const startColor = EMOTION_COLORS[metadata.arc.start] || '#888';
  const endColor = EMOTION_COLORS[metadata.arc.end] || '#888';

  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Emotion gradient bar on left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
        style={{ background: `linear-gradient(to bottom, ${startColor}, ${endColor})` }}
      />

      <div className="pl-4 pr-3 py-2.5 glass-pill">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
            Scene {scene.order}
          </span>
          <span className="text-[11px] font-medium text-text-primary truncate flex-1">
            {scene.title}
          </span>
          <div className="flex items-center gap-1">
            {hasTrack && <Music size={10} className="text-green-500" />}
            <span className="text-[9px] text-text-tertiary">
              {metadata.confidence}%
            </span>
          </div>
        </div>

        {/* Emotion pills */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <EmotionPill emotion={metadata.primaryEmotion} />
          {metadata.secondaryEmotion && <EmotionPill emotion={metadata.secondaryEmotion} />}
          <span className="text-[9px] text-text-tertiary ml-auto">
            {TEMPO_BPM[metadata.tempo]?.label || metadata.tempo}
          </span>
        </div>

        {/* Intensity bar */}
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-text-tertiary font-semibold uppercase w-12">
            {metadata.intensity}/100
          </span>
          <div className="flex-1">
            <IntensityBar value={metadata.intensity} />
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-2.5 border-t border-black/5 space-y-2 animate-fade-in">
            {/* Arc */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold text-text-tertiary uppercase w-10">Arc</span>
              <EmotionPill emotion={metadata.arc.start} size="md" />
              <ArrowRight size={10} className="text-text-tertiary" />
              <EmotionPill emotion={metadata.arc.end} size="md" />
            </div>

            {/* Pivot */}
            {metadata.arc.pivot && (
              <div className="flex items-start gap-2">
                <span className="text-[9px] font-semibold text-text-tertiary uppercase w-10">Pivot</span>
                <div>
                  <EmotionPill emotion={metadata.arc.pivot.emotion} size="md" />
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    at {metadata.arc.pivot.position}% — {metadata.arc.pivot.trigger}
                  </p>
                </div>
              </div>
            )}

            {/* Mood tags */}
            {metadata.moodTags.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-[9px] font-semibold text-text-tertiary uppercase w-10">Mood</span>
                <div className="flex flex-wrap gap-1">
                  {metadata.moodTags.map((tag, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-black/5 text-text-secondary">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Genre + music prompt */}
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-semibold text-text-tertiary uppercase w-10">Music</span>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-medium text-text-primary capitalize">
                  {metadata.suggestedGenre}
                </span>
                {metadata.musicPrompt && (
                  <p className="text-[9px] text-text-tertiary mt-0.5 leading-relaxed line-clamp-2">
                    {metadata.musicPrompt}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmotionalXRay({ chapterId }: Props) {
  const { chapters, emotionAnalyzing, analyzeChapterEmotions } = useStore();
  const chapter = chapters.find(c => c.id === chapterId);

  if (!chapter) return null;

  const scenes = (chapter.scenes || []).filter(s => s.prose?.trim()).sort((a, b) => a.order - b.order);
  const analyzedScenes = scenes.filter(s => s.emotionalMetadata);
  const hasData = analyzedScenes.length > 0;

  // Build chapter emotion timeline data
  const timelineEmotions = analyzedScenes.map(s => ({
    sceneId: s.id,
    order: s.order,
    start: s.emotionalMetadata!.arc.start,
    end: s.emotionalMetadata!.arc.end,
    intensity: s.emotionalMetadata!.intensity,
  }));

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-purple-500" />
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Emotional X-Ray</span>
        </div>
        <button
          onClick={() => analyzeChapterEmotions(chapterId)}
          disabled={emotionAnalyzing || scenes.length === 0}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
            emotionAnalyzing
              ? 'bg-black/5 text-text-tertiary'
              : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.97]'
          )}
        >
          {emotionAnalyzing ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Zap size={11} />
          )}
          {emotionAnalyzing ? 'Analyzing...' : hasData ? 'Re-analyze' : 'Analyze Scenes'}
        </button>
      </div>

      {/* Stats bar */}
      {hasData && (
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
          <span>{analyzedScenes.length}/{scenes.length} scenes analyzed</span>
          <span>·</span>
          <span>
            Dominant: {getMostCommonEmotion(analyzedScenes)}
          </span>
        </div>
      )}

      {/* Chapter emotion timeline */}
      {timelineEmotions.length >= 2 && (
        <div className="rounded-xl glass-pill p-3">
          <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            Chapter Emotion Flow
          </div>
          <div className="flex items-center gap-0.5 h-6">
            {timelineEmotions.map((e, i) => {
              const startColor = EMOTION_COLORS[e.start] || '#888';
              const endColor = EMOTION_COLORS[e.end] || '#888';
              const opacity = 0.3 + (e.intensity / 100) * 0.7;
              return (
                <div
                  key={e.sceneId}
                  className="flex-1 h-full rounded-sm transition-all"
                  style={{
                    background: `linear-gradient(to right, ${startColor}, ${endColor})`,
                    opacity,
                  }}
                  title={`Scene ${e.order}: ${e.start} → ${e.end} (${e.intensity}%)`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Scene cards */}
      {hasData ? (
        <div className="space-y-1">
          {scenes.map((scene, i) => {
            const metadata = scene.emotionalMetadata;
            if (!metadata) return (
              <div key={scene.id} className="glass-pill rounded-xl px-3 py-2 text-[10px] text-text-tertiary italic">
                Scene {scene.order}: {scene.title} — not analyzed
              </div>
            );

            return (
              <div key={scene.id}>
                {i > 0 && metadata.transitionSmoothness != null && (
                  <TransitionMarker smoothness={metadata.transitionSmoothness} />
                )}
                <SceneEmotionCard scene={scene} metadata={metadata} index={i} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <Activity size={24} className="text-purple-300 mx-auto mb-2" />
          <p className="text-sm text-text-secondary font-medium">No emotional data yet</p>
          <p className="text-xs text-text-tertiary mt-1">
            {scenes.length > 0
              ? 'Click "Analyze Scenes" to generate emotional metadata for each scene.'
              : 'Write some scenes first, then analyze their emotional arc.'}
          </p>
        </div>
      )}
    </div>
  );
}

function getMostCommonEmotion(scenes: Scene[]): string {
  const counts: Record<string, number> = {};
  for (const s of scenes) {
    const e = s.emotionalMetadata?.primaryEmotion;
    if (e) counts[e] = (counts[e] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'unknown';
}
