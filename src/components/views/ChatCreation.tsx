import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Check, ChevronDown, Settings2, ArrowLeft } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { generateId, cn } from '../../lib/utils';
import { generateText } from '../../lib/generate';
import { api } from '../../lib/api';
import { Slider } from '../ui/Slider';
import { autoFillCharacter, autoFillLocation } from '../../lib/ai-autofill';
import type { Project, NarrativeControls, BookSubtype } from '../../types';

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

const DEFAULT_USER_ID = 'user-ben';

type ByokProvider = 'anthropic' | 'openai' | 'openrouter' | null;

function resolveModel(model: string, provider: ByokProvider): string {
  if (provider === 'openai') return 'gpt-4.1';
  if (provider === 'openrouter') return 'openai/gpt-4o-mini';
  if (provider === 'anthropic') return 'claude-sonnet-4-5';

  const map: Record<string, string> = {
    auto: 'claude-sonnet-4-5',
    'claude-opus': 'claude-opus-4-6',
    'claude-sonnet': 'claude-sonnet-4-5',
    'gpt-4o': 'gpt-4.1',
  };
  return map[model] || model;
}

function parseProposedSettings(text: string): { message: string; settings?: ProposedSettings } {
  const marker = 'THEODORE_SETTINGS_JSON:';
  const idx = text.indexOf(marker);
  if (idx === -1) return { message: text.trim() };

  const message = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + marker.length).trim();

  try {
    const parsed = JSON.parse(jsonPart) as ProposedSettings;
    if (!parsed.title || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      return { message };
    }
    return { message, settings: parsed };
  } catch {
    return { message };
  }
}

function getSuggestedPrompts(userMessageCount: number, hasSettings: boolean): string[] {
  if (hasSettings) {
    return [
      'Tighten the pacing in the middle chapters',
      'Make chapter 1 open with a stronger hook',
      'Add a subplot that increases emotional stakes',
      'Shift tone to darker and more suspenseful',
      'Adjust for a shorter 8-chapter structure',
    ];
  }

  if (userMessageCount <= 1) {
    return [
      'My story is about a woman who finds a hidden garden under a library',
      'I want a dark fantasy with hopeful undertones',
      'The main character is brilliant but emotionally guarded',
      'I want this to feel literary but still page-turning',
    ];
  }

  if (userMessageCount <= 3) {
    return [
      'The world is grounded but has one impossible magical system',
      'Target audience is adults, around 90k words',
      'I want high tension with quiet emotional moments',
      'Give me a clear arc with escalating stakes',
    ];
  }

  return [
    'Build the full story structure now',
    'Draft chapter-by-chapter premises',
    'Increase character focus over worldbuilding',
    'Make the ending bittersweet instead of fully happy',
  ];
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
  const [byokProvider, setByokProvider] = useState<ByokProvider>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [quickStructuring, setQuickStructuring] = useState(false);
  const [showMetadataPanel, setShowMetadataPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { addProject, setActiveProject, setCurrentView, addChapter } = useStore();
  const { createCharacter, createLocation, addEntry } = useCanonStore();
  const { settings } = useSettingsStore();

  useEffect(() => {
    api.upsertUser({
      id: DEFAULT_USER_ID,
      email: 'ben@theodore.app',
      name: 'Ben',
    }).then((user) => {
      if (user?.plan === 'byok' && user?.byokProvider) {
        setByokProvider(user.byokProvider as ByokProvider);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, proposedSettings]);

  const sendMessage = async () => {
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

    try {
      const user = await api.getUser(DEFAULT_USER_ID).catch(() => null);
      const activeProvider =
        user?.plan === 'byok' && user?.byokProvider
          ? (user.byokProvider as ByokProvider)
          : byokProvider;

      const conversation = newMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const result = await generateText({
        userId: DEFAULT_USER_ID,
        action: 'plan-project',
        model: resolveModel(settings.ai.preferredModel, activeProvider),
        temperature: settings.ai.temperature,
        maxTokens: 2200,
        systemPrompt: `You are Theodore, an expert story architect helping users shape new fiction projects.
Keep responses conversational, specific, and useful.
If you have enough context to propose a full project setup, append one line:
THEODORE_SETTINGS_JSON:{"title":"...","subtype":"novel","targetLength":"medium","assistanceLevel":3,"narrativeControls":{"toneMood":{"lightDark":50,"hopefulGrim":50,"whimsicalSerious":50},"pacing":"balanced","dialogueWeight":"balanced","focusMix":{"character":40,"plot":40,"world":20},"genreEmphasis":[]},"chapterCount":12,"chapters":[{"number":1,"title":"...","premise":"..."}]}
Rules for JSON:
- Must be valid JSON on a single line.
- chapterCount must match chapters.length.
- chapters must have at least 3 items.
- If not enough context, do not include THEODORE_SETTINGS_JSON.`,
        prompt: `Conversation so far:\n${conversation}\n\nRespond as Theodore to the latest user message.`,
      });

      const parsed = parseProposedSettings(result.text || '');
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content: parsed.message || "Let's keep building your story idea.",
        timestamp: new Date(),
      }]);
      if (parsed.settings) {
        setProposedSettings(parsed.settings);
        setEditedSettings(parsed.settings);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content: `I couldn't reach the model right now.\n\nError: ${msg}\n\nCheck Settings > Usage & Credits and confirm your key/provider match, then try again.`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const createProjectFromSettings = async (settings: ProposedSettings) => {
    if (creatingProject) return;
    setCreatingProject(true);
    try {
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

      await addProject(project);

      for (const ch of settings.chapters) {
        await addChapter({
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
    } finally {
      setCreatingProject(false);
    }
  };

  const createProject = async () => {
    const settings = editedSettings || proposedSettings;
    if (!settings) return;
    await createProjectFromSettings(settings);
  };

  const forceBuildStarterPlan = async (): Promise<ProposedSettings | null> => {
    if (quickStructuring) return null;
    setQuickStructuring(true);
    try {
      const conversation = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const result = await generateText({
        userId: DEFAULT_USER_ID,
        action: 'plan-project',
        model: resolveModel(settings.ai.preferredModel, byokProvider),
        temperature: 0.7,
        maxTokens: 2200,
        systemPrompt: `You are Theodore, an expert story architect.
Generate a complete starter plan from the available conversation context, even if incomplete.
Return two parts:
1) A short assistant message explaining assumptions made.
2) One line with:
THEODORE_SETTINGS_JSON:{"title":"...","subtype":"novel","targetLength":"medium","assistanceLevel":3,"narrativeControls":{"toneMood":{"lightDark":50,"hopefulGrim":50,"whimsicalSerious":50},"pacing":"balanced","dialogueWeight":"balanced","focusMix":{"character":40,"plot":40,"world":20},"genreEmphasis":[]},"chapterCount":3,"chapters":[{"number":1,"title":"...","premise":"..."},{"number":2,"title":"...","premise":"..."},{"number":3,"title":"...","premise":"..."}]}
Rules:
- Must be valid JSON on a single line.
- Must include exactly 3 chapters.
- Fill missing details with plausible defaults and state assumptions in the assistant message.`,
        prompt: `Build a ready-to-create starter plan using only what we already know.\n\nConversation:\n${conversation}`,
      });
      const parsed = parseProposedSettings(result.text || '');
      if (!parsed.settings) {
        setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          content: 'I could not produce a valid 3-chapter starter yet. Try one more detail, then tap the button again.',
          timestamp: new Date(),
        }]);
        return null;
      }
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content: parsed.message || 'Starter structure prepared from current context.',
        timestamp: new Date(),
      }]);
      setProposedSettings(parsed.settings);
      setEditedSettings(parsed.settings);
      setShowMetadataPanel(true);
      return parsed.settings;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        content: `Could not build a starter structure yet.\n\nError: ${msg}`,
        timestamp: new Date(),
      }]);
      return null;
    } finally {
      setQuickStructuring(false);
    }
  };

  const quickCreateFromCurrentContext = async () => {
    if (creatingProject || quickStructuring) return;
    const existing = editedSettings || proposedSettings;
    if (existing) {
      await createProjectFromSettings(existing);
      return;
    }
    const built = await forceBuildStarterPlan();
    if (built) await createProjectFromSettings(built);
  };

  const selectedSettings = editedSettings || proposedSettings;
  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const suggestedPrompts = getSuggestedPrompts(userMessageCount, Boolean(selectedSettings));

  return (
    <div className="flex-1 flex flex-col bg-bg animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-black/5">
          <button onClick={onClose} className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm transition-colors">
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-text-primary" />
            <span className="text-sm font-medium">Plan Your Story</span>
          </div>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          <div className="max-w-2xl mx-auto space-y-4">
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
          {selectedSettings && !isTyping && (
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
                        value={selectedSettings.title}
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
                              selectedSettings.targetLength === len
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
                          value={selectedSettings.narrativeControls.toneMood.lightDark}
                          onChange={(v) => setEditedSettings(prev => prev ? {
                            ...prev,
                            narrativeControls: { ...prev.narrativeControls, toneMood: { ...prev.narrativeControls.toneMood, lightDark: v } }
                          } : prev)}
                          leftLabel="Light"
                          rightLabel="Dark"
                        />
                        <Slider
                          value={selectedSettings.narrativeControls.toneMood.hopefulGrim}
                          onChange={(v) => setEditedSettings(prev => prev ? {
                            ...prev,
                            narrativeControls: { ...prev.narrativeControls, toneMood: { ...prev.narrativeControls.toneMood, hopefulGrim: v } }
                          } : prev)}
                          leftLabel="Hopeful"
                          rightLabel="Grim"
                        />
                        <Slider
                          value={selectedSettings.narrativeControls.toneMood.whimsicalSerious}
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
                              selectedSettings.narrativeControls.pacing === p
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
                    {selectedSettings.chapters.length} Chapters Planned
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedSettings.chapters.map((ch) => (
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
                    disabled={creatingProject}
                    className="w-full py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-medium shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Check size={16} />
                    {creatingProject ? 'Creating Project...' : 'Create Project'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showMetadataPanel && selectedSettings && (
            <div className="glass rounded-2xl p-4 animate-fade-in">
              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Metadata Snapshot</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="glass-pill px-3 py-2 rounded-xl">Title: {selectedSettings.title}</div>
                <div className="glass-pill px-3 py-2 rounded-xl">Type: {selectedSettings.subtype}</div>
                <div className="glass-pill px-3 py-2 rounded-xl">Length: {selectedSettings.targetLength}</div>
                <div className="glass-pill px-3 py-2 rounded-xl">Assist Level: {selectedSettings.assistanceLevel}</div>
                <div className="glass-pill px-3 py-2 rounded-xl">Pacing: {selectedSettings.narrativeControls.pacing}</div>
                <div className="glass-pill px-3 py-2 rounded-xl">Dialogue: {selectedSettings.narrativeControls.dialogueWeight}</div>
                <div className="glass-pill px-3 py-2 rounded-xl col-span-2">
                  Focus Mix: Character {selectedSettings.narrativeControls.focusMix.character}% / Plot {selectedSettings.narrativeControls.focusMix.plot}% / World {selectedSettings.narrativeControls.focusMix.world}%
                </div>
                <div className="glass-pill px-3 py-2 rounded-xl col-span-2">
                  Chapters Ready: {selectedSettings.chapters.length}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 max-w-2xl mx-auto w-full">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              onClick={forceBuildStarterPlan}
              disabled={quickStructuring || creatingProject}
              className="text-[11px] px-2.5 py-1.5 rounded-full bg-text-primary text-text-inverse hover:shadow-md transition-all disabled:opacity-60"
            >
              {quickStructuring ? 'Building 3-Chapter Starter...' : 'Use What We Have -> Build 3 Chapters'}
            </button>
            <button
              onClick={() => setShowMetadataPanel(v => !v)}
              disabled={!selectedSettings}
              className="text-[11px] px-2.5 py-1.5 rounded-full glass-pill text-text-secondary hover:text-text-primary transition-all disabled:opacity-40"
            >
              {showMetadataPanel ? 'Hide Metadata' : 'Show Metadata'}
            </button>
            <button
              onClick={quickCreateFromCurrentContext}
              disabled={quickStructuring || creatingProject}
              className="text-[11px] px-2.5 py-1.5 rounded-full glass-pill text-text-secondary hover:text-text-primary hover:bg-white/70 transition-all disabled:opacity-60"
            >
              {creatingProject ? 'Creating...' : 'I’m Ready -> Create Now'}
            </button>
          </div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  setInput(prompt);
                  inputRef.current?.focus();
                }}
                className="text-[11px] px-2.5 py-1.5 rounded-full glass-pill text-text-secondary hover:text-text-primary hover:bg-white/70 transition-all text-left"
              >
                {prompt}
              </button>
            ))}
          </div>
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
  );
}
