import { useState } from 'react';
import { GitCompare, ChevronDown, Plus, Minus, Equal } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  lineNumber: { old?: number; new?: number };
  text: string;
}

interface VersionInfo {
  id: string;
  label: string;
  date: string;
  wordCount: number;
}

const MOCK_VERSIONS: VersionInfo[] = [
  { id: 'v3', label: 'Current Draft', date: '2026-02-20', wordCount: 2847 },
  { id: 'v2', label: 'Second Draft', date: '2026-02-18', wordCount: 2612 },
  { id: 'v1', label: 'First Draft', date: '2026-02-15', wordCount: 2203 },
];

const MOCK_DIFF: DiffLine[] = [
  { type: 'unchanged', lineNumber: { old: 1, new: 1 }, text: 'Eleanor Chen had spent three years cataloguing the restricted archives of Harrowgate Library,' },
  { type: 'removed', lineNumber: { old: 2 }, text: 'but it was a water stain that changed everything. Following the moisture behind shelf R-17,' },
  { type: 'added', lineNumber: { new: 2 }, text: 'but it was a hairline crack in the plaster that changed everything. Following the fracture behind shelf R-17,' },
  { type: 'unchanged', lineNumber: { old: 3, new: 3 }, text: 'she discovered that what she\'d assumed was a load-bearing wall was actually a sealed doorway,' },
  { type: 'removed', lineNumber: { old: 4 }, text: 'its mortar newer than the surrounding stonework by at least fifty years.' },
  { type: 'added', lineNumber: { new: 4 }, text: 'its mortar conspicuously newer than the surrounding stonework — fifty years at most, she guessed, running her thumb along the join.' },
  { type: 'unchanged', lineNumber: { old: 5, new: 5 }, text: '' },
  { type: 'unchanged', lineNumber: { old: 6, new: 6 }, text: 'Behind it lay a descending staircase, its steps worn smooth by feet that had walked them' },
  { type: 'removed', lineNumber: { old: 7 }, text: 'long before the library was built.' },
  { type: 'added', lineNumber: { new: 7 }, text: 'long before the library was built. The air that seeped through smelled of damp earth and something' },
  { type: 'added', lineNumber: { new: 8 }, text: 'older — a green, living scent that had no business existing three stories underground.' },
  { type: 'unchanged', lineNumber: { old: 8, new: 9 }, text: '' },
  { type: 'added', lineNumber: { new: 10 }, text: 'She stood at the top of the stairs for a long time, her phone flashlight cutting a white wedge' },
  { type: 'added', lineNumber: { new: 11 }, text: 'into the darkness below. Every protocol she\'d been trained on said to report this. Call security.' },
  { type: 'added', lineNumber: { new: 12 }, text: 'Fill out a form. Let someone else decide.' },
  { type: 'added', lineNumber: { new: 13 }, text: '' },
  { type: 'added', lineNumber: { new: 14 }, text: 'Eleanor descended.' },
  { type: 'unchanged', lineNumber: { old: 9, new: 15 }, text: '' },
  { type: 'unchanged', lineNumber: { old: 10, new: 16 }, text: 'The underground garden defied every expectation. Bioluminescent moss covered the vaulted ceiling,' },
];

export function ManuscriptComparison() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id) : [];

  const [leftVersion, setLeftVersion] = useState('v2');
  const [rightVersion, setRightVersion] = useState('v3');
  const [selectedChapter, setSelectedChapter] = useState(0);
  const [showUnchanged, setShowUnchanged] = useState(true);

  const leftInfo = MOCK_VERSIONS.find(v => v.id === leftVersion)!;
  const rightInfo = MOCK_VERSIONS.find(v => v.id === rightVersion)!;

  const added = MOCK_DIFF.filter(d => d.type === 'added').length;
  const removed = MOCK_DIFF.filter(d => d.type === 'removed').length;
  const wordDiff = rightInfo.wordCount - leftInfo.wordCount;

  const displayedDiff = showUnchanged ? MOCK_DIFF : MOCK_DIFF.filter(d => d.type !== 'unchanged');

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <GitCompare size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Manuscript Comparison</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          Track changes between drafts — see what evolved
        </p>

        {/* Version selectors */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">From</label>
            <select
              value={leftVersion}
              onChange={e => setLeftVersion(e.target.value)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm"
            >
              {MOCK_VERSIONS.map(v => (
                <option key={v.id} value={v.id}>{v.label} — {v.date}</option>
              ))}
            </select>
          </div>
          <div className="pt-5 text-text-tertiary">→</div>
          <div className="flex-1">
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">To</label>
            <select
              value={rightVersion}
              onChange={e => setRightVersion(e.target.value)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-sm"
            >
              {MOCK_VERSIONS.map(v => (
                <option key={v.id} value={v.id}>{v.label} — {v.date}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Chapter tabs */}
        {chapters.length > 0 && (
          <div className="flex gap-1 mb-4 overflow-x-auto">
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChapter(i)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all',
                  selectedChapter === i ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'
                )}
              >
                Ch {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Stats bar */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <Plus size={12} /> {added} added
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <Minus size={12} /> {removed} removed
          </span>
          <span className="text-text-tertiary">
            Net: {wordDiff > 0 ? '+' : ''}{wordDiff} words
          </span>
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-text-tertiary cursor-pointer">
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={e => setShowUnchanged(e.target.checked)}
              className="accent-black"
            />
            Show unchanged
          </label>
        </div>

        {/* Diff view */}
        <div className="glass-subtle rounded-2xl overflow-hidden">
          <div className="font-mono text-sm">
            {displayedDiff.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'flex border-b border-black/[0.03] last:border-0',
                  line.type === 'added' && 'bg-emerald-50',
                  line.type === 'removed' && 'bg-red-50',
                  line.type === 'unchanged' && 'bg-transparent',
                )}
              >
                {/* Line numbers */}
                <div className="w-10 flex-shrink-0 text-right pr-2 py-1.5 text-[10px] text-text-tertiary select-none border-r border-black/5">
                  {line.lineNumber.old || ''}
                </div>
                <div className="w-10 flex-shrink-0 text-right pr-2 py-1.5 text-[10px] text-text-tertiary select-none border-r border-black/5">
                  {line.lineNumber.new || ''}
                </div>

                {/* Indicator */}
                <div className={cn(
                  'w-6 flex-shrink-0 flex items-center justify-center py-1.5 text-xs',
                  line.type === 'added' && 'text-emerald-600',
                  line.type === 'removed' && 'text-red-500',
                )}>
                  {line.type === 'added' && '+'}
                  {line.type === 'removed' && '−'}
                </div>

                {/* Content */}
                <div className={cn(
                  'flex-1 py-1.5 px-2 text-xs leading-relaxed',
                  line.type === 'added' && 'text-emerald-800',
                  line.type === 'removed' && 'text-red-700 line-through',
                  line.type === 'unchanged' && 'text-text-secondary',
                )}>
                  {line.text || '\u00A0'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
