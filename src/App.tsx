import { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
import { CookieConsent } from './components/layout/CookieConsent';
import { AudioPlayerBar } from './components/layout/AudioPlayerBar';
import { GenerationProgressBar } from './components/layout/GenerationProgressBar';
import { AudiobookPanel } from './components/features/AudiobookPanel';
import { MobilePlayerBar, MobilePlayerFullscreen } from './components/features/MobilePlayer';
import { MobileStudioPanel } from './components/layout/MobileStudioPanel';
import { useAudioStore } from './store/audio';
import * as pixel from './lib/pixel';
import { track as jTrack, setAdmin as setJourneyAdmin, setUser as setJourneyUser } from './lib/journey';
import { findCreator } from './data/creators';

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
const CreatorsPage = lazy(async () => {
  const mod = await import('./components/views/CreatorsPage');
  return { default: mod.CreatorsPage };
});
const AdminDashboard = lazy(async () => {
  const mod = await import('./components/admin/AdminDashboard');
  return { default: mod.AdminDashboard };
});
const GuestSignupModal = lazy(async () => {
  const mod = await import('./components/credits/GuestSignupModal');
  return { default: mod.GuestSignupModal };
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
  const [mobilePlayerExpanded, setMobilePlayerExpanded] = useState(false);
  const miniPlayerVisible = useAudioStore((s) => s.miniPlayerVisible);
  // Show a mobile-styled mini bar globally (above BottomNav) whenever audio is
  // active and we're not already showing the fullscreen player or the Studio
  // panel (which has its own inline version). This means the Edit/Read tabs
  // also surface a pause/expand bar when a chapter is playing.
  const showMobileMiniBar = showWorkspaceChrome && miniPlayerVisible && !mobilePlayerExpanded && mobilePanel !== 'studio' && !showReadingMode;

  // Listen for expand event from AudioPlayerBar
  useEffect(() => {
    const handler = () => setMobilePlayerExpanded(true);
    window.addEventListener('theodore:expandPlayer', handler);
    return () => window.removeEventListener('theodore:expandPlayer', handler);
  }, []);

  // Listen for auth prompt from guest features
  useEffect(() => {
    const handler = () => { setReturnToChatAfterAuth(false); setShowAuth(true); };
    window.addEventListener('theodore:showAuth', handler);
    return () => window.removeEventListener('theodore:showAuth', handler);
  }, []);

  // ── Meta Pixel: track view changes ──
  const prevView = useRef(currentView);
  useEffect(() => {
    if (currentView !== prevView.current) {
      prevView.current = currentView;
      pixel.trackPageView();
      pixel.trackViewContent({ content_name: currentView, content_category: 'view' });
    }
  }, [currentView]);

  // ── Meta Pixel: track sign-up ──
  // Only fire on ACTUAL new registrations, not session restoration.
  // We listen for a custom event dispatched by the auth flow after
  // a successful registration API call, not the user state change
  // (which also fires on every page load when the session hydrates).
  useEffect(() => {
    const handler = () => pixel.trackCompleteRegistration();
    window.addEventListener('theodore:registered', handler);
    return () => window.removeEventListener('theodore:registered', handler);
  }, []);

  // Tag journey sessions as admin so they're filtered out automatically
  const ADMIN_EMAILS = ['benbrynildsen5757@gmail.com', 'ben@germaniabrewhaus.com'];
  useEffect(() => {
    setJourneyAdmin(!!user && ADMIN_EMAILS.includes(user.email));
    setJourneyUser(user?.id || null);
  }, [user]);

  const [showGuestChat, setShowGuestChat] = useState(false);
  const [guestInitialMessage, setGuestInitialMessage] = useState<string | undefined>();
  const [returnToChatAfterAuth, setReturnToChatAfterAuth] = useState(false);
  const [showPostAuthChat, setShowPostAuthChat] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const [showAnimationTest, setShowAnimationTest] = useState(false);
  const [showGuestSignupModal, setShowGuestSignupModal] = useState(false);
  const [guestModalDismissed, setGuestModalDismissed] = useState(false);
  const guestModalTriggered = useRef(false);

  // Show guest signup modal 3 seconds after the workspace renders for guests.
  // Must be a top-level useEffect (not inside conditional render) to avoid
  // mounting/unmounting issues that cause the modal to glitch or disappear.
  // Show guest signup modal AFTER Chapter 1 finishes generating.
  // This ensures the user sees their novel (cover, chapters, prose) before
  // the modal slides in — much harder to dismiss when their book is visible.
  const isGuestWorkspace = !user && hasActiveProject && (currentView === 'project' || currentView === 'chapter');
  useEffect(() => {
    if (!isGuestWorkspace || guestModalDismissed || showGuestSignupModal) return;

    // Poll the store for cover art — the last thing to generate.
    // The user sees: chapter titles → Chapter 1 prose streaming → cover art appears.
    // Modal shows 3 seconds AFTER cover art is ready so they can take it in.
    const check = setInterval(() => {
      const store = useStore.getState();
      const project = store.projects.find(p => p.id === store.activeProjectId);
      if (project?.coverUrl && !project.coverUrl.startsWith('data:')) {
        clearInterval(check);
        setTimeout(() => setShowGuestSignupModal(true), 3000);
      }
    }, 1000);

    // Safety: if Chapter 1 never generates (error, timeout), show modal after 60s anyway
    const fallback = setTimeout(() => {
      clearInterval(check);
      if (!showGuestSignupModal && !guestModalDismissed) {
        setShowGuestSignupModal(true);
      }
    }, 60000);

    return () => { clearInterval(check); clearTimeout(fallback); };
  }, [isGuestWorkspace, guestModalDismissed, showGuestSignupModal, activeProjectId]);

  const [showGoogleTest, setShowGoogleTest] = useState(false);
  const [showCreators, setShowCreators] = useState(false);
  const [creatorSlug, setCreatorSlug] = useState<string | null>(null);

  // Detect special URLs on mount
  useEffect(() => {
    const pathname = window.location.pathname;
    if (pathname === '/admin') setShowAdmin(true);
    if (pathname === '/animationtest') setShowAnimationTest(true);
    if (pathname === '/googletest') setShowGoogleTest(true);
    if (pathname === '/creators' || pathname.startsWith('/creators/')) {
      setShowCreators(true);
      const m = pathname.match(/^\/creators\/([^/]+)\/?$/);
      if (m) setCreatorSlug(decodeURIComponent(m[1]));
    }
  }, []);

  // Handle ?prompt= from the static /go landing page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get('prompt');
    if (prompt) {
      pixel.trackCustom('PromptRedirectArrived');
      jTrack('prompt_redirect_arrived', { prompt: prompt.slice(0, 200) });
      setGuestInitialMessage(prompt);
      setShowGuestChat(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('prompt');
      window.history.replaceState({}, '', url.pathname + url.search || '/');
    }
  }, []);

  // Resolve session on mount
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Handle Stripe billing redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get('billing');
    if (billingResult === 'success' || billingResult === 'cancel') {
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('billing');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.pathname + url.search);
      // Re-fetch user data to get updated plan
      if (billingResult === 'success') {
        pixel.trackSubscribe(0); // value filled when pricing is known
        bootstrap();
      }
    }
  }, [bootstrap]);

  // Bind app data to authenticated user
  useEffect(() => {
    const userId = user?.id || null;
    setCurrentUserId(userId);
    hydrateCreditsFromUser(user || null);
    if (userId) {
      // Migrate guest data: if we have local projects that aren't on the server yet, push them
      const migrateGuestData = async () => {
        const localProjects = useStore.getState().projects;
        const localChapters = useStore.getState().chapters;
        const localCanonEntries = useCanonStore.getState().entries;

        if (localProjects.length > 0) {
          // We have local guest data — persist it to the new account before loading server data.
          // Note: the server *also* claims any guest_backups row tied to the
          // visitor's guest-session cookie at register/google time. That path
          // handles the "different device / cleared localStorage" case; this
          // client loop handles the happy path where localStorage survived.
          // Errors are now logged (previously silently swallowed), so a real
          // migration failure is visible in the console instead of masked as
          // an empty account.
          let migrationErrors = 0;
          for (const project of localProjects) {
            try {
              await api.createProject({
                ...project,
                userId,
                narrativeControls: project.narrativeControls,
              });
            } catch (err) {
              migrationErrors++;
              // Likely a duplicate (project already claimed server-side) — keep going.
              console.warn('[guest-migrate] createProject failed', project.id, err);
            }
          }
          for (const chapter of localChapters) {
            try {
              await api.createChapter(chapter);
            } catch (err) {
              migrationErrors++;
              console.warn('[guest-migrate] createChapter failed', chapter.id, err);
            }
          }
          for (const entry of localCanonEntries) {
            try {
              await api.createCanon({ ...entry, projectId: entry.projectId });
            } catch (err) {
              migrationErrors++;
              console.warn('[guest-migrate] createCanon failed', entry.id, err);
            }
          }
          if (migrationErrors > 0) {
            console.warn(`[guest-migrate] completed with ${migrationErrors} errors — server-side claim should have caught the rest`);
          }
        }

        // Now load from server (which includes the just-migrated data)
        const savedActiveProject = useStore.getState().activeProjectId;
        await loadProjects();
        // Restore the active project so the user stays where they were
        if (savedActiveProject) {
          const stillExists = useStore.getState().projects.some(p => p.id === savedActiveProject);
          if (stillExists) {
            useStore.setState({ activeProjectId: savedActiveProject, currentView: 'project' });
          }
        }
      };

      migrateGuestData();

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

  // Guest backup: while unauthenticated, debounce-push the visitor's local
  // project state to the server so signup doesn't lose it if localStorage
  // dies (different device, incognito, cache clear, delay). Cookie-keyed.
  // Server is authoritative for skipping when a session exists, but we also
  // early-return here to avoid needless traffic.
  useEffect(() => {
    if (user) return; // authed users persist via the normal /projects APIs
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSignature = '';

    const maybeBackup = () => {
      const projects = useStore.getState().projects;
      const chapters = useStore.getState().chapters;
      const entries = useCanonStore.getState().entries;
      if (projects.length === 0 && chapters.length === 0 && entries.length === 0) return;
      const activeProjectId = useStore.getState().activeProjectId || null;
      const payload = { projects, chapters, canonEntries: entries, activeProjectId };
      // Lightweight change detection — sizes + active id are enough to avoid
      // the common "nothing changed" case without hashing the full JSON.
      const signature = `${projects.length}:${chapters.length}:${entries.length}:${activeProjectId || ''}:${projects.reduce((n, p) => n + (p.updatedAt || ''), '')}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      api.guestBackup(payload).catch((err) => {
        // 413 (too large) and 429 (rate-limited) are non-fatal and expected
        // under abuse; log but don't retry in a tight loop.
        console.warn('[guest-backup] failed', err?.message || err);
      });
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(maybeBackup, 2000);
    };

    // Subscribe to both stores so any project/chapter/canon change triggers a debounced sync.
    const unsubProjects = useStore.subscribe(schedule);
    const unsubCanon = useCanonStore.subscribe(schedule);
    // Kick once in case there's already local state on mount.
    schedule();

    return () => {
      if (timer) clearTimeout(timer);
      unsubProjects();
      unsubCanon();
    };
  }, [user]);

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
    const hasPrompt = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('prompt');
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f6f6f4] gap-3">
        <div className="w-6 h-6 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
        <p className="text-sm text-black/40">
          {hasPrompt ? 'Building your story...' : 'Loading Theodore...'}
        </p>
      </div>
    );
  }

  // Creator program landing page (public, no auth needed)
  if (showCreators) {
    const matched = creatorSlug ? findCreator(creatorSlug) : null;
    return (
      <Suspense fallback={<ViewLoader label="Loading..." />}>
        <CreatorsPage creator={matched} />
      </Suspense>
    );
  }

  // Google auth test page (accessible without auth)
  if (showGoogleTest) {
    const GoogleAuthTest = lazy(() => import('./components/views/GoogleAuthTest').then(m => ({ default: m.GoogleAuthTest })));
    return (
      <Suspense fallback={<ViewLoader label="Loading..." />}>
        <GoogleAuthTest />
      </Suspense>
    );
  }

  // Animation test page (accessible without auth)
  if (showAnimationTest) {
    const AnimationTest = lazy(() => import('./components/views/AnimationTest').then(m => ({ default: m.AnimationTest })));
    return (
      <Suspense fallback={<ViewLoader label="Loading animations..." />}>
        <AnimationTest />
      </Suspense>
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
        <>
          <ChatCreation
            onClose={() => {
              setShowGuestChat(false);
              setGuestInitialMessage(undefined);
            }}
            guestMode
            initialMessage={guestInitialMessage}
            onRequireAuth={() => {
              setReturnToChatAfterAuth(true);
              setShowAuth(true);
              setShowGuestChat(false);
            }}
          />
          <GenerationProgressBar />
        </>
      );
    }
    // Guest just created a project — let them experience the workspace first
    if (hasActiveProject && (currentView === 'project' || currentView === 'chapter')) {
      return (
        <div className="h-screen flex flex-col bg-bg">
          <TopBar />
          {/* Persistent guest sign-up banner */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200/60 px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm text-amber-900">
              Your story will be lost when you leave. <span className="text-amber-700">Sign up free to keep it.</span>
            </p>
            <button
              onClick={() => { setGuestModalDismissed(false); setShowGuestSignupModal(true); }}
              className="px-4 py-1.5 rounded-lg bg-text-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity flex-shrink-0 ml-3"
            >
              Sign Up
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden pb-bottom-nav">
            {showWorkspaceChrome && <div className="hidden sm:block h-full"><LeftSidebar /></div>}
            <main className="flex-1 flex overflow-hidden min-w-0">
              <Suspense fallback={<ViewLoader />}>
                <ProjectView />
              </Suspense>
            </main>
            {showWorkspaceChrome && <div className="hidden sm:block h-full"><RightSidebar /></div>}
          </div>
          {showWorkspaceChrome && <AudioPlayerBar />}
          {showMobileMiniBar && (
            <div className="sm:hidden fixed bottom-14 inset-x-0 z-[52]">
              <MobilePlayerBar onExpand={() => setMobilePlayerExpanded(true)} />
            </div>
          )}
          <GenerationProgressBar />
          <BottomNav />

          {/* Mobile drawer — Left sidebar (chapters/canon) */}
          {mobilePanel === 'left' && (
            <div className="sm:hidden fixed inset-0 z-[60] flex">
              <div className="absolute inset-0 bg-black/30" onClick={() => setMobilePanel(null)} />
              <div className="relative w-[85vw] max-w-[360px] h-full bg-bg shadow-2xl animate-slide-in-left overflow-y-auto pb-20">
                <LeftSidebar forceOpen />
              </div>
            </div>
          )}

          {/* Mobile fullscreen — Studio (audiobook panel) */}
          {mobilePanel === 'studio' && !mobilePlayerExpanded && (
            <MobileStudioPanel
              onClose={() => setMobilePanel(null)}
              onExpandPlayer={() => setMobilePlayerExpanded(true)}
            />
          )}
          {mobilePlayerExpanded && (
            <MobilePlayerFullscreen onCollapse={() => setMobilePlayerExpanded(false)} />
          )}
          {showReadingMode && (
            <Suspense fallback={<ViewLoader label="Loading reading mode..." />}>
              <ReadingMode onClose={() => setShowReadingMode(false)} />
            </Suspense>
          )}
          {showGuestSignupModal && !guestModalDismissed && (
            <Suspense fallback={null}>
              <GuestSignupModal
                onSignUp={() => {
                  // Auth already completed inside the modal — just close it.
                  // The user state change will re-render App and show the
                  // authenticated workspace (guest data auto-migrates).
                  setShowGuestSignupModal(false);
                  setGuestModalDismissed(true);
                }}
                onDismiss={() => {
                  setShowGuestSignupModal(false);
                  setGuestModalDismissed(true);
                }}
              />
            </Suspense>
          )}
        </div>
      );
    }
    return (
      <Suspense fallback={<ViewLoader label="Loading Theodore..." />}>
        <LandingPage onGetStarted={(msg) => { pixel.trackCustom('StartGuestChat'); setGuestInitialMessage(msg); setShowGuestChat(true); }} onSignIn={() => setShowAuth(true)} />
      </Suspense>
    );
  }


  // Admin dashboard
  if (showAdmin) {
    return (
      <div className="h-screen flex flex-col bg-bg">
        <Suspense fallback={<ViewLoader label="Loading admin..." />}>
          <AdminDashboard onClose={() => {
            setShowAdmin(false);
            window.history.replaceState({}, '', '/');
          }} />
        </Suspense>
      </div>
    );
  }

  // Show ChatCreation as authenticated user after signing up from guest flow
  if (showPostAuthChat) {
    return (
      <>
        <ChatCreation
          onClose={() => setShowPostAuthChat(false)}
        />
        <GenerationProgressBar />
      </>
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
      {showMobileMiniBar && (
        <div className="sm:hidden fixed bottom-14 inset-x-0 z-[52]">
          <MobilePlayerBar onExpand={() => setMobilePlayerExpanded(true)} />
        </div>
      )}
      <GenerationProgressBar />
      <BottomNav />
      <CookieConsent />

      {/* Mobile drawer — Left sidebar (chapters/canon) */}
      {mobilePanel === 'left' && (
        <div className="sm:hidden fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobilePanel(null)} />
          <div className="relative w-[85vw] max-w-[360px] h-full bg-bg shadow-2xl animate-slide-in-left overflow-y-auto pb-20">
            <LeftSidebar forceOpen />
          </div>
        </div>
      )}

      {/* Mobile fullscreen — Studio (audio + cover tabs) */}
      {mobilePanel === 'studio' && !mobilePlayerExpanded && (
        <MobileStudioPanel
          onClose={() => setMobilePanel(null)}
          onExpandPlayer={() => setMobilePlayerExpanded(true)}
        />
      )}
      {mobilePlayerExpanded && (
        <MobilePlayerFullscreen onCollapse={() => setMobilePlayerExpanded(false)} />
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
