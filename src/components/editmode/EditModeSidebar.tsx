import { useEffect } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { SceneCard } from './SceneCard';
import { EditChatPanel } from './EditChatPanel';
import { buildSceneDecompositionPrompt, buildSceneProseSplitPrompt } from '../../lib/prompt-builder';
import { generateText } from '../../lib/generate';
import { generateId } from '../../lib/utils';
import type { Scene } from '../../types';

interface Props {
  projectId: string;
  chapterId: string;
}

export function EditModeSidebar({ projectId, chapterId }: Props) {
  const {
    chapters,
    setEditMode,
    activeSceneId,
    setActiveScene,
    setChapterScenes,
    addScene,
    scenesGenerating,
    setScenesGenerating,
    getActiveProject,
    getProjectChapters,
  } = useStore();
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();

  const chapter = chapters.find(c => c.id === chapterId);
  const scenes = chapter?.scenes || [];
  const activeScene = scenes.find(s => s.id === activeSceneId) || null;

  // Auto-generate scenes on mount if chapter has none
  useEffect(() => {
    if (!chapter || scenes.length > 0 || scenesGenerating) return;

    const generateScenes = async () => {
      const project = getActiveProject();
      if (!project) return;

      setScenesGenerating(true);
      try {
        const allChapters = getProjectChapters(project.id);
        const canonEntries = getProjectEntries(project.id);

        const prompt = buildSceneDecompositionPrompt({
          project,
          chapter,
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
        // Parse JSON from response — handle markdown code blocks
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('Invalid scene decomposition response');

        const parsed = JSON.parse(jsonMatch[0]) as { title: string; summary: string; order: number }[];
        let newScenes: Scene[] = parsed.map((s, i) => ({
          id: generateId(),
          title: s.title || `Scene ${i + 1}`,
          summary: s.summary || '',
          prose: '',
          order: s.order || i + 1,
          status: 'outline' as const,
        }));

        // If chapter has existing prose, split it across scenes
        if (chapter.prose?.trim()) {
          try {
            const splitPrompt = buildSceneProseSplitPrompt(
              chapter,
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
        }

        setChapterScenes(chapterId, newScenes);
      } catch (error) {
        console.error('Failed to generate scenes:', error);
      } finally {
        setScenesGenerating(false);
      }
    };

    generateScenes();
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddScene = () => {
    if (!chapter) return;
    const maxOrder = scenes.reduce((max, s) => Math.max(max, s.order), 0);
    const newScene: Scene = {
      id: generateId(),
      title: `Scene ${maxOrder + 1}`,
      summary: '',
      prose: '',
      order: maxOrder + 1,
      status: 'outline',
    };
    addScene(chapterId, newScene);
    setActiveScene(newScene.id);
  };

  if (!chapter) return null;

  return (
    <>
      {/* Header */}
      <div className="p-3 border-b border-white/20">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold text-text-tertiary uppercase tracking-wider px-1">
            Edit Mode
          </div>
          <button
            onClick={() => setEditMode(false)}
            className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all"
            title="Exit Edit Mode"
          >
            <X size={16} />
          </button>
        </div>
        <div className="text-[13px] text-text-secondary px-1 truncate">
          Ch. {chapter.number} · {chapter.title}
        </div>
      </div>

      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {scenesGenerating && (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
            <Loader2 size={24} className="text-text-tertiary animate-spin mb-3" />
            <p className="text-sm text-text-secondary font-medium">Analyzing chapter...</p>
            <p className="text-xs text-text-tertiary mt-1">Generating scene outlines</p>
          </div>
        )}

        {!scenesGenerating && scenes.length === 0 && (
          <div className="text-center py-8 text-text-tertiary text-xs">
            No scenes yet. They'll be generated automatically.
          </div>
        )}

        {!scenesGenerating && [...scenes].sort((a, b) => a.order - b.order).map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            isActive={activeSceneId === scene.id}
            onClick={() => setActiveScene(scene.id === activeSceneId ? null : scene.id)}
          />
        ))}

        {!scenesGenerating && scenes.length > 0 && (
          <button
            onClick={handleAddScene}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all mt-1"
          >
            <Plus size={12} />
            Add Scene
          </button>
        )}
      </div>

      {/* Edit Chat */}
      <EditChatPanel chapterId={chapterId} scene={activeScene} />
    </>
  );
}
