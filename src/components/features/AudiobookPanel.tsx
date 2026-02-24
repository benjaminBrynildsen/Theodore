import { useState } from 'react';
import { Headphones, Play, Pause, Download, Loader2, Mic, User } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { cn } from '../../lib/utils';
import type { CharacterEntry } from '../../types/canon';

interface VoiceAssignment {
  characterId: string;
  characterName: string;
  voiceId: string;
  voiceName: string;
  voicePreview?: string;
}

const ELEVENLABS_VOICES = [
  { id: 'rachel', name: 'Rachel', desc: 'Calm, young female', category: 'narration' },
  { id: 'drew', name: 'Drew', desc: 'Well-rounded male', category: 'narration' },
  { id: 'clyde', name: 'Clyde', desc: 'War veteran, deep', category: 'character' },
  { id: 'domi', name: 'Domi', desc: 'Strong, assertive female', category: 'character' },
  { id: 'dave', name: 'Dave', desc: 'Young British male', category: 'character' },
  { id: 'fin', name: 'Fin', desc: 'Older Irish male', category: 'character' },
  { id: 'sarah', name: 'Sarah', desc: 'Soft, young female', category: 'character' },
  { id: 'antoni', name: 'Antoni', desc: 'Well-rounded male', category: 'character' },
  { id: 'elli', name: 'Elli', desc: 'Emotional young female', category: 'character' },
  { id: 'josh', name: 'Josh', desc: 'Deep, young male', category: 'character' },
  { id: 'narrator', name: 'Narrator (Default)', desc: 'Professional narration voice', category: 'narration' },
];

export function AudiobookPanel() {
  const { getActiveProject, getProjectChapters } = useStore();
  const { entries } = useCanonStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose).sort((a, b) => a.number - b.number) : [];
  const characters = entries.filter(e => e.projectId === project?.id && e.type === 'character') as CharacterEntry[];

  const [narratorVoice, setNarratorVoice] = useState('narrator');
  const [voiceAssignments, setVoiceAssignments] = useState<VoiceAssignment[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedChapters, setGeneratedChapters] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<string | null>(null);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [exportFormat, setExportFormat] = useState<'mp3' | 'm4b' | 'wav'>('mp3');

  const assignVoice = (charId: string, charName: string, voiceId: string) => {
    const voice = ELEVENLABS_VOICES.find(v => v.id === voiceId);
    setVoiceAssignments(prev => {
      const filtered = prev.filter(a => a.characterId !== charId);
      return [...filtered, { characterId: charId, characterName: charName, voiceId, voiceName: voice?.name || voiceId }];
    });
  };

  const generateChapter = async (chapterId: string) => {
    setGenerating(chapterId);
    // Simulate generation — real implementation calls ElevenLabs API
    await new Promise(r => setTimeout(r, 3000));
    setGeneratedChapters(prev => new Set([...prev, chapterId]));
    setGenerating(null);
  };

  const safeProjectName = (project?.title || 'audiobook').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();

  const downloadTextFile = (name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleChapterAction = (chapterId: string) => {
    if (!generatedChapters.has(chapterId)) {
      void generateChapter(chapterId);
      return;
    }
    if (currentChapter !== chapterId) {
      setCurrentChapter(chapterId);
      setPlaying(true);
      return;
    }
    setPlaying((prev) => !prev);
  };

  const downloadChapter = (chapterId: string) => {
    const chapter = chapters.find((ch) => ch.id === chapterId);
    if (!chapter || !generatedChapters.has(chapterId)) return;

    const content = [
      `Project: ${project?.title || 'Untitled Project'}`,
      `Chapter: ${chapter.number} - ${chapter.title}`,
      `Narrator Voice: ${ELEVENLABS_VOICES.find((v) => v.id === narratorVoice)?.name || narratorVoice}`,
      `Character Voice Assignments: ${voiceAssignments.length}`,
      '',
      'This is a placeholder export file for the generated audiobook chapter.',
      'Wire this action to your TTS output URL once ElevenLabs generation is fully integrated.',
    ].join('\n');

    downloadTextFile(`${safeProjectName}-ch-${chapter.number}.${exportFormat}.txt`, content);
  };

  const generateAll = async () => {
    for (const ch of chapters) {
      if (!generatedChapters.has(ch.id)) {
        await generateChapter(ch.id);
      }
    }
  };

  const exportAll = () => {
    const generated = chapters.filter((ch) => generatedChapters.has(ch.id));
    if (!generated.length) return;

    const content = [
      `Project: ${project?.title || 'Untitled Project'}`,
      `Format: ${exportFormat.toUpperCase()}`,
      `Narrator Voice: ${ELEVENLABS_VOICES.find((v) => v.id === narratorVoice)?.name || narratorVoice}`,
      '',
      ...generated.map((ch) => `Chapter ${ch.number}: ${ch.title}`),
      '',
      'This is a placeholder bundle manifest for audiobook export.',
      'Replace with binary packaging once audio generation endpoints are integrated.',
    ].join('\n');

    downloadTextFile(`${safeProjectName}-full-audiobook.${exportFormat}.txt`, content);
  };

  if (!project) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-black/5">
        <div className="flex items-center gap-2 mb-1">
          <Headphones size={18} />
          <h2 className="text-lg font-serif font-semibold">Audiobook Studio</h2>
        </div>
        <p className="text-xs text-text-tertiary">Generate narrated audio for each chapter using ElevenLabs AI voices</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* API Key */}
        {!apiKeySet && (
          <div className="p-5 border-b border-black/5">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">ElevenLabs API Key</label>
            <div className="flex gap-2 mt-1">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk_..."
                className="flex-1 px-3 py-2 rounded-lg glass-input text-sm font-mono"
              />
              <button
                onClick={() => apiKey && setApiKeySet(true)}
                disabled={!apiKey}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  apiKey ? 'bg-text-primary text-text-inverse' : 'bg-black/5 text-text-tertiary'
                )}
              >
                Connect
              </button>
            </div>
          </div>
        )}

        {/* Narrator Voice */}
        <div className="p-5 border-b border-black/5">
          <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Narrator Voice</label>
          <div className="grid grid-cols-2 gap-1.5">
            {ELEVENLABS_VOICES.filter(v => v.category === 'narration').map(voice => (
              <button
                key={voice.id}
                onClick={() => setNarratorVoice(voice.id)}
                className={cn(
                  'text-left p-2.5 rounded-xl transition-all text-xs',
                  narratorVoice === voice.id ? 'bg-text-primary text-text-inverse' : 'glass-pill hover:bg-white/60'
                )}
              >
                <div className="font-medium">{voice.name}</div>
                <div className={cn('text-[10px]', narratorVoice === voice.id ? 'text-white/60' : 'text-text-tertiary')}>{voice.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Character Voice Assignments */}
        {characters.length > 0 && (
          <div className="p-5 border-b border-black/5">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Character Voices</label>
            <div className="space-y-2">
              {characters.map(char => {
                const assignment = voiceAssignments.find(a => a.characterId === char.id);
                return (
                  <div key={char.id} className="glass-pill rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <User size={12} className="text-text-tertiary" />
                      <span className="text-xs font-medium">{char.name}</span>
                      {assignment && <span className="text-[10px] text-text-tertiary">→ {assignment.voiceName}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ELEVENLABS_VOICES.filter(v => v.category === 'character').map(voice => (
                        <button
                          key={voice.id}
                          onClick={() => assignVoice(char.id, char.name, voice.id)}
                          className={cn(
                            'px-2 py-1 rounded-lg text-[10px] transition-all',
                            assignment?.voiceId === voice.id ? 'bg-text-primary text-text-inverse' : 'bg-black/5 hover:bg-black/10'
                          )}
                        >
                          {voice.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Chapter Generation */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Chapters</label>
            <button
              onClick={generateAll}
              disabled={generating !== null || chapters.length === 0}
              className="text-xs font-medium px-3 py-1 rounded-lg bg-text-primary text-text-inverse hover:shadow-md transition-all disabled:opacity-50"
            >
              Generate All
            </button>
          </div>
          <div className="space-y-1.5">
            {chapters.map(ch => {
              const isGenerated = generatedChapters.has(ch.id);
              const isGenerating = generating === ch.id;
              return (
                <div key={ch.id} className="flex items-center gap-3 p-3 rounded-xl glass-pill">
                  <button
                    onClick={() => handleChapterAction(ch.id)}
                    disabled={isGenerating}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                      isGenerated ? 'bg-text-primary text-text-inverse' : 'bg-black/5'
                    )}
                  >
                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> :
                     isGenerated ? (playing && currentChapter === ch.id ? <Pause size={14} /> : <Play size={14} />) :
                     <Mic size={14} className="text-text-tertiary" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">Ch. {ch.number}: {ch.title}</div>
                    <div className="text-[10px] text-text-tertiary">
                      {isGenerated ? '✓ Audio ready' : isGenerating ? 'Generating...' : `${ch.prose.split(/\s+/).length} words`}
                    </div>
                  </div>
                  {isGenerated && (
                    <button
                      onClick={() => downloadChapter(ch.id)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Export */}
          {generatedChapters.size > 0 && (
            <div className="mt-4 pt-4 border-t border-black/5">
              <button
                onClick={exportAll}
                className="w-full py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all"
              >
                <Download size={16} />
                Export Full Audiobook ({generatedChapters.size} chapters)
              </button>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setExportFormat('mp3')}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs transition-all',
                    exportFormat === 'mp3' ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-secondary hover:bg-white/60',
                  )}
                >
                  MP3
                </button>
                <button
                  onClick={() => setExportFormat('m4b')}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs transition-all',
                    exportFormat === 'm4b' ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-secondary hover:bg-white/60',
                  )}
                >
                  M4B (Audible)
                </button>
                <button
                  onClick={() => setExportFormat('wav')}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs transition-all',
                    exportFormat === 'wav' ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-secondary hover:bg-white/60',
                  )}
                >
                  WAV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
