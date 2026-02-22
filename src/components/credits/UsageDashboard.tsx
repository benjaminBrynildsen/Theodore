import { useState, useMemo } from 'react';
import { BarChart3, Coins, TrendingUp, Clock, Zap, ArrowUpRight, Calendar } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { cn } from '../../lib/utils';
import type { CreditAction } from '../../types/credits';

type TimeRange = '7d' | '30d' | 'all';

export function UsageDashboard() {
  const { plan, transactions } = useCreditsStore();
  const [range, setRange] = useState<TimeRange>('30d');

  // Mock some historical transactions for the demo
  const allTransactions = useMemo(() => {
    if (transactions.length > 0) return transactions;
    // Seed demo data
    const now = Date.now();
    const day = 86400000;
    return [
      { id: '1', action: 'plan-project' as CreditAction, creditsUsed: 8, tokensInput: 5200, tokensOutput: 2800, model: 'claude-sonnet', projectId: 'demo-1', timestamp: new Date(now - 2 * day).toISOString() },
      { id: '2', action: 'generate-premise' as CreditAction, creditsUsed: 3, tokensInput: 1800, tokensOutput: 1200, model: 'claude-sonnet', projectId: 'demo-1', chapterId: 'ch-1', timestamp: new Date(now - 2 * day + 300000).toISOString() },
      { id: '3', action: 'generate-chapter-full' as CreditAction, creditsUsed: 22, tokensInput: 8500, tokensOutput: 13500, model: 'claude-sonnet', projectId: 'demo-1', chapterId: 'ch-1', timestamp: new Date(now - day).toISOString() },
      { id: '4', action: 'canon-validation' as CreditAction, creditsUsed: 2, tokensInput: 1500, tokensOutput: 500, model: 'claude-sonnet', projectId: 'demo-1', timestamp: new Date(now - day + 60000).toISOString() },
      { id: '5', action: 'generate-dialogue' as CreditAction, creditsUsed: 10, tokensInput: 4200, tokensOutput: 5800, model: 'claude-sonnet', projectId: 'demo-1', chapterId: 'ch-1', timestamp: new Date(now - day + 3600000).toISOString() },
      { id: '6', action: 'polish-rewrite' as CreditAction, creditsUsed: 14, tokensInput: 6800, tokensOutput: 7200, model: 'claude-opus', projectId: 'demo-1', chapterId: 'ch-1', timestamp: new Date(now - 3600000).toISOString() },
      { id: '7', action: 'chat-message' as CreditAction, creditsUsed: 2, tokensInput: 1200, tokensOutput: 800, model: 'claude-sonnet', projectId: 'demo-1', timestamp: new Date(now - 1800000).toISOString() },
      { id: '8', action: 'red-team-review' as CreditAction, creditsUsed: 4, tokensInput: 2800, tokensOutput: 1200, model: 'claude-sonnet', projectId: 'demo-1', chapterId: 'ch-1', timestamp: new Date(now - 600000).toISOString() },
    ];
  }, [transactions]);

  const filteredTx = allTransactions.filter(tx => {
    if (range === 'all') return true;
    const days = range === '7d' ? 7 : 30;
    return Date.now() - new Date(tx.timestamp).getTime() < days * 86400000;
  });

  const totalCredits = filteredTx.reduce((s, t) => s + t.creditsUsed, 0);
  const totalInputTokens = filteredTx.reduce((s, t) => s + t.tokensInput, 0);
  const totalOutputTokens = filteredTx.reduce((s, t) => s + t.tokensOutput, 0);

  // Usage by action type
  const byAction = useMemo(() => {
    const map = new Map<CreditAction, number>();
    for (const tx of filteredTx) {
      map.set(tx.action, (map.get(tx.action) || 0) + tx.creditsUsed);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([action, credits]) => ({ action, credits }));
  }, [filteredTx]);

  // Daily usage for bar chart
  const dailyUsage = useMemo(() => {
    const days = range === '7d' ? 7 : range === '30d' ? 14 : 30;
    const map = new Map<string, number>();
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().split('T')[0];
      map.set(d, 0);
    }
    for (const tx of filteredTx) {
      const d = tx.timestamp.split('T')[0];
      if (map.has(d)) map.set(d, map.get(d)! + tx.creditsUsed);
    }
    return [...map.entries()].map(([date, credits]) => ({ date, credits }));
  }, [filteredTx, range]);

  const maxDay = Math.max(...dailyUsage.map(d => d.credits), 1);

  const usagePercent = plan.creditsTotal > 0 ? (plan.creditsUsed / plan.creditsTotal) * 100 : 0;
  const daysLeft = plan.renewsAt ? Math.ceil((new Date(plan.renewsAt).getTime() - Date.now()) / 86400000) : null;

  const actionLabels: Record<string, string> = {
    'chat-message': 'Chat',
    'generate-premise': 'Premise',
    'generate-chapter-full': 'Full Chapter',
    'generate-chapter-outline': 'Outline',
    'generate-dialogue': 'Dialogue',
    'generate-action-skeleton': 'Action',
    'polish-rewrite': 'Polish',
    'canon-validation': 'Validation',
    'red-team-review': 'Red Team',
    'plan-project': 'Planning',
  };

  const actionColors: Record<string, string> = {
    'generate-chapter-full': 'bg-purple-500',
    'polish-rewrite': 'bg-blue-500',
    'generate-dialogue': 'bg-emerald-500',
    'plan-project': 'bg-amber-500',
    'red-team-review': 'bg-red-400',
    'canon-validation': 'bg-cyan-500',
    'chat-message': 'bg-gray-400',
    'generate-premise': 'bg-indigo-400',
  };

  return (
    <div className="space-y-5">
      {/* Plan overview bar */}
      <div className="glass-pill rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold capitalize">{plan.tier} Plan</div>
            <div className="text-xs text-text-tertiary">
              {plan.tier === 'byok' ? 'Unlimited — using your API key' : `${plan.creditsRemaining.toLocaleString()} credits remaining`}
            </div>
          </div>
          {daysLeft !== null && (
            <div className="text-right">
              <div className="text-xs text-text-tertiary">Renews in</div>
              <div className="text-sm font-mono font-semibold">{daysLeft} days</div>
            </div>
          )}
        </div>

        {plan.tier !== 'byok' && (
          <>
            {/* Usage bar */}
            <div className="w-full h-3 bg-black/5 rounded-full overflow-hidden mb-2">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  usagePercent > 90 ? 'bg-error' : usagePercent > 70 ? 'bg-warning' : 'bg-text-primary'
                )}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-tertiary">
              <span>{plan.creditsUsed.toLocaleString()} used</span>
              <span>{plan.creditsTotal.toLocaleString()} total</span>
            </div>

            {/* Projected usage alert */}
            {usagePercent > 60 && daysLeft && daysLeft > 7 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-warning bg-warning/5 rounded-lg px-3 py-2">
                <TrendingUp size={13} />
                At current pace, you'll use your credits {daysLeft > 15 ? 'before renewal' : `in ~${Math.ceil(daysLeft * (100 / usagePercent))} days`}.
              </div>
            )}
          </>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-pill rounded-xl p-3 text-center">
          <div className="text-lg font-mono font-semibold">{totalCredits}</div>
          <div className="text-[10px] text-text-tertiary">Credits Used</div>
        </div>
        <div className="glass-pill rounded-xl p-3 text-center">
          <div className="text-lg font-mono font-semibold">{filteredTx.length}</div>
          <div className="text-[10px] text-text-tertiary">API Calls</div>
        </div>
        <div className="glass-pill rounded-xl p-3 text-center">
          <div className="text-lg font-mono font-semibold">{((totalInputTokens + totalOutputTokens) / 1000).toFixed(1)}k</div>
          <div className="text-[10px] text-text-tertiary">Total Tokens</div>
        </div>
      </div>

      {/* Time range */}
      <div className="flex gap-1">
        {(['7d', '30d', 'all'] as TimeRange[]).map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={cn('flex-1 py-1.5 rounded-xl text-xs font-medium transition-all',
              range === r ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-tertiary'
            )}>
            {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'All Time'}
          </button>
        ))}
      </div>

      {/* Daily bar chart */}
      <div>
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Daily Usage</div>
        <div className="flex items-end gap-[3px] h-20">
          {dailyUsage.map((day, i) => {
            const h = (day.credits / maxDay) * 100;
            const isToday = i === dailyUsage.length - 1;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                  <div className="bg-text-primary text-text-inverse text-[9px] px-2 py-1 rounded-lg whitespace-nowrap shadow-lg">
                    {new Date(day.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}: {day.credits} cr
                  </div>
                </div>
                <div
                  className={cn(
                    'w-full rounded-sm transition-all',
                    isToday ? 'bg-text-primary' : day.credits > 0 ? 'bg-black/15' : 'bg-black/5'
                  )}
                  style={{ height: `${Math.max(2, h)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Usage by action */}
      <div>
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">By Action</div>
        <div className="space-y-1.5">
          {byAction.map(({ action, credits }) => {
            const pct = totalCredits > 0 ? (credits / totalCredits) * 100 : 0;
            return (
              <div key={action} className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', actionColors[action] || 'bg-gray-300')} />
                <span className="text-xs text-text-secondary flex-1">{actionLabels[action] || action}</span>
                <span className="text-xs font-mono text-text-tertiary">{credits} cr</span>
                <div className="w-16 h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', actionColors[action] || 'bg-gray-300')} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Recent Activity</div>
        <div className="space-y-1">
          {filteredTx.slice(-8).reverse().map(tx => (
            <div key={tx.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/[0.02] transition-colors">
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', actionColors[tx.action] || 'bg-gray-300')} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-secondary truncate">{actionLabels[tx.action] || tx.action}</div>
                <div className="text-[10px] text-text-tertiary">{tx.model} · {(tx.tokensInput + tx.tokensOutput).toLocaleString()} tokens</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-mono font-medium">{tx.creditsUsed} cr</div>
                <div className="text-[9px] text-text-tertiary">
                  {new Date(tx.timestamp).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
