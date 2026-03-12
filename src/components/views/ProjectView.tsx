import { useState, useMemo } from 'react';
import { Plus, FileText, Lock, AlertTriangle, Edit3, GripVertical, AlertCircle, Sparkles, Loader2, LayoutGrid, Info, ImageIcon, Palette, Users, X, ChevronDown, ChevronUp } from 'lucide-react';
import { computeArcBreakpoints, getStructureById } from '../../lib/story-structures';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { Badge } from '../ui/Badge';
import { ChapterView } from './ChapterView';
import { IllustrateButton } from '../features/IllustrateButton';
import { CHAPTER_PRESETS, buildScaffoldPrompt, parseScaffoldResponse } from '../../lib/scaffold';
import { generateStream } from '../../lib/generate';
import { cn, generateId } from '../../lib/utils';
import type { ChapterStatus, CharacterVisual } from '../../types';

const statusIcons: Record<ChapterStatus, React.ElementType> = {
  'premise-only': FileText,
  'draft-generated': Edit3,
  'human-edited': Edit3,
  'canon-locked': Lock,
  'out-of-alignment': AlertTriangle,
};

export function ProjectView() {
  const { getActiveProject, getProjectChapters, setActiveChapter, activeChapterId, addChapter, updateChapter, updateProject } = useStore();
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [reorderWarning, setReorderWarning] = useState<string | null>(null);
  const [showScaffold, setShowScaffold] = useState(false);
  const [scaffoldCount, setScaffoldCount] = useState(12);
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [showArcLabels, setShowArcLabels] = useState(true);
  const [expandedBeatName, setExpandedBeatName] = useState<string | null>(null);
  const [showStyleGuide, setShowStyleGuide] = useState(false);
  const project = getActiveProject();

  if (!project) return null;

  const chapters = getProjectChapters(project.id);
  const activeChapter = chapters.find(c => c.id === activeChapterId);
  const isChildrensBook = project.subtype === 'childrens-book';
  const cbs = project.childrensBookSettings;

  // Dynamic narrative arc based on selected story structure
  const structureId = project.storyStructureId || 'plot-pyramid';
  const structure = getStructureById(structureId);
  const arcBreakpoints = useMemo(() => {
    return computeArcBreakpoints(structureId, chapters.length);
  }, [structureId, chapters.length]);

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
          const existingNumbers = new Set(chapters.map(c => c.number));
          for (const r of results) {
            if (existingNumbers.has(r.number)) {
              const existing = chapters.find(c => c.number === r.number);
              if (existing && !existing.premise?.purpose) {
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
      title: isChildrensBook ? `Page ${chapters.length + 1}` : `Chapter ${chapters.length + 1}`,
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

  // Style guide handlers for children's books
  const handleStyleGuideChange = (styleGuide: string) => {
    const updated = { ...(cbs || { ageRange: '3-5', illustrationStyle: 'watercolor', wordsPerSpread: 40, spreadCount: 16, hasRhyme: false }), styleGuide };
    updateProject(project.id, { childrensBookSettings: updated });
  };

  const handleAddCharacterVisual = () => {
    const visuals = [...(cbs?.characterVisuals || []), { name: '', description: '' }];
    const updated = { ...(cbs || { ageRange: '3-5', illustrationStyle: 'watercolor', wordsPerSpread: 40, spreadCount: 16, hasRhyme: false }), characterVisuals: visuals };
    updateProject(project.id, { childrensBookSettings: updated });
  };

  const handleUpdateCharacterVisual = (index: number, field: 'name' | 'description', value: string) => {
    const visuals = [...(cbs?.characterVisuals || [])];
    visuals[index] = { ...visuals[index], [field]: value };
    const updated = { ...(cbs || { ageRange: '3-5', illustrationStyle: 'watercolor', wordsPerSpread: 40, spreadCount: 16, hasRhyme: false }), characterVisuals: visuals };
    updateProject(project.id, { childrensBookSettings: updated });
  };

  const handleRemoveCharacterVisual = (index: number) => {
    const visuals = [...(cbs?.characterVisuals || [])];
    visuals.splice(index, 1);
    const updated = { ...(cbs || { ageRange: '3-5', illustrationStyle: 'watercolor', wordsPerSpread: 40, spreadCount: 16, hasRhyme: false }), characterVisuals: visuals };
    updateProject(project.id, { childrensBookSettings: updated });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Project Header */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-12 pb-8">
        <h1 className="text-3xl font-serif font-semibold tracking-tight mb-2">{project.title}</h1>
        <div className="flex items-center gap-3">
          <p className="text-text-tertiary text-sm capitalize">
            {project.subtype?.replace('-', ' ') || project.type} · {chapters.length} {isChildrensBook ? 'pages' : 'chapters'}
            {isChildrensBook && cbs
              ? ` · ${cbs.ageRange} years · ${cbs.illustrationStyle}`
              : ` · ${project.targetLength} length`}
          </p>
          <IllustrateButton
            target="cover"
            projectId={project.id}
            compact
          />
        </div>
      </div>

      {/* Style Guide Panel (Children's Books) */}
      {isChildrensBook && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 mb-6">
          <button
            onClick={() => setShowStyleGuide(!showStyleGuide)}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all',
              showStyleGuide
                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : 'glass hover:bg-white/70 text-text-secondary'
            )}
          >
            <div className="flex items-center gap-2">
              <Palette size={15} className="text-purple-500" />
              Style Guide
              {cbs?.styleGuide || cbs?.characterVisuals?.length ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">configured</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">set up for consistent art</span>
              )}
            </div>
            {showStyleGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showStyleGuide && (
            <div className="mt-2 rounded-2xl glass p-5 animate-fade-in space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                  Art Direction
                </label>
                <p className="text-[10px] text-text-tertiary mb-2">
                  Describe the overall visual style. This anchors every illustration to the same look.
                </p>
                <textarea
                  value={cbs?.styleGuide || ''}
                  onChange={(e) => handleStyleGuideChange(e.target.value)}
                  placeholder="e.g. Soft watercolor with muted earth tones, whimsical forest setting, gentle rounded shapes, warm golden lighting throughout..."
                  className="w-full px-3 py-2.5 rounded-xl bg-black/5 text-xs text-text-primary placeholder:text-text-tertiary/50 resize-none border-none outline-none"
                  rows={3}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider block">
                      Character Appearances
                    </label>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      Detailed visual descriptions so characters look the same on every page.
                    </p>
                  </div>
                  <button
                    onClick={handleAddCharacterVisual}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-purple-600 hover:bg-purple-50 transition-all"
                  >
                    <Plus size={10} />
                    Add Character
                  </button>
                </div>
                <div className="space-y-2">
                  {(cbs?.characterVisuals || []).map((cv: CharacterVisual, i: number) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input
                        value={cv.name}
                        onChange={(e) => handleUpdateCharacterVisual(i, 'name', e.target.value)}
                        placeholder="Name"
                        className="w-28 flex-shrink-0 px-2.5 py-2 rounded-lg bg-black/5 text-xs text-text-primary placeholder:text-text-tertiary/50 border-none outline-none"
                      />
                      <textarea
                        value={cv.description}
                        onChange={(e) => handleUpdateCharacterVisual(i, 'description', e.target.value)}
                        placeholder="e.g. A small brown rabbit with long floppy ears, bright blue eyes, wearing a red knit sweater and tiny boots"
                        className="flex-1 px-2.5 py-2 rounded-lg bg-black/5 text-xs text-text-primary placeholder:text-text-tertiary/50 resize-none border-none outline-none"
                        rows={2}
                      />
                      <button
                        onClick={() => handleRemoveCharacterVisual(i)}
                        className="flex-shrink-0 p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {(!cbs?.characterVisuals || cbs.characterVisuals.length === 0) && (
                    <p className="text-[10px] text-text-tertiary italic py-2">
                      No characters defined yet. Add characters so the AI draws them consistently across all pages.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
                  AI generates titles, premises, and beats for every {isChildrensBook ? 'page' : 'chapter'}
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
                {chapters.length} existing {isChildrensBook ? 'page' : 'chapter'}{chapters.length !== 1 ? 's' : ''} will be kept — new ones fill the gaps.
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
                <><Loader2 size={14} className="animate-spin" /> Generating {scaffoldCount} {isChildrensBook ? 'pages' : 'chapters'}...</>
              ) : (
                <><Sparkles size={14} /> Generate {scaffoldCount}-{isChildrensBook ? 'Page' : 'Chapter'} Outline</>
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

      {/* Chapter / Page List */}
      <div className="max-w-[53rem] mx-auto px-4 sm:px-8 pb-16">
        {/* Arc toggle */}
        {chapters.length >= 2 && structure && !structure.isProcess && (
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowArcLabels(!showArcLabels)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                showArcLabels
                  ? 'bg-amber-100 text-amber-700'
                  : 'glass-pill text-text-tertiary hover:bg-white/60'
              )}
            >
              <span className="text-sm">📐</span>
              {structure.name}
            </button>
          </div>
        )}

        {/* Children's Book Grid Layout */}
        {isChildrensBook ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {chapters.map((chapter, index) => (
              <div
                key={chapter.id}
                className="group animate-scale-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div
                  className="rounded-2xl glass hover:bg-white/70 overflow-hidden transition-all duration-200 cursor-pointer active:scale-[0.98]"
                  onClick={() => setActiveChapter(chapter.id)}
                >
                  {/* Image area */}
                  <div className="aspect-[4/3] relative bg-gradient-to-br from-purple-50 to-pink-50 overflow-hidden">
                    {chapter.imageUrl ? (
                      <img
                        src={chapter.imageUrl}
                        alt={chapter.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-purple-300">
                        <ImageIcon size={32} strokeWidth={1} />
                        <span className="text-[10px] font-medium text-purple-400">No illustration yet</span>
                      </div>
                    )}
                    {/* Page number overlay */}
                    <div className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center text-white text-xs font-mono font-medium">
                      {chapter.number}
                    </div>
                    {/* Generate button overlay */}
                    {!chapter.imageUrl && (
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <IllustrateButton
                          target="page"
                          targetId={chapter.id}
                          projectId={project.id}
                          currentImageUrl={chapter.imageUrl}
                          onImageGenerated={(url) => updateChapter(chapter.id, { imageUrl: url })}
                          compact
                        />
                      </div>
                    )}
                    {/* Regenerate overlay on existing image */}
                    {chapter.imageUrl && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        <IllustrateButton
                          target="page"
                          targetId={chapter.id}
                          projectId={project.id}
                          currentImageUrl={chapter.imageUrl}
                          onImageGenerated={(url) => updateChapter(chapter.id, { imageUrl: url })}
                          compact
                        />
                      </div>
                    )}
                  </div>
                  {/* Text content */}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium truncate">{chapter.title}</span>
                      <Badge status={chapter.status} />
                    </div>
                    {chapter.premise?.purpose ? (
                      <p className="text-[10px] text-text-secondary line-clamp-2 leading-relaxed">{chapter.premise.purpose}</p>
                    ) : (
                      <p className="text-[10px] text-text-tertiary italic">Tap to write</p>
                    )}
                    {chapter.prose && (
                      <div className="flex items-center gap-1 mt-1.5 text-[9px] text-text-tertiary">
                        <span>{chapter.prose.split(/\s+/).filter(Boolean).length} words</span>
                        {cbs?.wordsPerSpread && (
                          <span>/ {cbs.wordsPerSpread} target</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Add Page card */}
            <div className="animate-scale-in" style={{ animationDelay: `${chapters.length * 30}ms` }}>
              <button
                onClick={addNewChapter}
                className="w-full h-full min-h-[180px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-purple-200 text-purple-400 hover:text-purple-600 hover:border-purple-400 hover:bg-purple-50/50 transition-all duration-200"
              >
                <Plus size={24} strokeWidth={1.5} />
                <span className="text-xs font-medium">Add Page</span>
              </button>
            </div>
          </div>
        ) : (
          /* Novel / Standard Chapter List */
          <div className="space-y-3">
            {chapters.map((chapter, index) => {
              const StatusIcon = statusIcons[chapter.status];
              const arcBeat = showArcLabels ? arcBreakpoints.get(index) : null;
              return (
                <div key={chapter.id}>
                {arcBeat && (
                  <div className="mb-1 animate-fade-in">
                    <button
                      onClick={() => setExpandedBeatName(expandedBeatName === arcBeat.name ? null : arcBeat.name)}
                      className="w-full flex items-center gap-3 py-3 group cursor-pointer"
                    >
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-600/80 whitespace-nowrap flex items-center gap-1.5">
                        {arcBeat.name}
                        <Info size={11} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
                    </button>
                    {expandedBeatName === arcBeat.name && (
                      <div className="mx-auto max-w-lg px-4 py-2.5 mb-2 rounded-xl bg-amber-50 border border-amber-200/60 animate-fade-in">
                        <p className="text-xs text-amber-800 leading-relaxed">{arcBeat.description}</p>
                      </div>
                    )}
                  </div>
                )}
                <div
                  draggable
                  onDragStart={() => setDragIdx(index)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(index); }}
                  onDragEnd={() => {
                    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                      const reordered = [...chapters];
                      const [moved] = reordered.splice(dragIdx, 1);
                      reordered.splice(dragOverIdx, 0, moved);
                      reordered.forEach((ch, i) => {
                        updateChapter(ch.id, { number: i + 1, timelinePosition: i + 1 });
                      });
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
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <GripVertical size={14} className="text-text-tertiary/30 opacity-0 group-hover:opacity-100 cursor-grab transition-opacity" />
                      <div className="w-10 h-10 rounded-xl glass-pill flex items-center justify-center text-sm font-mono text-text-tertiary group-hover:bg-text-primary group-hover:text-text-inverse transition-all duration-200">
                        {chapter.number}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{chapter.title}</span>
                        <Badge status={chapter.status} />
                      </div>
                      {chapter.premise?.purpose ? (
                        <p className="text-sm text-text-secondary line-clamp-2">{chapter.premise.purpose}</p>
                      ) : (
                        <p className="text-sm text-text-tertiary italic">No premise yet — click to define</p>
                      )}
                    </div>

                    <StatusIcon size={16} className="text-text-tertiary mt-1 flex-shrink-0" />
                  </div>
                  </button>
                </div>
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
        )}

        {/* Children's Book bottom actions */}
        {isChildrensBook && (
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowScaffold(!showScaffold)}
              className={cn(
                'flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium transition-all duration-200',
                showScaffold
                  ? 'bg-purple-100 text-purple-700'
                  : 'border border-dashed border-purple-300 text-purple-600 hover:bg-purple-50'
              )}
            >
              <Sparkles size={16} />
              Scaffold Pages
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
