// ========== Direction Tag Picker ==========
// Simple inline picker for inserting [direction] tags into prose

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { DIRECTION_TAG_GROUPS } from '../../lib/direction-tagger';
import { cn } from '../../lib/utils';

interface Props {
  onInsert: (tag: string) => void;
  onClose: () => void;
  position?: { x: number; y: number } | null;
}

const QUICK_TAGS = [
  'sighs', 'laughs', 'gasps', 'scoffs', 'chuckles', 'clears throat',
  'whispering', 'shouting', 'pause', 'dramatic pause',
  'sarcastic', 'angry', 'tender', 'nervous', 'confident',
];

export function DirectionTagPicker({ onInsert, onClose }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="mt-2 p-3 bg-white rounded-xl border border-black/10 shadow-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-text-secondary">Insert Direction</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5"><X size={12} /></button>
      </div>

      {/* Quick tags */}
      <div className="flex flex-wrap gap-1">
        {QUICK_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => { onInsert(tag); onClose(); }}
            className="px-2 py-1 rounded-md text-[11px] font-medium bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100 transition-colors"
          >
            [{tag}]
          </button>
        ))}
      </div>

      {/* Show all */}
      {!showAll ? (
        <button onClick={() => setShowAll(true)} className="text-[10px] text-text-tertiary hover:text-text-secondary">
          Show all tags →
        </button>
      ) : (
        <div className="space-y-2 pt-1 border-t border-black/5">
          {Object.entries(DIRECTION_TAG_GROUPS).map(([group, tags]) => (
            <div key={group}>
              <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">{group}</div>
              <div className="flex flex-wrap gap-1">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => { onInsert(tag); onClose(); }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100 transition-colors"
                  >
                    [{tag}]
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom input */}
      <form
        onSubmit={e => { e.preventDefault(); if (custom.trim()) { onInsert(custom.trim().toLowerCase()); onClose(); } }}
        className="flex items-center gap-2 pt-1 border-t border-black/5"
      >
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Custom tag..."
          className="flex-1 text-xs px-2 py-1 bg-black/[0.03] rounded-md outline-none"
        />
        {custom.trim() && (
          <button type="submit" className="text-[10px] font-medium px-2 py-1 bg-fuchsia-100 text-fuchsia-600 rounded hover:bg-fuchsia-200">
            [{custom.trim()}]
          </button>
        )}
      </form>
    </div>
  );
}
