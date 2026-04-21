import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const CHAT_DRAFT_STORAGE_KEY = 'theodore-chat-creation-draft-v1';
const MAX_IMPORT_BYTES = 500 * 1024;
const MIN_IMPORT_CHARS = 50;
const CLIENT_PARSE_EXTENSIONS = ['.txt', '.md', '.markdown'];
const SERVER_PARSE_EXTENSIONS = ['.pdf', '.docx'];
const ACCEPTED_EXTENSIONS = [...CLIENT_PARSE_EXTENSIONS, ...SERVER_PARSE_EXTENSIONS];
const COMING_SOON_EXTENSIONS = ['.epub', '.doc', '.rtf', '.odt'];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

type Status =
  | { kind: 'idle' }
  | { kind: 'extracting'; fileName: string }
  | { kind: 'extract-error'; message: string }
  | { kind: 'unsupported'; ext: string }
  | { kind: 'too-large'; size: number; fileName: string; text: string }
  | { kind: 'too-small' }
  | { kind: 'importing'; fileName: string }
  | { kind: 'ready'; fileName: string; text: string; size: number; words: number; file?: File; truncated?: boolean; originalBytes?: number };

export function ImportProjectModal({
  onClose,
  onImported,
  onCreatedProject,
}: {
  onClose: () => void;
  onImported: (text: string) => void;
  onCreatedProject?: (projectId: string) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const [synopsisText, setSynopsisText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractOnServer = useCallback(async (file: File) => {
    setStatus({ kind: 'extracting', fileName: file.name });
    const form = new FormData();
    form.append('file', file);
    try {
      const resp = await fetch('/api/import/extract', { method: 'POST', body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus({
          kind: 'extract-error',
          message: typeof data?.message === 'string'
            ? data.message
            : `We couldn't read ${file.name}. Try exporting it as a text file instead.`,
        });
        return;
      }
      const text = typeof data?.text === 'string' ? data.text : '';
      if (text.length < MIN_IMPORT_CHARS) {
        setStatus({ kind: 'too-small' });
        return;
      }
      const words = typeof data?.words === 'number' ? data.words : text.split(/\s+/).filter(Boolean).length;
      setStatus({
        kind: 'ready',
        fileName: file.name,
        text,
        size: file.size,
        words,
        file,
        truncated: !!data?.truncated,
        originalBytes: typeof data?.extractedBytes === 'number' ? data.extractedBytes : undefined,
      });
    } catch {
      setStatus({
        kind: 'extract-error',
        message: `We couldn't reach the server to read that file — check your connection and try again.`,
      });
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const ext = getExtension(file.name);
    if (COMING_SOON_EXTENSIONS.includes(ext)) {
      setStatus({ kind: 'unsupported', ext });
      return;
    }
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setStatus({ kind: 'unsupported', ext: ext || 'unknown' });
      return;
    }

    if (SERVER_PARSE_EXTENSIONS.includes(ext)) {
      await extractOnServer(file);
      return;
    }

    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setStatus({ kind: 'unsupported', ext });
      return;
    }

    const text = normalizeText(raw);

    if (file.size > MAX_IMPORT_BYTES) {
      setStatus({ kind: 'too-large', size: file.size, fileName: file.name, text });
      return;
    }
    if (text.length < MIN_IMPORT_CHARS) {
      setStatus({ kind: 'too-small' });
      return;
    }

    const words = text.split(/\s+/).filter(Boolean).length;
    setStatus({ kind: 'ready', fileName: file.name, text, size: file.size, words, file });
  }, [extractOnServer]);

  const handleDirectImport = useCallback(async (file: File) => {
    if (!onCreatedProject) return;
    setStatus({ kind: 'importing', fileName: file.name });
    const form = new FormData();
    form.append('file', file);
    try {
      const resp = await fetch('/api/import/as-project', { method: 'POST', body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus({
          kind: 'extract-error',
          message: typeof data?.message === 'string'
            ? data.message
            : `We couldn't create a project from ${file.name}. Try again, or use the chat option below.`,
        });
        return;
      }
      const projectId = typeof data?.project?.id === 'string' ? data.project.id : null;
      const projectTitle = typeof data?.project?.title === 'string' ? data.project.title : '';
      if (!projectId) {
        setStatus({ kind: 'extract-error', message: `Import completed but the server didn't return a project ID.` });
        return;
      }

      // Generate a placeholder cover from the title so the project grid/cards
      // don't show an empty box. This mirrors what ChatCreation does after
      // creating a project — client-side canvas, no API calls, no credits.
      // We do it best-effort: if the generator fails, the import still succeeds.
      try {
        const { generateBookCover } = await import('../../lib/cover-generator');
        const coverUrl = generateBookCover(projectTitle || 'Imported Book');
        if (coverUrl) {
          await fetch(`/api/projects/${projectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ coverUrl }),
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[ImportProject] Cover generation failed, continuing:', e);
      }

      try { localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY); } catch {}
      onCreatedProject(projectId);
    } catch {
      setStatus({
        kind: 'extract-error',
        message: `We couldn't reach the server. Check your connection and try again.`,
      });
    }
  }, [onCreatedProject]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const startImport = useCallback((text: string) => {
    try {
      localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    } catch {
      // Storage unavailable — not fatal, chat will still accept the initial message.
    }
    onImported(text);
  }, [onImported]);

  const handleConfirm = () => {
    if (status.kind === 'ready') startImport(status.text);
  };

  const handleUseSynopsis = () => {
    const text = normalizeText(synopsisText);
    if (text.length < MIN_IMPORT_CHARS) return;
    const bytes = new Blob([text]).size;
    if (bytes > MAX_IMPORT_BYTES) {
      setStatus({ kind: 'too-large', size: bytes, fileName: 'synopsis', text });
      return;
    }
    startImport(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-8 pt-8 pb-3">
          <div>
            <h2 className="text-2xl font-serif font-semibold">Import Existing Work</h2>
            <p className="text-sm text-text-tertiary mt-1">
              Drop a text file or paste a synopsis — Theodore reads it and shapes your project from there.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-6">
          {status.kind === 'extracting' && (
            <div className="py-12 text-center">
              <Loader2 size={32} className="mx-auto mb-3 text-text-tertiary animate-spin" />
              <p className="text-sm font-medium">Reading {status.fileName}…</p>
              <p className="text-xs text-text-tertiary mt-1">Pulling the text out so we can shape it up together.</p>
            </div>
          )}

          {status.kind === 'importing' && (
            <div className="py-12 text-center">
              <Loader2 size={32} className="mx-auto mb-3 text-text-tertiary animate-spin" />
              <p className="text-sm font-medium">Creating project from {status.fileName}…</p>
              <p className="text-xs text-text-tertiary mt-1">Detecting chapters, cleaning up formatting, preparing for narration.</p>
            </div>
          )}

          {status.kind === 'extract-error' && (
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-1">Couldn't read that file</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{status.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setStatus({ kind: 'idle' })}
                  className="px-4 py-2 rounded-xl text-xs hover:bg-black/5 transition-colors"
                >
                  Try another file
                </button>
              </div>
            </div>
          )}

          {(status.kind === 'idle' || status.kind === 'unsupported' || status.kind === 'too-small') && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-4',
                  dragOver ? 'border-black/30 bg-black/[0.03]' : 'border-black/10 hover:border-black/20'
                )}
              >
                <Upload size={32} className="mx-auto mb-3 text-text-tertiary" />
                <p className="text-sm font-medium">Drop a file here, or click to browse</p>
                <p className="text-xs text-text-tertiary mt-1">
                  .txt, .md, .pdf, .docx — up to {formatSize(MAX_IMPORT_BYTES)} of text
                </p>
                <p className="text-[11px] text-text-tertiary mt-2 opacity-70">
                  .epub, .rtf coming soon
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(',')}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="hidden"
                />
              </div>

              {status.kind === 'unsupported' && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mb-4">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {COMING_SOON_EXTENSIONS.includes(status.ext)
                      ? <>We can't read <strong>{status.ext}</strong> files yet — that's coming soon. For now, export your document as <strong>.txt</strong> or <strong>.md</strong>, or paste the synopsis below.</>
                      : <>That file type isn't supported. Try a <strong>.txt</strong> or <strong>.md</strong> file, or paste the synopsis below.</>}
                  </span>
                </div>
              )}

              {status.kind === 'too-small' && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mb-4">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>That file looks empty or too short — try another, or paste your synopsis below.</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                  …or paste a synopsis
                </label>
                <textarea
                  value={synopsisText}
                  onChange={(e) => setSynopsisText(e.target.value)}
                  placeholder="Paste your synopsis, outline, or a few chapters here. Theodore will read it and ask follow-up questions."
                  rows={6}
                  className="w-full px-4 py-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:border-black/20 resize-none"
                />
                <div className="flex items-center justify-between mt-2 text-[11px] text-text-tertiary">
                  <span>{synopsisText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
                  <span>{formatSize(new Blob([synopsisText]).size)} / {formatSize(MAX_IMPORT_BYTES)}</span>
                </div>
              </div>
            </>
          )}

          {status.kind === 'too-large' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
              <div className="flex items-start gap-3 mb-3">
                <FileText size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-1">That's a big one — let's trim it down</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    <strong>{status.fileName}</strong> is {formatSize(status.size)}. Theodore can work with up to {formatSize(MAX_IMPORT_BYTES)} at a time right now — roughly a chapter or a chunky synopsis. Paste the gist below and we'll fill in the rest together through chat.
                  </p>
                </div>
              </div>
              <textarea
                value={synopsisText}
                onChange={(e) => setSynopsisText(e.target.value)}
                placeholder="A synopsis, the opening chapter, or a rundown of what you have so far…"
                rows={6}
                className="w-full px-4 py-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:border-black/20 resize-none bg-white"
              />
              <div className="flex items-center justify-between mt-2 text-[11px] text-text-tertiary">
                <span>{synopsisText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
                <span>{formatSize(new Blob([synopsisText]).size)} / {formatSize(MAX_IMPORT_BYTES)}</span>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setStatus({ kind: 'idle' }); setSynopsisText(''); }}
                  className="px-4 py-2 rounded-xl text-xs hover:bg-black/5 transition-colors"
                >
                  Start over
                </button>
                <button
                  onClick={handleUseSynopsis}
                  disabled={normalizeText(synopsisText).length < MIN_IMPORT_CHARS}
                  className="flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded-xl text-xs hover:bg-black/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Sparkles size={12} />
                  Use this
                </button>
              </div>
            </div>
          )}

          {status.kind === 'ready' && (
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-5">
              <div className="flex items-start gap-3">
                <FileText size={20} className="text-text-secondary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{status.fileName}</div>
                  <div className="text-[11px] text-text-tertiary mt-0.5">
                    {formatSize(status.size)} · {status.words.toLocaleString()} words
                  </div>
                </div>
              </div>
              {status.truncated && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-xl p-3 mt-3">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    This one's a big read — we took the first ~{status.words.toLocaleString()} words so Theodore can get oriented. You can fill in the rest in chat.
                  </span>
                </div>
              )}
              {status.file && onCreatedProject ? (
                <>
                  <p className="text-xs text-text-secondary mt-4 leading-relaxed">
                    Already finished? Import it straight into a project — Theodore will detect chapters, clean up the formatting, and open it ready to narrate. Or start a chat to shape it further.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2 mt-4">
                    <button
                      onClick={() => setStatus({ kind: 'idle' })}
                      className="px-4 py-2 rounded-xl text-xs hover:bg-black/5 transition-colors"
                    >
                      Pick a different file
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs border border-black/10 hover:bg-black/5 transition-colors"
                    >
                      <Sparkles size={12} />
                      Refine in chat
                    </button>
                    <button
                      onClick={() => status.file && handleDirectImport(status.file)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded-xl text-xs hover:bg-black/90 transition-colors"
                    >
                      <FileText size={12} />
                      Import as project
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-text-secondary mt-4 leading-relaxed">
                    Theodore will read this as your opening message in the Imagine chat, then suggest a direction and ask about any gaps.
                  </p>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => setStatus({ kind: 'idle' })}
                      className="px-4 py-2 rounded-xl text-xs hover:bg-black/5 transition-colors"
                    >
                      Pick a different file
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded-xl text-xs hover:bg-black/90 transition-colors"
                    >
                      <Sparkles size={12} />
                      Start chat
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {(status.kind === 'idle' || status.kind === 'unsupported' || status.kind === 'too-small') && (
          <div className="px-8 pb-6 pt-2 flex justify-end gap-2 border-t border-black/5">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs hover:bg-black/5 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleUseSynopsis}
              disabled={normalizeText(synopsisText).length < MIN_IMPORT_CHARS || new Blob([synopsisText]).size > MAX_IMPORT_BYTES}
              className="flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded-xl text-xs hover:bg-black/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Sparkles size={12} />
              Use pasted text
            </button>
          </div>
        )}
        {status.kind === 'extract-error' && (
          <div className="px-8 pb-6 pt-2 flex justify-end gap-2 border-t border-black/5">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs hover:bg-black/5 transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
