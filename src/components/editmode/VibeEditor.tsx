import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, Sparkles, ChevronLeft, MousePointer2 } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { generateText } from '../../lib/generate';
import { buildSelectionEditPrompt } from '../../lib/prompt-builder';
import { generateId, cn } from '../../lib/utils';
import type { Chapter, EditChatMessage } from '../../types';

interface Props {
  chapter: Chapter;
  onClose: () => void;
}

interface TextSelection {
  text: string;
  startOffset: number;
  endOffset: number;
}

export function VibeEditor({ chapter, onClose }: Props) {
  const { updateChapter, getActiveProject, getProjectChapters } = useStore();
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();

  const [messages, setMessages] = useState<EditChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [prose, setProse] = useState(chapter.prose);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  const project = getActiveProject();

  // Sync prose back to chapter on changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (prose !== chapter.prose) {
        updateChapter(chapter.id, {
          prose,
          status: 'human-edited',
          updatedAt: new Date().toISOString(),
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [prose]);

  // Keep prose in sync if chapter updates externally
  useEffect(() => {
    setProse(chapter.prose);
  }, [chapter.id]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle text selection in the prose panel
  const handleProseMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !proseRef.current) {
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    // Find the offset within the full prose text
    const range = sel.getRangeAt(0);
    const proseEl = proseRef.current;

    // Walk through text nodes to compute the character offset
    const treeWalker = document.createTreeWalker(proseEl, NodeFilter.SHOW_TEXT);
    let charOffset = 0;
    let startOffset = -1;
    let endOffset = -1;

    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      if (node === range.startContainer) {
        startOffset = charOffset + range.startOffset;
      }
      if (node === range.endContainer) {
        endOffset = charOffset + range.endOffset;
        break;
      }
      charOffset += (node.textContent || '').length;
    }

    if (startOffset >= 0 && endOffset > startOffset) {
      setSelection({ text: selectedText, startOffset, endOffset });
      setHighlightRange({ start: startOffset, end: endOffset });
    }
  }, []);

  const clearSelection = () => {
    setSelection(null);
    setHighlightRange(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !project) return;

    const instruction = input.trim();
    const userMsg: EditChatMessage = {
      id: generateId(),
      role: 'user',
      content: selection
        ? `[Selected: "${selection.text.slice(0, 80)}${selection.text.length > 80 ? '...' : ''}"]\n${instruction}`
        : instruction,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const allChapters = getProjectChapters(project.id);
      const canonEntries = getProjectEntries(project.id);

      const prompt = buildSelectionEditPrompt({
        project,
        chapter: { ...chapter, prose },
        allChapters,
        canonEntries,
        settings,
        instruction,
        selectedText: selection?.text || null,
        fullProse: prose,
        chatHistory: messages.slice(-8),
      });

      const result = await generateText({
        prompt,
        model: settings.ai?.preferredModel || 'gpt-4.1',
        maxTokens: selection ? 2000 : 3000,
        action: 'vibe-edit',
        projectId: project.id,
        chapterId: chapter.id,
      });

      const responseText = (result.text || '').trim();

      if (responseText && selection) {
        // Replace the selected text in prose
        const before = prose.slice(0, selection.startOffset);
        const after = prose.slice(selection.endOffset);
        const newProse = before + responseText + after;
        setProse(newProse);

        // Highlight the new text
        setHighlightRange({
          start: selection.startOffset,
          end: selection.startOffset + responseText.length,
        });
        setSelection(null);

        const assistantMsg: EditChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `Updated the selected text. ${responseText.length > 120 ? '' : `New: "${responseText}"`}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else if (responseText && !selection) {
        // Full prose rewrite
        setProse(responseText);
        setHighlightRange(null);

        const assistantMsg: EditChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Updated the full text with your changes.',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const assistantMsg: EditChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Couldn\'t process that edit. Try rephrasing.',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (error: any) {
      const errorMsg: EditChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Error: ${error?.message || 'Edit failed'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Render prose with highlight
  const renderProse = () => {
    if (!prose) {
      return <p className="text-text-tertiary italic text-lg">No prose yet. Generate or write some text first, then come back to edit.</p>;
    }

    if (!highlightRange) {
      // Render paragraphs normally
      return prose.split('\n\n').map((paragraph, i) => (
        <p key={i} className="mb-6 leading-[2] text-[17px]">
          {paragraph.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      ));
    }

    // Render with highlight
    const before = prose.slice(0, highlightRange.start);
    const highlighted = prose.slice(highlightRange.start, highlightRange.end);
    const after = prose.slice(highlightRange.end);

    const renderSection = (text: string) => {
      return text.split('\n\n').map((paragraph, i) => (
        <span key={i}>
          {i > 0 && <><br /><br /></>}
          {paragraph.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </span>
      ));
    };

    return (
      <div className="leading-[2] text-[17px]">
        {renderSection(before)}
        <mark className="bg-blue-100 text-blue-900 rounded px-0.5 transition-colors">
          {renderSection(highlighted)}
        </mark>
        {renderSection(after)}
      </div>
    );
  };

  const wordCount = prose.trim() ? prose.trim().split(/\s+/).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex bg-white animate-fade-in">
      {/* Left Panel — Chat */}
      <div className="w-[380px] flex-shrink-0 flex flex-col border-r border-black/10 bg-stone-50/80">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <div>
              <h3 className="text-sm font-semibold">Edit Mode</h3>
              <p className="text-[10px] text-text-tertiary">Ch. {chapter.number} · {chapter.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Selection indicator */}
        {selection && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 animate-fade-in">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                <MousePointer2 size={10} />
                Selected Text
              </span>
              <button onClick={clearSelection} className="text-blue-400 hover:text-blue-600">
                <X size={11} />
              </button>
            </div>
            <p className="text-xs text-blue-800 line-clamp-3 leading-relaxed">
              "{selection.text.slice(0, 200)}{selection.text.length > 200 ? '...' : ''}"
            </p>
          </div>
        )}

        {/* Chat Messages */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={20} className="text-purple-400" />
              </div>
              <p className="text-sm text-text-secondary font-medium mb-1">Vibe Write</p>
              <p className="text-xs text-text-tertiary leading-relaxed max-w-[260px] mx-auto">
                Select text on the right to edit specific parts, or type an instruction to edit the whole chapter.
              </p>
              <div className="mt-4 space-y-1.5 text-left max-w-[260px] mx-auto">
                <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Try saying:</p>
                {[
                  'Make the dialogue more tense',
                  'Add more sensory detail here',
                  'Rewrite this in first person',
                  'Make this sentence punchier',
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
            <div
              key={msg.id}
              className={cn(
                'text-[13px] leading-relaxed rounded-xl px-3 py-2 max-w-[95%] whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-stone-800 text-white ml-auto'
                  : 'bg-white text-text-primary border border-black/5 shadow-sm'
              )}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-text-tertiary px-3 py-2">
              <Loader2 size={13} className="animate-spin" />
              {selection ? 'Rewriting selection...' : 'Editing...'}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-black/10">
          <div className="flex items-end gap-2 bg-white rounded-xl border border-black/10 p-2 focus-within:border-black/20 focus-within:shadow-sm transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selection
                  ? 'How should I change this selection?'
                  : 'Describe what to change...'
              }
              disabled={loading || !prose}
              rows={1}
              className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-tertiary/60 resize-none max-h-32"
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading || !prose}
              className={cn(
                'p-2 rounded-lg transition-all flex-shrink-0',
                input.trim() && !loading && prose
                  ? 'bg-stone-800 text-white hover:bg-stone-900'
                  : 'bg-black/5 text-text-tertiary cursor-not-allowed'
              )}
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-text-tertiary">
              {selection ? 'Will edit only the selected text' : 'Will edit the full chapter'}
            </span>
            <span className="text-[10px] text-text-tertiary">Enter to send</span>
          </div>
        </div>
      </div>

      {/* Right Panel — Prose */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Prose header */}
        <div className="flex items-center justify-between px-8 py-3 border-b border-black/5">
          <div>
            <h2 className="text-lg font-serif font-semibold">{chapter.title}</h2>
            <p className="text-xs text-text-tertiary">{wordCount.toLocaleString()} words · Chapter {chapter.number}</p>
          </div>
          <div className="flex items-center gap-2">
            {selection && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium animate-fade-in">
                {selection.text.split(/\s+/).length} words selected
              </span>
            )}
          </div>
        </div>

        {/* Prose content — selectable, not editable */}
        <div className="flex-1 overflow-y-auto">
          <div
            ref={proseRef}
            onMouseUp={handleProseMouseUp}
            className="max-w-2xl mx-auto px-8 py-10 font-serif text-text-primary cursor-text select-text"
          >
            {renderProse()}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-8 py-2 border-t border-black/5 text-[10px] text-text-tertiary">
          <span>Select text to edit specific parts</span>
          <span>Last saved {new Date(chapter.updatedAt).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
