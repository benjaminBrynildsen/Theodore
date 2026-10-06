import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useCreditsStore } from '../../store/credits';
import { generateStream, generateText } from '../../lib/generate';
import { editingModel } from '../../lib/models';
import { cn } from '../../lib/utils';
import {
  STORY_CHAT_SYSTEM, applyStoryChanges, buildStoryChangesPrompt, buildStoryChatPrompt, buildStoryContext,
  parseStoryChanges, storyBasis, type StoryChange, type StoryChangeSet, type StoryChatMessage,
} from '../../lib/story-chat';
import type { Chapter, Project } from '../../types';

const KIND_LABEL: Record<StoryChange['kind'], string> = { thread: 'Thread', character: 'Character', object: 'Object', chapter: 'Outline' };
const OP_LABEL: Record<StoryChange['op'], string> = { add: 'New', update: 'Change', remove: 'Remove' };

const storageKey = (projectId: string) => `theodore:story-chat:${projectId}`;

function loadMessages(projectId: string): StoryChatMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(projectId)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Book-level editing chat: talk through a direction, then review drafted
 * changes to the thread map, character & object map and chapter outlines.
 * Nothing changes until the author applies the changes they keep.
 */
export function StoryChat({ project, chapters, onClose }: { project: Project; chapters: Chapter[]; onClose: () => void }) {
  const updateProject = useStore((s) => s.updateProject);
  const updateChapter = useStore((s) => s.updateChapter);
  const [messages, setMessages] = useState<StoryChatMessage[]>(() => loadMessages(project.id));
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'replying' | 'drafting'>('idle');
  const [draft, setDraft] = useState<StoryChangeSet | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey(project.id), JSON.stringify(messages.slice(-40))); } catch { /* storage blocked */ }
  }, [messages, project.id]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, phase, draft]);

  const context = () => buildStoryContext({ project, chapters, canon: useCanonStore.getState().getProjectEntries(project.id) });
  const say = (role: StoryChatMessage['role'], content: string) =>
    setMessages((prev) => [...prev, { role, content, at: new Date().toISOString() }]);
  const failed = (error: string) => {
    if (error === 'INSUFFICIENT_CREDITS') useCreditsStore.getState().setShowUpgradeModal(true);
    say('assistant', error === 'INSUFFICIENT_CREDITS' ? 'Out of credits — top up to keep going.' : `Couldn't reach the model: ${error}`);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || phase !== 'idle') return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: text, at: new Date().toISOString() }];
    setMessages(next);
    setPhase('replying');
    let acc = '';
    let started = false;
    try {
      await generateStream(
        {
          prompt: buildStoryChatPrompt(context(), next),
          systemPrompt: STORY_CHAT_SYSTEM,
          model: editingModel(),
          effort: 'low',
          maxTokens: 500,
          action: 'story-chat',
          projectId: project.id,
        },
        (chunk) => {
          acc += chunk;
          if (!started) {
            started = true;
            setMessages((prev) => [...prev, { role: 'assistant', content: acc, at: new Date().toISOString() }]);
          } else {
            setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: acc } : m)));
          }
        },
        undefined,
        failed,
      );
    } finally {
      setPhase('idle');
    }
  };

  const draftChanges = async () => {
    if (phase !== 'idle') return;
    setPhase('drafting');
    try {
      const result = await generateText({
        prompt: buildStoryChangesPrompt(context(), messages, { threadPlan: project.threadPlan, arcPlan: project.arcPlan }),
        model: editingModel(),
        maxTokens: 8000,
        action: 'story-changes',
        projectId: project.id,
      });
      const set = parseStoryChanges(result.text || '', project, chapters);
      if (!set) say('assistant', "The draft came back in a shape I couldn't read, so nothing changed. Want me to try again?");
      else if (!set.changes.length) say('assistant', set.summary || "I couldn't find anything concrete to change yet — tell me more about the direction.");
      else {
        setRejected(new Set());
        setDraft(set);
        say('assistant', `${set.changes.length} proposed change${set.changes.length === 1 ? '' : 's'} — review them below and untick any you don't want.`);
      }
    } catch (e) {
      failed(e instanceof Error ? e.message : 'Drafting failed');
    } finally {
      setPhase('idle');
    }
  };

  const apply = () => {
    if (!draft) return;
    if (storyBasis(project, chapters) !== draft.basis) {
      setDraft(null);
      say('assistant', 'The maps or outlines changed since I drafted these, so I set them aside. Ask me to draft again.');
      return;
    }
    const accepted = new Set(draft.changes.filter((c) => !rejected.has(c.id)).map((c) => c.id));
    const result = applyStoryChanges(project, chapters, draft.changes, accepted);
    if (result.threadPlan || result.arcPlan) {
      updateProject(project.id, {
        ...(result.threadPlan ? { threadPlan: result.threadPlan } : {}),
        ...(result.arcPlan ? { arcPlan: result.arcPlan } : {}),
      });
    }
    for (const u of result.premiseUpdates) updateChapter(u.chapterId, { premise: u.premise });
    const rebuild = result.writtenChaptersAffected;
    say('assistant', `Applied ${accepted.size} of ${draft.changes.length} changes.${rebuild.length
      ? ` Chapter${rebuild.length === 1 ? '' : 's'} ${rebuild.join(', ')} ${rebuild.length === 1 ? 'is' : 'are'} already written — open ${rebuild.length === 1 ? 'it' : 'them'} and use Rebuild so the prose matches the new plan.`
      : ' New chapters will be written to the new plan.'}`);
    setDraft(null);
  };

  const hasReply = messages.some((m) => m.role === 'assistant');
  const keep = draft ? draft.changes.filter((c) => !rejected.has(c.id)).length : 0;

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={15} className="text-text-tertiary" />
        <h3 className="flex-1 text-sm font-semibold">Story chat</h3>
        {messages.length > 0 && phase === 'idle' && (
          <button
            onClick={() => { setMessages([]); setDraft(null); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-tertiary hover:text-text-primary hover:bg-black/5"
            title="Start a new conversation"
          >
            <RotateCcw size={11} /> New chat
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary" aria-label="Close story chat">
          <X size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="max-h-[55vh] overflow-y-auto space-y-2.5 pr-1">
        {!messages.length && (
          <div className="text-xs text-text-secondary leading-relaxed space-y-2 py-2">
            <p>Talk through where you want the book to go. I know your chapters, thread map, characters and objects, and I'll build on what's there. When we agree, I'll draft the changes for you to approve.</p>
            <div className="space-y-1">
              {[
                'I want a betrayal near the end. Who should it be, and when should we find out?',
                'One of the objects needs a bigger payoff in the last chapters.',
                'A supporting character feels flat. Give them a real arc.',
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)} className="block w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/70 text-text-tertiary hover:text-text-primary">
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'text-[13px] leading-relaxed rounded-xl px-3 py-2 max-w-[92%] whitespace-pre-wrap',
              m.role === 'user' ? 'bg-stone-800 text-white ml-auto' : 'bg-white text-text-primary border border-black/5 shadow-sm',
            )}
          >
            {m.content}
          </div>
        ))}
        {phase !== 'idle' && !(phase === 'replying' && messages[messages.length - 1]?.role === 'assistant') && (
          <div className="flex items-center gap-2 text-xs text-text-secondary px-1 py-1">
            <Loader2 size={13} className="animate-spin" /> {phase === 'drafting' ? 'Drafting changes…' : 'Thinking it through…'}
          </div>
        )}

        {draft && phase === 'idle' && (
          <div className="rounded-xl bg-white border border-black/10 shadow-sm">
            <div className="px-3 pt-3 pb-2 border-b border-black/5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Proposed changes</span>
                <div className="flex gap-1 text-[11px]">
                  <button onClick={() => setRejected(new Set())} className="px-2 py-0.5 rounded-md hover:bg-black/5 text-text-secondary">Accept all</button>
                  <button onClick={() => setRejected(new Set(draft.changes.map((c) => c.id)))} className="px-2 py-0.5 rounded-md hover:bg-black/5 text-text-secondary">Reject all</button>
                </div>
              </div>
              {draft.summary && <p className="text-[12px] text-text-secondary mt-1 leading-snug">{draft.summary}</p>}
            </div>
            <div className="divide-y divide-black/5">
              {draft.changes.map((c) => {
                const on = !rejected.has(c.id);
                const isOpen = open === c.id;
                return (
                  <div key={c.id} className={cn('px-3 py-2.5', !on && 'opacity-50')}>
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => setRejected((prev) => { const s = new Set(prev); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); return s; })}
                        className={cn('mt-0.5 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center border', on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-black/15 text-text-tertiary')}
                        aria-pressed={on}
                        aria-label={on ? 'Accepted — tap to reject' : 'Rejected — tap to accept'}
                      >
                        {on ? <Check size={13} /> : <X size={13} />}
                      </button>
                      <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex-1 min-w-0 text-left">
                        <div className="text-[11px] text-text-tertiary">
                          <span className="font-semibold text-text-secondary">{OP_LABEL[c.op]} {KIND_LABEL[c.kind].toLowerCase()}</span> · {c.label}
                          {c.chapters.length > 0 && <span> · Ch {c.chapters.join(', ')}</span>}
                        </div>
                        {c.why && <p className="text-[12px] text-text-primary mt-0.5">{c.why}</p>}
                        {c.before && (
                          <p className={cn('mt-1 text-[12px] leading-relaxed text-red-800/80 line-through decoration-red-300', !isOpen && 'line-clamp-2')}>{c.before}</p>
                        )}
                        {c.after && (
                          <p className={cn('mt-1 text-[12px] leading-relaxed text-emerald-900 bg-emerald-50 rounded px-1', !isOpen && 'line-clamp-3')}>{c.after}</p>
                        )}
                        {!isOpen && (c.before || c.after) && <span className="text-[10px] text-text-tertiary">Tap to read in full</span>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 flex gap-2 border-t border-black/5">
              <button onClick={apply} disabled={!keep} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                Apply {keep} change{keep === 1 ? '' : 's'}
              </button>
              <button onClick={() => { setDraft(null); say('assistant', 'Set those aside. Tell me what to adjust.'); }} className="px-4 py-2.5 rounded-xl text-[13px] font-medium bg-black/5 text-text-secondary hover:bg-black/10">
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {hasReply && !draft && phase === 'idle' && (
        <button
          onClick={draftChanges}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Sparkles size={14} /> Draft these changes
        </button>
      )}

      <div className="mt-3 flex items-end gap-2 glass-pill rounded-xl p-2.5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Where do you want the story to go?"
          rows={2}
          disabled={phase !== 'idle'}
          className="flex-1 bg-transparent outline-none text-[14px] leading-relaxed resize-none"
        />
        <button
          onClick={() => void send()}
          disabled={!input.trim() || phase !== 'idle'}
          className={cn('p-2.5 rounded-lg flex-shrink-0', input.trim() && phase === 'idle' ? 'bg-stone-800 text-white' : 'bg-black/5 text-text-tertiary')}
          aria-label="Send"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
