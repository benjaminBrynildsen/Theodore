import { useEffect } from 'react';
import { useStore } from './store';
import { useCanonStore } from './store/canon';
import { TopBar } from './components/layout/TopBar';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { RightSidebar } from './components/layout/RightSidebar';
import { Home } from './components/views/Home';
import { ProjectView } from './components/views/ProjectView';
import { CanonDetailPanel } from './components/canon/CanonDetailPanel';
import { UpgradeModal } from './components/credits/UpgradeModal';
import { ImpactPanel } from './components/validation/ImpactPanel';
import { SettingsView } from './components/views/SettingsView';
import { ReadingMode } from './components/views/ReadingMode';
import { ToolsView } from './components/views/ToolsView';
import { useSettingsStore } from './store/settings';

export default function App() {
  const {
    currentView,
    setCurrentView,
    showReadingMode,
    setShowReadingMode,
    showToolsView,
    setShowToolsView,
    activeProjectId,
    projects,
    loadProjects,
    rightSidebarOpen,
  } = useStore();
  const { showSettingsView } = useSettingsStore();
  const { activeEntryId, getEntry, setActiveEntry, loadEntries } = useCanonStore();
  const activeCanonEntry = activeEntryId ? getEntry(activeEntryId) : undefined;
  const hasActiveProject = !!activeProjectId && projects.some((p) => p.id === activeProjectId);

  // Load data from API on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load chapters and canon when active project changes
  useEffect(() => {
    if (activeProjectId) {
      useStore.getState().loadChapters(activeProjectId);
      loadEntries(activeProjectId);
    }
  }, [activeProjectId, loadEntries]);

  // Guard against stale persisted view/project ids that can produce a blank center pane.
  useEffect(() => {
    if ((currentView === 'project' || currentView === 'chapter') && !hasActiveProject) {
      setCurrentView('home');
    }
  }, [currentView, hasActiveProject, setCurrentView]);

  return (
    <div className="h-screen flex flex-col bg-bg">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        {!showSettingsView && !showToolsView && <div className="hidden sm:block h-full"><LeftSidebar /></div>}
        <main className="flex-1 flex overflow-hidden min-w-0">
          {showToolsView ? (
            <ToolsView onClose={() => setShowToolsView(false)} />
          ) : showSettingsView ? (
            <SettingsView />
          ) : (
            <>
              {(currentView === 'home' || !hasActiveProject) && <Home />}
              {(currentView === 'project' || currentView === 'chapter') && hasActiveProject && <ProjectView />}
            </>
          )}
        </main>
        
        {!showSettingsView && !showToolsView && activeCanonEntry && !rightSidebarOpen && (
          <div className="hidden md:block w-[420px] flex-shrink-0">
            <CanonDetailPanel
              entry={activeCanonEntry}
              onClose={() => setActiveEntry(null)}
            />
          </div>
        )}
        
        {!showSettingsView && !showToolsView && <div className="hidden sm:block"><RightSidebar /></div>}
      </div>
      
      <UpgradeModal />
      <ImpactPanel />
      {showReadingMode && <ReadingMode onClose={() => setShowReadingMode(false)} />}
{/* tools view handled inline */}
    </div>
  );
}
