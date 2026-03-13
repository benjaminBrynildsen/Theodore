import { Suspense, lazy, useEffect, useState } from 'react';
import { useStore } from './store';
import { useCanonStore } from './store/canon';
import { TopBar } from './components/layout/TopBar';
import { LeftSidebar } from './components/layout/LeftSidebar';
import { RightSidebar } from './components/layout/RightSidebar';
import { Home } from './components/views/Home';
import { ChatCreation } from './components/views/ChatCreation';
import { useSettingsStore } from './store/settings';
import { useAuthStore } from './store/auth';
import { useCreditsStore } from './store/credits';
import { api } from './lib/api';
import { BottomNav } from './components/layout/BottomNav';
import { AudioPlayerBar } from './components/layout/AudioPlayerBar';
import { AudiobookPanel } from './components/features/AudiobookPanel';

const ProjectView = lazy(async () => {
  const mod = await import('./components/views/ProjectView');
  return { default: mod.ProjectView };
});
const CanonDetailPanel = lazy(async () => {
  const mod = await import('./components/canon/CanonDetailPanel');
  return { default: mod.CanonDetailPanel };
});
const UpgradeModal = lazy(async () => {
  const mod = await import('./components/credits/UpgradeModal');
  return { default: mod.UpgradeModal };
});
const ImpactPanel = lazy(async () => {
  const mod = await import('./components/validation/ImpactPanel');
  return { default: mod.ImpactPanel };
});
const SettingsView = lazy(async () => {
  const mod = await import('./components/views/SettingsView');
  return { default: mod.SettingsView };
});
const ReadingMode = lazy(async () => {
  const mod = await import('./components/views/ReadingMode');
  return { default: mod.ReadingMode };
});
const ToolsView = lazy(async () => {
  const mod = await import('./components/views/ToolsView');
  return { default: mod.ToolsView };
});
const AuthView = lazy(async () => {
  const mod = await import('./components/views/AuthView');
  return { default: mod.AuthView };
});
const LandingPage = lazy(async () => {
  const mod = await import('./components/views/LandingPage');
  return { default: mod.LandingPage };
});

function ViewLoader({ label = 'Loading workspace...' }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="glass-pill px-4 py-2 text-sm text-text-secondary">{label}</div>
    </div>
  );
}

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
    mobilePanel,
    setMobilePanel,
  } = useStore();
  const { user, initialized, bootstrap } = useAuthStore();
  const hydrateCreditsFromUser = useCreditsStore((s) => s.hydrateFromUser);
  const setCreditTransactions = useCreditsStore((s) => s.setTransactions);
  const { showSettingsView } = useSettingsStore();
  const { activeEntryId, getEntry, setActiveEntry, loadEntries } = useCanonStore();
  const activeCanonEntry = activeEntryId ? getEntry(activeEntryId) : undefined;
  const hasActiveProject = !!activeProjectId && projects.some((p) => p.id === activeProjectId);
  const showWorkspaceChrome = !showSettingsView && !showToolsView && currentView !== 'home' && hasActiveProject;
  const [showAuth, setShowAuth] = useState(false);
  const [showGuestChat, setShowGuestChat] = useState(false);
  const [returnToChatAfterAuth, setReturnToChatAfterAuth] = useState(false);
  const [showPostAuthChat, setShowPostAuthChat] = useState(false);

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

  useEffect(() => {
    if (currentView === 'home' || !hasActiveProject) {
      useStore.setState({ leftSidebarOpen: false, rightSidebarOpen: false });
      if (activeEntryId) setActiveEntry(null);
    }
  }, [activeEntryId, currentView, hasActiveProject, setActiveEntry]);

  // After auth, if user came from guest chat, send them back to ChatCreation
  useEffect(() => {
    if (user && returnToChatAfterAuth) {
      setReturnToChatAfterAuth(false);
      setShowPostAuthChat(true);
    }
  }, [user, returnToChatAfterAuth]);

  if (!initialized) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-bg">
        <div className="glass-pill px-4 py-2 text-sm text-text-secondary">Checking session...</div>
      </div>
    );
  }

  if (!user) {
    if (showAuth) {
      return (
        <Suspense fallback={<ViewLoader label="Loading sign in..." />}>
          <AuthView onBack={() => {
            setShowAuth(false);
            if (returnToChatAfterAuth) {
              setShowGuestChat(true);
            }
          }} />
        </Suspense>
      );
    }
    if (showGuestChat) {
      return (
        <ChatCreation
          onClose={() => setShowGuestChat(false)}
          guestMode
          onRequireAuth={() => {
            setReturnToChatAfterAuth(true);
            setShowAuth(true);
            setShowGuestChat(false);
          }}
        />
      );
    }
    return (
      <Suspense fallback={<ViewLoader label="Loading Theodore..." />}>
        <LandingPage onGetStarted={() => setShowGuestChat(true)} onSignIn={() => setShowAuth(true)} />
      </Suspense>
    );
  }

  // Show ChatCreation as authenticated user after signing up from guest flow
  if (showPostAuthChat) {
    return (
      <ChatCreation
        onClose={() => setShowPostAuthChat(false)}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      <TopBar />
      <div className="flex-1 flex overflow-hidden pb-bottom-nav">
        {showWorkspaceChrome && <div className="hidden sm:block h-full"><LeftSidebar /></div>}
        <main className="flex-1 flex overflow-hidden min-w-0">
          <Suspense fallback={<ViewLoader />}>
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
          </Suspense>
        </main>
        
        {showWorkspaceChrome && activeCanonEntry && !rightSidebarOpen && (
          <div className="hidden md:block w-[420px] flex-shrink-0">
            <Suspense fallback={<ViewLoader label="Loading canon..." />}>
              <CanonDetailPanel
                entry={activeCanonEntry}
                onClose={() => setActiveEntry(null)}
              />
            </Suspense>
          </div>
        )}
        
        {showWorkspaceChrome && <div className="hidden sm:block h-full"><RightSidebar /></div>}
      </div>
      
      {showWorkspaceChrome && <AudioPlayerBar />}
      <BottomNav />

      {/* Mobile drawer — Left sidebar (chapters/canon) */}
      {mobilePanel === 'left' && (
        <div className="sm:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobilePanel(null)} />
          <div className="relative w-[85vw] max-w-[360px] h-full bg-bg shadow-2xl animate-slide-in-left overflow-y-auto pb-20">
            <LeftSidebar forceOpen />
          </div>
        </div>
      )}

      {/* Mobile drawer — Studio (audiobook panel) */}
      {mobilePanel === 'studio' && (
        <div className="sm:hidden fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobilePanel(null)} />
          <div className="relative w-[85vw] max-w-[360px] h-full bg-bg shadow-2xl animate-slide-in-right overflow-y-auto pb-20">
            <AudiobookPanel />
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        <UpgradeModal />
        <ImpactPanel />
      </Suspense>
      {showReadingMode && (
        <Suspense fallback={<ViewLoader label="Loading reading mode..." />}>
          <ReadingMode onClose={() => setShowReadingMode(false)} />
        </Suspense>
      )}
    </div>
  );
}
