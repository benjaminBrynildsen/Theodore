import { useState, useEffect } from 'react';
import { Target, TrendingUp, Calendar, Flame } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface WritingSession {
  date: string;
  words: number;
}

export function WordCountGoals() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id) : [];

  const [dailyGoal, setDailyGoal] = useState(1000);
  const [weeklyGoal, setWeeklyGoal] = useState(5000);
  
  // Mock session data — in production, tracked from actual writing
  const [sessions] = useState<WritingSession[]>([
    { date: '2026-02-21', words: 642 },
    { date: '2026-02-20', words: 1250 },
    { date: '2026-02-19', words: 890 },
    { date: '2026-02-18', words: 0 },
    { date: '2026-02-17', words: 1600 },
    { date: '2026-02-16', words: 450 },
    { date: '2026-02-15', words: 2100 },
  ]);

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.prose ? ch.prose.split(/\s+/).length : 0), 0);
  const todayWords = sessions[0]?.words || 0;
  const weekWords = sessions.reduce((sum, s) => sum + s.words, 0);
  const dailyProgress = Math.min(100, (todayWords / dailyGoal) * 100);
  const weeklyProgress = Math.min(100, (weekWords / weeklyGoal) * 100);
  
  // Streak calculation
  let streak = 0;
  for (const session of sessions) {
    if (session.words > 0) streak++;
    else break;
  }

  const maxDayWords = Math.max(...sessions.map(s => s.words), 1);

  return (
    <div className="p-4 space-y-4">
      {/* Today's Progress Ring */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-black/5" />
            <circle
              cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
              strokeDasharray={`${dailyProgress * 1.76} 176`}
              strokeLinecap="round"
              className={dailyProgress >= 100 ? 'text-success' : 'text-text-primary'}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-mono font-semibold">{todayWords}</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Today</div>
          <div className="text-xs text-text-tertiary">{todayWords.toLocaleString()} / {dailyGoal.toLocaleString()} words</div>
          <div className="flex items-center gap-1.5 mt-1">
            <Flame size={12} className={streak > 0 ? 'text-orange-500' : 'text-text-tertiary'} />
            <span className="text-xs text-text-secondary">{streak} day streak</span>
          </div>
        </div>
      </div>

      {/* Weekly bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">This Week</span>
          <span className="text-xs text-text-tertiary">{weekWords.toLocaleString()} / {weeklyGoal.toLocaleString()}</span>
        </div>
        <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', weeklyProgress >= 100 ? 'bg-success' : 'bg-text-primary')}
            style={{ width: `${weeklyProgress}%` }}
          />
        </div>
      </div>

      {/* Daily sparkline */}
      <div>
        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Last 7 Days</span>
        <div className="flex items-end gap-1 mt-2 h-12">
          {[...sessions].reverse().map((session, i) => {
            const height = (session.words / maxDayWords) * 100;
            const isToday = i === sessions.length - 1;
            const dayLabel = new Date(session.date).toLocaleDateString('en', { weekday: 'narrow' });
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'w-full rounded-sm transition-all',
                    isToday ? 'bg-text-primary' : session.words >= dailyGoal ? 'bg-success/60' : 'bg-black/10'
                  )}
                  style={{ height: `${Math.max(4, height)}%` }}
                />
                <span className="text-[8px] text-text-tertiary">{dayLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project total */}
      <div className="glass-pill rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium">Total Project Words</div>
            <div className="text-lg font-mono font-semibold">{totalWords.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-text-tertiary">Written Chapters</div>
            <div className="text-lg font-mono font-semibold">{chapters.filter(c => c.prose).length}/{chapters.length}</div>
          </div>
        </div>
      </div>

      {/* Goal settings */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Target size={12} className="text-text-tertiary" />
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Goals</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-text-tertiary">Daily</label>
            <input
              type="number"
              value={dailyGoal}
              onChange={e => setDailyGoal(Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded-lg glass-input text-xs font-mono"
              step={100}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-text-tertiary">Weekly</label>
            <input
              type="number"
              value={weeklyGoal}
              onChange={e => setWeeklyGoal(Number(e.target.value))}
              className="w-full mt-0.5 px-2 py-1.5 rounded-lg glass-input text-xs font-mono"
              step={500}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
