// ========== Settings Types ==========

export interface WritingStyleSettings {
  // Punctuation & Formatting
  emDashEnabled: boolean;            // Convert -- to em dash (—)
  smartQuotes: boolean;              // Convert straight quotes to curly
  oxfordComma: boolean;              // Enforce Oxford comma in AI output
  ellipsisStyle: 'three-dots' | 'unicode'; // ... vs …
  
  // Prose Preferences
  avoidAdverbs: boolean;             // Flag/reduce adverb usage
  preferActiveVoice: boolean;        // Favor active over passive
  avoidFilterWords: boolean;         // Remove "seemed", "felt", "noticed" etc.
  saidBookisms: boolean;             // Allow alternatives to "said" (whispered, exclaimed)
  contractionsAllowed: boolean;      // Allow contractions in prose
  
  // Paragraph Style
  paragraphLength: 'short' | 'mixed' | 'long';
  sceneBreakStyle: '***' | '---' | '· · ·' | 'blank';
  chapterStartStyle: 'drop-cap' | 'normal' | 'small-caps';
}

export interface EditorSettings {
  // Display
  fontFamily: 'serif' | 'sans' | 'mono';
  fontSize: number;                  // 14-24
  lineHeight: number;                // 1.5-2.5
  editorWidth: 'narrow' | 'medium' | 'wide';
  showWordCount: boolean;
  showReadTime: boolean;
  showParagraphNumbers: boolean;
  
  // Behavior
  autosaveInterval: number;          // seconds, 0 = off
  typewriterMode: boolean;           // Keep cursor centered
  focusModeDefault: boolean;         // Start in focus mode
  spellcheck: boolean;
  
  // Theme
  theme: 'light' | 'sepia' | 'dark';
}

export interface AISettings {
  // Model Preferences
  preferredModel: 'claude-opus' | 'claude-sonnet' | 'gpt-4o' | 'auto';
  temperature: number;               // 0.0-1.5
  
  // Generation Behavior
  autoSuggest: boolean;              // Show inline completions
  suggestAfterMs: number;            // Delay before suggestion (500-5000)
  generateLength: 'concise' | 'standard' | 'verbose';
  
  // Agents
  autoRunContinuity: boolean;        // Auto-check after generation
  autoRunLorekeeper: boolean;        // Auto-update canon after generation
  showAgentReasoning: boolean;       // Show AI thought process
  redTeamEnabled: boolean;           // Enable devil's advocate agent
  
  // Context
  contextWindow: 'minimal' | 'balanced' | 'maximum'; // How much context to send
  includeCanonInPrompt: boolean;     // Always include relevant canon
  includeOutlineInPrompt: boolean;   // Include chapter outlines
}

export interface ExportSettings {
  defaultFormat: 'docx' | 'pdf' | 'epub' | 'markdown' | 'txt';
  includeMetadata: boolean;
  includeCanonAppendix: boolean;
  pageSize: 'letter' | 'a4' | '6x9';
  doubleSpaced: boolean;
}

export interface NotificationSettings {
  generationComplete: boolean;
  validationAlerts: boolean;
  creditWarnings: boolean;
  weeklyProgress: boolean;
}

export interface AppSettings {
  writingStyle: WritingStyleSettings;
  editor: EditorSettings;
  ai: AISettings;
  export: ExportSettings;
  notifications: NotificationSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  writingStyle: {
    emDashEnabled: false,
    smartQuotes: true,
    oxfordComma: true,
    ellipsisStyle: 'three-dots',
    avoidAdverbs: false,
    preferActiveVoice: true,
    avoidFilterWords: false,
    saidBookisms: true,
    contractionsAllowed: true,
    paragraphLength: 'mixed',
    sceneBreakStyle: '***',
    chapterStartStyle: 'normal',
  },
  editor: {
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 2.0,
    editorWidth: 'medium',
    showWordCount: true,
    showReadTime: true,
    showParagraphNumbers: false,
    autosaveInterval: 5,
    typewriterMode: false,
    focusModeDefault: false,
    spellcheck: true,
    theme: 'light',
  },
  ai: {
    preferredModel: 'auto',
    temperature: 0.8,
    autoSuggest: false,
    suggestAfterMs: 2000,
    generateLength: 'standard',
    autoRunContinuity: true,
    autoRunLorekeeper: true,
    showAgentReasoning: false,
    redTeamEnabled: false,
    contextWindow: 'balanced',
    includeCanonInPrompt: true,
    includeOutlineInPrompt: true,
  },
  export: {
    defaultFormat: 'docx',
    includeMetadata: false,
    includeCanonAppendix: false,
    pageSize: 'letter',
    doubleSpaced: true,
  },
  notifications: {
    generationComplete: true,
    validationAlerts: true,
    creditWarnings: true,
    weeklyProgress: false,
  },
};
