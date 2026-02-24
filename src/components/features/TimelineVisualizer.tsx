import { useState } from 'react';
import { Calendar, Plus, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { cn, generateId } from '../../lib/utils';

interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  chapter: string;
  description: string;
  type: 'plot' | 'backstory' | 'worldbuilding' | 'character';
  conflict?: string; // conflict with another event
}

const TYPE_STYLES: Record<string, string> = {
  plot: 'bg-blue-500',
  backstory: 'bg-amber-500',
  worldbuilding: 'bg-purple-500',
  character: 'bg-emerald-500',
};

const TYPE_BADGE: Record<string, string> = {
  plot: 'bg-blue-100 text-blue-700',
  backstory: 'bg-amber-100 text-amber-700',
  worldbuilding: 'bg-purple-100 text-purple-700',
  character: 'bg-emerald-100 text-emerald-700',
};

const MOCK_EVENTS: TimelineEvent[] = [
  { id: 'e1', title: 'Verdant Accord Signed', date: '1247 CE', chapter: 'Backstory', description: 'The three ruling houses sign the garden truce, establishing sacred groves as neutral ground.', type: 'worldbuilding' },
  { id: 'e2', title: 'Roothold Grown', date: '1250 CE', chapter: 'Backstory', description: 'The Gardeners establish their living headquarters at the convergence of the three territories.', type: 'worldbuilding' },
  { id: 'e3', title: 'Ashbloom Incident', date: '1439 CE', chapter: 'Backstory', description: 'House Valdris violates the Accord by burning the infected Grove of Whispers.', type: 'plot' },
  { id: 'e4', title: 'Library Founded', date: '1847 CE', chapter: 'Backstory', description: 'Harrowgate Library is built over the garden entrance. Founding charter conceals the cipher key.', type: 'worldbuilding' },
  { id: 'e5', title: 'Doorway Sealed', date: '~1970 CE', chapter: 'Ch 1', description: 'Someone seals the passage behind shelf R-17 with newer mortar.', type: 'plot' },
  { id: 'e6', title: 'Eleanor Hired', date: '2023', chapter: 'Backstory', description: 'Eleanor Chen begins working at Harrowgate Library as an archivist.', type: 'character' },
  { id: 'e7', title: 'Crack Discovered', date: 'Feb 2026', chapter: 'Ch 1', description: 'Eleanor notices the hairline crack behind shelf R-17 and discovers the sealed doorway.', type: 'plot' },
  { id: 'e8', title: 'Garden Found', date: 'Feb 2026', chapter: 'Ch 2', description: 'Eleanor descends and discovers the underground garden with bioluminescent moss.', type: 'plot' },
  { id: 'e9', title: 'Marcus Confrontation', date: 'Feb 2026', chapter: 'Ch 3', description: 'Marcus reveals he knew about the garden. Claims the board of directors also knows.', type: 'character' },
  { id: 'e10', title: 'First Door Opened', date: 'Feb 2026', chapter: 'Ch 4', description: 'The cipher is decoded using the founding charter. The Alderman Codex is missing.', type: 'plot', conflict: 'Marcus claims never reading the charter but knows the cipher location.' },
  { id: 'e11', title: 'Codex Removed', date: 'Feb 2026?', chapter: 'Ch 4', description: 'Someone removed the Alderman Codex recently — cologne scent detected.', type: 'plot', conflict: 'Timing unclear: before or after Eleanor found the passage?' },
];

export function TimelineVisualizer() {
  const [events, setEvents] = useState<TimelineEvent[]>(MOCK_EVENTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const filtered = filterType ? events.filter(e => e.type === filterType) : events;
  const conflicts = events.filter(e => e.conflict);

  const handleScanConflicts = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 2000);
  };

  const addEvent = () => {
    const nextIndex = events.length + 1;
    const entry: TimelineEvent = {
      id: generateId(),
      title: `New Event ${nextIndex}`,
      date: 'TBD',
      chapter: 'Draft',
      description: 'Describe what happens and why it matters to continuity.',
      type: 'plot',
    };
    setEvents((prev) => [...prev, entry]);
    setSelectedId(entry.id);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Calendar size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Timeline Visualizer</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          Chronological event map — drag to reorder, detect temporal inconsistencies
        </p>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex gap-1">
            <button
              onClick={() => setFilterType(null)}
              className={cn('px-3 py-1.5 rounded-xl text-xs transition-all', !filterType ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10')}
            >
              All ({events.length})
            </button>
            {Object.entries(TYPE_BADGE).map(([type, style]) => (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? null : type)}
                className={cn('px-3 py-1.5 rounded-xl text-xs capitalize transition-all', filterType === type ? style : 'bg-black/5 hover:bg-black/10')}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {conflicts.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle size={12} /> {conflicts.length} conflicts
            </span>
          )}
          <button
            onClick={handleScanConflicts}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-xl text-xs hover:bg-black/90 transition-colors disabled:opacity-50"
          >
            {scanning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Scan Conflicts
          </button>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[120px] top-0 bottom-0 w-px bg-black/10" />

          <div className="space-y-1">
            {filtered.map((event) => (
              <div key={event.id} className="flex items-start group">
                {/* Date */}
                <div className="w-[110px] flex-shrink-0 text-right pr-4 pt-3">
                  <span className="text-xs text-text-tertiary">{event.date}</span>
                </div>

                {/* Dot */}
                <div className="relative flex-shrink-0 w-3 pt-3.5">
                  <div className={cn('w-3 h-3 rounded-full border-2 border-white', TYPE_STYLES[event.type])} />
                </div>

                {/* Card */}
                <button
                  onClick={() => setSelectedId(selectedId === event.id ? null : event.id)}
                  className={cn(
                    'flex-1 ml-4 text-left rounded-xl p-3 transition-all',
                    selectedId === event.id ? 'glass-subtle' : 'hover:bg-black/[0.02]',
                    event.conflict && 'border-l-2 border-amber-400'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{event.title}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] capitalize', TYPE_BADGE[event.type])}>
                      {event.type}
                    </span>
                    <span className="text-[10px] text-text-tertiary">{event.chapter}</span>
                    {event.conflict && <AlertTriangle size={12} className="text-amber-500" />}
                  </div>

                  {selectedId === event.id && (
                    <div className="mt-2 animate-fade-in">
                      <p className="text-sm text-text-secondary">{event.description}</p>
                      {event.conflict && (
                        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
                          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                          <span>{event.conflict}</span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Add event */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={addEvent}
            className="flex items-center gap-1.5 px-4 py-2 border border-dashed border-black/10 rounded-xl text-xs text-text-tertiary hover:border-black/20 hover:text-text-secondary transition-colors"
          >
            <Plus size={12} /> Add Event
          </button>
        </div>
      </div>
    </div>
  );
}
