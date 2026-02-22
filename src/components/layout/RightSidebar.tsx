import { useState } from 'react';
import { Shield, GitBranch, Sparkles, AlertTriangle, MessageSquare, Feather, Swords, Headphones, Target, Image, Download, FileOutput, Sliders } from 'lucide-react';
import { useStore } from '../../store';
import { useSettingsStore } from '../../store/settings';
import { Slider } from '../ui/Slider';
import { WordCountGoals } from '../features/WordCountGoals';
import { MoodBoard } from '../features/MoodBoard';
import { StoryBibleExport } from '../features/StoryBibleExport';
import { ManuscriptFormatter } from '../features/ManuscriptFormatter';
import { AudiobookPanel } from '../features/AudiobookPanel';
import { cn } from '../../lib/utils';

const AI_AGENTS = [
  { id: 'architect', label: 'Architect', desc: 'Structure & pacing', icon: GitBranch },
  { id: 'lorekeeper', label: 'Lorekeeper', desc: 'Canon enforcement', icon: Shield },
  { id: 'continuity', label: 'Continuity Judge', desc: 'Timeline & consistency', icon: Sparkles },
  { id: 'dialogue', label: 'Dialogue Pass', desc: 'Voice & conversation', icon: MessageSquare },
  { id: 'prose', label: 'Prose Polisher', desc: 'Style & rhythm', icon: Feather },
  { id: 'redteam', label: 'Red Team', desc: 'Plot holes & weak points', icon: AlertTriangle },
];

type SidebarTab = 'controls' | 'progress' | 'mood' | 'audio' | 'export';

export function RightSidebar() {
  const { rightSidebarOpen, getActiveProject, updateProject } = useStore();
  const { settings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('controls');
  const [agentStates, setAgentStates] = useState<Record<string, boolean>>({
    architect: true, lorekeeper: true, continuity: true, dialogue: false, prose: false, redteam: settings.ai.redTeamEnabled,
  });
  const project = getActiveProject();
  
  if (!rightSidebarOpen || !project) return null;

  const tabs = [
    { id: 'controls' as const, icon: Sliders, label: 'Controls' },
    { id: 'progress' as const, icon: Target, label: 'Progress' },
    { id: 'mood' as const, icon: Image, label: 'Mood' },
    { id: 'audio' as const, icon: Headphones, label: 'Audio' },
    { id: 'export' as const, icon: FileOutput, label: 'Export' },
  ];

  const updateNarrative = (path: string, value: any) => {
    const nc = { ...project.narrativeControls };
    if (path.startsWith('toneMood.')) {
      const key = path.split('.')[1];
      nc.toneMood = { ...nc.toneMood, [key]: value };
    } else {
      (nc as any)[path] = value;
    }
    updateProject(project.id, { narrativeControls: nc, updatedAt: new Date().toISOString() });
  };

  const toggleAgent = (id: string) => {
    setAgentStates(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className="w-72 glass-subtle flex flex-col animate-slide-in-right border-l-0">
      {/* Tab bar */}
      <div className="flex border-b border-white/20 px-1 pt-1">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-t-lg text-[9px] transition-all',
              activeTab === id ? 'text-text-primary bg-white/20' : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab !== 'controls' && activeTab === 'progress' && (
        <div className="flex-1 overflow-y-auto"><WordCountGoals /></div>
      )}
      {activeTab === 'mood' && (
        <div className="flex-1 overflow-y-auto"><MoodBoard projectId={project.id} /></div>
      )}
      {activeTab === 'audio' && (
        <div className="flex-1 overflow-y-auto"><AudiobookPanel /></div>
      )}
      {activeTab === 'export' && (
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-white/20">
            <StoryBibleExport />
          </div>
          <ManuscriptFormatter />
        </div>
      )}

      {activeTab !== 'controls' ? null : <>
      {/* Validation */}
      <div className="p-4 border-b border-white/20">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Validation</h3>
        <div className="flex items-center gap-2 text-sm text-success glass-pill px-3 py-2 rounded-xl w-fit">
          <Shield size={14} />
          <span>All checks passing</span>
        </div>
      </div>

      {/* Narrative Controls */}
      <div className="p-4 border-b border-white/20">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">Narrative Controls</h3>
        <div className="space-y-4">
          <Slider
            value={project.narrativeControls.toneMood.lightDark}
            onChange={(v) => updateNarrative('toneMood.lightDark', v)}
            leftLabel="Light"
            rightLabel="Dark"
          />
          <Slider
            value={project.narrativeControls.toneMood.hopefulGrim}
            onChange={(v) => updateNarrative('toneMood.hopefulGrim', v)}
            leftLabel="Hopeful"
            rightLabel="Grim"
          />
          <Slider
            value={project.narrativeControls.toneMood.whimsicalSerious}
            onChange={(v) => updateNarrative('toneMood.whimsicalSerious', v)}
            leftLabel="Whimsical"
            rightLabel="Serious"
          />
        </div>
      </div>

      {/* Pacing */}
      <div className="p-4 border-b border-white/20">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Pacing</h3>
        <div className="flex gap-1 glass-pill p-1 rounded-xl">
          {(['slow', 'balanced', 'fast'] as const).map((p) => (
            <button
              key={p}
              onClick={() => updateNarrative('pacing', p)}
              className={cn(
                'flex-1 py-1.5 text-xs rounded-lg transition-all duration-200 capitalize',
                project.narrativeControls.pacing === p
                  ? 'bg-text-primary text-text-inverse shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Dialogue Weight */}
      <div className="p-4 border-b border-white/20">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Dialogue Weight</h3>
        <div className="flex gap-1 glass-pill p-1 rounded-xl">
          {(['sparse', 'balanced', 'heavy'] as const).map((d) => (
            <button
              key={d}
              onClick={() => updateNarrative('dialogueWeight', d)}
              className={cn(
                'flex-1 py-1.5 text-xs rounded-lg transition-all duration-200 capitalize',
                project.narrativeControls.dialogueWeight === d
                  ? 'bg-text-primary text-text-inverse shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* AI Agents */}
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">AI Agents</h3>
        <div className="space-y-1.5">
          {AI_AGENTS.map(({ id, label, desc, icon: Icon }) => (
            <button
              key={id}
              onClick={() => toggleAgent(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl glass-pill transition-all duration-200 hover:bg-white/50"
            >
              <Icon size={14} className={agentStates[id] ? 'text-text-primary' : 'text-text-tertiary'} />
              <div className="flex-1 min-w-0 text-left">
                <div className={cn('text-sm font-medium', !agentStates[id] && 'text-text-tertiary')}>{label}</div>
                <div className="text-xs text-text-tertiary">{desc}</div>
              </div>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                agentStates[id] ? 'bg-success' : 'bg-black/10'
              )} />
            </button>
          ))}
        </div>
      </div>
      </>}
    </aside>
  );
}
