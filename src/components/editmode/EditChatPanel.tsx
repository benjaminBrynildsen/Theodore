import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { CreditCostTag } from '../credits/CreditCostTag';
import { buildSceneEditPrompt } from '../../lib/prompt-builder';
import { generateText } from '../../lib/generate';
import { generateId } from '../../lib/utils';
import { cn } from '../../lib/utils';
import type { EditChatMessage, Scene } from '../../types';

interface Props {
  chapterId: string;
  scene: Scene | null;
}

export function EditChatPanel({ chapterId, scene }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    editChatMessages,
    addEditChatMessage,
    editChatLoading,
    setEditChatLoading,
    updateScene,
    syncScenesToProse,
    getActiveProject,
    getProjectChapters,
    chapters,
  } = useStore();
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();

  const chapter = chapters.find(c => c.id === chapterId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [editChatMessages]);

  const handleSend = async () => {
    if (!input.trim() || !scene || !chapter || editChatLoading) return;

    const project = getActiveProject();
    if (!project) return;

    const userMsg: EditChatMessage = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      sceneId: scene.id,
      timestamp: new Date().toISOString(),
    };
    addEditChatMessage(userMsg);
    setInput('');
    setEditChatLoading(true);

    try {
      const allChapters = getProjectChapters(project.id);
      const canonEntries = getProjectEntries(project.id);

      const prompt = buildSceneEditPrompt(
        {
          project,
          chapter,
          allChapters,
          canonEntries,
          settings,
          writingMode: 'draft',
          generationType: 'full-chapter',
        },
        scene,
        userMsg.content,
        editChatMessages,
      );

      const result = await generateText({
        prompt,
        model: settings.ai.preferredModel || 'gpt-4.1',
        maxTokens: 3000,
        action: 'chat-message',
        projectId: project.id,
        chapterId,
      });

      const updatedProse = (result.text || '').trim();

      // Update scene prose
      if (updatedProse) {
        updateScene(chapterId, scene.id, {
          prose: updatedProse,
          status: 'edited',
        });
        syncScenesToProse(chapterId);
      }

      const assistantMsg: EditChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: updatedProse
          ? 'Done — I\'ve updated the scene prose with your changes.'
          : 'I wasn\'t able to generate updated prose. Try rephrasing your instruction.',
        sceneId: scene.id,
        timestamp: new Date().toISOString(),
      };
      addEditChatMessage(assistantMsg);
    } catch (error: any) {
      const errorMsg: EditChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Error: ${error?.message || 'Failed to process edit'}`,
        sceneId: scene.id,
        timestamp: new Date().toISOString(),
      };
      addEditChatMessage(errorMsg);
    } finally {
      setEditChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col border-t border-white/20">
      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 max-h-48 min-h-[80px]">
        {editChatMessages.length === 0 && (
          <p className="text-xs text-text-tertiary text-center py-3">
            {scene ? 'Chat with AI to edit this scene...' : 'Select a scene to start editing'}
          </p>
        )}
        {editChatMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'text-xs leading-relaxed rounded-lg px-2.5 py-1.5 max-w-[90%]',
              msg.role === 'user'
                ? 'bg-text-primary text-text-inverse ml-auto'
                : 'bg-white/50 text-text-secondary'
            )}
          >
            {msg.content}
          </div>
        ))}
        {editChatLoading && (
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary px-2.5 py-1.5">
            <Loader2 size={12} className="animate-spin" />
            Editing scene...
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-2 border-t border-white/10">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={scene ? `Edit "${scene.title}"...` : 'Select a scene first...'}
            disabled={!scene || editChatLoading}
            rows={1}
            className="flex-1 bg-transparent outline-none text-[13px] text-text-primary placeholder:text-text-tertiary resize-none glass-input rounded-lg px-3 py-2"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !scene || editChatLoading}
            className={cn(
              'p-2 rounded-lg transition-all flex-shrink-0',
              input.trim() && scene && !editChatLoading
                ? 'bg-text-primary text-text-inverse hover:shadow-md'
                : 'bg-white/20 text-text-tertiary cursor-not-allowed'
            )}
          >
            <Send size={14} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[10px] text-text-tertiary">Shift+Enter for newline</span>
          <CreditCostTag action="chat-message" />
        </div>
      </div>
    </div>
  );
}
