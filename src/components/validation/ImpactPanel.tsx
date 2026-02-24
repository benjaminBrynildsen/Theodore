import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, XCircle, Check, ChevronDown, Shield, X, MessageSquare } from 'lucide-react';
import { useValidationStore } from '../../store/validation';
import { cn } from '../../lib/utils';
import type { ValidationIssue, ValidationSeverity } from '../../lib/validation-engine';

const severityConfig: Record<ValidationSeverity, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  info: { icon: Info, color: 'text-info', bg: 'bg-info/10', label: 'Info' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Warning' },
  error: { icon: AlertCircle, color: 'text-error', bg: 'bg-error/10', label: 'Error' },
  critical: { icon: XCircle, color: 'text-error', bg: 'bg-error/15', label: 'Critical' },
};

function IssueCard({ issue }: { issue: ValidationIssue }) {
  const [expanded, setExpanded] = useState(false);
  const [overrideInput, setOverrideInput] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const { resolveIssue, overrideIssue, dismissIssue } = useValidationStore();

  const config = severityConfig[issue.severity];
  const Icon = config.icon;

  return (
    <div className={cn('rounded-xl overflow-hidden transition-all', config.bg)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/30 transition-colors"
      >
        <Icon size={16} className={cn(config.color, 'mt-0.5 flex-shrink-0')} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{issue.title}</div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {issue.affectedChapterIds.length} chapter{issue.affectedChapterIds.length !== 1 ? 's' : ''} affected
          </div>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', config.bg, config.color)}>
          {config.label}
        </span>
        <ChevronDown size={14} className={cn('text-text-tertiary transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 animate-fade-in">
          {/* Description */}
          <p className="text-sm text-text-secondary mb-3 leading-relaxed">{issue.description}</p>

          {/* Change detail */}
          {issue.oldValue && issue.newValue && (
            <div className="glass-pill rounded-lg p-3 mb-3 text-xs">
              <div className="text-text-tertiary mb-1">Change detected:</div>
              <div className="flex items-center gap-2">
                <span className="line-through text-text-tertiary">{issue.oldValue}</span>
                <span>→</span>
                <span className="font-medium">{issue.newValue}</span>
              </div>
            </div>
          )}

          {/* Suggestion */}
          <div className="flex items-start gap-2 mb-4 text-xs">
            <MessageSquare size={12} className="text-info mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-info">Suggested fix: </span>
              <span className="text-text-secondary">{issue.suggestion}</span>
            </div>
          </div>

          {/* Affected chapters */}
          <div className="mb-4">
            <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">Affected Chapters</div>
            <div className="flex flex-wrap gap-1">
              {issue.affectedChapterIds.slice(0, 15).map((ch) => (
                <span key={ch} className="glass-pill px-2 py-0.5 rounded-md text-xs font-mono">{ch}</span>
              ))}
              {issue.affectedChapterIds.length > 15 && (
                <span className="text-xs text-text-tertiary">+{issue.affectedChapterIds.length - 15} more</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => resolveIssue(issue.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
            >
              <Check size={12} /> Resolve
            </button>
            <button
              onClick={() => setShowOverride(!showOverride)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass-pill text-xs font-medium text-text-secondary hover:bg-white/60 transition-colors"
            >
              Override
            </button>
            <button
              onClick={() => dismissIssue(issue.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-error hover:bg-error/5 transition-colors ml-auto"
            >
              Dismiss
            </button>
          </div>

          {/* Override input */}
          {showOverride && (
            <div className="mt-3 animate-fade-in">
              <input
                type="text"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="Why is this intentional? (logged for continuity)"
                className="w-full px-3 py-2 rounded-lg glass-input text-xs"
              />
              <button
                onClick={() => {
                  if (overrideInput.trim()) {
                    overrideIssue(issue.id, overrideInput.trim());
                    setShowOverride(false);
                    setOverrideInput('');
                  }
                }}
                disabled={!overrideInput.trim()}
                className="mt-2 px-3 py-1.5 rounded-lg bg-text-primary text-text-inverse text-xs font-medium disabled:opacity-30 transition-all"
              >
                Confirm Override
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ImpactPanel() {
  const { issues, showImpactPanel, setShowImpactPanel, resolveIssue } = useValidationStore();
  const unresolvedIssues = issues.filter(i => !i.resolved && !i.overridden);
  const count = unresolvedIssues.length;

  if (!showImpactPanel || count === 0) return null;

  const criticalCount = unresolvedIssues.filter(i => i.severity === 'critical').length;
  const errorCount = unresolvedIssues.filter(i => i.severity === 'error').length;
  const warningCount = unresolvedIssues.filter(i => i.severity === 'warning').length;
  const infoCount = unresolvedIssues.filter(i => i.severity === 'info').length;
  const unresolvedInfoIds = unresolvedIssues.filter(i => i.severity === 'info').map((i) => i.id);

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[420px] max-h-[70vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-black/5 animate-scale-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
        <div className="flex items-center gap-2">
          <Shield size={16} className={criticalCount > 0 || errorCount > 0 ? 'text-error' : 'text-warning'} />
          <h3 className="text-sm font-semibold">Impact Analysis</h3>
          <span className="text-xs glass-pill px-2 py-0.5 rounded-full font-mono">
            {count} issue{count !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setShowImpactPanel(false)}
          className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 px-5 py-2 border-b border-black/5 text-xs">
        {criticalCount > 0 && <span className="text-error font-medium">{criticalCount} critical</span>}
        {errorCount > 0 && <span className="text-error">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
        {warningCount > 0 && <span className="text-warning">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>}
        {infoCount > 0 && <span className="text-info">{infoCount} info</span>}
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Critical first, then errors, warnings, info */}
        {['critical', 'error', 'warning', 'info'].map(severity => 
          unresolvedIssues
            .filter(i => i.severity === severity)
            .map(issue => <IssueCard key={issue.id} issue={issue} />)
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-black/5 text-center">
        <button
          onClick={() => unresolvedInfoIds.forEach((id) => resolveIssue(id))}
          disabled={unresolvedInfoIds.length === 0}
          className={cn(
            'text-xs transition-colors',
            unresolvedInfoIds.length > 0
              ? 'text-text-tertiary hover:text-text-primary'
              : 'text-text-tertiary/40 cursor-not-allowed',
          )}
        >
          Resolve All Info Issues{unresolvedInfoIds.length > 0 ? ' →' : ''}
        </button>
      </div>
    </div>
  );
}
