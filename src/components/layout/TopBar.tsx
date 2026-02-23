import { BookOpen, PanelLeft, PanelRight, ChevronLeft, Settings, BookMarked, Wrench, Menu } from 'lucide-react';
import { useStore } from '../../store';
import { useSettingsStore } from '../../store/settings';
import { CreditsBadge } from '../credits/CreditsBadge';
import { ValidationBadge } from '../validation/ValidationBadge';
import { cn } from '../../lib/utils';

export function TopBar() {
  const { 
    toggleLeftSidebar, toggleRightSidebar, leftSidebarOpen, rightSidebarOpen,
    getActiveProject, currentView, setCurrentView, setActiveProject, setActiveChapter
  } = useStore();
  
  const project = getActiveProject();

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

      {/* Back to projects */}
      {currentView !== 'home' && (
        <button
          onClick={() => {
            setCurrentView('home');
            setActiveProject(null);
            setActiveChapter(null);
          }}
          className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors text-sm flex-shrink-0"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Projects</span>
        </button>
      )}

      {/* Center title */}
      <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 min-w-0">
        {project ? (
          <>
            <BookOpen size={16} className="text-text-primary flex-shrink-0 hidden sm:block" />
            <span className="text-sm font-medium truncate">{project.title}</span>
            <span className="text-xs text-text-tertiary capitalize glass-pill px-2 py-0.5 rounded-full hidden md:inline-block flex-shrink-0">{project.subtype || project.type}</span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-lg font-serif font-semibold tracking-tight">Theodore</span>
            <span className="text-xs text-text-tertiary hidden sm:inline">Story Engine</span>
          </div>
        )}
      </div>

      {/* Tools — icon only on mobile */}
      {project && (
        <button
          onClick={() => useStore.getState().setShowToolsView(true)}
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
        onClick={() => useSettingsStore.getState().setShowSettingsView(true)}
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
          onClick={toggleRightSidebar}
          className={cn(
            'p-1.5 rounded-xl transition-all duration-200 hidden sm:block flex-shrink-0',
            rightSidebarOpen ? 'text-text-primary glass-pill' : 'text-text-tertiary hover:text-text-primary hover:bg-white/30'
          )}
        >
          <PanelRight size={18} />
        </button>
      )}
    </header>
  );
}
