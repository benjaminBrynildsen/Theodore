import { Shield, AlertTriangle } from 'lucide-react';
import { useValidationStore } from '../../store/validation';
import { cn } from '../../lib/utils';

export function ValidationBadge() {
  const { getUnresolvedCount, showImpactPanel, setShowImpactPanel } = useValidationStore();
  const count = getUnresolvedCount();

  if (count === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-success glass-pill px-3 py-1.5 rounded-full">
        <Shield size={13} />
        <span>Clean</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowImpactPanel(!showImpactPanel)}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all',
        count > 0 ? 'bg-error/10 text-error hover:bg-error/15' : 'glass-pill text-success'
      )}
    >
      <AlertTriangle size={13} />
      <span>{count} issue{count !== 1 ? 's' : ''}</span>
    </button>
  );
}
