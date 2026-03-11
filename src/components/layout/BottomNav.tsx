import { PenSquare, Wrench, Settings, Home, Headphones, Play, Pause, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { useSettingsStore } from '../../store/settings';
import { useAudioStore } from '../../store/audio';
import { cn } from '../../lib/utils';

type Tab = 'tools' | 'settings' | 'audio';

export function BottomNav() {
  const { showToolsView, setShowToolsView, activeProjectId, getActiveProject, getProjectChapters } = useStore();
  const { showSettingsView, setShowSettingsView, setSettingsViewSection } = useSettingsStore();
  const { playing, currentChapterId, generating, chapterAudio } = useAudioStore();

  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose).sort((a, b) => a.number - b.number) : [];
  const hasAnyAudio = chapters.some(c => chapterAudio[c.id]);
  const isGenerating = !!generating;
  const isPlaying = playing && !!currentChapterId;

  const activeTab: Tab | null = showSettingsView ? 'settings' : showToolsView ? 'tools' : null;

  const goTo = (tab: Tab) => {
    if (tab === 'tools') {
      setShowSettingsView(false);
      setShowToolsView(true);
    } else if (tab === 'settings') {
      setShowToolsView(false);
      setSettingsViewSection('writing');
      setShowSettingsView(true);
    } else if (tab === 'audio') {
      // Generate or toggle playback
      if (isGenerating) return;
      if (isPlaying) {
        useAudioStore.getState().setPlaying(false);
      } else if (hasAnyAudio && currentChapterId) {
        useAudioStore.getState().setPlaying(true);
      } else if (chapters.length > 0) {
        // Generate first chapter
        const first = chapters[0];
        window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId: first.id } }));
      }
    }
  };

  // Determine audio icon and label
  const getAudioIcon = () => {
    if (isGenerating) return Loader2;
    if (isPlaying) return Pause;
    if (hasAnyAudio) return Play;
    return Headphones;
  };
  const getAudioLabel = () => {
    if (isGenerating) return 'Generating';
    if (isPlaying) return 'Pause';
    if (hasAnyAudio) return 'Play';
    return 'Listen';
  };

  const AudioIcon = getAudioIcon();

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 glass-strong border-t border-white/30 safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-2">
        {/* Audio (replaces Write on mobile) */}
        <button
          onClick={() => goTo('audio')}
          disabled={isGenerating || (!activeProjectId || chapters.length === 0)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
            isPlaying ? 'text-text-primary' : 'text-text-tertiary active:text-text-primary',
            (isGenerating || (!activeProjectId || chapters.length === 0)) && 'opacity-40'
          )}
        >
          <AudioIcon size={20} strokeWidth={isPlaying ? 2.2 : 1.8} className={isGenerating ? 'animate-spin' : ''} />
          <span className="text-[10px] font-medium">{getAudioLabel()}</span>
        </button>

        {/* Tools */}
        <button
          onClick={() => goTo('tools')}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
            activeTab === 'tools' ? 'text-text-primary' : 'text-text-tertiary active:text-text-primary'
          )}
        >
          <Wrench size={20} strokeWidth={activeTab === 'tools' ? 2.2 : 1.8} />
          <span className="text-[10px] font-medium">Tools</span>
        </button>

        {/* Settings (restored) */}
        <button
          onClick={() => goTo('settings')}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
            activeTab === 'settings' ? 'text-text-primary' : 'text-text-tertiary active:text-text-primary'
          )}
        >
          <Settings size={20} strokeWidth={activeTab === 'settings' ? 2.2 : 1.8} />
          <span className="text-[10px] font-medium">Settings</span>
        </button>
      </div>
    </nav>
  );
}
