import { useMemo, useState } from 'react';
import { Download, FileCheck2, Lock, Printer, X } from 'lucide-react';
import { buildAuthorshipReport, describeEvent, renderAuthorshipHtml } from '../../lib/authorship';
import { cn } from '../../lib/utils';
import type { Chapter, Project } from '../../types';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/**
 * Private record of how the book was made: what the author directed, what the
 * AI drafted or changed, what the author kept, rejected and wrote. Never
 * shown publicly; exported only when the author chooses.
 */
export function AuthorshipRecord({ project, chapters, onClose }: { project: Project; chapters: Chapter[]; onClose: () => void }) {
  const report = useMemo(() => buildAuthorshipReport({ project, chapters }), [project, chapters]);
  const [open, setOpen] = useState<number | null>(null);
  const t = report.totals;
  const fileName = `${project.title.replace(/[^\w\s-]/g, '').trim() || 'Book'} - Authorship record.html`;

  const download = () => {
    const blob = new Blob([renderAuthorshipHtml(buildAuthorshipReport({ project, chapters }))], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) { download(); return; }
    w.document.write(renderAuthorshipHtml(buildAuthorshipReport({ project, chapters })));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 animate-fade-in space-y-3">
      <div className="flex items-center gap-2">
        <FileCheck2 size={15} className="text-text-tertiary" />
        <h3 className="flex-1 text-sm font-semibold">Authorship record</h3>
        <button onClick={print} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-secondary hover:bg-black/5" title="Print or save as PDF">
          <Printer size={12} /> Print / PDF
        </button>
        <button onClick={download} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text-secondary hover:bg-black/5" title="Download the record">
          <Download size={12} /> Download
        </button>
        <button onClick={onClose} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary" aria-label="Close authorship record">
          <X size={14} />
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-text-tertiary leading-snug">
        <Lock size={11} className="mt-0.5 flex-shrink-0" />
        Private to you. It's never added to the book or shown on shared pages; it leaves your account only if you download it.
        {report.trackingSince ? ` Detailed tracking since ${when(report.trackingSince)}.` : ' Tracking starts with your next draft, edit or rebuild.'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          [t.directions, 'your directions'],
          [`${t.suggestionsAccepted}/${t.suggestionsOffered}`, 'AI suggestions kept'],
          [`~${t.typedChars.toLocaleString()}`, 'characters you wrote'],
          [t.aiSteps, 'AI drafting steps'],
        ].map(([v, label]) => (
          <div key={String(label)} className="rounded-xl bg-white/70 border border-black/5 px-2 py-2">
            <div className="text-base font-semibold tabular-nums">{v}</div>
            <div className="text-[10px] text-text-tertiary">{label}</div>
          </div>
        ))}
      </div>

      {(report.storyChat.decisions.length > 0 || report.storyChat.authorMessages > 0) && (
        <div className="text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Story planning:</span> {report.storyChat.authorMessages} message{report.storyChat.authorMessages === 1 ? '' : 's'} from you in Story chat
          {report.storyChat.decisions.length > 0 && `, ${report.storyChat.decisions.length} set${report.storyChat.decisions.length === 1 ? '' : 's'} of plan changes applied`}.
        </div>
      )}

      <div className="divide-y divide-black/5 rounded-xl bg-white/60 border border-black/5">
        {report.chapters.map((c) => {
          const isOpen = open === c.number;
          return (
            <div key={c.number}>
              <button onClick={() => setOpen(isOpen ? null : c.number)} className="w-full text-left px-3 py-2.5" aria-expanded={isOpen}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium flex-1 truncate">Ch {c.number}: {c.title}</span>
                  {c.revisedPct !== null && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md tabular-nums', c.revisedPct >= 30 ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5 text-text-secondary')}>
                      {c.revisedPct}% yours after AI
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  {c.words.toLocaleString()} words · {c.aiDrafts + c.aiRebuilds} draft{c.aiDrafts + c.aiRebuilds === 1 ? '' : 's'} · {c.directions.length} direction{c.directions.length === 1 ? '' : 's'} · {c.typedSessions} editing session{c.typedSessions === 1 ? '' : 's'}
                  {c.events.length === 0 && ' · written before tracking'}
                </div>
              </button>
              {isOpen && (
                <ol className="px-3 pb-3 space-y-1 text-[11px] text-text-secondary">
                  {c.events.length === 0 && <li className="text-text-tertiary">No detailed log yet — this chapter was written before tracking began. Version history still holds its earlier drafts.</li>}
                  {c.events.map((e, i) => (
                    <li key={i} className="leading-snug">
                      <span className="text-text-tertiary tabular-nums mr-1.5">{when(e.since || e.at)}</span>
                      {describeEvent(e)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
