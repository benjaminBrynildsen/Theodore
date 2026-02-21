import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Check, ChevronDown, Settings2 } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { generateId, cn } from '../../lib/utils';
import { Slider } from '../ui/Slider';
import { autoFillCharacter, autoFillLocation } from '../../lib/ai-autofill';
import type { Project, NarrativeControls, BookSubtype } from '../../types';
import type { CharacterEntry, LocationEntry } from '../../types/canon';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ProposedSettings {
  title: string;
  subtype: BookSubtype;
  targetLength: Project['targetLength'];
  assistanceLevel: number;
  narrativeControls: NarrativeControls;
  chapterCount: number;
  chapters: { number: number; title: string; premise: string }[];
}

// Simulated AI responses — will connect to real AI later
function getAIResponse(messages: Message[]): { message: string; settings?: ProposedSettings } {
  const userMessages = messages.filter(m => m.role === 'user');
  const lastMsg = userMessages[userMessages.length - 1]?.content.toLowerCase() || '';
  const count = userMessages.length;

  if (count === 1) {
    return {
      message: `That's a fascinating premise! I can already feel the shape of this story.\n\nLet me ask a few questions to understand your vision:\n\n**Who is this story really about?** Tell me about your main character — what drives them, what haunts them.`
    };
  }
  
  if (count === 2) {
    return {
      message: `Great character foundation. I can see them clearly.\n\n**What's the world like?** Is this grounded in reality, or are we building something fantastical? And what's the tone — should readers feel unsettled, hopeful, curious?`
    };
  }
  
  if (count === 3) {
    return {
      message: `I love that. The world and tone are coming together beautifully.\n\n**One more thing — how long are you thinking?** A tight, punchy novella? A sprawling epic? And is this for adults, young adults, or younger readers?\n\nAfter this I'll put together a complete proposal for you.`
    };
  }

  // After enough context, propose settings
  const proposedTitle = userMessages[0]?.content.split('.')[0].slice(0, 60) || 'Untitled';
  return {
    message: `Here's what I'm thinking for **"${proposedTitle}"**:\n\nI've drafted the full structure — chapter titles, premises, tone settings, everything. Take a look at the proposal below and adjust anything that doesn't feel right. When you're happy with it, hit **Create Project** and we'll dive in. ✨`,
    settings: {
      title: proposedTitle,
      subtype: 'novel',
      targetLength: 'medium',
      assistanceLevel: 3,
      narrativeControls: {
        toneMood: { lightDark: 60, hopefulGrim: 40, whimsicalSerious: 65 },
        pacing: 'balanced',
        dialogueWeight: 'balanced',
        focusMix: { character: 50, plot: 30, world: 20 },
        genreEmphasis: [],
      },
      chapterCount: 12,
      chapters: [
        { number: 1, title: 'The Invitation', premise: 'Introduce the protagonist in their ordinary world. A disruption arrives — an invitation, a discovery, or an encounter that sets everything in motion.' },
        { number: 2, title: 'Crossing the Threshold', premise: 'The protagonist makes a choice that can\'t be undone. The stakes become personal.' },
        { number: 3, title: 'New Rules', premise: 'The protagonist discovers the rules of this new reality. Allies and enemies begin to emerge.' },
        { number: 4, title: 'The First Test', premise: 'A challenge that reveals the protagonist\'s strengths and fatal flaw.' },
        { number: 5, title: 'Deepening', premise: 'Relationships deepen. Subplots weave in. The world expands.' },
        { number: 6, title: 'The Midpoint Turn', premise: 'Everything the protagonist believed is challenged. A revelation changes the game.' },
        { number: 7, title: 'Fallout', premise: 'Consequences cascade. Trust fractures. The protagonist must adapt or break.' },
        { number: 8, title: 'Gathering Storm', premise: 'Forces align against the protagonist. The path forward narrows.' },
        { number: 9, title: 'The Dark Night', premise: 'The lowest point. Loss, doubt, or betrayal pushes the protagonist to their limit.' },
        { number: 10, title: 'The Choice', premise: 'Armed with hard-won wisdom, the protagonist makes their defining decision.' },
        { number: 11, title: 'The Climax', premise: 'The final confrontation. Everything built to this moment pays off.' },
        { number: 12, title: 'Resolution', premise: 'The new equilibrium. The world has changed, and so has the protagonist.' },
      ],
    },
  };
}

interface Props {
  onClose: () => void;
}

export function ChatCreation({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: generateId(),
      role: 'assistant',
      content: "I'm Theodore, your story architect. ✨\n\nTell me about the story you want to write. What's the idea, the feeling, the world? Don't worry about structure yet — just tell me what excites you about this story.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [proposedSettings, setProposedSettings] = useState<ProposedSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editedSettings, setEditedSettings] = useState<ProposedSettings | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { addProject, setActiveProject, setCurrentView, addChapter } = useStore();
  const { createCharacter, createLocation, addEntry } = useCanonStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, proposedSettings]);

  const sendMessage = () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    // Simulate AI thinking
    setTimeout(() => {
      const response = getAIResponse(newMessages);
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      }]);
      if (response.settings) {
        setProposedSettings(response.settings);
        setEditedSettings(response.settings);
      }
      setIsTyping(false);
    }, 1200 + Math.random() * 800);
  };

  const createProject = () => {
    const settings = editedSettings || proposedSettings;
    if (!settings) return;

    const projectId = generateId();
    const now = new Date().toISOString();

    const project: Project = {
      id: projectId,
      title: settings.title,
      type: 'book',
      subtype: settings.subtype,
      targetLength: settings.targetLength,
      toneBaseline: '',
      assistanceLevel: settings.assistanceLevel,
      narrativeControls: settings.narrativeControls,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    addProject(project);

    for (const ch of settings.chapters) {
      addChapter({
        id: generateId(),
        projectId,
        number: ch.number,
        title: ch.title,
        timelinePosition: ch.number,
        status: 'premise-only',
        premise: {
          purpose: ch.premise,
          changes: '',
          characters: [],
          emotionalBeat: '',
          setupPayoff: [],
          constraints: [],
        },
        prose: '',
        referencedCanonIds: [],
        validationStatus: { isValid: true, checks: [] },
        createdAt: now,
        updatedAt: now,
      });
    }

    // Auto-generate canon entries from the conversation
    // In production: AI analyzes all messages and extracts characters, locations, systems
    // For now: create starter entries and auto-fill them
    const userContent = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
    
    // Create a protagonist character with auto-filled metadata
    const protagonist = createCharacter(projectId, 'Protagonist');
    protagonist.description = 'The main character — update name and details from your story concept';
    protagonist.character.role = 'protagonist';
    protagonist.character = autoFillCharacter(protagonist);
    addEntry(protagonist);

    // Create the primary setting
    const primaryLocation = createLocation(projectId, 'Primary Setting');
    primaryLocation.description = 'The main location — update from your story concept';
    primaryLocation.location = autoFillLocation(primaryLocation);
    addEntry(primaryLocation);

    setActiveProject(projectId);
    setCurrentView('project');
    onClose();
  };

  const settings = editedSettings || proposedSettings;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl" onClick={onClose} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-2xl mx-4 h-[80vh] flex flex-col animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-text-primary" />
            <h2 className="text-lg font-serif font-semibold">Plan Your Story</h2>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-sm transition-colors">
            Cancel
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'animate-fade-in max-w-[85%]',
                msg.role === 'user' ? 'ml-auto' : ''
              )}
            >
              <div
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line',
                  msg.role === 'user'
                    ? 'bg-text-primary text-text-inverse rounded-br-md'
                    : 'glass rounded-bl-md'
                )}
              >
                {msg.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i}>{part.slice(2, -2)}</strong>;
                  }
                  return part;
                })}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="animate-fade-in">
              <div className="glass px-4 py-3 rounded-2xl rounded-bl-md w-fit">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Proposed Settings Card */}
          {settings && !isTyping && (
            <div className="animate-scale-in">
              <div className="glass rounded-2xl overflow-hidden">
                {/* Settings Header */}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 size={16} />
                    <span className="text-sm font-medium">Proposed Settings</span>
                  </div>
                  <ChevronDown size={16} className={cn('transition-transform', showSettings && 'rotate-180')} />
                </button>

                {showSettings && (
                  <div className="px-5 pb-5 space-y-4 border-t border-black/5 pt-4 animate-fade-in">
                    {/* Title */}
                    <div>
                      <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Title</label>
                      <input
                        type="text"
                        value={settings.title}
                        onChange={(e) => setEditedSettings(prev => prev ? { ...prev, title: e.target.value } : prev)}
                        className="w-full mt-1 px-3 py-2 rounded-xl glass-input text-sm"
                      />
                    </div>

                    {/* Length */}
                    <div>
                      <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Length</label>
                      <div className="flex gap-2 mt-1">
                        {(['short', 'medium', 'long', 'epic'] as const).map((len) => (
                          <button
                            key={len}
                            onClick={() => setEditedSettings(prev => prev ? { ...prev, targetLength: len } : prev)}
                            className={cn(
                              'flex-1 py-2 text-xs rounded-xl transition-all capitalize',
                              settings.targetLength === len
                                ? 'bg-text-primary text-text-inverse shadow-md'
                                : 'glass-pill text-text-secondary hover:bg-white/60'
                            )}
                          >
                            {len}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tone */}
                    <div>
                      <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Tone</label>
                      <div className="space-y-2 mt-2">
                        <Slider
                          value={settings.narrativeControls.toneMood.lightDark}
                          onChange={(v) => setEditedSettings(prev => prev ? {
                            ...prev,
                            narrativeControls: { ...prev.narrativeControls, toneMood: { ...prev.narrativeControls.toneMood, lightDark: v } }
                          } : prev)}
                          leftLabel="Light"
                          rightLabel="Dark"
                        />
                        <Slider
                          value={settings.narrativeControls.toneMood.hopefulGrim}
                          onChange={(v) => setEditedSettings(prev => prev ? {
                            ...prev,
                            narrativeControls: { ...prev.narrativeControls, toneMood: { ...prev.narrativeControls.toneMood, hopefulGrim: v } }
                          } : prev)}
                          leftLabel="Hopeful"
                          rightLabel="Grim"
                        />
                        <Slider
                          value={settings.narrativeControls.toneMood.whimsicalSerious}
                          onChange={(v) => setEditedSettings(prev => prev ? {
                            ...prev,
                            narrativeControls: { ...prev.narrativeControls, toneMood: { ...prev.narrativeControls.toneMood, whimsicalSerious: v } }
                          } : prev)}
                          leftLabel="Whimsical"
                          rightLabel="Serious"
                        />
                      </div>
                    </div>

                    {/* Pacing */}
                    <div>
                      <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Pacing</label>
                      <div className="flex gap-1 mt-1 glass-pill p-1 rounded-xl">
                        {(['slow', 'balanced', 'fast'] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setEditedSettings(prev => prev ? {
                              ...prev,
                              narrativeControls: { ...prev.narrativeControls, pacing: p }
                            } : prev)}
                            className={cn(
                              'flex-1 py-1.5 text-xs rounded-lg transition-all capitalize',
                              settings.narrativeControls.pacing === p
                                ? 'bg-text-primary text-text-inverse shadow-sm'
                                : 'text-text-secondary'
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Chapters Preview */}
                <div className="px-5 pb-4 border-t border-black/5 pt-4">
                  <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">
                    {settings.chapters.length} Chapters Planned
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {settings.chapters.map((ch) => (
                      <div key={ch.number} className="flex gap-3 text-sm">
                        <span className="text-text-tertiary font-mono text-xs mt-0.5 w-6 text-right flex-shrink-0">{ch.number}</span>
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{ch.title}</div>
                          <div className="text-xs text-text-secondary line-clamp-2">{ch.premise}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Create Button */}
                <div className="px-5 pb-5">
                  <button
                    onClick={createProject}
                    className="w-full py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-medium shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Check size={16} />
                    Create Project
                  </button>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2">
          <div className="flex items-end gap-2 glass rounded-2xl p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Tell me about your story..."
              rows={1}
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm px-3 py-2 max-h-32 leading-relaxed"
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isTyping}
              className={cn(
                'p-2.5 rounded-xl transition-all',
                input.trim() && !isTyping
                  ? 'bg-text-primary text-text-inverse shadow-md hover:shadow-lg active:scale-95'
                  : 'text-text-tertiary'
              )}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
