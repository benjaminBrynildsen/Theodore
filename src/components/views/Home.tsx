import { useMemo, useState } from 'react';
import { Plus, BookOpen, Clock, ChevronRight, Upload } from 'lucide-react';
import { useStore } from '../../store';
import { ImportProjectModal } from '../modals/ImportProjectModal';
import { ChatCreation } from './ChatCreation';

export function Home() {
  const [showChatCreation, setShowChatCreation] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importedMessage, setImportedMessage] = useState<string | undefined>(undefined);
  const { projects, chapters, setActiveProject, setCurrentView } = useStore();

  const sortedProjects = useMemo(() => {
    let openedMap: Record<string, string> = {};
    try {
      openedMap = JSON.parse(localStorage.getItem('theodore:last-opened-projects') || '{}');
    } catch {
      openedMap = {};
    }

    const score = (project: { id: string; updatedAt: string }) => {
      const editedTs = new Date(project.updatedAt).getTime() || 0;
      const openedTs = openedMap[project.id] ? new Date(openedMap[project.id]).getTime() || 0 : 0;
      return Math.max(editedTs, openedTs);
    };

    return [...projects].sort((a, b) => score(b) - score(a));
  }, [projects]);

  // Full-screen chat creation
  if (showChatCreation) {
    return (
      <ChatCreation
        onClose={() => { setShowChatCreation(false); setImportedMessage(undefined); }}
        initialMessage={importedMessage}
      />
    );
  }

  // Main home screen
  return (
    <div className="flex-1 overflow-y-auto animate-fade-in">
      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Hero */}
      <div className="text-center mb-8 sm:mb-12 max-w-lg px-4">
        <h1 className="text-3xl sm:text-5xl font-serif font-semibold tracking-tight mb-3 sm:mb-4">Theodore</h1>
        <p className="text-text-secondary text-base sm:text-lg leading-relaxed">
          A story engine for writers who think in systems, not documents.
        </p>
      </div>

      {/* Single CTA — straight into Imagine */}
      <button
        onClick={() => setShowChatCreation(true)}
        className="glass px-8 py-4 rounded-2xl flex items-center gap-3 text-text-primary hover:bg-white/70 active:scale-[0.98] transition-all duration-200 mb-3"
      >
        <Plus size={20} />
        <span className="font-medium">Create New Project</span>
      </button>

      {/* Secondary import option for users with existing manuscripts */}
      <button
        onClick={() => setShowImport(true)}
        className="text-xs text-text-tertiary hover:text-text-primary inline-flex items-center gap-1.5 mb-8 sm:mb-12 transition-colors"
      >
        <Upload size={12} />
        <span>or import existing work</span>
      </button>

      {/* Existing Projects */}
      {projects.length > 0 && (
        <div className="w-full max-w-2xl px-4 sm:px-0">
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4 px-1">Your Projects</h2>
          <div className="space-y-3">
            {sortedProjects.map((project, i) => {
              const loadedCount = chapters.filter((c) => c.projectId === project.id).length;
              const chapterCount = typeof project.chapterCount === 'number' ? project.chapterCount : loadedCount;
              return (
              <button
                key={project.id}
                onClick={() => {
                  try {
                    const raw = localStorage.getItem('theodore:last-opened-projects');
                    const openedMap = raw ? JSON.parse(raw) : {};
                    openedMap[project.id] = new Date().toISOString();
                    localStorage.setItem('theodore:last-opened-projects', JSON.stringify(openedMap));
                  } catch {}
                  setActiveProject(project.id);
                  setCurrentView('project');
                }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl glass hover:bg-white/70 active:scale-[0.99] transition-all duration-200 group animate-scale-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {project.coverUrl && !project.coverUrl.startsWith('data:') ? (
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                    <img src={project.coverUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-xl glass-pill flex items-center justify-center group-hover:bg-text-primary group-hover:text-text-inverse transition-all duration-200">
                    <BookOpen size={20} />
                  </div>
                )}
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium">{project.title}</div>
                  <div className="text-sm text-text-tertiary capitalize flex items-center gap-2">
                    <span>{project.subtype?.replace('-', ' ') || project.type}</span>
                    <span className="text-text-tertiary/60">·</span>
                    <span>{chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-text-tertiary">
                  <div className="flex items-center gap-1 text-xs">
                    <Clock size={12} />
                    <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="text-center text-text-tertiary text-sm mt-4 glass-pill px-6 py-3 rounded-2xl">
          <p>No projects yet. Start by telling Theodore about your story.</p>
        </div>
      )}
      </div>
      {showImport && (
        <ImportProjectModal
          onClose={() => setShowImport(false)}
          onImported={(text) => {
            setImportedMessage(text);
            setShowImport(false);
            setShowChatCreation(true);
          }}
        />
      )}
    </div>
  );
}
