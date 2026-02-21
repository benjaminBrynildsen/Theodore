import { Plus, FileText, Lock, AlertTriangle, Edit3 } from 'lucide-react';
import { useStore } from '../../store';
import { Badge } from '../ui/Badge';
import { ChapterView } from './ChapterView';
import { cn, generateId } from '../../lib/utils';
import type { ChapterStatus } from '../../types';

const statusIcons: Record<ChapterStatus, React.ElementType> = {
  'premise-only': FileText,
  'draft-generated': Edit3,
  'human-edited': Edit3,
  'canon-locked': Lock,
  'out-of-alignment': AlertTriangle,
};

export function ProjectView() {
  const { getActiveProject, getProjectChapters, setActiveChapter, activeChapterId, addChapter } = useStore();
  const project = getActiveProject();
  
  if (!project) return null;

  const chapters = getProjectChapters(project.id);
  const activeChapter = chapters.find(c => c.id === activeChapterId);

  if (activeChapter) {
    return <ChapterView chapter={activeChapter} />;
  }

  const addNewChapter = () => {
    const now = new Date().toISOString();
    addChapter({
      id: generateId(),
      projectId: project.id,
      number: chapters.length + 1,
      title: `Chapter ${chapters.length + 1}`,
      timelinePosition: chapters.length + 1,
      status: 'premise-only',
      premise: { purpose: '', changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] },
      prose: '',
      referencedCanonIds: [],
      validationStatus: { isValid: true, checks: [] },
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Project Header */}
      <div className="max-w-3xl mx-auto px-8 pt-12 pb-8">
        <h1 className="text-3xl font-serif font-semibold tracking-tight mb-2">{project.title}</h1>
        <p className="text-text-tertiary text-sm capitalize">
          {project.subtype?.replace('-', ' ') || project.type} · {chapters.length} chapters · {project.targetLength} length
        </p>
      </div>

      {/* Chapter List */}
      <div className="max-w-3xl mx-auto px-8 pb-16">
        <div className="space-y-3">
          {chapters.map((chapter, index) => {
            const StatusIcon = statusIcons[chapter.status];
            return (
              <button
                key={chapter.id}
                onClick={() => setActiveChapter(chapter.id)}
                className="w-full text-left group animate-scale-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-start gap-4 p-5 rounded-2xl glass hover:bg-white/70 active:scale-[0.995] transition-all duration-200">
                  {/* Chapter Number */}
                  <div className="w-10 h-10 rounded-xl glass-pill flex items-center justify-center text-sm font-mono text-text-tertiary group-hover:bg-text-primary group-hover:text-text-inverse transition-all duration-200 flex-shrink-0">
                    {chapter.number}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{chapter.title}</span>
                      <Badge status={chapter.status} />
                    </div>
                    {chapter.premise.purpose ? (
                      <p className="text-sm text-text-secondary line-clamp-2">{chapter.premise.purpose}</p>
                    ) : (
                      <p className="text-sm text-text-tertiary italic">No premise yet — click to define</p>
                    )}
                  </div>

                  <StatusIcon size={16} className="text-text-tertiary mt-1 flex-shrink-0" />
                </div>
              </button>
            );
          })}

          {/* Add Chapter */}
          <button
            onClick={addNewChapter}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-black/10 text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all duration-200 text-sm"
          >
            <Plus size={16} />
            Add Chapter
          </button>
        </div>
      </div>
    </div>
  );
}
