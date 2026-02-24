import { PenSquare, Wrench, Settings, Home } from 'lucide-react';
import { useStore } from '../../store';
import { useSettingsStore } from '../../store/settings';
import { cn } from '../../lib/utils';

type Tab = 'write' | 'tools' | 'settings';

export function BottomNav() {
  const { showToolsView, setShowToolsView, activeProjectId, setCurrentView, setActiveProject, setActiveChapter } = useStore();
  const { showSettingsView, setShowSettingsView, setSettingsViewSection } = useSettingsStore();

  const activeTab: Tab = showSettingsView ? 'settings' : showToolsView ? 'tools' : 'write';

  const goTo = (tab: Tab) => {
    if (tab === 'write') {
      setShowSettingsView(false);
      setShowToolsView(false);
    } else if (tab === 'tools') {
      setShowSettingsView(false);
      setShowToolsView(true);
    } else {
      setShowToolsView(false);
      setSettingsViewSection('writing');
      setShowSettingsView(true);
    }
  };

  const tabs: { id: Tab; icon: typeof PenSquare; label: string }[] = [
    { id: 'write', icon: activeProjectId ? PenSquare : Home, label: activeProjectId ? 'Write' : 'Home' },
    { id: 'tools', icon: Wrench, label: 'Tools' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 glass-strong border-t border-white/30 safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-2">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => goTo(id)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
              activeTab === id
                ? 'text-text-primary'
                : 'text-text-tertiary active:text-text-primary'
            )}
          >
            <Icon size={20} strokeWidth={activeTab === id ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
