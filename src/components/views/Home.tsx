import { useState } from 'react';
import { Plus, BookOpen, Clock, ChevronRight, MessageSquare, Settings2, Upload, ArrowLeft } from 'lucide-react';
import { useStore } from '../../store';
import { NewProjectModal } from '../modals/NewProjectModal';
import { ImportProjectModal } from '../modals/ImportProjectModal';
import { ChatCreation } from './ChatCreation';
import { cn } from '../../lib/utils';

type HomeScreen = 'main' | 'choose-method';

export function Home() {
  const [showNewProject, setShowNewProject] = useState(false);
  const [showChatCreation, setShowChatCreation] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [screen, setScreen] = useState<HomeScreen>('main');
  const { projects, setActiveProject, setCurrentView } = useStore();

  // Full-screen chat creation
  if (showChatCreation) {
    return <ChatCreation onClose={() => setShowChatCreation(false)} />;
  }

  // Method selection screen
  if (screen === 'choose-method') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto">
        <button
          onClick={() => setScreen('main')}
          className="self-start flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm mb-8 ml-2 sm:ml-0 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="text-center mb-8 sm:mb-12 max-w-lg px-4">
          <h2 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight mb-3">How would you like to start?</h2>
          <p className="text-text-secondary text-sm sm:text-base">Choose how you want to set up your project</p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-md px-4">
          <button
            onClick={() => setShowChatCreation(true)}
            className="glass px-6 py-5 rounded-2xl flex items-center gap-4 text-text-primary hover:bg-white/70 active:scale-[0.98] transition-all duration-200 w-full"
          >
            <div className="w-10 h-10 rounded-xl glass-pill flex items-center justify-center flex-shrink-0">
              <MessageSquare size={20} />
            </div>
            <div className="text-left">
              <div className="font-medium">Imagine</div>
              <div className="text-xs text-text-tertiary mt-0.5">Describe your idea, Theodore builds the blueprint</div>
            </div>
          </button>

          <button
            onClick={() => setShowImport(true)}
            className="glass px-6 py-5 rounded-2xl flex items-center gap-4 text-text-primary hover:bg-white/70 active:scale-[0.98] transition-all duration-200 w-full"
          >
            <div className="w-10 h-10 rounded-xl glass-pill flex items-center justify-center flex-shrink-0">
              <Upload size={20} />
            </div>
            <div className="text-left">
              <div className="font-medium">Import Existing Work</div>
              <div className="text-xs text-text-tertiary mt-0.5">Bring your unfinished or finished manuscript, notes and outlines etc</div>
            </div>
          </button>

          <button
            onClick={() => setShowNewProject(true)}
            className="glass-pill px-6 py-5 rounded-2xl flex items-center gap-4 text-text-secondary hover:text-text-primary hover:bg-white/60 active:scale-[0.98] transition-all duration-200 w-full"
          >
            <div className="w-10 h-10 rounded-xl glass-pill flex items-center justify-center flex-shrink-0">
              <Settings2 size={20} />
            </div>
            <div className="text-left">
              <div className="font-medium">Manual Setup</div>
              <div className="text-xs text-text-tertiary mt-0.5">Configure everything yourself</div>
            </div>
          </button>
        </div>

        {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
        {showImport && <ImportProjectModal onClose={() => setShowImport(false)} />}
      </div>
    );
  }

  // Main home screen
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto">
      {/* Hero */}
      <div className="text-center mb-8 sm:mb-12 max-w-lg px-4">
        <h1 className="text-3xl sm:text-5xl font-serif font-semibold tracking-tight mb-3 sm:mb-4">Theodore</h1>
        <p className="text-text-secondary text-base sm:text-lg leading-relaxed">
          A story engine for writers who think in systems, not documents.
        </p>
      </div>

      {/* Single CTA */}
      <button
        onClick={() => setScreen('choose-method')}
        className="glass px-8 py-4 rounded-2xl flex items-center gap-3 text-text-primary hover:bg-white/70 active:scale-[0.98] transition-all duration-200 mb-8 sm:mb-12"
      >
        <Plus size={20} />
        <span className="font-medium">Create New Project</span>
      </button>

      {/* Existing Projects */}
      {projects.length > 0 && (
        <div className="w-full max-w-2xl px-4 sm:px-0">
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4 px-1">Your Projects</h2>
          <div className="space-y-3">
            {projects.map((project, i) => (
              <button
                key={project.id}
                onClick={() => {
                  setActiveProject(project.id);
                  setCurrentView('project');
                }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl glass hover:bg-white/70 active:scale-[0.99] transition-all duration-200 group animate-scale-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="w-11 h-11 rounded-xl glass-pill flex items-center justify-center group-hover:bg-text-primary group-hover:text-text-inverse transition-all duration-200">
                  <BookOpen size={18} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium">{project.title}</div>
                  <div className="text-sm text-text-tertiary capitalize">
                    {project.subtype?.replace('-', ' ') || project.type}
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
            ))}
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
  );
}
