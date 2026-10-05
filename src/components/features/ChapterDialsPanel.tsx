import { RotateCcw } from 'lucide-react';
import {
  DEFAULT_DIALS, DIALOGUE_MAX, DIALOGUE_MIN, DIALOGUE_STEP, PACE_LABELS, WORDS_MAX, WORDS_MIN, WORDS_STEP,
  formatWords, type ChapterDials,
} from '../../lib/chapter-dials';

function Dial({ label, value, display, min, max, step, ends, onChange }: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  ends: [string, string];
  onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{label}</span>
        <span className="text-sm font-semibold text-text-primary tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={display}
        className="dial w-full"
        style={{ ['--fill' as string]: `${fill}%` }}
      />
      <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

/** Length, dialogue share and pace for the chapter about to be written. */
export function ChapterDialsPanel({ value, onChange }: { value: ChapterDials; onChange: (d: ChapterDials) => void }) {
  const isDefault = value.words === DEFAULT_DIALS.words && value.dialoguePct === DEFAULT_DIALS.dialoguePct && value.pace === DEFAULT_DIALS.pace;
  return (
    <div className="max-w-xl mx-auto mb-5 px-2">
      <style>{`
        .dial { -webkit-appearance: none; appearance: none; height: 28px; background: transparent; touch-action: pan-y; }
        .dial::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: linear-gradient(to right, var(--color-text-primary, #1c1917) var(--fill), rgba(0,0,0,0.1) var(--fill)); }
        .dial::-moz-range-track { height: 6px; border-radius: 999px; background: rgba(0,0,0,0.1); }
        .dial::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--color-text-primary, #1c1917); }
        .dial::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; margin-top: -9px; border-radius: 999px; background: #fff; border: 2px solid var(--color-text-primary, #1c1917); box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: grab; }
        .dial::-moz-range-thumb { width: 22px; height: 22px; border-radius: 999px; background: #fff; border: 2px solid var(--color-text-primary, #1c1917); box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: grab; }
        .dial:focus-visible { outline: none; }
        .dial:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(0,0,0,0.12); }
      `}</style>
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 space-y-4 text-left">
        <Dial
          label="Length"
          value={value.words}
          display={`${value.words.toLocaleString()} words`}
          min={WORDS_MIN}
          max={WORDS_MAX}
          step={WORDS_STEP}
          ends={[formatWords(WORDS_MIN), formatWords(WORDS_MAX)]}
          onChange={(words) => onChange({ ...value, words })}
        />
        <Dial
          label="Dialogue"
          value={value.dialoguePct}
          display={`${value.dialoguePct}%`}
          min={DIALOGUE_MIN}
          max={DIALOGUE_MAX}
          step={DIALOGUE_STEP}
          ends={['Mostly narration', 'Mostly dialogue']}
          onChange={(dialoguePct) => onChange({ ...value, dialoguePct })}
        />
        <Dial
          label="Pace & energy"
          value={value.pace}
          display={PACE_LABELS[value.pace]}
          min={1}
          max={5}
          step={1}
          ends={['Slow & reflective', 'Fast & intense']}
          onChange={(pace) => onChange({ ...value, pace })}
        />
        {!isDefault && (
          <button
            onClick={() => onChange(DEFAULT_DIALS)}
            className="inline-flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary"
          >
            <RotateCcw size={11} /> Reset to defaults ({DEFAULT_DIALS.words.toLocaleString()} words · {DEFAULT_DIALS.dialoguePct}% dialogue · {PACE_LABELS[DEFAULT_DIALS.pace]})
          </button>
        )}
      </div>
    </div>
  );
}
