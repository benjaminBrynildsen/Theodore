import { useState } from 'react';
import { BookOpen, Sparkles, Loader2, AlertCircle, ThumbsUp, Frown, Zap, HelpCircle } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface ReaderFeedback {
  chapter: number;
  title: string;
  engagement: number; // 0-100
  clarity: number;
  pacing: number;
  notes: { type: 'confused' | 'bored' | 'hooked' | 'surprised' | 'emotional'; text: string; paragraph: number }[];
}

export function FirstReaderAI() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose).sort((a, b) => a.number - b.number) : [];
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [feedback, setFeedback] = useState<ReaderFeedback[] | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const runFirstReader = async () => {
    setReading(true);
    setFeedback(null);
    
    const results: ReaderFeedback[] = [];
    for (let i = 0; i < chapters.length; i++) {
      setProgress(((i + 1) / chapters.length) * 100);
      await new Promise(r => setTimeout(r, 1200));
      
      const ch = chapters[i];
      // Mock feedback — real version sends prose to AI
      results.push({
        chapter: ch.number,
        title: ch.title,
        engagement: 60 + Math.floor(Math.random() * 35),
        clarity: 65 + Math.floor(Math.random() * 30),
        pacing: 55 + Math.floor(Math.random() * 40),
        notes: [
          { type: 'hooked', text: 'Strong opening image. Immediately grounded in the world.', paragraph: 1 },
          { type: 'confused', text: 'The transition between the wall description and Elara\'s thoughts is abrupt. Consider a bridging sentence.', paragraph: 3 },
          { type: 'surprised', text: 'The door appearing — great reveal. The "pulled back" ivy is vivid and unsettling.', paragraph: 2 },
          { type: 'emotional', text: 'The Gardener\'s line "You\'re early" is perfect. Creates instant mystery.', paragraph: 8 },
          { type: 'bored', text: 'The paragraph about her research background slows momentum. Consider trimming to one sentence.', paragraph: 5 },
        ].slice(0, 3 + Math.floor(Math.random() * 3)),
      });
    }
    
    setFeedback(results);
    setReading(false);
    if (results.length > 0) setSelectedChapter(results[0].chapter);
  };

  const noteIcons = {
    confused: HelpCircle, bored: Frown, hooked: Zap, surprised: Sparkles, emotional: ThumbsUp,
  };
  const noteColors = {
    confused: 'text-amber-500 bg-amber-50', bored: 'text-red-400 bg-red-50',
    hooked: 'text-emerald-500 bg-emerald-50', surprised: 'text-purple-500 bg-purple-50',
    emotional: 'text-blue-500 bg-blue-50',
  };

  const selectedFeedback = feedback?.find(f => f.chapter === selectedChapter);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">First Reader AI</h3>
          <p className="text-xs text-text-tertiary">Simulates a fresh reader experiencing your story for the first time.</p>
        </div>
      </div>

      {!feedback && !reading && (
        <div className="text-center py-8">
          <BookOpen size={32} className="mx-auto mb-3 text-text-tertiary" />
          <p className="text-sm text-text-secondary mb-1">Ready to read your manuscript</p>
          <p className="text-xs text-text-tertiary mb-5">{chapters.length} chapters with prose · {chapters.reduce((s, c) => s + c.prose.split(/\s+/).length, 0).toLocaleString()} words</p>
          <button
            onClick={runFirstReader}
            disabled={chapters.length === 0}
            className="px-5 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center gap-2 mx-auto hover:shadow-lg transition-all disabled:opacity-50"
          >
            <Sparkles size={15} /> Start Reading
          </button>
        </div>
      )}

      {reading && (
        <div className="text-center py-8 animate-fade-in">
          <Loader2 size={28} className="mx-auto mb-3 text-text-tertiary animate-spin" />
          <p className="text-sm text-text-secondary mb-2">Reading your manuscript...</p>
          <div className="w-48 h-1.5 bg-black/5 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-text-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-text-tertiary mt-2">Chapter {Math.ceil((progress / 100) * chapters.length)} of {chapters.length}</p>
        </div>
      )}

      {feedback && (
        <div className="animate-fade-in">
          {/* Overall scores */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Engagement', value: Math.round(feedback.reduce((s, f) => s + f.engagement, 0) / feedback.length) },
              { label: 'Clarity', value: Math.round(feedback.reduce((s, f) => s + f.clarity, 0) / feedback.length) },
              { label: 'Pacing', value: Math.round(feedback.reduce((s, f) => s + f.pacing, 0) / feedback.length) },
            ].map(({ label, value }) => (
              <div key={label} className="glass-pill rounded-xl p-3 text-center">
                <div className={cn('text-xl font-mono font-semibold', value >= 80 ? 'text-success' : value >= 60 ? 'text-text-primary' : 'text-warning')}>{value}</div>
                <div className="text-[10px] text-text-tertiary">{label}</div>
              </div>
            ))}
          </div>

          {/* Chapter tabs */}
          <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
            {feedback.map(f => (
              <button
                key={f.chapter}
                onClick={() => setSelectedChapter(f.chapter)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
                  selectedChapter === f.chapter ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-tertiary'
                )}
              >
                Ch.{f.chapter}
              </button>
            ))}
          </div>

          {/* Selected chapter feedback */}
          {selectedFeedback && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">{selectedFeedback.title}</div>
              
              {/* Chapter scores */}
              <div className="flex gap-4 mb-3">
                {[
                  { label: 'Engagement', value: selectedFeedback.engagement },
                  { label: 'Clarity', value: selectedFeedback.clarity },
                  { label: 'Pacing', value: selectedFeedback.pacing },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-black/5 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', value >= 80 ? 'bg-success' : value >= 60 ? 'bg-text-primary' : 'bg-warning')} style={{ width: `${value}%` }} />
                    </div>
                    <span className="text-[10px] text-text-tertiary">{label} {value}</span>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                {selectedFeedback.notes.map((note, i) => {
                  const Icon = noteIcons[note.type];
                  return (
                    <div key={i} className={cn('rounded-xl p-3 flex gap-3', noteColors[note.type])}>
                      <Icon size={14} className="flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs font-medium capitalize mb-0.5">{note.type} — ¶{note.paragraph}</div>
                        <div className="text-xs opacity-80">{note.text}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Re-read button */}
          <button
            onClick={runFirstReader}
            className="mt-4 w-full py-2 rounded-xl glass-pill text-xs text-text-secondary hover:bg-white/60 flex items-center justify-center gap-1.5"
          >
            <Sparkles size={12} /> Re-read (after edits)
          </button>
        </div>
      )}
    </div>
  );
}
