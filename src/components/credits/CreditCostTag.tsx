import { Coins } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { CREDIT_COSTS, type CreditAction } from '../../types/credits';
import { cn } from '../../lib/utils';

interface Props {
  action: CreditAction;
  className?: string;
  showRange?: boolean;
}

export function CreditCostTag({ action, className, showRange = false }: Props) {
  const { canAfford, plan } = useCreditsStore();
  const cost = CREDIT_COSTS[action];
  const affordable = canAfford(cost.typical);
  const isByok = plan.tier === 'byok';

  if (isByok) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        affordable ? 'text-text-tertiary' : 'text-error',
        className
      )}
    >
      <Coins size={10} />
      {showRange ? (
        <span>~{cost.min}-{cost.max}</span>
      ) : (
        <span>~{cost.typical}</span>
      )}
    </span>
  );
}
