import { useState } from 'react';
import { X, BookOpen, Film, Tv, Music, FileVideo, Clapperboard, Lock } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { generateId, cn } from '../../lib/utils';
import type { Project, BookSubtype, NarrativeControls } from '../../types';

const projectTypes = [
  { type: 'book' as const, label: 'Book', icon: BookOpen, available: true },
  { type: 'screenplay' as const, label: 'Screenplay', icon: Clapperboard, available: false },
  { type: 'tv-series' as const, label: 'TV Series', icon: Tv, available: false },
  { type: 'film' as const, label: 'Film', icon: Film, available: false },
  { type: 'musical' as const, label: 'Musical', icon: Music, available: false },
  { type: 'documentary' as const, label: 'Documentary', icon: FileVideo, available: false },
];

const bookSubtypes: { type: BookSubtype; label: string; desc: string }[] = [
  { type: 'novel', label: 'Novel', desc: 'Full-length narrative fiction' },
  { type: 'short-stories', label: 'Short Story Collection', desc: 'Multiple connected or standalone stories' },
  { type: 'childrens-book', label: "Children's Book", desc: 'Illustrated stories for young readers' },
];

interface Props {
  onClose: () => void;
}

export function NewProjectModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [subtype, setSubtype] = useState<BookSubtype>('novel');
  const [targetLength, setTargetLength] = useState<Project['targetLength']>('medium');
  const [assistanceLevel, setAssistanceLevel] = useState(3);
  const [ageRange, setAgeRange] = useState('');
  const [narrativeControls, setNarrativeControls] = useState<NarrativeControls>({
    toneMood: { lightDark: 50, hopefulGrim: 50, whimsicalSerious: 50 },
    pacing: 'balanced',
    dialogueWeight: 'balanced',
    focusMix: { character: 40, plot: 40, world: 20 },
    genreEmphasis: [],
  });

  const { addProject, setActiveProject, setCurrentView, addChapter } = useStore();

  const createProject = () => {
    const projectId = generateId();
    const now = new Date().toISOString();
    
    const project: Project = {
      id: projectId,
      title: title || 'Untitled',
      type: 'book',
      subtype,
      targetLength,
      toneBaseline: '',
      assistanceLevel,
      ageRange: subtype === 'childrens-book' ? ageRange : undefined,
      narrativeControls,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    addProject(project);

    const chapterCount = subtype === 'childrens-book' ? 5 : targetLength === 'short' ? 8 : targetLength === 'medium' ? 15 : targetLength === 'long' ? 25 : 40;
    
    for (let i = 1; i <= chapterCount; i++) {
      addChapter({
        id: generateId(),
        projectId,
        number: i,
        title: `Chapter ${i}`,
        timelinePosition: i,
        status: 'premise-only',
        premise: {
          purpose: '',
          changes: '',
          characters: [],
          emotionalBeat: '',
          setupPayoff: [],
          constraints: [],
        },
        prose: '',
        referencedCanonIds: [],
        validationStatus: { isValid: true, checks: [] },
        createdAt: now,
        updatedAt: now,
      });
    }

    setActiveProject(projectId);
    setCurrentView('project');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 animate-scale-in overflow-hidden border border-black/5">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-serif font-semibold">New Project</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Step 0: Project Type */}
        {step === 0 && (
          <div className="px-6 pb-6 animate-fade-in">
            <p className="text-sm text-text-secondary mb-5">What are you creating?</p>
            <div className="grid grid-cols-3 gap-3">
              {projectTypes.map(({ type, label, icon: Icon, available }) => (
                <button
                  key={type}
                  disabled={!available}
                  onClick={() => available && setStep(1)}
                  className={cn(
                    'flex flex-col items-center gap-2.5 p-5 rounded-2xl transition-all duration-200',
                    available
                      ? 'glass-pill hover:bg-white/60 hover:shadow-md cursor-pointer active:scale-[0.97]'
                      : 'bg-white/10 opacity-35 cursor-not-allowed'
                  )}
                >
                  <Icon size={24} className={available ? 'text-text-primary' : 'text-text-tertiary'} />
                  <span className="text-sm font-medium">{label}</span>
                  {!available && <Lock size={10} className="text-text-tertiary" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Book Subtype */}
        {step === 1 && (
          <div className="px-6 pb-6 animate-fade-in">
            <p className="text-sm text-text-secondary mb-5">What kind of book?</p>
            <div className="space-y-2">
              {bookSubtypes.map(({ type, label, desc }) => (
                <button
                  key={type}
                  onClick={() => { setSubtype(type); setStep(2); }}
                  className="w-full text-left p-4 rounded-2xl glass-pill hover:bg-white/60 transition-all duration-200 active:scale-[0.99]"
                >
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === 2 && (
          <div className="px-6 pb-6 animate-fade-in space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Working title..."
                className="w-full mt-1.5 px-4 py-2.5 rounded-xl glass-input text-sm"
                autoFocus
              />
            </div>

            {/* Target Length */}
            <div>
              <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Target Length</label>
              <div className="flex gap-2 mt-1.5">
                {(['short', 'medium', 'long', 'epic'] as const).map((len) => (
                  <button
                    key={len}
                    onClick={() => setTargetLength(len)}
                    className={cn(
                      'flex-1 py-2.5 text-xs rounded-xl transition-all duration-200 capitalize',
                      targetLength === len
                        ? 'bg-text-primary text-text-inverse shadow-md'
                        : 'glass-pill text-text-secondary hover:bg-white/60'
                    )}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>

            {/* Assistance Level */}
            <div>
              <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Writing Assistance</label>
              <Slider
                value={assistanceLevel * 20}
                onChange={(v) => setAssistanceLevel(Math.round(v / 20))}
                leftLabel="Light"
                rightLabel="Heavy"
                className="mt-2"
              />
            </div>

            {/* Tone */}
            <div>
              <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Tone & Mood</label>
              <div className="space-y-2 mt-2">
                <Slider
                  value={narrativeControls.toneMood.lightDark}
                  onChange={(v) => setNarrativeControls(prev => ({ ...prev, toneMood: { ...prev.toneMood, lightDark: v } }))}
                  leftLabel="Light"
                  rightLabel="Dark"
                />
                <Slider
                  value={narrativeControls.toneMood.hopefulGrim}
                  onChange={(v) => setNarrativeControls(prev => ({ ...prev, toneMood: { ...prev.toneMood, hopefulGrim: v } }))}
                  leftLabel="Hopeful"
                  rightLabel="Grim"
                />
                <Slider
                  value={narrativeControls.toneMood.whimsicalSerious}
                  onChange={(v) => setNarrativeControls(prev => ({ ...prev, toneMood: { ...prev.toneMood, whimsicalSerious: v } }))}
                  leftLabel="Whimsical"
                  rightLabel="Serious"
                />
              </div>
            </div>

            {/* Age Range for Children's Books */}
            {subtype === 'childrens-book' && (
              <div>
                <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Age Range</label>
                <input
                  type="text"
                  value={ageRange}
                  onChange={(e) => setAgeRange(e.target.value)}
                  placeholder="e.g., 4-8 years"
                  className="w-full mt-1.5 px-4 py-2.5 rounded-xl glass-input text-sm"
                />
              </div>
            )}

            {/* Create Button */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-xl glass-pill text-sm font-medium text-text-secondary hover:bg-white/60 transition-all"
              >
                Back
              </button>
              <button
                onClick={createProject}
                className="flex-1 py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-medium shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
              >
                Create Project
              </button>
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 pb-5">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                s === step ? 'w-6 bg-text-primary' : s < step ? 'w-1.5 bg-text-primary/40' : 'w-1.5 bg-black/10'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
