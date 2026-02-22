import { useState } from 'react';
import { Globe, Copy, Check, Eye, Sparkles, Loader2, Calendar, Mail, ExternalLink } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

export function PreOrderPage() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const [generating, setGenerating] = useState(false);
  const [published, setPublished] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [pageData, setPageData] = useState({
    title: project?.title || 'Untitled',
    subtitle: 'A Novel',
    author: '',
    blurb: '',
    launchDate: '',
    coverColor: '#1a1a2e',
    accentColor: '#e2d1c3',
    emailSignup: true,
    countdown: true,
    socialLinks: { twitter: '', instagram: '' },
  });

  const generateBlurb = async () => {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 1500));
    setPageData(prev => ({
      ...prev,
      blurb: `Some gardens grow. This one remembers.\n\nWhen Dr. Elara Voss discovers a hidden door in a crumbling estate wall, she steps into an impossible garden tended by a figure who's been waiting for her. The Gardener says the garden chose her — just as it chose her grandmother before her.\n\nA lyrical fantasy about the conversations between humans and the living world.`,
    }));
    setGenerating(false);
  };

  const publishPage = async () => {
    setPublished(true);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`https://theodore.app/pre-order/${project?.id || 'demo'}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const preOrderUrl = `theodore.app/pre-order/${project?.id || 'demo'}`;

  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Pre-Order Page</h3>
        <p className="text-xs text-text-tertiary">Generate a landing page to capture launch interest before your book is published.</p>
      </div>

      {!showPreview ? (
        <div className="space-y-4 animate-fade-in">
          {/* Basic info */}
          <div className="space-y-2">
            <input value={pageData.title} onChange={e => setPageData(p => ({ ...p, title: e.target.value }))}
              placeholder="Book title" className="w-full px-3 py-2 rounded-lg glass-input text-sm font-semibold" />
            <input value={pageData.subtitle} onChange={e => setPageData(p => ({ ...p, subtitle: e.target.value }))}
              placeholder="Subtitle" className="w-full px-3 py-2 rounded-lg glass-input text-xs" />
            <input value={pageData.author} onChange={e => setPageData(p => ({ ...p, author: e.target.value }))}
              placeholder="Author name" className="w-full px-3 py-2 rounded-lg glass-input text-xs" />
          </div>

          {/* Blurb */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Blurb</label>
              <button onClick={generateBlurb} disabled={generating}
                className="text-[10px] text-text-tertiary hover:text-text-primary flex items-center gap-1">
                {generating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Auto-generate
              </button>
            </div>
            <textarea value={pageData.blurb} onChange={e => setPageData(p => ({ ...p, blurb: e.target.value }))}
              placeholder="Back-cover blurb..."
              className="w-full px-3 py-2 rounded-lg glass-input text-xs min-h-[100px] resize-none" />
          </div>

          {/* Launch date */}
          <div>
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 block">Launch Date</label>
            <input type="date" value={pageData.launchDate} onChange={e => setPageData(p => ({ ...p, launchDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg glass-input text-xs" />
          </div>

          {/* Colors */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-text-tertiary mb-1 block">Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={pageData.coverColor} onChange={e => setPageData(p => ({ ...p, coverColor: e.target.value }))}
                  className="w-8 h-8 rounded-lg border-none cursor-pointer" />
                <span className="text-xs font-mono text-text-tertiary">{pageData.coverColor}</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-text-tertiary mb-1 block">Accent</label>
              <div className="flex items-center gap-2">
                <input type="color" value={pageData.accentColor} onChange={e => setPageData(p => ({ ...p, accentColor: e.target.value }))}
                  className="w-8 h-8 rounded-lg border-none cursor-pointer" />
                <span className="text-xs font-mono text-text-tertiary">{pageData.accentColor}</span>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pageData.emailSignup} onChange={e => setPageData(p => ({ ...p, emailSignup: e.target.checked }))}
                className="rounded" />
              <span className="text-xs text-text-secondary">Email signup for launch notification</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pageData.countdown} onChange={e => setPageData(p => ({ ...p, countdown: e.target.checked }))}
                className="rounded" />
              <span className="text-xs text-text-secondary">Countdown timer to launch</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)}
              className="flex-1 py-2.5 rounded-xl glass-pill text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/60">
              <Eye size={13} /> Preview
            </button>
            <button onClick={publishPage}
              className="flex-1 py-2.5 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center justify-center gap-1.5 hover:shadow-lg">
              <Globe size={13} /> {published ? 'Update' : 'Publish'}
            </button>
          </div>

          {/* Published URL */}
          {published && (
            <div className="glass-pill rounded-xl p-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-success font-medium mb-0.5">🟢 Live</div>
                  <div className="text-xs font-mono text-text-secondary">{preOrderUrl}</div>
                </div>
                <button onClick={copyLink} className="p-2 rounded-lg glass-pill text-text-tertiary hover:text-text-primary">
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <span className="text-[10px] text-text-tertiary">Share:</span>
                <button className="text-[10px] text-blue-500 hover:underline">Twitter</button>
                <button className="text-[10px] text-pink-500 hover:underline">Instagram</button>
                <button className="text-[10px] text-blue-700 hover:underline">Facebook</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Preview */
        <div className="animate-fade-in">
          <button onClick={() => setShowPreview(false)} className="text-xs text-text-tertiary hover:text-text-primary mb-3">← Back to editor</button>
          
          <div className="rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: pageData.coverColor }}>
            <div className="px-8 py-12 text-center">
              {/* Title */}
              <h1 className="text-2xl font-serif font-bold mb-1" style={{ color: pageData.accentColor }}>
                {pageData.title}
              </h1>
              <p className="text-sm mb-1" style={{ color: pageData.accentColor + 'aa' }}>{pageData.subtitle}</p>
              <p className="text-xs mb-6" style={{ color: pageData.accentColor + '80' }}>by {pageData.author || 'Author Name'}</p>

              {/* Blurb */}
              {pageData.blurb && (
                <p className="text-xs leading-relaxed max-w-xs mx-auto mb-6 whitespace-pre-line" style={{ color: pageData.accentColor + 'cc' }}>
                  {pageData.blurb}
                </p>
              )}

              {/* Countdown */}
              {pageData.countdown && pageData.launchDate && (
                <div className="mb-6">
                  <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: pageData.accentColor + '60' }}>Launching in</div>
                  <div className="flex justify-center gap-3">
                    {(() => {
                      const days = Math.max(0, Math.ceil((new Date(pageData.launchDate).getTime() - Date.now()) / 86400000));
                      return [
                        { value: days, label: 'days' },
                        { value: 0, label: 'hours' },
                        { value: 0, label: 'min' },
                      ].map(({ value, label }) => (
                        <div key={label} className="text-center">
                          <div className="text-xl font-mono font-bold" style={{ color: pageData.accentColor }}>{value}</div>
                          <div className="text-[8px] uppercase" style={{ color: pageData.accentColor + '60' }}>{label}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Email signup */}
              {pageData.emailSignup && (
                <div className="flex gap-2 max-w-xs mx-auto">
                  <input placeholder="your@email.com" className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/10 border border-white/20 outline-none"
                    style={{ color: pageData.accentColor }} />
                  <button className="px-4 py-2 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: pageData.accentColor, color: pageData.coverColor }}>
                    Notify Me
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
