import { useState } from 'react';
import { FileOutput, Download, Check, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type SubmissionFormat = 'shunn' | 'standard-manuscript' | 'custom-publisher';
type FontChoice = 'courier-new' | 'times-new-roman' | 'garamond';

interface FormatPreset {
  id: SubmissionFormat;
  name: string;
  desc: string;
  font: FontChoice;
  fontSize: number;
  lineSpacing: 'double' | '1.5' | 'single';
  margins: string;
  firstLineIndent: string;
  headerContent: string;
  pageBreakChapters: boolean;
  sceneBreakMarker: string;
}

const PRESETS: FormatPreset[] = [
  {
    id: 'shunn',
    name: 'Shunn (Short Fiction)',
    desc: 'William Shunn format for magazine/anthology submissions',
    font: 'courier-new',
    fontSize: 12,
    lineSpacing: 'double',
    margins: '1 inch all sides',
    firstLineIndent: '0.5 inch',
    headerContent: 'Author / Title / Page',
    pageBreakChapters: false,
    sceneBreakMarker: '#',
  },
  {
    id: 'standard-manuscript',
    name: 'Standard Manuscript',
    desc: 'Industry standard for novel submissions to agents and publishers',
    font: 'times-new-roman',
    fontSize: 12,
    lineSpacing: 'double',
    margins: '1 inch all sides',
    firstLineIndent: '0.5 inch',
    headerContent: 'Author / Title / Page',
    pageBreakChapters: true,
    sceneBreakMarker: '# # #',
  },
  {
    id: 'custom-publisher',
    name: 'Custom Publisher',
    desc: 'Configure to match specific publisher guidelines',
    font: 'times-new-roman',
    fontSize: 12,
    lineSpacing: 'double',
    margins: '1 inch all sides',
    firstLineIndent: '0.5 inch',
    headerContent: 'Author / Title / Page',
    pageBreakChapters: true,
    sceneBreakMarker: '***',
  },
];

export function ManuscriptFormatter() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose) : [];

  const [selectedPreset, setSelectedPreset] = useState<SubmissionFormat>('standard-manuscript');
  const [authorName, setAuthorName] = useState('');
  const [authorAddress, setAuthorAddress] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [wordCountDisplay, setWordCountDisplay] = useState<'exact' | 'rounded'>('rounded');
  const [includeTitle, setIncludeTitle] = useState(true);
  const [exporting, setExporting] = useState(false);

  const preset = PRESETS.find(p => p.id === selectedPreset)!;
  const totalWords = chapters.reduce((sum, ch) => sum + ch.prose.split(/\s+/).length, 0);
  const displayWords = wordCountDisplay === 'rounded' ? Math.round(totalWords / 1000) * 1000 : totalWords;

  const handleExport = async () => {
    setExporting(true);
    // In production: generates properly formatted DOCX/PDF server-side
    await new Promise(r => setTimeout(r, 2000));
    
    // For now, generate a formatted text file
    const lines: string[] = [];
    
    // Title page
    if (includeTitle) {
      lines.push(authorName || 'Author Name');
      if (authorAddress) lines.push(authorAddress);
      if (authorEmail) lines.push(authorEmail);
      lines.push('');
      lines.push(`Approx. ${displayWords.toLocaleString()} words`);
      lines.push('');
      lines.push('');
      lines.push('');
      lines.push(project?.title?.toUpperCase() || 'UNTITLED');
      lines.push('');
      lines.push(`by ${authorName || 'Author Name'}`);
      lines.push('\n\n---PAGE BREAK---\n\n');
    }

    for (const ch of chapters) {
      if (preset.pageBreakChapters && chapters.indexOf(ch) > 0) {
        lines.push('\n---PAGE BREAK---\n');
      }
      lines.push(`CHAPTER ${ch.number}`);
      lines.push(ch.title.toUpperCase());
      lines.push('');
      lines.push(ch.prose);
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.title || 'manuscript'}-formatted.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    setExporting(false);
  };

  if (!project) return null;

  return (
    <div className="p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Manuscript Formatter</h3>
        <p className="text-xs text-text-tertiary">Format your manuscript to industry submission standards.</p>
      </div>

      {/* Preset selection */}
      <div className="space-y-1.5">
        {PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPreset(p.id)}
            className={cn(
              'w-full text-left p-3 rounded-xl transition-all',
              selectedPreset === p.id ? 'bg-text-primary text-text-inverse' : 'glass-pill hover:bg-white/60'
            )}
          >
            <div className="text-xs font-medium">{p.name}</div>
            <div className={cn('text-[10px]', selectedPreset === p.id ? 'text-white/60' : 'text-text-tertiary')}>{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Format details */}
      <div className="glass-pill rounded-xl p-3 space-y-1.5">
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Format Details</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-text-tertiary">Font</span>
          <span className="text-text-secondary capitalize">{preset.font.replace(/-/g, ' ')}</span>
          <span className="text-text-tertiary">Size</span>
          <span className="text-text-secondary">{preset.fontSize}pt</span>
          <span className="text-text-tertiary">Spacing</span>
          <span className="text-text-secondary capitalize">{preset.lineSpacing}</span>
          <span className="text-text-tertiary">Margins</span>
          <span className="text-text-secondary">{preset.margins}</span>
          <span className="text-text-tertiary">Indent</span>
          <span className="text-text-secondary">{preset.firstLineIndent}</span>
          <span className="text-text-tertiary">Scene breaks</span>
          <span className="text-text-secondary font-mono">{preset.sceneBreakMarker}</span>
        </div>
      </div>

      {/* Author info */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Author Information</label>
        <input value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Full name / pen name" className="w-full px-3 py-2 rounded-lg glass-input text-xs" />
        <input value={authorEmail} onChange={e => setAuthorEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 rounded-lg glass-input text-xs" />
        <input value={authorAddress} onChange={e => setAuthorAddress(e.target.value)} placeholder="Address (optional)" className="w-full px-3 py-2 rounded-lg glass-input text-xs" />
      </div>

      {/* Word count display */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-tertiary">Word count:</span>
        <button onClick={() => setWordCountDisplay('exact')} className={cn('text-xs px-2 py-0.5 rounded-lg', wordCountDisplay === 'exact' ? 'bg-text-primary text-text-inverse' : 'glass-pill')}>
          Exact ({totalWords.toLocaleString()})
        </button>
        <button onClick={() => setWordCountDisplay('rounded')} className={cn('text-xs px-2 py-0.5 rounded-lg', wordCountDisplay === 'rounded' ? 'bg-text-primary text-text-inverse' : 'glass-pill')}>
          Rounded (~{displayWords.toLocaleString()})
        </button>
      </div>

      {/* Stats */}
      <div className="glass-pill rounded-xl p-3 text-xs text-text-secondary">
        <div>{chapters.length} chapters · {totalWords.toLocaleString()} words · ~{Math.round(totalWords / 250)} pages (est.)</div>
      </div>

      <button
        onClick={handleExport}
        disabled={exporting || chapters.length === 0}
        className="w-full py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
      >
        {exporting ? <><Loader2 size={16} className="animate-spin" /> Formatting...</> : <><FileOutput size={16} /> Export Manuscript</>}
      </button>
    </div>
  );
}
