import { useMemo, useState } from 'react';
import { Download, FileCheck2, Lock, Printer, X } from 'lucide-react';
import { buildAuthorshipReport, describeEvent, renderAuthorshipHtml, type AuthorshipEvent, type ExportOptions } from '../../lib/authorship';
import { cn } from '../../lib/utils';
import type { Chapter, Project } from '../../types';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const EXPORT_KEY = 'theodore:authorship-export';
function loadOptions(): ExportOptions {
  try { return { dates: true, steps: true, ...JSON.parse(localStorage.getItem(EXPORT_KEY) || '{}') }; } catch { return { dates: true, steps: true }; }
}

function Steps({ events }: { events: AuthorshipEvent[] }) {
  return (
    <ol className="px-3 pb-3 space-y-1 text-[11px] text-text-secondary">
      {events.map((e, i) => (
        <li key={i} className="leading-snug">
          <span className="text-text-tertiary tabular-nums mr-1.5">{when(e.since || e.at)}</span>
          {describeEvent(e)}
        </li>
      ))}
    </ol>
  );
}

/**
 * Private record of how the book was made, in the author's first person: what
 * I directed, what I had the AI draft, what I kept, rejected and rewrote, and
 * how I developed the characters, objects, places and maps. Never shown
 * publicly; exported only when the author chooses.
 */
export function AuthorshipRecord({ project, chapters, onClose }: { project: Project; chapters: Chapter[]; onClose: () => void }) {
  const report = useMemo(() => buildAuthorshipReport({ project, chapters }), [project, chapters]);
  const [open, setOpen] = useState<string | null>(null);
  const [options, setOptions] = useState<ExportOptions>(loadOptions);
  const t = report.totals;
  const fileName = `${project.title.replace(/[^\w\s-]/g, '').trim() || 'Book'} - Authorship record.html`;

  const setOption = (k: keyof ExportOptions, v: boolean) => setOptions((prev) => {
    const next = { ...prev, [k]: v };
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    return next;
  });
  const html = () => renderAuthorshipHtml(buildAuthorshipReport({ project, chapters }), options);

  const download = () => {
    const url = URL.createObjectURL(new Blob([html()], { type: 'text/html' }));
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
    w.document.write(html());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const toggle = (key: string) => setOpen(open === key ? null : key);
  const dev = report.development;

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 animate-fade-in space-y-3">
      <div className="flex items-center gap-2">
        <FileCheck2 size={15} className="text-text-tertiary" />
        <h3 className="flex-1 text-sm font-semibold">Authorship record</h3>
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
          [t.directions, 'directions I gave'],
          [t.revisionRounds, 'revision rounds'],
          [`${t.suggestionsAccepted}/${t.suggestionsOffered}`, 'suggestions I kept'],
          [`~${t.typedChars.toLocaleString()}`, 'characters I rewrote'],
        ].map(([v, label]) => (
          <div key={String(label)} className="rounded-xl bg-white/70 border border-black/5 px-2 py-2">
            <div className="text-base font-semibold tabular-nums">{v}</div>
            <div className="text-[10px] text-text-tertiary">{label}</div>
          </div>
        ))}
      </div>

      {/* Story planning + characters, objects, places */}
      {(dev.plans.length > 0 || report.storyChat.decisions.length > 0 || dev.entities.length > 0) && (
        <div className="divide-y divide-black/5 rounded-xl bg-white/60 border border-black/5">
          {(dev.plans.length > 0 || report.storyChat.decisions.length > 0) && (
            <div>
              <button onClick={() => toggle('plans')} className="w-full text-left px-3 py-2.5" aria-expanded={open === 'plans'}>
                <div className="text-[13px] font-medium">Story planning</div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  {dev.plans.length} map step{dev.plans.length === 1 ? '' : 's'} · {report.storyChat.authorMessages} Story chat message{report.storyChat.authorMessages === 1 ? '' : 's'} from me · {report.storyChat.decisions.length} set{report.storyChat.decisions.length === 1 ? '' : 's'} of plan changes I applied
                </div>
              </button>
              {open === 'plans' && (
                <>
                  <Steps events={dev.plans} />
                  {report.storyChat.decisions.length > 0 && (
                    <ol className="px-3 pb-3 space-y-1 text-[11px] text-text-secondary">
                      {report.storyChat.decisions.map((d, i) => (
                        <li key={i}><span className="text-text-tertiary mr-1.5">{when(d.at)}</span>{d.summary || 'Plan changes'} — I applied {d.applied} of {d.offered}.</li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>
          )}
          {dev.entities.length > 0 && (
            <div>
              <button onClick={() => toggle('entities')} className="w-full text-left px-3 py-2.5" aria-expanded={open === 'entities'}>
                <div className="text-[13px] font-medium">Characters, objects and places</div>
                <div className="text-[11px] text-text-tertiary mt-0.5">{dev.entities.length} I developed: {dev.entities.slice(0, 5).map((d) => d.name).join(', ')}{dev.entities.length > 5 ? '…' : ''}</div>
              </button>
              {open === 'entities' && dev.entities.map((d) => (
                <div key={d.entity + d.name}>
                  <div className="px-3 pt-1 text-[12px] font-medium">{d.name}</div>
                  <Steps events={d.events} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="divide-y divide-black/5 rounded-xl bg-white/60 border border-black/5">
        {report.chapters.map((c) => {
          const key = `ch-${c.number}`;
          return (
            <div key={key}>
              <button onClick={() => toggle(key)} className="w-full text-left px-3 py-2.5" aria-expanded={open === key}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium flex-1 truncate">Ch {c.number}: {c.title}</span>
                  {c.revisedPct !== null && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md tabular-nums', c.revisedPct >= 30 ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5 text-text-secondary')}>
                      {c.revisedPct}% mine after AI
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  {c.events.length
                    ? `${c.words.toLocaleString()} words · ${c.directions.length} direction${c.directions.length === 1 ? '' : 's'} · ${c.revisionRounds} revision round${c.revisionRounds === 1 ? '' : 's'}`
                    : `${c.words.toLocaleString()} words · written before tracking`}
                </div>
              </button>
              {open === key && (c.events.length
                ? <Steps events={c.events} />
                : <p className="px-3 pb-3 text-[11px] text-text-tertiary">No detailed log — written before tracking began. Version history still holds its earlier drafts.</p>)}
            </div>
          );
        })}
      </div>

      {/* Export */}
      <div className="rounded-xl bg-white/70 border border-black/5 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Export</div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={options.dates} onChange={(e) => setOption('dates', e.target.checked)} />
          Include dates and times
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={options.steps} onChange={(e) => setOption('steps', e.target.checked)} />
          Include every step (off: summaries only)
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={download} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-semibold bg-text-primary text-text-inverse">
            <Download size={13} /> Download
          </button>
          <button onClick={print} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-medium bg-black/5">
            <Printer size={13} /> Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}
