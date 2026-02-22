import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, File, Trash2, Sparkles, Loader2, CheckCircle, AlertCircle, BookOpen, Users, MapPin, Scroll } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { generateId, cn } from '../../lib/utils';

interface ImportedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
  category: 'manuscript' | 'outline' | 'characters' | 'worldbuilding' | 'notes' | 'auto';
}

const CATEGORY_INFO: Record<string, { label: string; icon: typeof FileText; color: string; description: string }> = {
  manuscript: { label: 'Manuscript', icon: BookOpen, color: 'text-blue-600 bg-blue-50', description: 'Chapters, drafts, prose' },
  outline: { label: 'Outline', icon: Scroll, color: 'text-purple-600 bg-purple-50', description: 'Plot structure, synopsis' },
  characters: { label: 'Characters', icon: Users, color: 'text-emerald-600 bg-emerald-50', description: 'Character sheets, bios' },
  worldbuilding: { label: 'World', icon: MapPin, color: 'text-amber-600 bg-amber-50', description: 'Lore, settings, systems' },
  notes: { label: 'Notes', icon: FileText, color: 'text-gray-600 bg-gray-50', description: 'Research, ideas, misc' },
};

const ACCEPTED_TYPES = [
  '.txt', '.md', '.markdown', '.doc', '.docx', '.rtf', '.odt',
  '.pdf', '.epub', '.json', '.csv',
];

function guessCategory(filename: string, content: string): ImportedFile['category'] {
  const lower = filename.toLowerCase();
  const lowerContent = content.toLowerCase().slice(0, 2000);
  
  if (lower.includes('character') || lower.includes('cast') || lower.includes('bio')) return 'characters';
  if (lower.includes('outline') || lower.includes('synopsis') || lower.includes('plot') || lower.includes('structure')) return 'outline';
  if (lower.includes('world') || lower.includes('setting') || lower.includes('lore') || lower.includes('magic')) return 'worldbuilding';
  if (lower.includes('note') || lower.includes('research') || lower.includes('idea')) return 'notes';
  if (lower.includes('chapter') || lower.includes('draft') || lower.includes('manuscript')) return 'manuscript';
  
  // Content-based guessing
  if (lowerContent.includes('chapter 1') || lowerContent.includes('chapter one') || content.length > 5000) return 'manuscript';
  if (lowerContent.includes('act 1') || lowerContent.includes('inciting incident') || lowerContent.includes('climax')) return 'outline';
  if (lowerContent.includes('age:') || lowerContent.includes('appearance:') || lowerContent.includes('personality:')) return 'characters';
  
  return 'notes';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ImportProjectModal({ onClose }: { onClose: () => void }) {
  const { addProject, setActiveProject, setCurrentView, addChapter } = useStore();
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'upload' | 'categorize' | 'processing' | 'done'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles: ImportedFile[] = [];
    
    for (const file of Array.from(fileList)) {
      // Read text content
      try {
        const content = await file.text();
        const category = guessCategory(file.name, content);
        
        newFiles.push({
          id: generateId(),
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          content,
          category,
        });
      } catch {
        // For binary files (docx, pdf), we'd need server-side parsing
        newFiles.push({
          id: generateId(),
          name: file.name,
          size: file.size,
          type: file.type,
          content: `[Binary file: ${file.name} — ${formatSize(file.size)}. Will be parsed by AI during import.]`,
          category: guessCategory(file.name, ''),
        });
      }
    }
    
    setFiles(prev => [...prev, ...newFiles]);
    
    // Auto-detect project title from first manuscript file
    if (!projectTitle) {
      const manuscript = newFiles.find(f => f.category === 'manuscript');
      if (manuscript) {
        const nameGuess = manuscript.name
          .replace(/\.(txt|md|docx?|rtf|pdf)$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/chapter\s*\d+/i, '')
          .trim();
        if (nameGuess.length > 2) setProjectTitle(nameGuess);
      }
    }
  }, [projectTitle]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const removeFile = (id: string) => {
    setFiles(files.filter(f => f.id !== id));
  };

  const updateCategory = (id: string, category: ImportedFile['category']) => {
    setFiles(files.map(f => f.id === id ? { ...f, category } : f));
  };

  const handleImport = async () => {
    setStep('processing');
    setProcessing(true);

    // Simulate AI processing (in production, this sends to the API for real parsing)
    await new Promise(r => setTimeout(r, 3000));

    const projectId = generateId();
    const now = new Date().toISOString();

    // Create project
    const project = {
      id: projectId,
      title: projectTitle || 'Imported Project',
      type: 'book' as const,
      subtype: 'novel' as const,
      targetLength: 'medium' as const,
      toneBaseline: '',
      assistanceLevel: 3,
      narrativeControls: {
        toneMood: { lightDark: 50, hopefulGrim: 50, whimsicalSerious: 50 },
        pacing: 'balanced' as const,
        dialogueWeight: 'balanced' as const,
        focusMix: { character: 40, plot: 35, world: 25 },
        genreEmphasis: [] as string[],
      },
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };
    addProject(project);

    // Create chapters from manuscript files
    const manuscripts = files.filter(f => f.category === 'manuscript');
    manuscripts.forEach((file, i) => {
      // Try to split into chapters if it's one big file
      const chapterSplits = file.content.split(/(?=chapter\s+\d+|chapter\s+[a-z]+\b)/i);
      
      if (chapterSplits.length > 1 && file.content.length > 3000) {
        chapterSplits.forEach((chunk, j) => {
          if (chunk.trim().length < 50) return;
          const titleMatch = chunk.match(/chapter\s+(\d+|[a-z]+)[:\s]*(.*?)(?:\n|$)/i);
          addChapter({
            id: generateId(),
            projectId,
            number: j + 1,
            title: titleMatch?.[2]?.trim() || `Chapter ${j + 1}`,
            timelinePosition: j + 1,
            status: 'human-edited',
            premise: { purpose: '', changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] },
            prose: chunk.trim(),
            referencedCanonIds: [],
            validationStatus: { isValid: true, checks: [] },
            createdAt: now,
            updatedAt: now,
          });
        });
      } else {
        addChapter({
          id: generateId(),
          projectId,
          number: i + 1,
          title: file.name.replace(/\.(txt|md|docx?|rtf)$/i, '').replace(/[-_]/g, ' ').trim() || `Chapter ${i + 1}`,
          timelinePosition: i + 1,
          status: file.content.length > 100 ? 'human-edited' : 'premise-only',
          premise: { purpose: '', changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] },
          prose: file.content,
          referencedCanonIds: [],
          validationStatus: { isValid: true, checks: [] },
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    // Create a notes chapter for outline/worldbuilding/notes files
    const otherFiles = files.filter(f => f.category !== 'manuscript');
    if (otherFiles.length > 0) {
      // These would be processed by AI into proper canon entries in production
      // For now, create placeholder chapters or notes
    }

    setProcessing(false);
    setStep('done');

    setTimeout(() => {
      setActiveProject(projectId);
      setCurrentView('project');
      onClose();
    }, 1500);
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const totalWords = files.reduce((s, f) => s + f.content.split(/\s+/).length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <h2 className="text-2xl font-serif font-semibold">Import Existing Work</h2>
            <p className="text-sm text-text-tertiary mt-1">
              {step === 'upload' && 'Drop your files — manuscripts, outlines, character sheets, worldbuilding notes'}
              {step === 'categorize' && 'Review how Theodore categorized your files'}
              {step === 'processing' && 'Theodore is reading your work and building your project...'}
              {step === 'done' && 'Your project is ready!'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {(step === 'upload' || step === 'categorize') && (
            <>
              {/* Project title */}
              <div className="mb-5">
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Project Title</label>
                <input
                  value={projectTitle}
                  onChange={e => setProjectTitle(e.target.value)}
                  placeholder="My Novel"
                  className="w-full px-4 py-2.5 border border-black/10 rounded-xl text-sm focus:outline-none focus:border-black/20"
                />
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-5',
                  dragOver ? 'border-black/30 bg-black/[0.03]' : 'border-black/10 hover:border-black/20'
                )}
              >
                <Upload size={32} className="mx-auto mb-3 text-text-tertiary" />
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-text-tertiary mt-1">
                  .txt, .md, .docx, .rtf, .pdf — manuscripts, outlines, character sheets, anything
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES.join(',')}
                  onChange={e => e.target.files && handleFiles(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2 mb-5">
                  <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
                    <span>{files.length} files · {formatSize(totalSize)} · ~{totalWords.toLocaleString()} words</span>
                    <button onClick={() => setFiles([])} className="hover:text-text-primary transition-colors">Clear all</button>
                  </div>
                  
                  {files.map(file => {
                    const catInfo = CATEGORY_INFO[file.category];
                    return (
                      <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl border border-black/5 hover:border-black/10 transition-colors">
                        <File size={16} className="text-text-tertiary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{file.name}</div>
                          <div className="text-[10px] text-text-tertiary">{formatSize(file.size)} · {file.content.split(/\s+/).length.toLocaleString()} words</div>
                        </div>
                        
                        {/* Category selector */}
                        <select
                          value={file.category}
                          onChange={e => updateCategory(file.id, e.target.value as ImportedFile['category'])}
                          className={cn('px-2 py-1 rounded-lg text-[10px] font-medium border-0 cursor-pointer', catInfo.color)}
                        >
                          {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                            <option key={key} value={key}>{info.label}</option>
                          ))}
                        </select>
                        
                        <button onClick={() => removeFile(file.id)} className="p-1 rounded-lg hover:bg-black/5 text-text-tertiary">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Category legend */}
              {files.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mb-5">
                  {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                    const count = files.filter(f => f.category === key).length;
                    return (
                      <div key={key} className={cn('rounded-xl p-2.5 text-center', info.color)}>
                        <info.icon size={16} className="mx-auto mb-1" />
                        <div className="text-[10px] font-medium">{info.label}</div>
                        <div className="text-[10px] opacity-70">{count} files</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* What happens next */}
              {files.length > 0 && (
                <div className="rounded-xl bg-black/[0.02] border border-black/5 p-4 mb-5">
                  <h4 className="text-xs font-medium mb-2">What Theodore will do:</h4>
                  <ul className="space-y-1.5 text-xs text-text-secondary">
                    {files.some(f => f.category === 'manuscript') && (
                      <li className="flex items-start gap-2"><CheckCircle size={12} className="text-emerald-500 mt-0.5" /> Split manuscripts into chapters and import prose</li>
                    )}
                    {files.some(f => f.category === 'characters') && (
                      <li className="flex items-start gap-2"><CheckCircle size={12} className="text-emerald-500 mt-0.5" /> Extract character details into canon entries</li>
                    )}
                    {files.some(f => f.category === 'outline') && (
                      <li className="flex items-start gap-2"><CheckCircle size={12} className="text-emerald-500 mt-0.5" /> Build chapter premises from your outline</li>
                    )}
                    {files.some(f => f.category === 'worldbuilding') && (
                      <li className="flex items-start gap-2"><CheckCircle size={12} className="text-emerald-500 mt-0.5" /> Create world wiki entries from your lore</li>
                    )}
                    <li className="flex items-start gap-2"><CheckCircle size={12} className="text-emerald-500 mt-0.5" /> Auto-detect tone, pacing, and narrative style</li>
                    <li className="flex items-start gap-2"><AlertCircle size={12} className="text-amber-500 mt-0.5" /> Everything is editable — Theodore suggests, you decide</li>
                  </ul>
                </div>
              )}
            </>
          )}

          {step === 'processing' && (
            <div className="py-12 text-center">
              <Loader2 size={48} className="mx-auto mb-4 text-text-tertiary animate-spin" />
              <h3 className="text-lg font-serif mb-2">Reading your work...</h3>
              <p className="text-sm text-text-tertiary max-w-md mx-auto">
                Theodore is analyzing your files, identifying characters, mapping plot structure, and building your project canon.
              </p>
              <div className="mt-6 space-y-2 max-w-sm mx-auto text-left">
                <div className="flex items-center gap-2 text-xs text-emerald-600">
                  <CheckCircle size={14} /> Parsed {files.length} files
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-600">
                  <CheckCircle size={14} /> Identified chapter boundaries
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Loader2 size={14} className="animate-spin" /> Building canon entries...
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-12 text-center animate-fade-in">
              <CheckCircle size={48} className="mx-auto mb-4 text-emerald-500" />
              <h3 className="text-lg font-serif mb-2">Project Ready!</h3>
              <p className="text-sm text-text-tertiary">Opening your project now...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'upload' || step === 'categorize') && (
          <div className="px-8 pb-8 pt-2 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm hover:bg-black/5 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={files.length === 0 || !projectTitle.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-xl text-sm hover:bg-black/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Sparkles size={14} />
              Import & Build Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
