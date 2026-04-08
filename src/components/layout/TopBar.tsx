import { useEffect, useRef, useState } from 'react';
import { BookOpen, PanelLeft, PanelRight, BookMarked, Wrench, Settings, PenSquare, LogOut } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { useAuthStore } from '../../store/auth';
import { CreditsBadge } from '../credits/CreditsBadge';
import { ValidationBadge } from '../validation/ValidationBadge';
import { cn } from '../../lib/utils';

/**
 * Inline-editable project title. Click to edit, Enter or blur to save,
 * Escape to cancel. Used in TopBar so the user can rename their book from
 * any view without diving into settings.
 */
function EditableProjectTitle({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        className="text-sm font-medium bg-white/60 border border-black/10 rounded-md px-2 py-0.5 outline-none focus:ring-2 focus:ring-black/10 min-w-0 max-w-[40vw]"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm font-medium truncate rounded-md px-2 py-0.5 hover:bg-white/40 transition-colors max-w-[40vw]"
      title="Click to rename"
    >
      {value}
    </button>
  );
}

export function TopBar() {
  const {
    toggleLeftSidebar, toggleRightSidebar, leftSidebarOpen, rightSidebarOpen,
    getActiveProject, currentView, setCurrentView, setActiveProject, setActiveChapter, showToolsView, setShowToolsView,
    updateProject,
  } = useStore();
  const { activeEntryId, setActiveEntry } = useCanonStore();
  const { showSettingsView, setShowSettingsView, setSettingsViewSection } = useSettingsStore();
  const { logout } = useAuthStore();

  // On the home view we always want the "Theodore" wordmark in the center,
  // even if an active project is still lingering in state. Only treat as
  // in-project when we're actually inside a project/chapter view.
  const rawProject = getActiveProject();
  const project = currentView === 'home' ? null : rawProject;
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
      {/* Invisible spacer on mobile to balance the settings gear on the right */}
      <div className="w-[30px] flex-shrink-0 sm:hidden" />

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
              className="p-1.5 rounded-xl hover:bg-white/30 transition-colors hidden sm:block flex-shrink-0"
              title="Home"
            >
              <BookOpen size={16} className="text-text-primary" />
            </button>
            <EditableProjectTitle
              value={project.title}
              onSave={(title) => updateProject(project.id, { title })}
            />
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

      {/* Tools — hidden on mobile (bottom nav handles it) */}
      {project && (
        <button
          onClick={() => {
            setShowSettingsView(false);
            setShowToolsView(true);
          }}
          className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200 flex-shrink-0 hidden sm:block"
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

      {/* Settings — visible on all screen sizes */}
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

      <button
        onClick={() => { void logout(); }}
        className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all duration-200 flex-shrink-0 hidden sm:block"
        title="Sign out"
      >
        <LogOut size={18} />
      </button>

      {/* Credits Badge — hidden on mobile */}
      <div className="hidden sm:block"><CreditsBadge /></div>

      {/* Validation and AI Ready badges removed per Ben's request */}
      
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
