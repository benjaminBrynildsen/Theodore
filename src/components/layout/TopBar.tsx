import { BookOpen, PanelLeft, PanelRight, ChevronLeft, Settings, BookMarked } from 'lucide-react';
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
    <header className="h-14 glass-subtle flex items-center px-4 gap-3 z-50 border-b-0">
      <button
        onClick={toggleLeftSidebar}
        className={cn(
          'p-1.5 rounded-xl transition-all duration-200',
          leftSidebarOpen ? 'text-text-primary glass-pill' : 'text-text-tertiary hover:text-text-primary hover:bg-white/30'
        )}
      >
        <PanelLeft size={18} />
      </button>

      {currentView !== 'home' && (
        <button
          onClick={() => {
            setCurrentView('home');
            setActiveProject(null);
            setActiveChapter(null);
          }}
          className="flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors text-sm"
        >
          <ChevronLeft size={16} />
          <span>Projects</span>
        </button>
      )}

      <div className="flex-1 flex items-center justify-center gap-3">
        {project ? (
          <>
            <BookOpen size={16} className="text-text-primary" />
            <span className="text-sm font-medium">{project.title}</span>
            <span className="text-xs text-text-tertiary capitalize glass-pill px-2 py-0.5 rounded-full">{project.subtype || project.type}</span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-lg font-serif font-semibold tracking-tight">Theodore</span>
            <span className="text-xs text-text-tertiary">Story Engine</span>
          </div>
        )}
      </div>

      {/* Reading Mode */}
      {project && (
        <button
          onClick={() => useStore.getState().setShowReadingMode(true)}
          className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200"
          title="Reading Mode"
        >
          <BookMarked size={18} />
        </button>
      )}

      {/* Settings */}
      <button
        onClick={() => useSettingsStore.getState().setShowSettingsView(true)}
        className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200"
      >
        <Settings size={18} />
      </button>

      {/* Credits Badge — always visible */}
      <CreditsBadge />

      {/* Validation status */}
      {project && <ValidationBadge />}

      {project && (
        <div className="flex items-center gap-1.5 text-xs text-text-secondary glass-pill px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span>AI Ready</span>
        </div>
      )}
      
      {project && (
        <button
          onClick={toggleRightSidebar}
          className={cn(
            'p-1.5 rounded-xl transition-all duration-200',
            rightSidebarOpen ? 'text-text-primary glass-pill' : 'text-text-tertiary hover:text-text-primary hover:bg-white/30'
          )}
        >
          <PanelRight size={18} />
        </button>
      )}
    </header>
  );
}
