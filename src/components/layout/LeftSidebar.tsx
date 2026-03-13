import { useState, useEffect, useCallback } from 'react';
import { Users, MapPin, Cog, Gem, Scale, Milestone, Plus, ChevronRight, Search, FileText, PenLine, Film, RefreshCw, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { cn } from '../../lib/utils';
import { EditModeSidebar } from '../editmode/EditModeSidebar';
import { InlineEditChat } from '../features/InlineEditChat';
import { buildSceneDecompositionPrompt, buildSceneProseSplitPrompt } from '../../lib/prompt-builder';
import { generateText } from '../../lib/generate';
import { generateId } from '../../lib/utils';
import type { CanonType } from '../../types/canon';
import type { Scene } from '../../types';

const canonSections: { type: CanonType; label: string; icon: React.ElementType }[] = [
  { type: 'character', label: 'Characters', icon: Users },
  { type: 'location', label: 'Places', icon: MapPin },
  { type: 'artifact', label: 'Objects', icon: Gem },
  { type: 'media', label: 'Media', icon: Film },
  { type: 'system', label: 'Systems', icon: Cog },
  { type: 'rule', label: 'Rules', icon: Scale },
  { type: 'event', label: 'Major Events', icon: Milestone },
];

// ========== PROJECT SIDEBAR (Canon & World) ==========

function ProjectSidebar({ projectId }: { projectId: string }) {
  const { entries, setActiveEntry, activeEntryId, createCharacter, createLocation, createSystem, createArtifact, createMedia, createRule, createEvent, addEntry } = useCanonStore();
  const [search, setSearch] = useState('');
  const [expandedType, setExpandedType] = useState<CanonType | null>('character');

  const projectEntries = entries.filter(e => e.projectId === projectId);
  const filteredEntries = search
    ? projectEntries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : projectEntries;

  const handleAdd = (type: CanonType) => {
    const creators: Record<CanonType, (pid: string, name: string) => any> = {
      character: createCharacter, location: createLocation, system: createSystem,
      artifact: createArtifact, media: createMedia, rule: createRule, event: createEvent,
    };
    const entry = creators[type](projectId, `New ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    addEntry(entry);
    setActiveEntry(entry.id);
    setExpandedType(type);
  };

  return (
    <>
      <div className="p-3 border-b border-white/20">
        <div className="text-base font-semibold text-text-tertiary uppercase tracking-wider px-1 mb-2">Canon & World</div>
        <div className="flex items-center gap-2 glass-pill rounded-xl px-3 py-1.5">
          <Search size={13} className="text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search canon..."
            className="flex-1 bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-tertiary"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {canonSections.map(({ type, label, icon: Icon }) => {
          const typeEntries = filteredEntries.filter(e => e.type === type);
          const isExpanded = expandedType === type;
          
          return (
            <div key={type} className="mb-0.5">
              <button
                onClick={() => setExpandedType(isExpanded ? null : type)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[15px] text-text-secondary hover:text-text-primary hover:bg-white/40 transition-all duration-200 group"
              >
                <Icon size={15} className="text-text-tertiary group-hover:text-text-primary transition-colors" />
                <span className="flex-1 text-left text-[15px] font-medium">{label}</span>
                <span className="text-[13px] text-text-tertiary">{typeEntries.length}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleAdd(type); }}
                  className="text-text-tertiary hover:text-text-primary transition-all p-0.5"
                  aria-label={`Add ${type}`}
                >
                  <Plus size={13} />
                </button>
              </button>
              
              {isExpanded && typeEntries.length > 0 && (
                <div className="ml-3 space-y-0.5 animate-fade-in">
                  {typeEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setActiveEntry(entry.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[15px] transition-all duration-150',
                        activeEntryId === entry.id
                          ? 'bg-text-primary text-text-inverse'
                          : 'text-text-secondary hover:text-text-primary hover:bg-white/40'
                      )}
                    >
                      <ChevronRight size={10} className={cn(activeEntryId === entry.id ? 'text-text-inverse/60' : 'text-text-tertiary')} />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {isExpanded && typeEntries.length === 0 && (
                <button
                  onClick={() => handleAdd(type)}
                  className="ml-3 w-[calc(100%-12px)] flex items-center gap-2 px-3 py-2 rounded-lg text-[15px] text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all"
                >
                  <Plus size={12} />
                  <span>Add {type}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-white/20">
        <div className="text-sm text-text-tertiary text-center">
          {projectEntries.length} canon {projectEntries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>
    </>
  );
}

// ========== CHAPTER SIDEBAR (Context-Aware Toolkit) ==========

function ChapterSidebar({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const { chapters, updateChapter, setEditMode, inlineEditOpen, setInlineEditOpen, inlineSelection, setInlineSelection, editHighlight, setEditHighlight, setChapterScenes, scenesGenerating, setScenesGenerating, getActiveProject, getProjectChapters } = useStore();
  const { entries, getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<'edit' | 'scenes' | 'artifacts'>('edit');

  const chapter = chapters.find(c => c.id === chapterId);
  if (!chapter) return null;

  const projectEntries = entries.filter(e => e.projectId === projectId);
  const chapterEntries = projectEntries.filter(e => (chapter.referencedCanonIds || []).includes(e.id));
  const scenes = (chapter.scenes || []).filter((s: any) => s && s.id);

  const updatePremise = (field: string, value: any) => {
    updateChapter(chapter.id, {
      premise: { ...(chapter.premise || {}), [field]: value },
      updatedAt: new Date().toISOString(),
    });
  };

  // Rescan: regenerate scenes from chapter prose
  const rescanScenes = async () => {
    const project = getActiveProject();
    const freshChapter = useStore.getState().chapters.find(c => c.id === chapterId);
    if (!project || !freshChapter?.prose?.trim()) return;

    setScenesGenerating(true);
    try {
      const allChapters = getProjectChapters(project.id);
      const canonEntries = getProjectEntries(project.id);

      const prompt = buildSceneDecompositionPrompt({
        project,
        chapter: freshChapter,
        allChapters,
        canonEntries,
        settings,
        writingMode: 'draft',
        generationType: 'scene-outline',
      });

      const result = await generateText({
        prompt,
        model: settings.ai.preferredModel || 'gpt-4.1',
        maxTokens: 1500,
        action: 'generate-chapter-outline',
        projectId: project.id,
        chapterId,
      });

      const text = (result.text || '').trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Invalid scene decomposition response');

      const parsed = JSON.parse(jsonMatch[0]) as { title: string; summary: string; order: number }[];
      const newScenes: Scene[] = parsed.map((s, i) => ({
        id: generateId(),
        title: s.title || `Scene ${i + 1}`,
        summary: s.summary || '',
        prose: '',
        order: s.order || i + 1,
        status: 'outline' as const,
      }));

      // Split existing prose across new scenes
      try {
        const splitPrompt = buildSceneProseSplitPrompt(
          freshChapter,
          newScenes.map(s => ({ title: s.title, summary: s.summary, order: s.order })),
        );
        const splitResult = await generateText({
          prompt: splitPrompt,
          model: settings.ai.preferredModel || 'gpt-4.1',
          maxTokens: 4000,
          action: 'generate-chapter-outline',
          projectId: project.id,
          chapterId,
        });
        const splitText = (splitResult.text || '').trim();
        const splitJsonMatch = splitText.match(/\[[\s\S]*\]/);
        if (splitJsonMatch) {
          const splitParsed = JSON.parse(splitJsonMatch[0]) as { order: number; prose: string }[];
          for (const seg of splitParsed) {
            const targetScene = newScenes.find(s => s.order === seg.order);
            if (targetScene && seg.prose) {
              targetScene.prose = seg.prose;
              targetScene.status = 'drafted';
            }
          }
        }
      } catch (e) {
        console.error('Failed to split prose into scenes:', e);
      }

      setChapterScenes(chapterId, newScenes);
    } catch (error) {
      console.error('Failed to rescan scenes:', error);
    } finally {
      setScenesGenerating(false);
    }
  };

  // Auto-open inline edit when Edit tab is active
  useEffect(() => {
    if (activeSection === 'edit' && chapter.prose) {
      setInlineEditOpen(true);
    } else if (activeSection !== 'edit' && inlineEditOpen) {
      setInlineEditOpen(false);
    }
  }, [activeSection]);

  const sections = [
    { id: 'edit' as const, label: 'Edit', icon: PenLine },
    { id: 'scenes' as const, label: 'Scenes', icon: FileText },
    { id: 'artifacts' as const, label: 'Artifacts', icon: Gem }, // tab name kept for route compat
  ];

  return (
    <>
      {/* Chapter breadcrumb */}
      <div className="p-3 border-b border-white/20">
        <div className="mb-2">
          <div className="text-sm font-semibold text-text-tertiary uppercase tracking-wider px-1 truncate">
            Ch. {chapter.number} · {chapter.title}
          </div>
        </div>
        {/* Section tabs */}
        <div className="flex gap-0.5 glass-pill p-0.5 rounded-xl">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all',
                activeSection === id
                  ? 'bg-text-primary text-text-inverse shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* EDIT SECTION — full height chat, no padding wrapper */}
      {activeSection === 'edit' && (
        !chapter.prose ? (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                <PenLine size={24} className="text-purple-400" />
              </div>
              <p className="text-sm font-medium text-text-secondary mb-1">No prose yet</p>
              <p className="text-xs text-text-tertiary leading-relaxed max-w-[260px] mx-auto">
                Generate or write some prose first, then come back here to refine it sentence by sentence.
              </p>
            </div>
          </div>
        ) : (
          <InlineEditChat
            chapterId={chapter.id}
            prose={chapter.prose}
            selection={inlineSelection}
            onClearSelection={() => {
              setInlineSelection(null);
              setEditHighlight(null);
            }}
            onProseUpdate={(newProse, highlightStart, highlightEnd) => {
              updateChapter(chapter.id, {
                prose: newProse,
                status: 'human-edited',
                updatedAt: new Date().toISOString(),
              });
              if (highlightStart !== highlightEnd) {
                setEditHighlight({ start: highlightStart, end: highlightEnd });
                setTimeout(() => setEditHighlight(null), 4000);
              } else {
                setEditHighlight(null);
              }
            }}
            onClose={() => setActiveSection('scenes')}
          />
        )
      )}

      {activeSection !== 'edit' && (
      <div className="flex-1 overflow-y-auto p-3">

        {/* SCENES SECTION */}
        {activeSection === 'scenes' && (
          <div className="space-y-4 animate-fade-in">
            {/* Chapter premise overview */}
            <div>
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-1 mb-2">Chapter Premise</div>
              <div className="glass-pill rounded-xl p-3 space-y-2.5">
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Purpose</label>
                  <textarea
                    value={chapter.premise?.purpose || ''}
                    onChange={(e) => updatePremise('purpose', e.target.value)}
                    placeholder="What is this chapter's role?"
                    rows={3}
                    className="w-full mt-1 px-2 py-1.5 rounded-lg glass-input text-[13px] leading-relaxed resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Changes</label>
                  <textarea
                    value={chapter.premise?.changes || ''}
                    onChange={(e) => updatePremise('changes', e.target.value)}
                    placeholder="How is the world different after?"
                    rows={2}
                    className="w-full mt-1 px-2 py-1.5 rounded-lg glass-input text-[13px] leading-relaxed resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Emotional Beat</label>
                  <input
                    type="text"
                    value={chapter.premise?.emotionalBeat || ''}
                    onChange={(e) => updatePremise('emotionalBeat', e.target.value)}
                    placeholder="e.g., Grief giving way to wonder"
                    className="w-full mt-1 px-2 py-1.5 rounded-lg glass-input text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Constraints</label>
                  <textarea
                    value={(chapter.premise?.constraints || []).join('\n')}
                    onChange={(e) => updatePremise('constraints', e.target.value.split('\n').filter(Boolean))}
                    placeholder="What must NOT happen (one per line)"
                    rows={2}
                    className="w-full mt-1 px-2 py-1.5 rounded-lg glass-input text-[13px] leading-relaxed resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Scene list */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Scenes {scenes.length > 0 && `(${scenes.length})`}
                </div>
                <button
                  onClick={rescanScenes}
                  disabled={scenesGenerating || !chapter.prose?.trim()}
                  className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-primary transition-colors px-2 py-1 rounded-lg hover:bg-black/5 disabled:opacity-40"
                  title="Re-analyze chapter prose and regenerate scene breakdown"
                >
                  {scenesGenerating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                  Rescan
                </button>
              </div>
              {scenesGenerating ? (
                <div className="glass-pill rounded-xl p-6 text-center">
                  <Loader2 size={20} className="mx-auto text-text-tertiary animate-spin mb-2" />
                  <p className="text-xs text-text-tertiary">Analyzing chapter & splitting into scenes...</p>
                </div>
              ) : scenes.length === 0 ? (
                <div className="glass-pill rounded-xl p-4 text-center">
                  <p className="text-xs text-text-tertiary mb-2">No scenes yet</p>
                  {chapter.prose?.trim() && (
                    <button
                      onClick={rescanScenes}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-text-primary text-text-inverse hover:shadow-md transition-all"
                    >
                      <RefreshCw size={11} />
                      Generate Scenes
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...scenes].sort((a, b) => a.order - b.order).map((scene) => {
                    const sceneWordCount = scene.prose?.trim() ? scene.prose.trim().split(/\s+/).length : 0;
                    return (
                      <div key={scene.id} className="glass-pill rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                            Scene {scene.order}
                          </span>
                          <span className="text-[10px] text-text-tertiary">
                            {sceneWordCount > 0 ? `${sceneWordCount} words` : 'empty'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-text-primary">{scene.title}</p>
                        {scene.summary && (
                          <p className="text-xs text-text-secondary mt-1 leading-relaxed line-clamp-2">{scene.summary}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GENERATE SECTION */}
        {/* ARTIFACTS SECTION */}
        {activeSection === 'artifacts' && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex justify-end px-1">
              <button
                onClick={() => useStore.getState().rescanChapterMetadata(chapterId)}
                className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-primary transition-colors px-2 py-1 rounded-lg hover:bg-black/5"
              >
                <Search size={10} />
                Rescan
              </button>
            </div>
            {chapterEntries.length === 0 ? (
              <div className="text-center py-8 text-text-tertiary text-xs">
                No canon entries referenced in this chapter.
              </div>
            ) : (
              <>
                {canonSections.map(({ type, label, icon: Icon }) => {
                  const typeEntries = chapterEntries.filter(e => e.type === type);
                  if (typeEntries.length === 0) return null;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 px-1">
                        <Icon size={12} />
                        {label}
                      </div>
                      <div className="space-y-1">
                        {typeEntries.map(entry => {
                          const isActive = useCanonStore.getState().activeEntryId === entry.id;
                          return (
                          <button
                            key={entry.id}
                            onClick={() => {
                              const store = useCanonStore.getState();
                              store.setActiveEntry(store.activeEntryId === entry.id ? null : entry.id);
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left',
                              isActive ? 'bg-amber-100/80 ring-1 ring-amber-300' : 'glass-pill hover:bg-white/60'
                            )}
                          >
                            <span className="text-[15px] font-medium truncate">{entry.name}</span>
                            {entry.description && (
                              <span className="text-xs text-text-tertiary truncate flex-1">{entry.description.slice(0, 40)}...</span>
                            )}
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
      )}
    </>
  );
}

// ========== MAIN SIDEBAR ==========

export function LeftSidebar({ forceOpen }: { forceOpen?: boolean } = {}) {
  const { leftSidebarOpen, getActiveProject, activeChapterId, editMode } = useStore();
  const project = getActiveProject();

  if ((!forceOpen && !leftSidebarOpen) || !project) return null;

  return (
    <aside className={cn('h-full glass-subtle flex flex-col animate-fade-in border-r-0', forceOpen ? 'w-full' : 'w-96')}>
      {editMode && activeChapterId ? (
        <EditModeSidebar projectId={project.id} chapterId={activeChapterId} />
      ) : activeChapterId ? (
        <ChapterSidebar projectId={project.id} chapterId={activeChapterId} />
      ) : (
        <ProjectSidebar projectId={project.id} />
      )}
    </aside>
  );
}
