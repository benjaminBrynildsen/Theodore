import { useState, useRef } from 'react';
import { Plus, FileText, Lock, AlertTriangle, Edit3, GripVertical, AlertCircle, ImageIcon } from 'lucide-react';
import { useStore } from '../../store';
import { Badge } from '../ui/Badge';
import { ChapterView } from './ChapterView';
import { IllustrateButton } from '../features/IllustrateButton';
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
  const { getActiveProject, getProjectChapters, setActiveChapter, activeChapterId, addChapter, updateChapter } = useStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [reorderWarning, setReorderWarning] = useState<string | null>(null);
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
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-12 pb-8">
        <h1 className="text-3xl font-serif font-semibold tracking-tight mb-2">{project.title}</h1>
        <div className="flex items-center gap-3">
          <p className="text-text-tertiary text-sm capitalize">
            {project.subtype?.replace('-', ' ') || project.type} · {chapters.length} chapters · {project.targetLength} length
          </p>
          <IllustrateButton
            target="cover"
            projectId={project.id}
            compact
          />
        </div>
      </div>

      {/* Reorder warning */}
      {reorderWarning && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/10 text-warning text-sm animate-fade-in mb-4">
            <AlertCircle size={16} />
            {reorderWarning}
          </div>
        </div>
      )}

      {/* Chapter List */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pb-16">
        <div className="space-y-3">
          {chapters.map((chapter, index) => {
            const StatusIcon = statusIcons[chapter.status];
            return (
              <div
                key={chapter.id}
                draggable
                onDragStart={() => setDragIdx(index)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(index); }}
                onDragEnd={() => {
                  if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                    // Reorder chapters
                    const reordered = [...chapters];
                    const [moved] = reordered.splice(dragIdx, 1);
                    reordered.splice(dragOverIdx, 0, moved);
                    reordered.forEach((ch, i) => {
                      updateChapter(ch.id, { number: i + 1, timelinePosition: i + 1 });
                    });
                    // Check for continuity issues
                    if (moved.prose) {
                      setReorderWarning(`Moved "${moved.title}" — check continuity for referenced characters and events.`);
                      setTimeout(() => setReorderWarning(null), 5000);
                    }
                  }
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                className={cn(
                  'w-full text-left group animate-scale-in',
                  dragOverIdx === index && dragIdx !== index && 'border-t-2 border-text-primary'
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <button
                  onClick={() => setActiveChapter(chapter.id)}
                  className="w-full text-left"
                >
                <div className="flex items-start gap-4 p-5 rounded-2xl glass hover:bg-white/70 active:scale-[0.995] transition-all duration-200">
                  {/* Drag handle + Chapter Number */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <GripVertical size={14} className="text-text-tertiary/30 opacity-0 group-hover:opacity-100 cursor-grab transition-opacity" />
                    <div className="w-10 h-10 rounded-xl glass-pill flex items-center justify-center text-sm font-mono text-text-tertiary group-hover:bg-text-primary group-hover:text-text-inverse transition-all duration-200">
                      {chapter.number}
                    </div>
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
              </div>
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
