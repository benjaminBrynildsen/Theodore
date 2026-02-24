import { useEffect, useState } from 'react';
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
import { useAuthStore } from './store/auth';
import { useCreditsStore } from './store/credits';
import { api } from './lib/api';
import { AuthView } from './components/views/AuthView';
import { LandingPage } from './components/views/LandingPage';
import { BottomNav } from './components/layout/BottomNav';

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
    setCurrentUserId,
    rightSidebarOpen,
  } = useStore();
  const { user, initialized, bootstrap } = useAuthStore();
  const hydrateCreditsFromUser = useCreditsStore((s) => s.hydrateFromUser);
  const setCreditTransactions = useCreditsStore((s) => s.setTransactions);
  const { showSettingsView } = useSettingsStore();
  const { activeEntryId, getEntry, setActiveEntry, loadEntries } = useCanonStore();
  const activeCanonEntry = activeEntryId ? getEntry(activeEntryId) : undefined;
  const hasActiveProject = !!activeProjectId && projects.some((p) => p.id === activeProjectId);
  const [showAuth, setShowAuth] = useState(false);

  // Resolve session on mount
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Bind app data to authenticated user
  useEffect(() => {
    const userId = user?.id || null;
    setCurrentUserId(userId);
    hydrateCreditsFromUser(user || null);
    if (userId) {
      loadProjects();
      api.listTransactions(userId).then((rows) => {
        const mapped = rows.map((tx: any) => {
          const meta = tx.metadata || {};
          return {
            id: String(tx.id),
            action: tx.action,
            creditsUsed: Number(tx.creditsUsed || 0),
            tokensInput: Number(meta.inputTokens || 0),
            tokensOutput: Number(meta.outputTokens || 0),
            model: tx.model || 'unknown',
            projectId: meta.projectId,
            chapterId: tx.chapterId || undefined,
            timestamp: tx.createdAt || new Date().toISOString(),
          };
        });
        setCreditTransactions(mapped);
      }).catch(() => setCreditTransactions([]));
    } else {
      useStore.setState({
        projects: [],
        chapters: [],
        activeProjectId: null,
        activeChapterId: null,
        currentView: 'home',
      });
      useCanonStore.setState({ entries: [], activeEntryId: null, editingEntryId: null });
      setCreditTransactions([]);
    }
  }, [hydrateCreditsFromUser, loadProjects, setCreditTransactions, setCurrentUserId, user]);

  // Load chapters and canon when active project changes
  useEffect(() => {
    if (activeProjectId && user?.id) {
      useStore.getState().loadChapters(activeProjectId);
      loadEntries(activeProjectId);
    }
  }, [activeProjectId, loadEntries, user?.id]);

  // Guard against stale persisted view/project ids that can produce a blank center pane.
  useEffect(() => {
    if ((currentView === 'project' || currentView === 'chapter') && !hasActiveProject) {
      setCurrentView('home');
    }
  }, [currentView, hasActiveProject, setCurrentView]);

  if (!initialized) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-bg">
        <div className="glass-pill px-4 py-2 text-sm text-text-secondary">Checking session...</div>
      </div>
    );
  }

  if (!user) {
    if (showAuth) return <AuthView onBack={() => setShowAuth(false)} />;
    return <LandingPage onGetStarted={() => setShowAuth(true)} />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      <TopBar />
      <div className="flex-1 flex overflow-hidden pb-bottom-nav">
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
      
      <BottomNav />
      <UpgradeModal />
      <ImpactPanel />
      {showReadingMode && <ReadingMode onClose={() => setShowReadingMode(false)} />}
    </div>
  );
}
