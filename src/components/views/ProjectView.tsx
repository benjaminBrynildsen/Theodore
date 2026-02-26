import { useState, useRef } from 'react';
import { Plus, FileText, Lock, AlertTriangle, Edit3, GripVertical, AlertCircle, Sparkles, Loader2, LayoutGrid } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { Badge } from '../ui/Badge';
import { ChapterView } from './ChapterView';
import { IllustrateButton } from '../features/IllustrateButton';
import { CHAPTER_PRESETS, buildScaffoldPrompt, parseScaffoldResponse } from '../../lib/scaffold';
import { generateStream } from '../../lib/generate';
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
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [reorderWarning, setReorderWarning] = useState<string | null>(null);
  const [showScaffold, setShowScaffold] = useState(false);
  const [scaffoldCount, setScaffoldCount] = useState(12);
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const project = getActiveProject();
  
  if (!project) return null;

  const chapters = getProjectChapters(project.id);
  const activeChapter = chapters.find(c => c.id === activeChapterId);

  const handleScaffold = async () => {
    setScaffolding(true);
    setScaffoldError(null);

    const canonEntries = getProjectEntries(project.id);
    const prompt = buildScaffoldPrompt(project, scaffoldCount, canonEntries, chapters);

    let accumulated = '';
    await generateStream(
      {
        prompt,
        model: settings.ai?.preferredModel || 'gpt-4.1',
        maxTokens: 4096,
        action: 'scaffold-chapters',
        projectId: project.id,
      },
      (text) => { accumulated += text; },
      () => {
        try {
          const results = parseScaffoldResponse(accumulated);
          const now = new Date().toISOString();
          // Create chapters that don't already exist
          const existingNumbers = new Set(chapters.map(c => c.number));
          for (const r of results) {
            if (existingNumbers.has(r.number)) {
              // Update existing chapter's premise if it's empty
              const existing = chapters.find(c => c.number === r.number);
              if (existing && !existing.premise.purpose) {
                updateChapter(existing.id, {
                  title: r.title,
                  premise: {
                    purpose: r.purpose,
                    changes: r.changes,
                    emotionalBeat: r.emotionalBeat,
                    characters: r.characters,
                    constraints: r.constraints,
                    setupPayoff: [],
                  },
                });
              }
              continue;
            }
            addChapter({
              id: generateId(),
              projectId: project.id,
              number: r.number,
              title: r.title,
              timelinePosition: r.number,
              status: 'premise-only',
              premise: {
                purpose: r.purpose,
                changes: r.changes,
                emotionalBeat: r.emotionalBeat,
                characters: r.characters,
                constraints: r.constraints,
                setupPayoff: [],
              },
              prose: '',
              referencedCanonIds: [],
              validationStatus: { isValid: true, checks: [] },
              createdAt: now,
              updatedAt: now,
            });
          }
          setShowScaffold(false);
        } catch (e: any) {
          setScaffoldError(e.message);
        }
        setScaffolding(false);
      },
      (error) => {
        setScaffoldError(String(error));
        setScaffolding(false);
      },
    );
  };

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

      {/* Scaffold Panel */}
      {showScaffold && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 mb-6">
          <div className="rounded-2xl glass p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <LayoutGrid size={15} className="text-purple-500" />
                  Scaffold Story Outline
                </h3>
                <p className="text-xs text-text-tertiary mt-1">
                  AI generates titles, premises, and beats for every chapter
                </p>
              </div>
              <button onClick={() => setShowScaffold(false)} className="text-text-tertiary hover:text-text-primary text-xs">
                Cancel
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {CHAPTER_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setScaffoldCount(p.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-xs transition-all',
                    scaffoldCount === p.value
                      ? 'bg-text-primary text-text-inverse shadow-sm'
                      : 'glass-pill text-text-secondary hover:bg-white/60'
                  )}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-[10px] opacity-60">{p.desc}</div>
                </button>
              ))}
            </div>

            {chapters.length > 0 && (
              <p className="text-xs text-text-tertiary mb-3">
                ℹ️ {chapters.length} existing chapter{chapters.length !== 1 ? 's' : ''} will be kept — new chapters fill the gaps.
              </p>
            )}

            {scaffoldError && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{scaffoldError}</div>
            )}

            <button
              onClick={handleScaffold}
              disabled={scaffolding}
              className={cn(
                'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
                scaffolding
                  ? 'bg-black/5 text-text-tertiary'
                  : 'bg-text-primary text-text-inverse hover:shadow-lg'
              )}
            >
              {scaffolding ? (
                <><Loader2 size={14} className="animate-spin" /> Generating {scaffoldCount} chapters...</>
              ) : (
                <><Sparkles size={14} /> Generate {scaffoldCount}-Chapter Outline</>
              )}
            </button>
          </div>
        </div>
      )}

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

          {/* Add Chapter + Scaffold */}
          <div className="flex gap-3">
            <button
              onClick={addNewChapter}
              className="flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-black/10 text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all duration-200 text-sm"
            >
              <Plus size={16} />
              Add Chapter
            </button>
            <button
              onClick={() => setShowScaffold(!showScaffold)}
              className={cn(
                'flex items-center justify-center gap-2 px-5 py-4 rounded-2xl text-sm font-medium transition-all duration-200',
                showScaffold
                  ? 'bg-purple-100 text-purple-700'
                  : 'border border-dashed border-purple-300 text-purple-600 hover:bg-purple-50'
              )}
            >
              <Sparkles size={16} />
              Scaffold Outline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
