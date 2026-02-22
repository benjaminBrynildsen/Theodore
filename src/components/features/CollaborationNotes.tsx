import { useState } from 'react';
import { MessageCircle, Plus, Check, X, Reply, ChevronDown, ChevronUp, User, Bot } from 'lucide-react';
import { cn, generateId } from '../../lib/utils';

type NoteStatus = 'open' | 'resolved' | 'dismissed';
type NoteAuthor = 'editor' | 'beta-reader' | 'author' | 'ai';

interface ThreadReply {
  id: string;
  author: string;
  authorType: NoteAuthor;
  text: string;
  timestamp: string;
}

interface CollaborationNote {
  id: string;
  passage: string;
  chapterRef: string;
  author: string;
  authorType: NoteAuthor;
  text: string;
  status: NoteStatus;
  timestamp: string;
  replies: ThreadReply[];
}

const AUTHOR_STYLES: Record<NoteAuthor, { color: string; icon: typeof User }> = {
  editor: { color: 'text-purple-600', icon: User },
  'beta-reader': { color: 'text-blue-600', icon: User },
  author: { color: 'text-emerald-600', icon: User },
  ai: { color: 'text-amber-600', icon: Bot },
};

const STATUS_STYLES: Record<NoteStatus, string> = {
  open: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-500',
};

const MOCK_NOTES: CollaborationNote[] = [
  {
    id: 'n1',
    passage: '"Behind it lay a descending staircase, its steps worn smooth by feet that had walked them long before the library was built."',
    chapterRef: 'Ch 1, para 3',
    author: 'Sarah Chen',
    authorType: 'editor',
    text: 'Love this image, but "worn smooth by feet" is slightly cliché. Consider something more specific to your world — "grooved by centuries of descent" or similar.',
    status: 'open',
    timestamp: '2026-02-20 14:30',
    replies: [
      { id: 'r1', author: 'You', authorType: 'author', text: 'Good catch — going with "grooved by centuries of careful descent." The "careful" adds character.', timestamp: '2026-02-20 15:45' },
    ],
  },
  {
    id: 'n2',
    passage: '"Bioluminescent moss covered the vaulted ceiling, casting a perpetual blue-green twilight over beds of impossible plants"',
    chapterRef: 'Ch 2, para 1',
    author: 'Mike Torres',
    authorType: 'beta-reader',
    text: 'I was confused here — are we meant to understand this as magic, or is there a scientific explanation? As a reader, I wasn\'t sure what genre rules to apply.',
    status: 'open',
    timestamp: '2026-02-19 10:15',
    replies: [
      { id: 'r2', author: 'Theodore AI', authorType: 'ai', text: 'This feedback aligns with the logic gap flagged in Plot Hole Detector. Consider adding Eleanor\'s internal reaction — her scientific mind trying and failing to explain it, which signals to the reader that this is intentionally inexplicable.', timestamp: '2026-02-19 10:16' },
    ],
  },
  {
    id: 'n3',
    passage: '"Marcus appeared at the garden entrance as if summoned."',
    chapterRef: 'Ch 3, para 1',
    author: 'Sarah Chen',
    authorType: 'editor',
    text: 'This is doing a lot of work — "as if summoned" hints at magic or surveillance. Is that intentional? If so, great foreshadowing. If not, consider softening.',
    status: 'resolved',
    timestamp: '2026-02-18 09:00',
    replies: [
      { id: 'r3', author: 'You', authorType: 'author', text: 'Intentional! He was watching the cameras. Payoff comes in Ch 7.', timestamp: '2026-02-18 11:30' },
      { id: 'r4', author: 'Sarah Chen', authorType: 'editor', text: 'Perfect — marked as resolved. The payoff will land well.', timestamp: '2026-02-18 12:00' },
    ],
  },
  {
    id: 'n4',
    passage: '"Eleanor descended."',
    chapterRef: 'Ch 1, para 5',
    author: 'Mike Torres',
    authorType: 'beta-reader',
    text: 'Short sentence after all that buildup — chef\'s kiss. This is where I got hooked.',
    status: 'dismissed',
    timestamp: '2026-02-17 16:20',
    replies: [],
  },
];

export function CollaborationNotes() {
  const [notes, setNotes] = useState<CollaborationNote[]>(MOCK_NOTES);
  const [expandedId, setExpandedId] = useState<string | null>('n1');
  const [filterStatus, setFilterStatus] = useState<NoteStatus | null>(null);
  const [filterAuthorType, setFilterAuthorType] = useState<NoteAuthor | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const filtered = notes.filter(n => {
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterAuthorType && n.authorType !== filterAuthorType) return false;
    return true;
  });

  const handleReply = (noteId: string) => {
    if (!replyText.trim()) return;
    setNotes(notes.map(n => n.id === noteId ? {
      ...n,
      replies: [...n.replies, {
        id: generateId(),
        author: 'You',
        authorType: 'author' as NoteAuthor,
        text: replyText,
        timestamp: new Date().toLocaleString(),
      }]
    } : n));
    setReplyText('');
    setReplyingTo(null);
  };

  const updateStatus = (noteId: string, status: NoteStatus) => {
    setNotes(notes.map(n => n.id === noteId ? { ...n, status } : n));
  };

  const openCount = notes.filter(n => n.status === 'open').length;

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <MessageCircle size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Collaboration Notes</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          Editor and beta reader annotations with threaded discussion
        </p>

        {/* Summary + filters */}
        <div className="flex items-center gap-3 mb-6">
          <span className="glass-pill px-3 py-1.5 text-xs">
            {openCount} open · {notes.filter(n => n.status === 'resolved').length} resolved
          </span>
          <div className="flex-1" />
          <div className="flex gap-1">
            {(['open', 'resolved', 'dismissed'] as NoteStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? null : s)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] capitalize transition-all',
                  filterStatus === s ? STATUS_STYLES[s] : 'bg-black/5 text-text-tertiary hover:bg-black/10'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['editor', 'beta-reader', 'ai'] as NoteAuthor[]).map(a => (
              <button
                key={a}
                onClick={() => setFilterAuthorType(filterAuthorType === a ? null : a)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] capitalize transition-all',
                  filterAuthorType === a ? 'bg-black text-white' : 'bg-black/5 text-text-tertiary hover:bg-black/10'
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Notes list */}
        <div className="space-y-3">
          {filtered.map(note => {
            const expanded = expandedId === note.id;
            const authorStyle = AUTHOR_STYLES[note.authorType];
            return (
              <div key={note.id} className={cn('glass-subtle rounded-2xl overflow-hidden transition-all', note.status === 'dismissed' && 'opacity-50')}>
                <button
                  onClick={() => setExpandedId(expanded ? null : note.id)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5', authorStyle.color)}>
                      <authorStyle.icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-xs font-medium', authorStyle.color)}>{note.author}</span>
                        <span className="text-[10px] text-text-tertiary">{note.chapterRef}</span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[9px]', STATUS_STYLES[note.status])}>{note.status}</span>
                        {note.replies.length > 0 && (
                          <span className="text-[10px] text-text-tertiary flex items-center gap-0.5">
                            <Reply size={9} /> {note.replies.length}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary line-clamp-2">{note.text}</div>
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-text-tertiary" /> : <ChevronDown size={14} className="text-text-tertiary" />}
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 animate-fade-in">
                    {/* Highlighted passage */}
                    <div className="ml-7 mb-4 p-3 rounded-xl bg-amber-50/50 border-l-2 border-amber-300 text-sm italic text-text-secondary">
                      {note.passage}
                    </div>

                    {/* Full note */}
                    <div className="ml-7 mb-4 text-sm text-text-primary">{note.text}</div>

                    {/* Thread */}
                    {note.replies.length > 0 && (
                      <div className="ml-7 space-y-3 mb-4 pl-4 border-l border-black/5">
                        {note.replies.map(reply => {
                          const replyStyle = AUTHOR_STYLES[reply.authorType];
                          return (
                            <div key={reply.id} className="flex gap-2">
                              <replyStyle.icon size={14} className={cn('mt-0.5', replyStyle.color)} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={cn('text-xs font-medium', replyStyle.color)}>{reply.author}</span>
                                  <span className="text-[10px] text-text-tertiary">{reply.timestamp}</span>
                                </div>
                                <div className="text-sm text-text-secondary mt-0.5">{reply.text}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reply input */}
                    {replyingTo === note.id ? (
                      <div className="ml-7 flex gap-2">
                        <input
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleReply(note.id)}
                          placeholder="Write a reply..."
                          className="flex-1 glass-input px-3 py-2 rounded-xl text-sm"
                          autoFocus
                        />
                        <button onClick={() => handleReply(note.id)} className="px-3 py-2 bg-black text-white rounded-xl text-xs">Send</button>
                        <button onClick={() => { setReplyingTo(null); setReplyText(''); }} className="p-2 rounded-xl hover:bg-black/5"><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="ml-7 flex gap-2">
                        <button
                          onClick={() => setReplyingTo(note.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-black/5 hover:bg-black/10 transition-colors"
                        >
                          <Reply size={12} /> Reply
                        </button>
                        {note.status === 'open' && (
                          <>
                            <button
                              onClick={() => updateStatus(note.id, 'resolved')}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                            >
                              <Check size={12} /> Resolve
                            </button>
                            <button
                              onClick={() => updateStatus(note.id, 'dismissed')}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-black/5 text-text-tertiary hover:bg-black/10 transition-colors"
                            >
                              <X size={12} /> Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
