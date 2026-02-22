import { useState } from 'react';
import { AlertTriangle, Sparkles, Loader2, Check, ChevronDown, ChevronUp, Shield, Crosshair, HelpCircle } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type Severity = 'critical' | 'warning' | 'info';
type IssueType = 'contradiction' | 'unresolved' | 'chekhov' | 'timeline' | 'logic';

interface PlotIssue {
  id: string;
  title: string;
  type: IssueType;
  severity: Severity;
  description: string;
  chapters: string[];
  suggestion: string;
  resolved: boolean;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

const TYPE_LABELS: Record<IssueType, { label: string; icon: typeof AlertTriangle }> = {
  contradiction: { label: 'Contradiction', icon: AlertTriangle },
  unresolved: { label: 'Unresolved Thread', icon: HelpCircle },
  chekhov: { label: "Chekhov's Gun", icon: Crosshair },
  timeline: { label: 'Timeline Issue', icon: AlertTriangle },
  logic: { label: 'Logic Gap', icon: Shield },
};

const MOCK_ISSUES: PlotIssue[] = [
  {
    id: '1', title: 'Marcus claims he never read the founding charter',
    type: 'contradiction', severity: 'critical',
    description: 'In Chapter 3, Marcus insists he\'s never read the library\'s founding charter of 1847. However, in Chapter 4, he guides Eleanor directly to the exact passage containing the cipher key — knowledge that would require familiarity with the document.',
    chapters: ['Ch 3: The Archivist\'s Secret', 'Ch 4: The First Door'],
    suggestion: 'Either establish that Marcus is lying (add a tell or later revelation), or change his claim to "I\'ve only skimmed it" to reduce the contradiction.',
    resolved: false,
  },
  {
    id: '2', title: 'The cologne scent in the sealed chamber',
    type: 'chekhov', severity: 'warning',
    description: 'Chapter 4 introduces "the faint scent of modern cologne" in the sealed preservation chamber, implying someone recently entered. This detail is never followed up on or explained in subsequent chapters.',
    chapters: ['Ch 4: The First Door'],
    suggestion: 'This is a strong hook — connect it to a character reveal. Consider having Eleanor recognize the scent later, or have it match a character introduced in the next chapter.',
    resolved: false,
  },
  {
    id: '3', title: 'Missing Alderman Codex — no investigation',
    type: 'unresolved', severity: 'critical',
    description: 'The gap in the shelving where the Alderman Codex should be is presented as a major discovery, but Eleanor doesn\'t investigate further, report it, or even mention it in subsequent chapters.',
    chapters: ['Ch 4: The First Door'],
    suggestion: 'Add a reaction scene: Eleanor should at minimum discuss this with Marcus, check the library\'s checkout records, or attempt to trace who accessed the chamber.',
    resolved: false,
  },
  {
    id: '4', title: 'Board of Directors awareness',
    type: 'unresolved', severity: 'warning',
    description: 'Marcus says "Because they already know" about the garden, but this revelation is dropped without further exploration. Who on the board knows? Why do they keep it secret? What are the implications?',
    chapters: ['Ch 3: The Archivist\'s Secret'],
    suggestion: 'Seed this thread with a board meeting scene, or have Eleanor encounter evidence of board involvement (memos, restricted files, a board member visiting the garden).',
    resolved: false,
  },
  {
    id: '5', title: 'Bioluminescent moss ecosystem',
    type: 'logic', severity: 'info',
    description: 'The underground garden sustains plants from "different continents and different centuries" lit only by bioluminescent moss. While this is fantastical, no mechanism is suggested for how the plants survive without sunlight or proper soil composition.',
    chapters: ['Ch 2: The Garden Below'],
    suggestion: 'If the magic system supports this, add a line about the "hum" being a magical sustaining force. If aiming for realism, acknowledge the impossibility as part of the mystery.',
    resolved: false,
  },
  {
    id: '6', title: 'Three doors but only one explored',
    type: 'chekhov', severity: 'info',
    description: 'Three cipher-locked doors are established in Chapter 2, but only the first is opened. The other two represent significant unexplored story threads.',
    chapters: ['Ch 2: The Garden Below', 'Ch 4: The First Door'],
    suggestion: 'This is likely intentional pacing. Ensure the remaining doors are addressed in upcoming chapters and that their contents differ meaningfully from the first.',
    resolved: false,
  },
];

export function PlotHoleDetector() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [issues, setIssues] = useState<PlotIssue[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | null>(null);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setIssues(MOCK_ISSUES);
      setScanned(true);
      setScanning(false);
    }, 3000);
  };

  const toggleResolved = (id: string) => {
    setIssues(issues.map(i => i.id === id ? { ...i, resolved: !i.resolved } : i));
  };

  const filtered = issues.filter(i => {
    if (filterSeverity && i.severity !== filterSeverity) return false;
    return true;
  });

  const criticalCount = issues.filter(i => i.severity === 'critical' && !i.resolved).length;
  const warningCount = issues.filter(i => i.severity === 'warning' && !i.resolved).length;
  const resolvedCount = issues.filter(i => i.resolved).length;

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <p>Open a project to scan for plot holes</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Crosshair size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Plot Hole Detector</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          AI scans for contradictions, unresolved threads, and Chekhov's guns that never fire
        </p>

        {!scanned ? (
          <div className="glass-subtle rounded-2xl p-8 text-center">
            <Crosshair size={48} strokeWidth={1} className="mx-auto mb-4 text-text-tertiary opacity-40" />
            <h3 className="text-lg font-serif mb-2">Deep Scan Your Manuscript</h3>
            <p className="text-sm text-text-tertiary mb-6 max-w-md mx-auto">
              Reads every chapter and cross-references plot elements, character claims, timeline events, and setup/payoff patterns
            </p>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-6 py-3 bg-black text-white rounded-xl hover:bg-black/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {scanning ? (
                <><Loader2 size={16} className="animate-spin" /> Scanning manuscript...</>
              ) : (
                <><Sparkles size={16} /> Scan for Plot Holes</>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="flex gap-4">
              <div className="flex-1 glass-subtle rounded-2xl p-4 text-center">
                <div className="text-2xl font-light text-red-600">{criticalCount}</div>
                <div className="text-xs text-text-tertiary">Critical</div>
              </div>
              <div className="flex-1 glass-subtle rounded-2xl p-4 text-center">
                <div className="text-2xl font-light text-amber-600">{warningCount}</div>
                <div className="text-xs text-text-tertiary">Warnings</div>
              </div>
              <div className="flex-1 glass-subtle rounded-2xl p-4 text-center">
                <div className="text-2xl font-light text-emerald-600">{resolvedCount}</div>
                <div className="text-xs text-text-tertiary">Resolved</div>
              </div>
              <div className="flex-1 glass-subtle rounded-2xl p-4 text-center">
                <div className="text-2xl font-light">{issues.length}</div>
                <div className="text-xs text-text-tertiary">Total</div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterSeverity(null)}
                className={cn('px-3 py-1.5 rounded-xl text-xs transition-all', !filterSeverity ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10')}
              >
                All ({issues.length})
              </button>
              {(['critical', 'warning', 'info'] as Severity[]).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterSeverity(filterSeverity === s ? null : s)}
                  className={cn('px-3 py-1.5 rounded-xl text-xs capitalize transition-all', filterSeverity === s ? SEVERITY_STYLES[s] : 'bg-black/5 hover:bg-black/10')}
                >
                  {s} ({issues.filter(i => i.severity === s).length})
                </button>
              ))}
            </div>

            {/* Issues */}
            <div className="space-y-3">
              {filtered.map(issue => {
                const expanded = expandedId === issue.id;
                const typeInfo = TYPE_LABELS[issue.type];
                return (
                  <div
                    key={issue.id}
                    className={cn(
                      'rounded-2xl border transition-all overflow-hidden',
                      issue.resolved ? 'border-emerald-200 bg-emerald-50/30' : 'border-black/5 glass-subtle'
                    )}
                  >
                    <button
                      onClick={() => setExpandedId(expanded ? null : issue.id)}
                      className="w-full flex items-start gap-3 p-4 text-left"
                    >
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] border mt-0.5', SEVERITY_STYLES[issue.severity])}>
                        {issue.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-sm font-medium', issue.resolved && 'line-through text-text-tertiary')}>
                          {issue.title}
                        </div>
                        <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-2">
                          <typeInfo.icon size={10} />
                          <span>{typeInfo.label}</span>
                          <span>·</span>
                          <span>{issue.chapters.join(', ')}</span>
                        </div>
                      </div>
                      {expanded ? <ChevronUp size={16} className="text-text-tertiary mt-1" /> : <ChevronDown size={16} className="text-text-tertiary mt-1" />}
                    </button>

                    {expanded && (
                      <div className="px-4 pb-4 space-y-3 animate-fade-in">
                        <div className="text-sm text-text-secondary leading-relaxed pl-[68px]">
                          {issue.description}
                        </div>
                        <div className="ml-[68px] p-3 rounded-xl bg-black/[0.03] border border-black/5">
                          <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">Suggestion</div>
                          <div className="text-sm text-text-secondary">{issue.suggestion}</div>
                        </div>
                        <div className="pl-[68px]">
                          <button
                            onClick={() => toggleResolved(issue.id)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all',
                              issue.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-black/5 hover:bg-black/10'
                            )}
                          >
                            <Check size={12} />
                            {issue.resolved ? 'Resolved' : 'Mark Resolved'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Re-scan */}
            <button
              onClick={handleScan}
              disabled={scanning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-black/10 rounded-xl text-sm hover:bg-black/[0.02] transition-colors disabled:opacity-50"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Re-scan Manuscript
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
