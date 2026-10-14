import { useEffect, useRef, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { generateId, cn } from '../../lib/utils';
import { NOTE_LOOKBACK_SECONDS, NOTES_CHANGED_EVENT, formatClock, listenNotesApi, passageAt } from '../../lib/listen-notes';
import type { Chapter } from '../../types';

const OPEN_EVENT = 'theodore:addListenNote';

/** The Note button for the players. Opens the note box pinned to this moment. */
export function ListenNoteButton({ className, label = true, dark = false, nested = false }: { className?: string; label?: boolean; dark?: boolean; nested?: boolean }) {
  const currentChapterId = useAudioStore((s) => s.currentChapterId);
  if (nested) {
    // Inside another button (the mini player bar): a button can't hold a button.
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label="Add a note at this moment"
        onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent(OPEN_EVENT)); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent(OPEN_EVENT)); } }}
        className={cn('inline-flex items-center justify-center text-text-primary', className)}
      >
        <NotebookPen size={18} />
      </span>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent(OPEN_EVENT)); }}
      disabled={!currentChapterId}
      aria-label="Add a note at this moment"
      title="Add a note at this moment"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-30',
        dark ? 'text-white/80 hover:text-white' : 'text-text-primary',
        className,
      )}
    >
      <NotebookPen size={label ? 16 : 18} />
      {label && <span>Note</span>}
    </button>
  );
}

function chapterFor(id: string | null, chapters: Chapter[]): Chapter | undefined {
  if (!id) return undefined;
  return chapters.find((c) => c.id === id)
    || (id.startsWith('scene-') ? chapters.find((c) => c.scenes?.some((s) => `scene-${s.id}` === id)) : undefined);
}

interface Moment {
  chapter: Chapter;
  audioTime: number;
  startTime: number;
  passage: ReturnType<typeof passageAt>;
  resume: boolean;
}

/**
 * The note box. Mounted once; any Note button opens it. Pauses playback while
 * it's open and picks up again on save if it was playing.
 */
export function ListenNoteCapture() {
  const [moment, setMoment] = useState<Moment | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const open = () => {
      const audio = useAudioStore.getState();
      const chapter = chapterFor(audio.currentChapterId, useStore.getState().chapters);
      if (!chapter) return;
      const audioTime = audio.currentTime || 0;
      const startTime = Math.max(0, audioTime - NOTE_LOOKBACK_SECONDS);
      const total = audio.duration || audio.chapterAudio[audio.currentChapterId || '']?.durationEstimate || 0;
      const resume = audio.playing;
      if (resume) window.dispatchEvent(new CustomEvent('theodore:togglePlayback'));
      setMoment({ chapter, audioTime, startTime, passage: passageAt(chapter.prose || '', startTime, audioTime, total), resume });
      setText('');
      setError(null);
      setSaved(false);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (!moment) return null;

  const close = (resume: boolean) => {
    if (resume && moment.resume && !useAudioStore.getState().playing) window.dispatchEvent(new CustomEvent('theodore:togglePlayback'));
    setMoment(null);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await listenNotesApi.create({
        id: generateId(),
        projectId: moment.chapter.projectId,
        chapterId: moment.chapter.id,
        chapterNumber: moment.chapter.number,
        chapterTitle: moment.chapter.title || null,
        audioTime: moment.audioTime,
        startTime: moment.startTime,
        passage: moment.passage?.text || null,
        passageStart: moment.passage?.start ?? null,
        passageEnd: moment.passage?.end ?? null,
        note: text.trim(),
      });
      window.dispatchEvent(new CustomEvent(NOTES_CHANGED_EVENT));
      setSaved(true);
      setTimeout(() => close(true), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-3 animate-fade-in" onClick={() => close(true)}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a note">
        <div className="flex items-baseline gap-2">
          <h2 className="flex-1 text-base font-semibold">Note</h2>
          <span className="text-xs text-text-tertiary tabular-nums">
            Ch {moment.chapter.number} · {formatClock(moment.startTime)}–{formatClock(moment.audioTime)}
          </span>
        </div>
        <textarea
          ref={ref}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type, or tap the mic on your keyboard and talk."
          rows={5}
          className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-[17px] leading-snug outline-none focus:border-black/40 resize-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || saved}
            className="flex-1 py-3.5 rounded-xl bg-text-primary text-text-inverse text-base font-semibold disabled:opacity-70"
          >
            {saved ? 'Saved' : saving ? 'Saving…' : moment.resume ? 'Save & keep listening' : 'Save'}
          </button>
          <button onClick={() => close(true)} className="px-5 py-3.5 rounded-xl bg-black/5 text-base">Cancel</button>
        </div>
        <p className="text-[11px] text-text-tertiary leading-snug">
          Saved to this chapter for later. Nothing in the story changes until you choose to use it.
        </p>
      </div>
    </div>
  );
}
