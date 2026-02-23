import { useState } from 'react';
import {
  ChevronLeft, Pen, Monitor, Sparkles, Download, Bell,
  RotateCcw, Type, Quote, Minus, MoreHorizontal,
  Eye, Keyboard, Palette, Bot, Zap, Brain, Shield,
  FileText, BookOpen, Mail, BarChart3
} from 'lucide-react';
import { UsageDashboard } from '../credits/UsageDashboard';
import { useSettingsStore } from '../../store/settings';
import { cn } from '../../lib/utils';
import type {
  WritingStyleSettings, EditorSettings, AISettings,
  ExportSettings, NotificationSettings
} from '../../types/settings';

type Section = 'writing' | 'editor' | 'ai' | 'export' | 'notifications' | 'usage';

// ===== Reusable Components =====

function Toggle({ value, onChange, label, description }: {
  value: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div className="flex items-start justify-between py-3 group">
      <div className="flex-1 mr-4">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && <div className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-10 h-[22px] rounded-full transition-all duration-200 flex-shrink-0 mt-0.5',
          value ? 'bg-text-primary' : 'bg-black/10'
        )}
      >
        <div className={cn(
          'absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200',
          value ? 'left-[21px]' : 'left-[3px]'
        )} />
      </button>
    </div>
  );
}

function SegmentedControl<T extends string>({ value, onChange, options, label, description }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; description?: string;
}) {
  return (
    <div className="py-3">
      <div className="text-sm font-medium text-text-primary">{label}</div>
      {description && <div className="text-xs text-text-tertiary mt-0.5 mb-2 leading-relaxed">{description}</div>}
      <div className="flex gap-1 p-1 rounded-xl bg-black/[0.04] mt-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-all duration-200',
              value === opt.value
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderControl({ value, onChange, min, max, step, label, description, suffix }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number;
  label: string; description?: string; suffix?: string;
}) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-text-primary">{label}</div>
          {description && <div className="text-xs text-text-tertiary mt-0.5">{description}</div>}
        </div>
        <span className="text-xs font-mono text-text-secondary bg-black/[0.04] px-2 py-0.5 rounded-lg">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-black h-1 cursor-pointer"
      />
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="pt-5 pb-1">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.1em]">{label}</div>
    </div>
  );
}

// ===== Section Panels =====

function WritingStyleSection() {
  const { settings, updateWritingStyle } = useSettingsStore();
  const s = settings.writingStyle;

  return (
    <div className="animate-fade-in">
      <SectionDivider label="Punctuation & Formatting" />
      <Toggle
        value={s.emDashEnabled}
        onChange={(v) => updateWritingStyle({ emDashEnabled: v })}
        label="Em Dash Auto-Convert"
        description='Automatically convert double hyphens (--) to em dashes (—) in AI-generated prose'
      />
      <Toggle
        value={s.smartQuotes}
        onChange={(v) => updateWritingStyle({ smartQuotes: v })}
        label="Smart Quotes"
        description='Convert straight quotes ("") to curly typographic quotes ("")'
      />
      <Toggle
        value={s.oxfordComma}
        onChange={(v) => updateWritingStyle({ oxfordComma: v })}
        label="Oxford Comma"
        description="Enforce the serial comma in lists (red, white, and blue)"
      />
      <SegmentedControl
        value={s.ellipsisStyle}
        onChange={(v) => updateWritingStyle({ ellipsisStyle: v })}
        label="Ellipsis Style"
        description="How trailing-off text is represented"
        options={[
          { value: 'three-dots', label: 'Three dots (...)' },
          { value: 'unicode', label: 'Unicode (…)' },
        ]}
      />

      <SectionDivider label="Prose Preferences" />
      <Toggle
        value={s.avoidAdverbs}
        onChange={(v) => updateWritingStyle({ avoidAdverbs: v })}
        label="Minimize Adverbs"
        description='"She ran quickly" → "She sprinted." AI will favor strong verbs over adverb+verb pairs'
      />
      <Toggle
        value={s.preferActiveVoice}
        onChange={(v) => updateWritingStyle({ preferActiveVoice: v })}
        label="Prefer Active Voice"
        description='"The door was opened by her" → "She opened the door"'
      />
      <Toggle
        value={s.avoidFilterWords}
        onChange={(v) => updateWritingStyle({ avoidFilterWords: v })}
        label="Avoid Filter Words"
        description='Reduce "she felt," "he noticed," "it seemed" — let the reader experience directly'
      />
      <Toggle
        value={s.saidBookisms}
        onChange={(v) => updateWritingStyle({ saidBookisms: v })}
        label='Allow "Said" Alternatives'
        description='Let AI use "whispered," "exclaimed," "muttered" instead of always "said"'
      />
      <Toggle
        value={s.contractionsAllowed}
        onChange={(v) => updateWritingStyle({ contractionsAllowed: v })}
        label="Allow Contractions"
        description="Enable contractions in narrative prose (don't, can't, won't)"
      />

      <SectionDivider label="Paragraph & Scene" />
      <SegmentedControl
        value={s.paragraphLength}
        onChange={(v) => updateWritingStyle({ paragraphLength: v })}
        label="Paragraph Length"
        description="How AI structures paragraph breaks"
        options={[
          { value: 'short', label: 'Short' },
          { value: 'mixed', label: 'Mixed' },
          { value: 'long', label: 'Long' },
        ]}
      />
      <SegmentedControl
        value={s.sceneBreakStyle}
        onChange={(v) => updateWritingStyle({ sceneBreakStyle: v })}
        label="Scene Break Marker"
        options={[
          { value: '***', label: '***' },
          { value: '---', label: '---' },
          { value: '· · ·', label: '· · ·' },
          { value: 'blank', label: 'Blank' },
        ]}
      />
      <SegmentedControl
        value={s.chapterStartStyle}
        onChange={(v) => updateWritingStyle({ chapterStartStyle: v })}
        label="Chapter Opening Style"
        options={[
          { value: 'normal', label: 'Normal' },
          { value: 'drop-cap', label: 'Drop Cap' },
          { value: 'small-caps', label: 'Small Caps' },
        ]}
      />
    </div>
  );
}

function EditorSection() {
  const { settings, updateEditor } = useSettingsStore();
  const s = settings.editor;

  return (
    <div className="animate-fade-in">
      <SectionDivider label="Display" />
      <SegmentedControl
        value={s.fontFamily}
        onChange={(v) => updateEditor({ fontFamily: v })}
        label="Editor Font"
        options={[
          { value: 'serif', label: 'Serif' },
          { value: 'sans', label: 'Sans' },
          { value: 'mono', label: 'Mono' },
        ]}
      />
      <SliderControl
        value={s.fontSize} onChange={(v) => updateEditor({ fontSize: v })}
        min={14} max={24} step={1}
        label="Font Size" suffix="px"
      />
      <SliderControl
        value={s.lineHeight} onChange={(v) => updateEditor({ lineHeight: v })}
        min={1.5} max={2.5} step={0.1}
        label="Line Height" suffix="×"
      />
      <SegmentedControl
        value={s.editorWidth}
        onChange={(v) => updateEditor({ editorWidth: v })}
        label="Editor Width"
        description="Maximum width of the writing area"
        options={[
          { value: 'narrow', label: 'Narrow' },
          { value: 'medium', label: 'Medium' },
          { value: 'wide', label: 'Wide' },
        ]}
      />
      <SegmentedControl
        value={s.theme}
        onChange={(v) => updateEditor({ theme: v })}
        label="Theme"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'sepia', label: 'Sepia' },
          { value: 'dark', label: 'Dark' },
        ]}
      />

      <SectionDivider label="Info Bar" />
      <Toggle
        value={s.showWordCount}
        onChange={(v) => updateEditor({ showWordCount: v })}
        label="Show Word Count"
      />
      <Toggle
        value={s.showReadTime}
        onChange={(v) => updateEditor({ showReadTime: v })}
        label="Show Read Time"
      />
      <Toggle
        value={s.showParagraphNumbers}
        onChange={(v) => updateEditor({ showParagraphNumbers: v })}
        label="Paragraph Numbers"
        description="Show paragraph numbers in the gutter for easy reference"
      />

      <SectionDivider label="Behavior" />
      <SliderControl
        value={s.autosaveInterval} onChange={(v) => updateEditor({ autosaveInterval: v })}
        min={0} max={60} step={5}
        label="Auto-Save Interval" suffix="s" description="0 = manual save only"
      />
      <Toggle
        value={s.typewriterMode}
        onChange={(v) => updateEditor({ typewriterMode: v })}
        label="Typewriter Mode"
        description="Keep the active line vertically centered as you type"
      />
      <Toggle
        value={s.focusModeDefault}
        onChange={(v) => updateEditor({ focusModeDefault: v })}
        label="Default to Focus Mode"
        description="Open chapters in distraction-free fullscreen"
      />
      <Toggle
        value={s.spellcheck}
        onChange={(v) => updateEditor({ spellcheck: v })}
        label="Spellcheck"
        description="Browser-native spellcheck underlines"
      />
    </div>
  );
}

function AISection() {
  const { settings, updateAI } = useSettingsStore();
  const s = settings.ai;

  return (
    <div className="animate-fade-in">
      <SectionDivider label="Model" />
      <SegmentedControl
        value={s.preferredModel}
        onChange={(v) => updateAI({ preferredModel: v })}
        label="Preferred Model"
        description="Auto selects the best model for each task"
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'claude-opus', label: 'Opus' },
          { value: 'claude-sonnet', label: 'Sonnet' },
          { value: 'gpt-4o', label: 'GPT-4o' },
        ]}
      />
      <SliderControl
        value={s.temperature} onChange={(v) => updateAI({ temperature: v })}
        min={0} max={1.5} step={0.1}
        label="Temperature" description="Higher = more creative, lower = more consistent"
      />

      <SectionDivider label="Generation" />
      <Toggle
        value={s.autoSuggest}
        onChange={(v) => updateAI({ autoSuggest: v })}
        label="Inline Suggestions"
        description="Show ghost text completions as you type (like GitHub Copilot)"
      />
      {s.autoSuggest && (
        <SliderControl
          value={s.suggestAfterMs} onChange={(v) => updateAI({ suggestAfterMs: v })}
          min={500} max={5000} step={250}
          label="Suggestion Delay" suffix="ms" description="Wait time before showing suggestion"
        />
      )}
      <SegmentedControl
        value={s.generateLength}
        onChange={(v) => updateAI({ generateLength: v })}
        label="Default Generation Length"
        description="How much prose to generate per request"
        options={[
          { value: 'concise', label: 'Concise' },
          { value: 'standard', label: 'Standard' },
          { value: 'verbose', label: 'Verbose' },
        ]}
      />

      <SectionDivider label="AI Agents" />
      <Toggle
        value={s.autoRunContinuity}
        onChange={(v) => updateAI({ autoRunContinuity: v })}
        label="Auto-Run Continuity Check"
        description="Automatically validate for plot holes after each generation"
      />
      <Toggle
        value={s.autoRunLorekeeper}
        onChange={(v) => updateAI({ autoRunLorekeeper: v })}
        label="Auto-Update Canon"
        description="Automatically extract new characters, locations, and events from generated prose"
      />
      <Toggle
        value={s.showAgentReasoning}
        onChange={(v) => updateAI({ showAgentReasoning: v })}
        label="Show Agent Reasoning"
        description="Display the AI's thought process and decisions in a collapsible panel"
      />
      <Toggle
        value={s.redTeamEnabled}
        onChange={(v) => updateAI({ redTeamEnabled: v })}
        label="Red Team Agent"
        description="Enable a devil's advocate that challenges your plot, finds weak points, and suggests alternatives"
      />

      <SectionDivider label="Context" />
      <SegmentedControl
        value={s.contextWindow}
        onChange={(v) => updateAI({ contextWindow: v })}
        label="Context Window Size"
        description="How much surrounding text to include. More context = better coherence but higher cost."
        options={[
          { value: 'minimal', label: 'Minimal' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'maximum', label: 'Maximum' },
        ]}
      />
      <Toggle
        value={s.includeCanonInPrompt}
        onChange={(v) => updateAI({ includeCanonInPrompt: v })}
        label="Include Canon in Prompts"
        description="Always send relevant character/location data to the AI"
      />
      <Toggle
        value={s.includeOutlineInPrompt}
        onChange={(v) => updateAI({ includeOutlineInPrompt: v })}
        label="Include Outlines in Prompts"
        description="Send chapter premises and story outline for better coherence"
      />
    </div>
  );
}

function ExportSection() {
  const { settings, updateExport } = useSettingsStore();
  const s = settings.export;

  return (
    <div className="animate-fade-in">
      <SectionDivider label="Format" />
      <SegmentedControl
        value={s.defaultFormat}
        onChange={(v) => updateExport({ defaultFormat: v })}
        label="Default Export Format"
        options={[
          { value: 'docx', label: 'DOCX' },
          { value: 'pdf', label: 'PDF' },
          { value: 'epub', label: 'ePub' },
          { value: 'markdown', label: 'MD' },
          { value: 'txt', label: 'TXT' },
        ]}
      />
      <SegmentedControl
        value={s.pageSize}
        onChange={(v) => updateExport({ pageSize: v })}
        label="Page Size"
        options={[
          { value: 'letter', label: 'Letter' },
          { value: 'a4', label: 'A4' },
          { value: '6x9', label: '6×9 Book' },
        ]}
      />

      <SectionDivider label="Content" />
      <Toggle
        value={s.doubleSpaced}
        onChange={(v) => updateExport({ doubleSpaced: v })}
        label="Double Spaced"
        description="Industry standard for manuscript submissions"
      />
      <Toggle
        value={s.includeMetadata}
        onChange={(v) => updateExport({ includeMetadata: v })}
        label="Include Metadata"
        description="Add title page, author info, and generation dates"
      />
      <Toggle
        value={s.includeCanonAppendix}
        onChange={(v) => updateExport({ includeCanonAppendix: v })}
        label="Canon Appendix"
        description="Append character bios, location descriptions, and world rules"
      />
    </div>
  );
}

function NotificationsSection() {
  const { settings, updateNotifications } = useSettingsStore();
  const s = settings.notifications;

  return (
    <div className="animate-fade-in">
      <SectionDivider label="Alerts" />
      <Toggle
        value={s.generationComplete}
        onChange={(v) => updateNotifications({ generationComplete: v })}
        label="Generation Complete"
        description="Notify when AI finishes generating a chapter or scene"
      />
      <Toggle
        value={s.validationAlerts}
        onChange={(v) => updateNotifications({ validationAlerts: v })}
        label="Validation Alerts"
        description="Alert when canon changes create continuity issues"
      />
      <Toggle
        value={s.creditWarnings}
        onChange={(v) => updateNotifications({ creditWarnings: v })}
        label="Low Credit Warnings"
        description="Warn when credits drop below 20%"
      />
      <Toggle
        value={s.weeklyProgress}
        onChange={(v) => updateNotifications({ weeklyProgress: v })}
        label="Weekly Progress Report"
        description="Summary of words written, chapters completed, and credits used"
      />
    </div>
  );
}

// ===== Main Settings View =====

const SECTIONS: { id: Section; label: string; icon: typeof Pen; description: string }[] = [
  { id: 'writing', label: 'Writing Style', icon: Pen, description: 'Punctuation, prose rules, formatting' },
  { id: 'editor', label: 'Editor', icon: Monitor, description: 'Font, theme, layout, behavior' },
  { id: 'ai', label: 'AI & Generation', icon: Sparkles, description: 'Models, agents, context' },
  { id: 'export', label: 'Export', icon: Download, description: 'Format, page size, content' },
  { id: 'usage', label: 'Usage & Credits', icon: BarChart3, description: 'Token budget, spending, plan' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts and reports' },
];

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<Section>('writing');
  const [mobileShowContent, setMobileShowContent] = useState(false);

  const handleSectionClick = (id: Section) => {
    setActiveSection(id);
    setMobileShowContent(true);
  };
  const { setShowSettingsView, resetAll } = useSettingsStore();

  return (
    <div className="flex-1 flex overflow-hidden animate-fade-in">
      {/* Left nav */}
      <div className={cn(
        'flex-shrink-0 border-r border-black/5 p-4 sm:p-6 overflow-y-auto',
        mobileShowContent ? 'hidden sm:block w-64' : 'w-full sm:w-64'
      )}>
        <button
          onClick={() => setShowSettingsView(false)}
          className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm transition-colors mb-6 sm:mb-8"
        >
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>

        <h1 className="text-2xl font-serif font-semibold mb-1">Settings</h1>
        <p className="text-xs text-text-tertiary mb-6 sm:mb-8">Configure your writing environment</p>

        <nav className="space-y-1">
          {SECTIONS.map(({ id, label, icon: Icon, description }) => (
            <button
              key={id}
              onClick={() => handleSectionClick(id)}
              className={cn(
                'w-full text-left px-3 py-3 rounded-xl transition-all duration-200',
                activeSection === id
                  ? 'bg-black/[0.04]'
                  : 'hover:bg-black/[0.02]'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={15} className={activeSection === id ? 'text-text-primary' : 'text-text-tertiary'} />
                <div>
                  <div className={cn(
                    'text-sm font-medium',
                    activeSection === id ? 'text-text-primary' : 'text-text-secondary'
                  )}>
                    {label}
                  </div>
                  <div className="text-[10px] text-text-tertiary">{description}</div>
                </div>
              </div>
            </button>
          ))}
        </nav>

        <div className="mt-8 pt-6 border-t border-black/5">
          <button
            onClick={resetAll}
            className="flex items-center gap-2 text-xs text-text-tertiary hover:text-error transition-colors"
          >
            <RotateCcw size={13} />
            Reset All to Defaults
          </button>
        </div>
      </div>

      {/* Right content */}
      <div className={cn('flex-1 overflow-y-auto', !mobileShowContent && 'hidden sm:block')}>
        {/* Mobile back button */}
        <div className="sm:hidden p-3 border-b border-black/5">
          <button
            onClick={() => setMobileShowContent(false)}
            className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm"
          >
            <ChevronLeft size={16} />
            <span>Settings</span>
          </button>
        </div>
        <div className="max-w-xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <h2 className="text-xl font-serif font-semibold mb-1">
            {SECTIONS.find(s => s.id === activeSection)?.label}
          </h2>
          <p className="text-xs text-text-tertiary mb-2">
            {SECTIONS.find(s => s.id === activeSection)?.description}
          </p>
          <div className="divide-y divide-black/[0.04]">
            {activeSection === 'writing' && <WritingStyleSection />}
            {activeSection === 'editor' && <EditorSection />}
            {activeSection === 'ai' && <AISection />}
            {activeSection === 'export' && <ExportSection />}
            {activeSection === 'usage' && <UsageDashboard />}
            {activeSection === 'notifications' && <NotificationsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
