import { useEffect, useState } from 'react';
import { X, Copy, Check, Globe, Lock } from 'lucide-react';

interface Props {
  projectId: string;
  projectTitle: string;
  chapters: Array<{ id: string; number: number; title: string }>;
  onClose: () => void;
}

interface ShareStatus {
  isPublic: boolean;
  slug: string | null;
  publishedAt: string | null;
  shareConfig: {
    allowText?: boolean;
    allowAudio?: boolean;
    allowedChapterIds?: string[] | null;
    description?: string;
    authorDisplayName?: string;
  };
  listens: number;
}

function libraryUrl(slug: string): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/library/b/${slug}`;
  }
  const root = host.replace(/^www\./, '');
  return `${window.location.protocol}//library.${root}/b/${slug}`;
}

export function ShareBookDialog({ projectId, projectTitle, chapters, onClose }: Props) {
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allowText, setAllowText] = useState(true);
  const [allowAudio, setAllowAudio] = useState(true);
  const [description, setDescription] = useState('');
  const [authorDisplayName, setAuthorDisplayName] = useState('');
  const [allowAllChapters, setAllowAllChapters] = useState(true);
  const [allowedIds, setAllowedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/projects/${projectId}/share-status`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((s: ShareStatus | null) => {
        if (!s) return;
        setStatus(s);
        const cfg = s.shareConfig || {};
        setAllowText(cfg.allowText !== false);
        setAllowAudio(cfg.allowAudio !== false);
        setDescription(cfg.description || '');
        setAuthorDisplayName(cfg.authorDisplayName || '');
        if (cfg.allowedChapterIds == null) {
          setAllowAllChapters(true);
          setAllowedIds(new Set(chapters.map(c => c.id)));
        } else {
          setAllowAllChapters(false);
          setAllowedIds(new Set(cfg.allowedChapterIds));
        }
      });
  }, [projectId, chapters]);

  const publish = async () => {
    setLoading(true);
    const body = {
      allowText,
      allowAudio,
      description,
      authorDisplayName: authorDisplayName || undefined,
      allowedChapterIds: allowAllChapters ? null : Array.from(allowedIds),
    };
    const r = await fetch(`/api/projects/${projectId}/publish`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const data = await r.json();
      setStatus((prev) => ({ ...(prev || { listens: 0, publishedAt: null }), isPublic: true, slug: data.slug, shareConfig: data.shareConfig, publishedAt: prev?.publishedAt || new Date().toISOString(), listens: prev?.listens || 0 }));
    }
    setLoading(false);
  };

  const unpublish = async () => {
    if (!confirm('Unpublish this book? The shareable link will stop working.')) return;
    setLoading(true);
    await fetch(`/api/projects/${projectId}/unpublish`, { method: 'POST', credentials: 'include' });
    setStatus((prev) => prev ? { ...prev, isPublic: false } : prev);
    setLoading(false);
  };

  const toggleChapter = (id: string) => {
    setAllowedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const copyLink = () => {
    if (!status?.slug) return;
    navigator.clipboard.writeText(libraryUrl(status.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-100">
          <div>
            <h2 className="text-lg font-semibold">Share "{projectTitle}"</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Publish to the Theodore library</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {status?.isPublic && status.slug && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800 text-sm font-medium mb-2">
                <Globe size={14} /> Published
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={libraryUrl(status.slug)}
                  className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 font-mono"
                />
                <button onClick={copyLink} className="p-2 rounded-lg bg-white border border-green-200 hover:bg-green-100">
                  {copied ? <Check size={14} className="text-green-700" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="text-xs text-green-700 mt-2">{status.listens} listen{status.listens === 1 ? '' : 's'}</div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Author name (public)</label>
            <input
              value={authorDisplayName}
              onChange={(e) => setAuthorDisplayName(e.target.value)}
              placeholder="Your name or pen name"
              className="mt-1.5 w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short teaser for readers..."
              rows={3}
              className="mt-1.5 w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowText} onChange={(e) => setAllowText(e.target.checked)} />
              Include text
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowAudio} onChange={(e) => setAllowAudio(e.target.checked)} />
              Include audio
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <input
                type="checkbox"
                checked={allowAllChapters}
                onChange={(e) => setAllowAllChapters(e.target.checked)}
              />
              Include all chapters
            </label>
            {!allowAllChapters && (
              <div className="pl-6 space-y-1 max-h-48 overflow-y-auto">
                {chapters.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={allowedIds.has(c.id)}
                      onChange={() => toggleChapter(c.id)}
                    />
                    Ch. {c.number}: {c.title}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-2 flex items-center justify-between border-t border-neutral-100">
          {status?.isPublic ? (
            <button
              onClick={unpublish}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
            >
              <Lock size={14} /> Unpublish
            </button>
          ) : <span />}
          <button
            onClick={publish}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? 'Saving...' : status?.isPublic ? 'Update sharing' : 'Publish & get link'}
          </button>
        </div>
      </div>
    </div>
  );
}
