import { useState } from 'react';
import { Plus, BookOpen, Clock, ChevronRight, MessageSquare, Settings2, Upload } from 'lucide-react';
import { useStore } from '../../store';
import { NewProjectModal } from '../modals/NewProjectModal';
import { ImportProjectModal } from '../modals/ImportProjectModal';
import { ChatCreation } from './ChatCreation';
import { cn } from '../../lib/utils';

export function Home() {
  const [showNewProject, setShowNewProject] = useState(false);
  const [showChatCreation, setShowChatCreation] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const { projects, setActiveProject, setCurrentView } = useStore();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto">
      {/* Hero */}
      <div className="text-center mb-8 sm:mb-12 max-w-lg px-4">
        <h1 className="text-3xl sm:text-5xl font-serif font-semibold tracking-tight mb-3 sm:mb-4">Theodore</h1>
        <p className="text-text-secondary text-base sm:text-lg leading-relaxed">
          A story engine for writers who think in systems, not documents.
        </p>
      </div>

      {/* Creation Options */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 sm:mb-12 w-full sm:w-auto px-4 sm:px-0">
        {/* Chat-based creation (primary) */}
        <button
          onClick={() => setShowChatCreation(true)}
          className="glass px-6 sm:px-8 py-4 sm:py-5 rounded-2xl flex flex-row sm:flex-col items-center gap-3 text-text-primary hover:bg-white/70 active:scale-[0.98] transition-all duration-200 w-full sm:w-56"
        >
          <MessageSquare size={24} className="flex-shrink-0" />
          <div className="text-left sm:text-center">
            <div className="font-medium text-sm">Plan with AI</div>
            <div className="text-xs text-text-tertiary mt-0.5">Describe your idea, Theodore builds the blueprint</div>
          </div>
        </button>

        {/* Import existing */}
        <button
          onClick={() => setShowImport(true)}
          className="glass px-6 sm:px-8 py-4 sm:py-5 rounded-2xl flex flex-row sm:flex-col items-center gap-3 text-text-primary hover:bg-white/70 active:scale-[0.98] transition-all duration-200 w-full sm:w-56"
        >
          <Upload size={24} className="flex-shrink-0" />
          <div className="text-left sm:text-center">
            <div className="font-medium text-sm">Import Existing</div>
            <div className="text-xs text-text-tertiary mt-0.5">Bring your manuscript, outline, and notes</div>
          </div>
        </button>

        {/* Manual creation */}
        <button
          onClick={() => setShowNewProject(true)}
          className="glass-pill px-6 sm:px-8 py-4 sm:py-5 rounded-2xl flex flex-row sm:flex-col items-center gap-3 text-text-secondary hover:text-text-primary hover:bg-white/60 active:scale-[0.98] transition-all duration-200 w-full sm:w-56"
        >
          <Settings2 size={24} className="flex-shrink-0" />
          <div className="text-left sm:text-center">
            <div className="font-medium text-sm">Manual Setup</div>
            <div className="text-xs text-text-tertiary mt-0.5">Configure everything yourself</div>
          </div>
        </button>
      </div>

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

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      {showImport && <ImportProjectModal onClose={() => setShowImport(false)} />}
      {showChatCreation && <ChatCreation onClose={() => setShowChatCreation(false)} />}
    </div>
  );
}
