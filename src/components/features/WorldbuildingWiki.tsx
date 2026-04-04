import { useState } from 'react';
import { Globe2, Plus, Search, Link2, Sparkles, Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import { cn, generateId } from '../../lib/utils';

interface WikiEntry {
  id: string;
  title: string;
  category: 'lore' | 'history' | 'magic' | 'culture' | 'geography' | 'technology' | 'faction' | 'custom';
  content: string;
  links: string[]; // ids of linked entries
  tags: string[];
  lastEdited: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  lore: 'bg-purple-100 text-purple-700',
  history: 'bg-amber-100 text-amber-700',
  magic: 'bg-blue-100 text-blue-700',
  culture: 'bg-emerald-100 text-emerald-700',
  geography: 'bg-teal-100 text-teal-700',
  technology: 'bg-slate-100 text-slate-700',
  faction: 'bg-red-100 text-red-700',
  custom: 'bg-gray-100 text-gray-600',
};

const MOCK_ENTRIES: WikiEntry[] = [
  {
    id: 'w1', title: 'The Verdant Accord', category: 'history',
    content: 'The Verdant Accord was signed in the Year of Falling Stars (1247 CE) between the three ruling houses of the Thornlands. It established the Garden Truce — a cessation of hostilities centered around the sacred groves that dotted the borderlands.\n\nThe Accord specified that no armed force could enter within a league of any registered grove, and that the Gardeners (a newly created neutral order) would maintain these spaces as sanctuaries for diplomacy and healing.\n\nThe treaty held for nearly two centuries before the Ashbloom Incident shattered the fragile peace.',
    links: ['w2', 'w3'], tags: ['treaty', 'thornlands', 'peace'], lastEdited: '2026-02-20',
  },
  {
    id: 'w2', title: 'The Gardeners', category: 'faction',
    content: 'A neutral order established by the Verdant Accord to maintain the sacred groves. Members renounce all house allegiances upon initiation and take vows of botanical stewardship.\n\nTheir knowledge of plant-based magic is unmatched, and they serve as mediators in disputes between the houses. Their headquarters is the Roothold, a living structure grown from an ancient oak.',
    links: ['w1', 'w4'], tags: ['faction', 'neutral', 'magic'], lastEdited: '2026-02-19',
  },
  {
    id: 'w3', title: 'The Ashbloom Incident', category: 'history',
    content: 'In 1439 CE, a rare parasitic flower known as Ashbloom appeared in the Grove of Whispers. The Gardeners quarantined the area, but House Valdris sent soldiers to burn the infected trees, violating the Verdant Accord.\n\nThe resulting conflict lasted three days and killed the Grove — the first sacred space lost since the Accord was signed. This event is widely considered the beginning of the end for the garden truce.',
    links: ['w1', 'w2'], tags: ['conflict', 'grove', 'ashbloom'], lastEdited: '2026-02-18',
  },
  {
    id: 'w4', title: 'Roothold', category: 'geography',
    content: 'The living headquarters of the Gardeners, located at the convergence of the three house territories. Roothold is not built but grown — its walls are woven branches, its floors are packed earth over root networks, and its highest tower is the still-living crown of a 400-year-old oak.\n\nThe structure responds to the will of the Head Gardener, opening passages and sealing rooms as needed.',
    links: ['w2'], tags: ['location', 'magic', 'gardeners'], lastEdited: '2026-02-17',
  },
  {
    id: 'w5', title: 'Thornblood Magic', category: 'magic',
    content: 'The dominant magical tradition of the Thornlands, Thornblood magic draws power from living plant matter. Practitioners form symbiotic bonds with specific plant species, gaining abilities related to that plant\'s properties.\n\nRose-bonded mages can manipulate thorns and create barriers. Willow-bonded can heal and bend perception. Oak-bonded gain physical resilience and structural magic. The rarest bond — Ashbloom — grants power over decay and transformation.',
    links: ['w2', 'w3'], tags: ['magic', 'system', 'thornlands'], lastEdited: '2026-02-20',
  },
];

export function WorldbuildingWiki() {
  const [entries, setEntries] = useState<WikiEntry[]>(MOCK_ENTRIES);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [generating, setGenerating] = useState(false);

  const activeEntry = entries.find(e => e.id === activeId);

  const filtered = entries.filter(e => {
    if (filterCat && e.category !== filterCat) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getLinkedEntries = (ids: string[]) => entries.filter(e => ids.includes(e.id));

  const handleAddEntry = () => {
    const newEntry: WikiEntry = {
      id: generateId(),
      title: 'New Entry',
      category: 'custom',
      content: '',
      links: [],
      tags: [],
      lastEdited: new Date().toISOString().split('T')[0],
    };
    setEntries([newEntry, ...entries]);
    setActiveId(newEntry.id);
    setEditing(true);
    setEditContent('');
  };

  const handleAutoGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const newEntry: WikiEntry = {
        id: generateId(),
        title: 'The Bloom Cycles',
        category: 'lore',
        content: 'Every seven years, the sacred groves undergo a Bloom Cycle — a period of accelerated growth and magical intensification lasting exactly thirteen days. During this time, Thornblood bonds strengthen dramatically, and new bonds can be formed with species that are otherwise dormant.\n\nThe Gardeners consider Bloom Cycles sacred and restrict all access to the groves during these periods. Historical records suggest that the most powerful practitioners in Thornlands history formed their bonds during Bloom Cycles.\n\nThe next cycle is predicted for the spring equinox — a fact that has not gone unnoticed by House Valdris.',
        links: ['w2', 'w5'],
        tags: ['lore', 'magic', 'cycles'],
        lastEdited: new Date().toISOString().split('T')[0],
      };
      setEntries([newEntry, ...entries]);
      setActiveId(newEntry.id);
      setGenerating(false);
    }, 2500);
  };

  const handleSave = () => {
    if (!activeEntry) return;
    setEntries(entries.map(e => e.id === activeId ? { ...e, content: editContent, lastEdited: new Date().toISOString().split('T')[0] } : e));
    setEditing(false);
  };

  const categories = Object.keys(CATEGORY_COLORS);

  return (
    <div className="flex-1 flex overflow-hidden animate-fade-in">
      {/* Sidebar: entry list */}
      <div className="w-72 flex-shrink-0 border-r border-black/5 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <Globe2 size={18} className="text-text-tertiary" />
          <h2 className="text-lg font-serif font-semibold">World Wiki</h2>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full glass-input pl-8 pr-3 py-2 rounded-xl text-sm"
          />
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-1 mb-4">
          <button
            onClick={() => setFilterCat(null)}
            className={cn('px-2 py-0.5 rounded-full text-[10px] transition-all', !filterCat ? 'bg-black text-white' : 'bg-black/5 text-text-tertiary hover:bg-black/10')}
          >
            All
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilterCat(filterCat === c ? null : c)}
              className={cn('px-2 py-0.5 rounded-full text-[10px] capitalize transition-all', filterCat === c ? CATEGORY_COLORS[c] : 'bg-black/5 text-text-tertiary hover:bg-black/10')}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-4">
          <button onClick={handleAddEntry} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-black/10 rounded-xl text-xs hover:bg-black/[0.02] transition-colors">
            <Plus size={12} /> New Entry
          </button>
          <button
            onClick={handleAutoGenerate}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-black text-white rounded-xl text-xs hover:bg-black/90 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI Generate
          </button>
        </div>

        {/* Entry list */}
        <div className="space-y-1">
          {filtered.map(entry => (
            <button
              key={entry.id}
              onClick={() => { setActiveId(entry.id); setEditing(false); }}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-xl transition-all',
                activeId === entry.id ? 'bg-black/[0.04]' : 'hover:bg-black/[0.02]'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('px-1.5 py-0.5 rounded text-[9px] capitalize', CATEGORY_COLORS[entry.category])}>
                  {entry.category}
                </span>
                <span className="text-sm font-medium truncate">{entry.title}</span>
              </div>
              <div className="text-[10px] text-text-tertiary mt-0.5 flex items-center gap-2">
                <span>{entry.links.length} links</span>
                <span>·</span>
                <span>{entry.lastEdited}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {!activeEntry ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
            <Globe2 size={48} strokeWidth={1} className="mb-4 opacity-30" />
            <p className="text-sm">Select an entry or create a new one</p>
            <p className="text-xs mt-1">Build your world, one article at a time</p>
          </div>
        ) : (
          <div className="max-w-2xl">
            {/* Title & category */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <span className={cn('px-2 py-0.5 rounded-full text-xs capitalize', CATEGORY_COLORS[activeEntry.category])}>
                  {activeEntry.category}
                </span>
                <span className="text-xs text-text-tertiary">Last edited {activeEntry.lastEdited}</span>
              </div>
              <h1 className="text-3xl font-serif font-semibold">{activeEntry.title}</h1>
            </div>

            {/* Tags */}
            {activeEntry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {activeEntry.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-black/5 text-xs text-text-tertiary">#{tag}</span>
                ))}
              </div>
            )}

            {/* Content */}
            {editing ? (
              <div>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-64 p-4 border border-black/10 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:border-black/20"
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSave} className="px-4 py-2 bg-black text-white rounded-xl text-sm hover:bg-black/90 transition-colors">Save</button>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 border border-black/10 rounded-xl text-sm hover:bg-black/[0.02] transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => { setEditing(true); setEditContent(activeEntry.content); }}
                className="prose prose-sm max-w-none text-text-secondary leading-relaxed whitespace-pre-wrap cursor-text hover:bg-black/[0.01] rounded-xl p-2 -m-2 transition-colors"
              >
                {activeEntry.content || <span className="text-text-tertiary italic">Click to add content...</span>}
              </div>
            )}

            {/* Linked entries */}
            {activeEntry.links.length > 0 && (
              <div className="mt-8 pt-6 border-t border-black/5">
                <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Link2 size={12} /> Linked Entries
                </h3>
                <div className="space-y-1.5">
                  {getLinkedEntries(activeEntry.links).map(linked => (
                    <button
                      key={linked.id}
                      onClick={() => { setActiveId(linked.id); setEditing(false); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl glass-subtle hover:bg-black/[0.03] transition-all text-left"
                    >
                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] capitalize', CATEGORY_COLORS[linked.category])}>
                        {linked.category}
                      </span>
                      <span className="text-sm font-medium">{linked.title}</span>
                      <ExternalLink size={12} className="ml-auto text-text-tertiary" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
