import { useState } from 'react';
import { Megaphone, Sparkles, AlertCircle, Loader2, ChevronDown, ChevronRight, Copy, CheckCircle2 } from 'lucide-react';

const API = '/api/admin';

interface RuleScore {
  n: number;
  name: string;
  applies: boolean;
  score: number;
  note: string;
}

interface GradeResult {
  overall: number;
  verdict: string;
  char_count: number;
  char_warning: string;
  rules: RuleScore[];
  strengths: string[];
  weaknesses: string[];
  rewrites: string[];
}

export function CopyGraderTab() {
  const [headline, setHeadline] = useState('');
  const [primary, setPrimary] = useState('');
  const [showPrimary, setShowPrimary] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const charCount = headline.length;
  const overLimit = charCount > 40;

  const grade = async () => {
    const trimmed = headline.trim();
    if (!trimmed) {
      setError('Enter a headline first');
      return;
    }
    setGrading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${API}/grade-copy`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: trimmed, primary: showPrimary ? primary.trim() : undefined }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `${r.status}`);
      }
      const j: GradeResult = await r.json();
      setResult(j);
    } catch (e: any) {
      setError(e?.message || 'Grading failed');
    } finally {
      setGrading(false);
    }
  };

  const copyRewrite = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      setError('Copy failed');
    }
  };

  const useRewrite = (text: string) => {
    setHeadline(text);
    setResult(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={16} className="text-text-tertiary" />
        <h2 className="text-base font-serif font-semibold">Copy Grader</h2>
      </div>
      <p className="text-xs text-text-tertiary mb-5">
        Paste a headline (and optionally body copy). Grades against Hormozi's 12+1 rules and suggests rewrites. Tuned for Theodore audio-player ads.
      </p>

      <div className="rounded-2xl border border-black/5 bg-white p-4 mb-4">
        <label className="block text-xs font-semibold text-text-secondary mb-1.5">Headline</label>
        <textarea
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Press play. That's an AI audiobook."
          rows={2}
          className="w-full text-sm rounded-lg border border-black/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
          maxLength={200}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-[11px] tabular-nums ${overLimit ? 'text-red-600 font-semibold' : 'text-text-tertiary'}`}>
            {charCount} / 40 chars{overLimit && ` — over by ${charCount - 40}`}
          </span>
          <button
            onClick={() => setShowPrimary(!showPrimary)}
            className="text-[11px] text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1"
          >
            {showPrimary ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {showPrimary ? 'Hide' : 'Add'} primary text
          </button>
        </div>

        {showPrimary && (
          <div className="mt-3">
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Primary text (optional)</label>
            <textarea
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="Type one sentence. Theodore writes the novel and narrates the audiobook. Free."
              rows={4}
              className="w-full text-sm rounded-lg border border-black/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
              maxLength={2200}
            />
            <span className="text-[11px] text-text-tertiary tabular-nums">{primary.length} / 2200</span>
          </div>
        )}

        <button
          onClick={grade}
          disabled={grading || !headline.trim()}
          className="mt-3 w-full sm:w-auto px-4 py-2 rounded-lg bg-text-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-text-primary/90 transition-colors"
        >
          {grading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {grading ? 'Grading…' : 'Grade headline'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 inline-flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Score + verdict */}
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <div className="flex items-center gap-4">
              <ScoreRing score={result.overall} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold mb-1">Verdict</div>
                <p className="text-sm text-text-primary leading-snug">{result.verdict}</p>
                {result.char_warning && (
                  <p className="text-[11px] text-red-600 mt-1.5 inline-flex items-center gap-1">
                    <AlertCircle size={11} /> {result.char_warning}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Strengths + weaknesses */}
          <div className="grid sm:grid-cols-2 gap-3">
            <SectionList title="Strengths" items={result.strengths} tone="good" />
            <SectionList title="Weaknesses" items={result.weaknesses} tone="bad" />
          </div>

          {/* Rewrites */}
          {result.rewrites?.length > 0 && (
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold mb-2">Rewrites</div>
              <div className="space-y-2">
                {result.rewrites.map((rw, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-black/[0.02] border border-black/5">
                    <span className="flex-1 text-sm font-serif text-text-primary">{rw}</span>
                    <span className="text-[10px] text-text-tertiary tabular-nums shrink-0">{rw.length}c</span>
                    <button
                      onClick={() => useRewrite(rw)}
                      className="text-[11px] text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-black/5 shrink-0"
                      title="Load into the editor"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => copyRewrite(rw, i)}
                      className="p-1 rounded hover:bg-black/5 shrink-0"
                      title="Copy"
                    >
                      {copiedIdx === i ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Copy size={13} className="text-text-tertiary" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rule breakdown */}
          <div className="rounded-2xl border border-black/5 bg-white">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] rounded-2xl"
            >
              <span className="text-sm font-semibold text-text-primary inline-flex items-center gap-1.5">
                {showRules ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Rule-by-rule breakdown
              </span>
              <span className="text-[11px] text-text-tertiary">
                {result.rules.filter(r => r.applies).length} rules scored
              </span>
            </button>
            {showRules && (
              <div className="px-4 pb-4 space-y-1.5 border-t border-black/5 pt-3">
                {result.rules.map((rule) => (
                  <div key={rule.n} className={`flex items-start gap-3 p-2 rounded-lg ${!rule.applies ? 'opacity-40' : ''}`}>
                    <span className="text-[11px] font-mono text-text-tertiary w-5 shrink-0 mt-0.5">#{rule.n}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text-primary">{rule.name}</span>
                        {rule.applies && <ScoreDots score={rule.score} />}
                        {!rule.applies && <span className="text-[10px] text-text-tertiary uppercase tracking-wider">N/A</span>}
                      </div>
                      <p className="text-[11px] text-text-tertiary mt-0.5 leading-snug">{rule.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 80 ? 'emerald' : score >= 60 ? 'amber' : score >= 40 ? 'orange' : 'red';
  const colors: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700' },
    red: { bg: 'bg-red-50', text: 'text-red-700' },
  };
  const c = colors[tone];
  return (
    <div className={`shrink-0 w-20 h-20 rounded-full ${c.bg} flex flex-col items-center justify-center`}>
      <span className={`text-2xl font-serif font-bold ${c.text} tabular-nums`}>{score}</span>
      <span className={`text-[9px] uppercase tracking-wider font-semibold ${c.text} opacity-70`}>/ 100</span>
    </div>
  );
}

function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < score ? (score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-amber-500' : 'bg-orange-500') : 'bg-black/10'
          }`}
        />
      ))}
    </span>
  );
}

function SectionList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'bad' }) {
  const accent = tone === 'good' ? 'text-emerald-700' : 'text-orange-700';
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4">
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${accent}`}>{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-text-tertiary">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s, i) => (
            <li key={i} className="text-xs text-text-primary leading-snug flex gap-2">
              <span className={`shrink-0 ${accent}`}>•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
