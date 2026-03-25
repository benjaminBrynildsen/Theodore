// ========== Direction Tag Picker ==========
// Floating picker that lets users manually insert [direction] tags into prose
// Appears on text selection or via a toolbar button

import { useState, useRef, useEffect } from 'react';
import { Mic, X, Search } from 'lucide-react';
import { DIRECTION_TAG_GROUPS } from '../../lib/direction-tagger';
import { cn } from '../../lib/utils';

interface Props {
  onInsert: (tag: string) => void;
  onClose: () => void;
  position?: { x: number; y: number } | null;
}

const GROUP_ICONS: Record<string, string> = {
  'Vocal Actions': '🎭',
  'Emotions': '💭',
  'Delivery': '🎙️',
  'Pacing': '⏱️',
};

const TAG_DESCRIPTIONS: Record<string, string> = {
  'sighs': 'Resigned, tired, frustrated exhale',
  'laughs': 'Genuine laughter',
  'scoffs': 'Dismissive, disbelieving',
  'gasps': 'Shock, surprise, fear',
  'clears throat': 'Awkward pause, getting attention',
  'chuckles': 'Soft, amused laugh',
  'snickers': 'Sneaky, mocking laugh',
  'cries': 'Crying, emotional',
  'sobs': 'Heavy crying, grief',
  'groans': 'Pain, frustration, annoyance',
  'yawns': 'Boredom, tiredness',
  'whispering': 'Quiet, secretive delivery',
  'shouting': 'Loud, forceful delivery',
  'monotone': 'Flat, emotionless delivery',
  'dramatic': 'Theatrical, intense delivery',
  'deadpan': 'Dry, flat humor',
  'gentle': 'Soft, caring delivery',
  'urgent': 'Rushed, time-sensitive delivery',
  'hesitant': 'Uncertain, careful delivery',
  'confident': 'Strong, assured delivery',
  'nervous': 'Anxious, shaky delivery',
  'cold': 'Distant, detached delivery',
  'warm': 'Friendly, affectionate delivery',
  'pause': 'Brief silence',
  'dramatic pause': 'Extended silence for effect',
  'slowly': 'Deliberately slow pacing',
  'quickly': 'Fast, rushed pacing',
  'thoughtful': 'Contemplative, measured pacing',
};

export function DirectionTagPicker({ onInsert, onClose, position }: Props) {
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string>('Vocal Actions');
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const allTags = Object.entries(DIRECTION_TAG_GROUPS).flatMap(([group, tags]) =>
    tags.map(tag => ({ tag, group }))
  );

  const filtered = search.trim()
    ? allTags.filter(({ tag }) => tag.toLowerCase().includes(search.toLowerCase()))
    : allTags.filter(({ group }) => group === activeGroup);

  const style: React.CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, zIndex: 9999 }
    : {};

  return (
    <div
      ref={containerRef}
      className="w-72 bg-white rounded-xl shadow-2xl border border-black/10 overflow-hidden"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/5">
        <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
          <Mic size={12} />
          Insert Direction Tag
        </span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5">
          <X size={12} className="text-text-tertiary" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-black/5">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-black/[0.03] rounded-lg">
          <Search size={11} className="text-text-tertiary" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tags..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-text-tertiary/50"
          />
        </div>
      </div>

      {/* Group tabs (hidden when searching) */}
      {!search.trim() && (
        <div className="flex px-2 pt-2 gap-1 overflow-x-auto">
          {Object.keys(DIRECTION_TAG_GROUPS).map(group => (
            <button
              key={group}
              onClick={() => setActiveGroup(group)}
              className={cn(
                'px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-all',
                activeGroup === group
                  ? 'bg-fuchsia-100 text-fuchsia-700'
                  : 'bg-black/[0.03] text-text-tertiary hover:bg-black/[0.06]'
              )}
            >
              {GROUP_ICONS[group]} {group}
            </button>
          ))}
        </div>
      )}

      {/* Tag list */}
      <div className="max-h-56 overflow-y-auto p-2 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-[10px] text-text-tertiary text-center py-4">No matching tags</p>
        )}
        {filtered.map(({ tag, group }) => (
          <button
            key={tag}
            onClick={() => {
              onInsert(tag);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-fuchsia-50 transition-colors text-left group"
          >
            <span className="text-xs font-semibold text-fuchsia-600 group-hover:text-fuchsia-700">
              [{tag}]
            </span>
            <span className="text-[10px] text-text-tertiary truncate flex-1">
              {TAG_DESCRIPTIONS[tag] || ''}
            </span>
            {search.trim() && (
              <span className="text-[9px] text-text-tertiary/50">{group}</span>
            )}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="px-3 py-2 border-t border-black/5">
        <form
          onSubmit={e => {
            e.preventDefault();
            const custom = search.trim();
            if (custom) {
              onInsert(custom.toLowerCase());
              onClose();
            }
          }}
          className="flex items-center gap-1.5"
        >
          <span className="text-[10px] text-text-tertiary">Custom:</span>
          <span className="text-[10px] text-fuchsia-600 font-medium">[{search || '...'}]</span>
          {search.trim() && (
            <button
              type="submit"
              className="ml-auto text-[10px] font-medium px-2 py-0.5 bg-fuchsia-100 text-fuchsia-600 rounded hover:bg-fuchsia-200"
            >
              Insert
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
