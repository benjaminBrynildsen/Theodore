import { useMemo } from 'react';
import { Coins, Zap, BookOpen, Users, MapPin, FileText, AlertTriangle, Info } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useCanonStore } from '../../store/canon';
import { useStore } from '../../store';
import { useSettingsStore } from '../../store/settings';
import { cn } from '../../lib/utils';
import type { CreditAction } from '../../types/credits';

interface Props {
  chapterId: string;
  action: CreditAction;
  onConfirm: () => void;
  onCancel: () => void;
}

interface BudgetLine {
  label: string;
  tokens: number;
  icon: typeof Coins;
  detail?: string;
}

function tokensToCredits(tokens: number): number {
  return Math.max(1, Math.ceil(tokens / 1000));
}

export function TokenBudget({ chapterId, action, onConfirm, onCancel }: Props) {
  const { plan, canAfford } = useCreditsStore();
  const { entries } = useCanonStore();
  const { chapters, getActiveProject } = useStore();
  const { settings } = useSettingsStore();
  const project = getActiveProject();

  const chapter = chapters.find(c => c.id === chapterId);
  const projectCanon = entries.filter(e => e.projectId === project?.id);
  const referencedCanon = projectCanon.filter(e => chapter?.referencedCanonIds?.includes(e.id));

  const budget = useMemo((): BudgetLine[] => {
    const lines: BudgetLine[] = [];

    // System prompt + writing rules (cached after first call)
    lines.push({
      label: 'System prompt + writing rules',
      tokens: 480,
      icon: FileText,
      detail: 'Cached — free after first generation',
    });

    // Canon context
    const canonTokens = referencedCanon.length * 150; // ~150 tokens per summary
    lines.push({
      label: `Canon context (${referencedCanon.length} entries)`,
      tokens: canonTokens || 100,
      icon: Users,
      detail: referencedCanon.map(e => e.name).join(', ') || 'No referenced entries',
    });

    // Previous chapter context
    const prevChapter = chapters
      .filter(c => c.projectId === project?.id && c.number < (chapter?.number || 0))
      .sort((a, b) => b.number - a.number)[0];
    if (prevChapter?.prose) {
      lines.push({
        label: 'Previous chapter summary',
        tokens: 280,
        icon: BookOpen,
        detail: `Ch. ${prevChapter.number}: "${prevChapter.title}"`,
      });
    }

    // Chapter premise + outline
    if (chapter?.premise) {
      const premiseTokens = Math.ceil(JSON.stringify(chapter.premise).length / 4);
      lines.push({
        label: 'Chapter premise + outline',
        tokens: Math.min(premiseTokens, 300),
        icon: MapPin,
      });
    }

    // Narrative controls + settings
    lines.push({
      label: 'Narrative controls + style',
      tokens: 200,
      icon: Zap,
      detail: `Tone, pacing, ${settings.writingStyle.emDashUsage ? 'em dashes on' : 'no em dashes'}`,
    });

    // Output generation budget
    const outputTokens = action === 'generate-chapter-full' ? 3000 
      : action === 'generate-dialogue' ? 1500
      : action === 'polish-rewrite' ? 2000
      : action === 'generate-chapter-outline' ? 800
      : 1000;
    lines.push({
      label: 'Generation output',
      tokens: outputTokens,
      icon: Coins,
      detail: `~${Math.round(outputTokens * 0.75)} words`,
    });

    return lines;
  }, [chapter, referencedCanon, project, settings, action]);

  const totalTokens = budget.reduce((sum, line) => sum + line.tokens, 0);
  const estimatedCredits = Math.ceil(totalTokens / 1000);
  const affordable = canAfford(estimatedCredits);

  const actionLabels: Record<string, string> = {
    'generate-chapter-full': 'Write Full Chapter',
    'generate-dialogue': 'Dialogue First',
    'generate-action-skeleton': 'Action Skeleton',
    'generate-chapter-outline': 'Scene Outline',
    'polish-rewrite': 'Polish & Rewrite',
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Coins size={14} className="text-text-tertiary" />
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Credit Budget</span>
        </div>
        <span className="text-xs text-text-tertiary">{actionLabels[action] || action}</span>
      </div>

      {/* Budget breakdown */}
      <div className="glass-pill rounded-xl overflow-hidden mb-3">
        {budget.map((line, i) => (
          <div key={i} className={cn('flex items-center gap-2.5 px-3 py-2', i > 0 && 'border-t border-black/5')}>
            <line.icon size={12} className="text-text-tertiary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-secondary truncate">{line.label}</div>
              {line.detail && <div className="text-[10px] text-text-tertiary truncate">{line.detail}</div>}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-semibold text-text-primary">~{tokensToCredits(line.tokens)} cr</div>
              <div className="text-[10px] font-mono text-text-tertiary">{line.tokens.toLocaleString()} tok</div>
            </div>
          </div>
        ))}

        {/* Total */}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-black/10 bg-black/[0.02]">
          <span className="text-xs font-semibold">Total</span>
          <div className="text-right">
            <span className="text-xs font-semibold">{estimatedCredits} credits</span>
            <span className="text-[10px] text-text-tertiary ml-2">≈ {totalTokens.toLocaleString()} tokens</span>
          </div>
        </div>
      </div>

      {/* Credit balance */}
      <div className={cn(
        'rounded-xl p-3 mb-3 flex items-center justify-between',
        affordable ? 'bg-success/5 border border-success/10' : 'bg-error/5 border border-error/10'
      )}>
        <div>
          <div className="text-xs font-medium">{`${plan.creditsRemaining.toLocaleString()} credits remaining`}</div>
          <div className="text-[10px] text-text-tertiary">
            {`${plan.creditsUsed.toLocaleString()} / ${plan.creditsTotal.toLocaleString()} used this month`}
          </div>
        </div>
        {!affordable && (
          <div className="flex items-center gap-1 text-error text-xs">
            <AlertTriangle size={12} />
            Insufficient
          </div>
        )}
      </div>

      {/* Prompt caching note */}
      <div className="flex items-start gap-2 mb-3 px-1">
        <Info size={11} className="text-text-tertiary mt-0.5 flex-shrink-0" />
        <span className="text-[10px] text-text-tertiary leading-relaxed">
          System prompt + writing rules are cached between calls. Repeated generations in the same session use ~50% fewer input tokens.
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl glass-pill text-xs text-text-secondary hover:bg-white/60">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!affordable}
          className={cn(
            'flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all',
            affordable ? 'bg-text-primary text-text-inverse hover:shadow-md' : 'bg-black/10 text-text-tertiary cursor-not-allowed'
          )}
        >
          <Zap size={12} />
          Generate ({estimatedCredits} cr)
        </button>
      </div>
    </div>
  );
}
