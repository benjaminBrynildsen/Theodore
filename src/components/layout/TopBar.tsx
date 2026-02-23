import { BookOpen, PanelLeft, PanelRight, BookMarked, Wrench, Settings, PenSquare } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { CreditsBadge } from '../credits/CreditsBadge';
import { ValidationBadge } from '../validation/ValidationBadge';
import { cn } from '../../lib/utils';

export function TopBar() {
  const { 
    toggleLeftSidebar, toggleRightSidebar, leftSidebarOpen, rightSidebarOpen,
    getActiveProject, setCurrentView, setActiveProject, setActiveChapter, showToolsView, setShowToolsView
  } = useStore();
  const { activeEntryId, setActiveEntry } = useCanonStore();
  const { showSettingsView, setShowSettingsView, setSettingsViewSection } = useSettingsStore();
  
  const project = getActiveProject();
  const activeMode: 'write' | 'tools' | 'settings' = showSettingsView ? 'settings' : showToolsView ? 'tools' : 'write';
  const goHome = () => {
    setShowToolsView(false);
    setShowSettingsView(false);
    setCurrentView('home');
    setActiveProject(null);
    setActiveChapter(null);
  };

  return (
    <header className="h-14 glass-subtle flex items-center px-3 sm:px-4 gap-2 sm:gap-3 z-50 border-b-0 overflow-x-auto">
      {/* Left sidebar toggle — hidden on mobile */}
      <button
        onClick={toggleLeftSidebar}
        className={cn(
          'p-1.5 rounded-xl transition-all duration-200 hidden sm:block flex-shrink-0',
          leftSidebarOpen ? 'text-text-primary glass-pill' : 'text-text-tertiary hover:text-text-primary hover:bg-white/30'
        )}
      >
        <PanelLeft size={18} />
      </button>

      {/* Center title */}
      <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 min-w-0">
        {project ? (
          <>
            <button
              onClick={goHome}
              className="flex items-center gap-2 min-w-0 rounded-xl px-2 py-1 hover:bg-white/30 transition-colors"
              title="Home"
            >
              <BookOpen size={16} className="text-text-primary flex-shrink-0 hidden sm:block" />
              <span className="text-sm font-medium truncate">{project.title}</span>
            </button>
            <span className="text-xs text-text-tertiary capitalize glass-pill px-2 py-0.5 rounded-full hidden md:inline-block flex-shrink-0">{project.subtype || project.type}</span>
            <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-black/[0.04]">
              <button
                onClick={() => {
                  setShowSettingsView(false);
                  setShowToolsView(false);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1',
                  activeMode === 'write' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-primary'
                )}
              >
                <PenSquare size={12} />
                Write
              </button>
              <button
                onClick={() => {
                  setShowSettingsView(false);
                  setShowToolsView(true);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1',
                  activeMode === 'tools' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-primary'
                )}
              >
                <Wrench size={12} />
                Tools
              </button>
              <button
                onClick={() => {
                  setShowToolsView(false);
                  setSettingsViewSection('writing');
                  setShowSettingsView(true);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1',
                  activeMode === 'settings' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-primary'
                )}
              >
                <Settings size={12} />
                Settings
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={goHome}
            className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/30 transition-colors"
            title="Home"
          >
            <span className="text-lg font-serif font-semibold tracking-tight">Theodore</span>
            <span className="text-xs text-text-tertiary hidden sm:inline">Story Engine</span>
          </button>
        )}
      </div>

      {/* Tools — icon only on mobile */}
      {project && (
        <button
          onClick={() => {
            setShowSettingsView(false);
            setShowToolsView(true);
          }}
          className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200 flex-shrink-0"
          title="Tools"
        >
          <Wrench size={18} />
        </button>
      )}

      {/* Reading Mode — hide on small mobile */}
      {project && (
        <button
          onClick={() => useStore.getState().setShowReadingMode(true)}
          className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200 flex-shrink-0 hidden sm:block"
          title="Reading Mode"
        >
          <BookMarked size={18} />
        </button>
      )}

      {/* Settings */}
      <button
        onClick={() => {
          setShowToolsView(false);
          setSettingsViewSection('writing');
          setShowSettingsView(true);
        }}
        className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200 flex-shrink-0"
        title="Settings"
      >
        <Settings size={18} />
      </button>

      {/* Credits Badge */}
      <CreditsBadge />

      {/* Validation — hide on mobile */}
      {project && <div className="hidden md:block"><ValidationBadge /></div>}

      {/* AI Ready — hide on mobile */}
      {project && (
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-text-secondary glass-pill px-3 py-1.5 rounded-full flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span>AI Ready</span>
        </div>
      )}
      
      {/* Right sidebar toggle — hidden on mobile */}
      {project && (
        <button
          onClick={() => {
            // If canon detail is open, close it and reveal the right sidebar.
            if (activeEntryId) {
              setActiveEntry(null);
              if (!rightSidebarOpen) toggleRightSidebar();
              return;
            }
            toggleRightSidebar();
          }}
          className={cn(
            'p-1.5 rounded-xl transition-all duration-200 hidden sm:block flex-shrink-0',
            rightSidebarOpen ? 'text-text-primary glass-pill' : 'text-text-tertiary hover:text-text-primary hover:bg-white/30'
          )}
        >
          <PanelRight size={18} />
        </button>
      )}

      {project && (
        <button
          onClick={goHome}
          className="hidden sm:inline-flex px-2.5 py-1.5 rounded-xl text-xs text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all"
          title="Projects"
        >
          Projects
        </button>
      )}
    </header>
  );
}
