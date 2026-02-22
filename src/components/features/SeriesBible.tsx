import { useState } from 'react';
import { Library, Plus, ChevronRight, Link2, AlertTriangle, Check, BookOpen } from 'lucide-react';
import { useStore } from '../../store';
import { cn, generateId } from '../../lib/utils';

interface SeriesBook {
  id: string;
  projectId: string | null; // null = external/not in Theodore
  title: string;
  number: number;
  status: 'published' | 'draft' | 'planned';
}

interface OpenThread {
  id: string;
  fromBookNumber: number;
  description: string;
  resolvedInBook: number | null;
  status: 'open' | 'resolved' | 'abandoned';
}

export function SeriesBible() {
  const { projects, getActiveProject } = useStore();
  const project = getActiveProject();

  const [seriesName, setSeriesName] = useState(project?.title ? `The ${project.title.split(' ').pop()} Series` : 'My Series');
  const [books, setBooks] = useState<SeriesBook[]>([
    { id: '1', projectId: 'demo-1', title: project?.title || 'Book 1', number: 1, status: 'draft' },
    { id: '2', projectId: null, title: 'Untitled Book 2', number: 2, status: 'planned' },
  ]);

  const [threads, setThreads] = useState<OpenThread[]>([
    { id: '1', fromBookNumber: 1, description: 'The iron key — what else does it unlock beyond the garden?', resolvedInBook: null, status: 'open' },
    { id: '2', fromBookNumber: 1, description: 'The Gardener\'s origin — who was he before the garden?', resolvedInBook: null, status: 'open' },
    { id: '3', fromBookNumber: 1, description: 'Grandmother\'s journal — what other secrets does it hold?', resolvedInBook: null, status: 'open' },
  ]);

  const [showAddBook, setShowAddBook] = useState(false);
  const [showAddThread, setShowAddThread] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newThreadDesc, setNewThreadDesc] = useState('');

  const addBook = () => {
    if (!newBookTitle.trim()) return;
    setBooks(prev => [...prev, {
      id: generateId(),
      projectId: null,
      title: newBookTitle.trim(),
      number: prev.length + 1,
      status: 'planned',
    }]);
    setNewBookTitle('');
    setShowAddBook(false);
  };

  const addThread = () => {
    if (!newThreadDesc.trim()) return;
    const activeBook = books.find(b => b.projectId === project?.id);
    setThreads(prev => [...prev, {
      id: generateId(),
      fromBookNumber: activeBook?.number || 1,
      description: newThreadDesc.trim(),
      resolvedInBook: null,
      status: 'open',
    }]);
    setNewThreadDesc('');
    setShowAddThread(false);
  };

  const resolveThread = (threadId: string, bookNumber: number) => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, resolvedInBook: bookNumber, status: 'resolved' } : t));
  };

  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');

  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Series Bible</h3>
        <p className="text-xs text-text-tertiary">Track continuity across multiple books. Canon carries forward automatically.</p>
      </div>

      {/* Series name */}
      <div className="mb-4">
        <input
          value={seriesName}
          onChange={e => setSeriesName(e.target.value)}
          className="text-lg font-serif font-semibold bg-transparent border-none outline-none w-full placeholder:text-text-tertiary"
          placeholder="Series Name"
        />
      </div>

      {/* Books in series */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Books</span>
          <button onClick={() => setShowAddBook(!showAddBook)} className="text-text-tertiary hover:text-text-primary">
            <Plus size={14} />
          </button>
        </div>

        <div className="space-y-1.5">
          {books.map(book => (
            <div key={book.id} className={cn(
              'flex items-center gap-3 p-3 rounded-xl transition-colors',
              book.projectId === project?.id ? 'bg-black/[0.04] ring-1 ring-black/5' : 'glass-pill'
            )}>
              <div className="w-8 h-10 rounded bg-black/5 flex items-center justify-center text-xs font-mono text-text-tertiary flex-shrink-0">
                {book.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{book.title}</div>
                <div className="text-[10px] text-text-tertiary">
                  {book.projectId === project?.id ? 'Current project' : book.projectId ? 'In Theodore' : 'Not started'}
                </div>
              </div>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full',
                book.status === 'published' ? 'bg-success/10 text-success' :
                book.status === 'draft' ? 'bg-blue-50 text-blue-600' :
                'bg-black/5 text-text-tertiary'
              )}>
                {book.status}
              </span>
            </div>
          ))}
        </div>

        {showAddBook && (
          <div className="flex gap-2 mt-2 animate-fade-in">
            <input
              value={newBookTitle}
              onChange={e => setNewBookTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBook()}
              placeholder="Book title"
              className="flex-1 px-3 py-2 rounded-lg glass-input text-xs"
              autoFocus
            />
            <button onClick={addBook} className="px-3 py-2 rounded-lg bg-text-primary text-text-inverse text-xs">Add</button>
          </div>
        )}
      </div>

      {/* Open threads */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Open Threads</span>
            {openThreads.length > 0 && (
              <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{openThreads.length}</span>
            )}
          </div>
          <button onClick={() => setShowAddThread(!showAddThread)} className="text-text-tertiary hover:text-text-primary">
            <Plus size={14} />
          </button>
        </div>

        <div className="space-y-1.5">
          {openThreads.map(thread => (
            <div key={thread.id} className="glass-pill rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-text-secondary">{thread.description}</div>
                  <div className="text-[10px] text-text-tertiary mt-1">From Book {thread.fromBookNumber}</div>
                </div>
                <select
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (val > 0) resolveThread(thread.id, val);
                  }}
                  defaultValue=""
                  className="text-[10px] px-2 py-1 rounded-lg glass-input"
                >
                  <option value="" disabled>Resolve in...</option>
                  {books.map(b => <option key={b.id} value={b.number}>Book {b.number}</option>)}
                </select>
              </div>
            </div>
          ))}
          {openThreads.length === 0 && (
            <p className="text-xs text-text-tertiary italic text-center py-2">No open threads</p>
          )}
        </div>

        {showAddThread && (
          <div className="flex gap-2 mt-2 animate-fade-in">
            <input
              value={newThreadDesc}
              onChange={e => setNewThreadDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addThread()}
              placeholder="Describe the open thread..."
              className="flex-1 px-3 py-2 rounded-lg glass-input text-xs"
              autoFocus
            />
            <button onClick={addThread} className="px-3 py-2 rounded-lg bg-text-primary text-text-inverse text-xs">Add</button>
          </div>
        )}
      </div>

      {/* Resolved threads */}
      {resolvedThreads.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Resolved</span>
          {resolvedThreads.map(thread => (
            <div key={thread.id} className="flex items-center gap-2 px-3 py-1.5 text-text-tertiary">
              <Check size={12} className="text-success" />
              <span className="text-xs line-through flex-1">{thread.description}</span>
              <span className="text-[10px]">Book {thread.resolvedInBook}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
