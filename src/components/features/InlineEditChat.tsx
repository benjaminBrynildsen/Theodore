import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X, MousePointer2, RotateCcw, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { generateText, generateStream } from '../../lib/generate';
import { useGenerationStore } from '../../store/generation';
import { buildSelectionEditPrompt } from '../../lib/prompt-builder';
import { generateId, cn } from '../../lib/utils';
import { schedulePostEditPipeline } from '../../lib/post-generation-pipeline';
import type { EditChatMessage, ProseSelection } from '../../types';
import { DIRECTION_TAG_GROUPS } from '../../lib/direction-tagger';
import { Mic } from 'lucide-react';
export type { ProseSelection };

const QUICK_DIRECTIONS = ['sighs', 'laughs', 'gasps', 'scoffs', 'chuckles', 'whispering', 'shouting', 'pause', 'sarcastic', 'angry', 'tender', 'nervous'];

/** Inline direction tag inserter — shown in the selection card */
function DirectionInsertRow({ chapterId, prose, selection, onProseUpdate }: {
  chapterId: string;
  prose: string;
  selection: ProseSelection;
  onProseUpdate: (prose: string, highlightStart: number, highlightEnd: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [custom, setCustom] = useState('');

  const insertTag = (tag: string) => {
    const offset = selection.startOffset;
    const newProse = prose.slice(0, offset) + `[${tag}] ` + prose.slice(offset);
    const tagLen = tag.length + 3; // [tag] + space
    onProseUpdate(newProse, offset, selection.endOffset + tagLen);
    setOpen(false);
    setShowAll(false);
    setCustom('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100 active:bg-fuchsia-200 transition-all"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Mic size={11} />
        Add Voice Direction
      </button>
    );
  }

  return (
    <div className="mt-2 p-2.5 bg-fuchsia-50 rounded-lg border border-fuchsia-200 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-fuchsia-600 uppercase tracking-wider">Voice Direction</span>
        <button onClick={() => { setOpen(false); setShowAll(false); }} className="text-fuchsia-400 hover:text-fuchsia-600 p-0.5">
          <X size={11} />
        </button>
      </div>

      {/* Quick tags */}
      <div className="flex flex-wrap gap-1">
        {QUICK_DIRECTIONS.map(tag => (
          <button
            key={tag}
            onClick={() => insertTag(tag)}
            className="px-2 py-1 rounded-md text-[11px] font-medium bg-white text-fuchsia-600 border border-fuchsia-200 hover:bg-fuchsia-100 active:bg-fuchsia-200 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            [{tag}]
          </button>
        ))}
      </div>

      {/* Show all */}
      {!showAll ? (
        <button onClick={() => setShowAll(true)} className="text-[10px] text-fuchsia-500 hover:text-fuchsia-700">
          Show all tags →
        </button>
      ) : (
        <div className="space-y-2 pt-1 border-t border-fuchsia-200">
          {Object.entries(DIRECTION_TAG_GROUPS).map(([group, tags]) => (
            <div key={group}>
              <div className="text-[9px] font-semibold text-fuchsia-400 uppercase tracking-wider mb-1">{group}</div>
              <div className="flex flex-wrap gap-1">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => insertTag(tag)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white text-fuchsia-600 border border-fuchsia-200 hover:bg-fuchsia-100 active:bg-fuchsia-200 transition-colors"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    [{tag}]
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom */}
      <form
        onSubmit={e => { e.preventDefault(); if (custom.trim()) insertTag(custom.trim().toLowerCase()); }}
        className="flex items-center gap-2 pt-1 border-t border-fuchsia-200"
      >
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Custom tag..."
          className="flex-1 text-xs px-2 py-1.5 bg-white rounded-md border border-fuchsia-200 outline-none focus:border-fuchsia-400"
        />
        {custom.trim() && (
          <button type="submit" className="text-[10px] font-medium px-2 py-1 bg-fuchsia-500 text-white rounded hover:bg-fuchsia-600">
            Insert
          </button>
        )}
      </form>
    </div>
  );
}

interface UndoEntry {
  id: string;
  prose: string;
  label: string;
  timestamp: string;
}

interface Props {
  chapterId: string;
  prose: string;
  selection: ProseSelection | null;
  onClearSelection: () => void;
  onProseUpdate: (prose: string, highlightStart: number, highlightEnd: number) => void;
  onClose: () => void;
}

export function InlineEditChat({ chapterId, prose, selection, onClearSelection, onProseUpdate, onClose }: Props) {
  const { getActiveProject, getProjectChapters, updateChapter, chapters } = useStore();
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();

  const [messages, setMessages] = useState<EditChatMessage[]>([]);
  const [input, setInput] = useState('');
  // Two-beat flow: 'discussing' = Haiku proposing an approach (streamed),
  // 'applying' = Sonnet doing the actual rewrite. loading = either.
  const [editPhase, setEditPhase] = useState<'idle' | 'discussing' | 'applying'>('idle');
  const loading = editPhase !== 'idle';
  const [streamingId, setStreamingId] = useState<string | null>(null);
  // The edit we've proposed and are waiting to apply (set after a discuss turn).
  const [pendingEdit, setPendingEdit] = useState<{ selection: ProseSelection | null; instruction: string } | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);

  const project = getActiveProject();

  // Load per-chapter edit chat history
  useEffect(() => {
    const chapter = chapters.find((c) => c.id === chapterId);
    setMessages(chapter?.editChatHistory || []);
  }, [chapterId, chapters]);

  const persistChatHistory = (nextMessages: EditChatMessage[]) => {
    const trimmed = nextMessages.slice(-50);
    updateChapter(chapterId, { editChatHistory: trimmed as any });
  };

  const appendMessage = (msg: EditChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      persistChatHistory(next);
      return next;
    });
  };

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when selection changes
  useEffect(() => {
    if (selection) {
      inputRef.current?.focus();
    }
  }, [selection]);

  const pushUndo = (label: string) => {
    setUndoStack(prev => [...prev.slice(-19), {
      id: generateId(),
      prose,
      label,
      timestamp: new Date().toISOString(),
    }]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    updateChapter(chapterId, {
      prose: last.prose,
      status: 'human-edited',
      updatedAt: new Date().toISOString(),
    });
    const restoredMsg: EditChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: `Restored to before "${last.label}"`,
      timestamp: new Date().toISOString(),
    };
    appendMessage(restoredMsg);
  };

  // Short affirmations that mean "apply the edit we just discussed".
  const isConfirmation = (t: string) => {
    const s = t.trim().toLowerCase().replace(/[.!,]/g, '');
    return /^(yes|yep|yeah|yup|y|sure|ok|okay|k|go|go ahead|do it|run it|run with it|apply|apply it|perfect|sounds good|love it|great|please do|lets do it|let's do it|that works|yes please|go for it|👍|🙌)$/.test(s);
  };

  // Beat 1 — discuss: stream a short Haiku proposal. No edit applied yet.
  const discussTurn = async (instruction: string, currentSelection: ProseSelection | null) => {
    setEditPhase('discussing');
    setStreamingId(null);
    const msgId = generateId();
    let acc = '';
    const priorConvo = [...messages, { role: 'user', content: instruction }]
      .slice(-8)
      .map((m: any) => `${String(m.role).toUpperCase()}: ${typeof m.content === 'string' ? m.content : ''}`)
      .join('\n\n');
    const passage = currentSelection?.text || prose.slice(0, 1200);
    try {
      await generateStream(
        {
          action: 'chapter-edit-chat',
          model: 'claude-haiku-4-5',
          temperature: settings.ai?.temperature ?? 0.8,
          maxTokens: 120,
          projectId: project!.id,
          chapterId,
          systemPrompt: `You are Theodore, a sharp, collaborative story editor working with the author on ${currentSelection ? 'a selected passage' : 'this chapter'}. Be brief and warm — like a writing partner, not a tool.
RULES:
- 1-2 sentences ONLY. Never more.
- React to what they want, then propose ONE specific way you'd make the edit ("I'd [specific approach]").
- End by asking if they want you to run it or adjust ("Want me to run it, or tweak the angle?").
- Do NOT rewrite or output the edited passage yet — that happens only after they confirm.
- NEVER list options or use bullet points. NEVER use paragraphs.`,
          prompt: `Passage being edited:\n"${passage}"\n\nConversation so far:\n${priorConvo}\n\nRespond in 1-2 sentences: propose one approach and ask if they want it.`,
        },
        (text) => {
          acc += text;
          if (!streamingIdRef.current) {
            streamingIdRef.current = msgId;
            setStreamingId(msgId);
            setMessages((prev) => [...prev, { id: msgId, role: 'assistant', content: acc, timestamp: new Date().toISOString() } as EditChatMessage]);
          } else {
            setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: acc } : m)));
          }
        },
        () => {
          setMessages((prev) => { persistChatHistory(prev); return prev; });
        },
        (error) => {
          if (error === 'INSUFFICIENT_CREDITS') {
            import('../../store/credits').then(({ useCreditsStore }) => useCreditsStore.getState().setShowUpgradeModal(true));
          }
          const content = error === 'INSUFFICIENT_CREDITS' ? 'Out of credits — upgrade to keep editing.' : `Couldn't reach the model: ${error}`;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === msgId);
            const next = exists ? prev.map((m) => (m.id === msgId ? { ...m, content } : m)) : [...prev, { id: msgId, role: 'assistant', content, timestamp: new Date().toISOString() } as EditChatMessage];
            persistChatHistory(next);
            return next;
          });
          setPendingEdit(null);
        },
      );
    } finally {
      streamingIdRef.current = null;
      setStreamingId(null);
      setEditPhase('idle');
    }
  };

  // Beat 2 — apply: Sonnet does the real rewrite and drops it into the prose.
  const applyEdit = async (target: { selection: ProseSelection | null; instruction: string }) => {
    if (loading || !project) return;
    setEditPhase('applying');
    pushUndo(target.selection ? `edit "${target.selection.text.slice(0, 30)}..."` : 'full edit');
    const editLabel = target.selection
      ? `"${target.selection.text.slice(0, 40)}${target.selection.text.length > 40 ? '…' : ''}"`
      : 'full chapter';
    useGenerationStore.getState().start({ kind: 'inline-edit', label: editLabel, subtitle: 'Rewriting…', indeterminate: true });

    try {
      const allChapters = getProjectChapters(project.id);
      const canonEntries = getProjectEntries(project.id);
      const chapter = useStore.getState().chapters.find((c) => c.id === chapterId);
      if (!chapter) throw new Error('Chapter not found');

      const prompt = buildSelectionEditPrompt({
        project,
        chapter: { ...chapter, prose },
        allChapters,
        canonEntries,
        settings,
        instruction: target.instruction,
        selectedText: target.selection?.text || null,
        fullProse: prose,
        chatHistory: messages.slice(-8),
      });

      const result = await generateText({
        prompt,
        model: settings.ai?.preferredModel || 'claude-sonnet',
        maxTokens: target.selection ? 2000 : 4000,
        action: 'inline-edit',
        projectId: project.id,
        chapterId,
      });

      const responseText = (result.text || '').trim();

      if (responseText && target.selection) {
        const before = prose.slice(0, target.selection.startOffset);
        const after = prose.slice(target.selection.endOffset);
        const newProse = before + responseText + after;
        onProseUpdate(newProse, target.selection.startOffset, target.selection.startOffset + responseText.length);
        onClearSelection();
        const diff = responseText.length - target.selection.text.length;
        const diffLabel = diff > 0 ? `(+${diff} chars)` : diff < 0 ? `(${diff} chars)` : '(same length)';
        appendMessage({
          id: generateId(),
          role: 'assistant',
          content: responseText.length <= 200 ? `Done — dropped it in. ${diffLabel}` : `Done — updated the passage ${diffLabel}, highlighted in the text.`,
          timestamp: new Date().toISOString(),
        });
        schedulePostEditPipeline(chapterId);
      } else if (responseText && !target.selection) {
        onProseUpdate(responseText, 0, 0);
        schedulePostEditPipeline(chapterId);
        appendMessage({ id: generateId(), role: 'assistant', content: 'Done — applied to the full chapter.', timestamp: new Date().toISOString() });
      } else {
        setUndoStack((prev) => prev.slice(0, -1));
        appendMessage({ id: generateId(), role: 'assistant', content: 'Hmm, that came back empty — want to try a different angle?', timestamp: new Date().toISOString() });
        useGenerationStore.getState().end();
        setPendingEdit(null);
        return;
      }
      useGenerationStore.getState().setPhase('done');
      setPendingEdit(null);
    } catch (error: any) {
      setUndoStack((prev) => prev.slice(0, -1));
      if (error?.message === 'INSUFFICIENT_CREDITS') {
        const { useCreditsStore } = await import('../../store/credits');
        useCreditsStore.getState().setShowUpgradeModal(true);
      }
      appendMessage({
        id: generateId(),
        role: 'assistant',
        content: error?.message === 'INSUFFICIENT_CREDITS' ? 'Not enough credits — upgrade to continue editing.' : `Error: ${error?.message || 'Edit failed'}`,
        timestamp: new Date().toISOString(),
      });
      useGenerationStore.getState().end();
    } finally {
      setEditPhase('idle');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !project) return;
    const text = input.trim();
    const currentSelection = selection;
    setInput('');

    // If we've already proposed an edit and they just confirmed → apply it.
    if (pendingEdit && isConfirmation(text)) {
      appendMessage({ id: generateId(), role: 'user', content: text, timestamp: new Date().toISOString() });
      await applyEdit(pendingEdit);
      return;
    }

    // Otherwise this is a new / refined instruction → discuss it first.
    const userContent = currentSelection
      ? `**Editing:** "${currentSelection.text.slice(0, 100)}${currentSelection.text.length > 100 ? '...' : ''}"\n${currentSelection.sceneName ? `*Scene: ${currentSelection.sceneName}*\n` : ''}${text}`
      : text;
    appendMessage({ id: generateId(), role: 'user', content: userContent, timestamp: new Date().toISOString() });
    const target = { selection: currentSelection || pendingEdit?.selection || null, instruction: text };
    setPendingEdit(target);
    await discussTurn(text, target.selection);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      {undoStack.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/20">
          <span className="text-[10px] text-text-tertiary">
            {undoStack.length} undo{undoStack.length !== 1 ? 's' : ''} available
          </span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all"
            title={`Undo: ${undoStack[undoStack.length - 1]?.label}`}
          >
            <RotateCcw size={11} />
            Undo
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
              <Sparkles size={20} className="text-purple-400" />
            </div>
            <p className="text-sm text-text-secondary font-medium mb-1">Inline Editor</p>
            <p className="text-xs text-text-tertiary leading-relaxed max-w-[260px] mx-auto">
              Select text in the chapter to target specific passages, then describe your edit.
            </p>
            <div className="mt-4 space-y-1.5 text-left max-w-[260px] mx-auto">
              <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Try:</p>
              {[
                'Make this more tense',
                'Add sensory detail',
                'Sharpen the dialogue',
                'Make this punchier',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInput(suggestion)}
                  className="block w-full text-left text-xs text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:bg-white/80 transition-all"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in">
            <div
              className={cn(
                'text-[13px] leading-relaxed rounded-xl px-3 py-2 max-w-[95%] whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-stone-800 text-white ml-auto'
                  : 'bg-white text-text-primary border border-black/5 shadow-sm'
              )}
            >
              {msg.role === 'user' ? (
                <div>
                  {msg.content.split('\n').map((line, i) => {
                    if (line.startsWith('**Editing:**')) {
                      return (
                        <div key={i} className="text-[11px] text-blue-300 mb-1.5 leading-snug">
                          {line.replace(/\*\*/g, '')}
                        </div>
                      );
                    }
                    if (line.startsWith('*Scene:')) {
                      return (
                        <div key={i} className="text-[10px] text-stone-400 mb-1">
                          {line.replace(/\*/g, '')}
                        </div>
                      );
                    }
                    return <span key={i}>{line}</span>;
                  })}
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {/* Discuss turn — brief "thinking" until the streamed proposal arrives */}
        {editPhase === 'discussing' && !streamingId && (
          <div className="animate-fade-in px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 size={13} className="animate-spin text-purple-500" />
              <span className="font-medium">Thinking it through…</span>
            </div>
          </div>
        )}
        {/* Apply turn — the actual Sonnet rewrite */}
        {editPhase === 'applying' && (
          <div className="animate-fade-in px-3 py-3">
            <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
              <Loader2 size={13} className="animate-spin text-purple-500" />
              <span className="font-medium">{selection ? 'Rewriting selection…' : 'Editing chapter…'}</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 bg-purple-100 rounded-full animate-pulse w-3/4" />
              <div className="h-2 bg-purple-50 rounded-full animate-pulse w-1/2" />
            </div>
          </div>
        )}
      </div>

      {/* Apply-edit action — appears after a proposal, one tap to run the rewrite */}
      {pendingEdit && editPhase === 'idle' && (
        <div className="px-3 pb-2 animate-fade-in">
          <button
            onClick={() => applyEdit(pendingEdit)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99] transition-all shadow-sm"
          >
            <Sparkles size={14} /> Apply edit
          </button>
          <p className="text-center text-[10px] text-text-tertiary mt-1">or keep refining — type "yes" to apply</p>
        </div>
      )}

      {/* Selection card — pinned above input */}
      {selection && (
        <div className="mx-3 mb-0 px-3 py-2.5 rounded-t-xl bg-blue-50 border border-b-0 border-blue-200 animate-fade-in">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1">
              <MousePointer2 size={10} />
              {selection.sceneName ? `${selection.sceneName}` : 'Selected'}
            </span>
            <button onClick={onClearSelection} className="text-blue-400 hover:text-blue-600 p-0.5">
              <X size={11} />
            </button>
          </div>
          <p className="text-[13px] text-blue-900 leading-relaxed font-serif line-clamp-3">
            "{selection.text.slice(0, 200)}{selection.text.length > 200 ? '...' : ''}"
          </p>
          <p className="text-[10px] text-blue-500 mt-1">
            {selection.text.split(/\s+/).length} words · click elsewhere to deselect
          </p>
          <DirectionInsertRow
            chapterId={chapterId}
            prose={prose}
            selection={selection}
            onProseUpdate={onProseUpdate}
          />
        </div>
      )}

      {/* Input */}
      <div className={cn('p-3 border-t border-white/20', selection && 'pt-0 border-t-0')}>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[11px] font-medium text-text-secondary">
            {selection ? 'Editing selected text' : 'Editing full chapter'}
          </span>
          <span className="text-[10px] text-text-tertiary">Enter to send</span>
        </div>
        <div className={cn(
          'flex items-end gap-2 glass-pill p-3 focus-within:bg-white/80 focus-within:shadow-md transition-all',
          selection ? 'rounded-b-xl rounded-t-none border-t-0 mx-0 border border-blue-200' : 'rounded-xl'
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selection
                ? 'How should I change this?'
                : 'Describe what to change...'
            }
            disabled={loading || !prose}
            rows={2}
            className="flex-1 bg-transparent outline-none text-[14px] leading-relaxed text-text-primary placeholder:text-text-tertiary/60 resize-none max-h-40"
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 160) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !prose}
            className={cn(
              'p-2.5 rounded-lg transition-all flex-shrink-0',
              input.trim() && !loading && prose
                ? 'bg-stone-800 text-white hover:bg-stone-900'
                : 'bg-black/5 text-text-tertiary cursor-not-allowed'
            )}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
