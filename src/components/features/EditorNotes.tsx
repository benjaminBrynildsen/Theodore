import { useState } from 'react';
import { MessageCircle, Plus, Check, X, User, Clock } from 'lucide-react';
import { cn, generateId } from '../../lib/utils';

export interface EditorNote {
  id: string;
  chapterId: string;
  paragraphIndex: number;
  selectedText: string;
  comment: string;
  author: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
  replies: { author: string; comment: string; createdAt: string }[];
}

interface Props {
  chapterId: string;
  notes: EditorNote[];
  onAddNote: (note: EditorNote) => void;
  onResolve: (noteId: string) => void;
  onReply: (noteId: string, reply: string) => void;
}

const AUTHOR_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export function EditorNotes({ chapterId, notes, onAddNote, onResolve, onReply }: Props) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const activeNotes = notes.filter(n => n.chapterId === chapterId && (showResolved || !n.resolved));
  const unresolvedCount = notes.filter(n => n.chapterId === chapterId && !n.resolved).length;

  const handleReply = (noteId: string) => {
    if (!replyText.trim()) return;
    onReply(noteId, replyText.trim());
    setReplyText('');
    setReplyingTo(null);
  };

  return (
    <div className="border-t border-black/5">
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-text-tertiary" />
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Notes</span>
          {unresolvedCount > 0 && (
            <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{unresolvedCount}</span>
          )}
        </div>
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="text-[10px] text-text-tertiary hover:text-text-primary"
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      <div className="px-5 pb-4 space-y-2 max-h-60 overflow-y-auto">
        {activeNotes.length === 0 && (
          <div className="text-xs text-text-tertiary text-center py-4">
            No notes yet. Select text in the editor and click "Add Note" to start a discussion.
          </div>
        )}

        {activeNotes.map(note => (
          <div key={note.id} className={cn(
            'rounded-xl p-3 transition-all',
            note.resolved ? 'glass-pill opacity-60' : 'bg-blue-50 border border-blue-100'
          )}>
            {/* Quote */}
            <div className="text-[10px] text-text-tertiary mb-1.5 italic border-l-2 border-blue-200 pl-2 line-clamp-2">
              "{note.selectedText}"
            </div>

            {/* Comment */}
            <div className="flex gap-2 mb-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0" style={{ backgroundColor: note.authorColor }}>
                {note.author.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{note.author}</span>
                  <span className="text-[9px] text-text-tertiary">{new Date(note.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{note.comment}</p>
              </div>
            </div>

            {/* Replies */}
            {note.replies.map((reply, i) => (
              <div key={i} className="flex gap-2 ml-7 mt-1.5 pt-1.5 border-t border-black/5">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium">{reply.author}</span>
                    <span className="text-[9px] text-text-tertiary">{new Date(reply.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary">{reply.comment}</p>
                </div>
              </div>
            ))}

            {/* Reply input */}
            {replyingTo === note.id && (
              <div className="flex gap-2 mt-2 ml-7 animate-fade-in">
                <input
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReply(note.id)}
                  placeholder="Reply..."
                  className="flex-1 px-2 py-1 rounded-lg glass-input text-xs"
                  autoFocus
                />
                <button onClick={() => handleReply(note.id)} className="p-1 text-blue-600"><Check size={14} /></button>
                <button onClick={() => setReplyingTo(null)} className="p-1 text-text-tertiary"><X size={14} /></button>
              </div>
            )}

            {/* Actions */}
            {!note.resolved && replyingTo !== note.id && (
              <div className="flex gap-2 mt-2 ml-7">
                <button onClick={() => setReplyingTo(note.id)} className="text-[10px] text-blue-600 hover:underline">Reply</button>
                <button onClick={() => onResolve(note.id)} className="text-[10px] text-text-tertiary hover:text-success">✓ Resolve</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
