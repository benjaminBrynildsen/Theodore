import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Play, Pause, RotateCcw, Trophy, Flame, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Duration = 15 | 25 | 45 | 60;

interface SprintRecord {
  id: string;
  date: string;
  duration: number;
  wordsWritten: number;
  wpm: number;
}

const DURATIONS: Duration[] = [15, 25, 45, 60];

const MOCK_HISTORY: SprintRecord[] = [
  { id: '1', date: '2026-02-20 14:30', duration: 25, wordsWritten: 612, wpm: 24.5 },
  { id: '2', date: '2026-02-20 10:00', duration: 15, wordsWritten: 340, wpm: 22.7 },
  { id: '3', date: '2026-02-19 16:15', duration: 45, wordsWritten: 1105, wpm: 24.6 },
  { id: '4', date: '2026-02-19 09:00', duration: 25, wordsWritten: 580, wpm: 23.2 },
  { id: '5', date: '2026-02-18 20:00', duration: 60, wordsWritten: 1520, wpm: 25.3 },
];

export function WritingSprintMode() {
  const [duration, setDuration] = useState<Duration>(25);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [wordCount, setWordCount] = useState(0);
  const [startWordCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [history] = useState<SprintRecord[]>(MOCK_HISTORY);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSeconds = duration * 60;
  const elapsed = totalSeconds - secondsLeft;
  const progress = elapsed / totalSeconds;

  useEffect(() => {
    if (running && !paused) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            setCompleted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, paused]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setSecondsLeft(duration * 60);
    setWordCount(0);
    setRunning(true);
    setPaused(false);
    setCompleted(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleReset = () => {
    setRunning(false);
    setPaused(false);
    setCompleted(false);
    setSecondsLeft(duration * 60);
    setWordCount(0);
  };

  const handleTextChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  };

  const wpm = elapsed > 0 ? ((wordCount / elapsed) * 60).toFixed(1) : '0.0';

  // Streak calc
  const streak = 3; // mock

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 bg-bg flex flex-col'
    : 'flex-1 p-8 overflow-y-auto animate-fade-in';

  return (
    <div className={containerClass}>
      <div className={cn('mx-auto w-full', fullscreen ? 'max-w-4xl flex-1 flex flex-col p-8' : 'max-w-3xl')}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Timer size={20} className="text-text-tertiary" />
              <h2 className="text-2xl font-serif font-semibold">Writing Sprint</h2>
            </div>
            <p className="text-sm text-text-tertiary">Timed sessions. No distractions. Just words.</p>
          </div>
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <div className="flex items-center gap-1.5 glass-pill px-3 py-1.5 text-xs">
                <Flame size={14} className="text-orange-500" />
                <span>{streak}-day streak</span>
              </div>
            )}
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="p-2 rounded-lg hover:bg-black/[0.04] transition-colors"
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {!running && !completed ? (
          /* Setup */
          <div className="space-y-6">
            <div className="glass-subtle rounded-2xl p-6">
              <label className="text-xs font-medium text-text-secondary mb-3 block">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => { setDuration(d); setSecondsLeft(d * 60); }}
                    className={cn(
                      'flex-1 py-4 rounded-xl border transition-all text-center',
                      duration === d
                        ? 'border-black/20 bg-black/[0.04]'
                        : 'border-black/5 hover:border-black/10'
                    )}
                  >
                    <div className="text-2xl font-light">{d}</div>
                    <div className="text-xs text-text-tertiary mt-0.5">min</div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleStart}
                className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-black/90 transition-colors"
              >
                <Play size={16} />
                Start Sprint
              </button>
            </div>

            {/* History */}
            <div className="glass-subtle rounded-2xl p-6">
              <h3 className="text-sm font-medium mb-4">Recent Sprints</h3>
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                    <div>
                      <div className="text-sm">{h.duration} min sprint</div>
                      <div className="text-xs text-text-tertiary">{h.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{h.wordsWritten} words</div>
                      <div className="text-xs text-text-tertiary">{h.wpm} wpm</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-black/5 flex justify-between text-xs text-text-tertiary">
                <span>Total: {history.reduce((s, h) => s + h.wordsWritten, 0).toLocaleString()} words</span>
                <span>Avg: {(history.reduce((s, h) => s + h.wpm, 0) / history.length).toFixed(1)} wpm</span>
              </div>
            </div>
          </div>
        ) : completed ? (
          /* Completed */
          <div className="glass-subtle rounded-2xl p-8 text-center animate-fade-in">
            <Trophy size={48} className="mx-auto mb-4 text-amber-500" />
            <h3 className="text-2xl font-serif font-semibold mb-2">Sprint Complete!</h3>
            <div className="flex justify-center gap-8 my-6">
              <div>
                <div className="text-3xl font-light">{wordCount}</div>
                <div className="text-xs text-text-tertiary">words</div>
              </div>
              <div>
                <div className="text-3xl font-light">{duration}</div>
                <div className="text-xs text-text-tertiary">minutes</div>
              </div>
              <div>
                <div className="text-3xl font-light">{wpm}</div>
                <div className="text-xs text-text-tertiary">wpm</div>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-black text-white rounded-xl hover:bg-black/90 transition-colors"
            >
              New Sprint
            </button>
          </div>
        ) : (
          /* Active sprint */
          <div className="flex-1 flex flex-col">
            {/* Timer bar */}
            <div className="glass-subtle rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-3xl font-light tabular-nums">{formatTime(secondsLeft)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPaused(!paused)}
                      className="p-2 rounded-lg hover:bg-black/[0.04] transition-colors"
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    <button
                      onClick={handleReset}
                      className="p-2 rounded-lg hover:bg-black/[0.04] transition-colors"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-text-tertiary">Words: </span>
                    <span className="font-medium">{wordCount}</span>
                  </div>
                  <div>
                    <span className="text-text-tertiary">WPM: </span>
                    <span className="font-medium">{wpm}</span>
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-black/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all duration-1000"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>

            {/* Writing area */}
            <textarea
              ref={textareaRef}
              onChange={e => handleTextChange(e.target.value)}
              placeholder="Start writing..."
              className={cn(
                'flex-1 min-h-[300px] w-full p-6 rounded-2xl border border-black/5 resize-none',
                'text-lg leading-relaxed font-serif',
                'focus:outline-none focus:border-black/10',
                'placeholder:text-text-tertiary/50'
              )}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}
