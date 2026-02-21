import { cn } from '../../lib/utils';
import type { ChapterStatus } from '../../types';

const statusConfig: Record<ChapterStatus, { label: string; className: string }> = {
  'premise-only': { label: 'Premise', className: 'bg-accent-subtle text-accent' },
  'draft-generated': { label: 'Draft', className: 'bg-info/10 text-info' },
  'human-edited': { label: 'Edited', className: 'bg-success/10 text-success' },
  'canon-locked': { label: 'Locked', className: 'bg-text-primary/10 text-text-primary' },
  'out-of-alignment': { label: 'Misaligned', className: 'bg-error/10 text-error' },
};

interface BadgeProps {
  status?: ChapterStatus;
  label?: string;
  className?: string;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error';
}

export function Badge({ status, label, className, variant = 'default' }: BadgeProps) {
  if (status) {
    const config = statusConfig[status];
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.className, className)}>
        {config.label}
      </span>
    );
  }

  const variantClasses = {
    default: 'bg-bg-hover text-text-secondary',
    accent: 'bg-accent-subtle text-accent',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  };

  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variantClasses[variant], className)}>
      {label}
    </span>
  );
}
