import { useState } from 'react';
import { Megaphone, Sparkles, AlertCircle, Loader2, ChevronDown, ChevronRight, Copy, CheckCircle2, Bookmark } from 'lucide-react';

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

interface Preset {
  id: string;
  group: string;
  label: string;
  headline: string;
  primary?: string;
}

const PRESETS: Preset[] = [
  // ─── Audio Player — D7–D20 (newest, Hormozi-built) ───────────────────────
  { id: 'd7', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D7 — Stop-trying',
    headline: 'Stop trying to write that book.',
    primary: 'You\'ve started three times. Chapter 4 is where it always dies. / Theodore writes the whole novel for you. And narrates it. / Press play on a real chapter, generated this morning from one sentence. Free.' },
  { id: 'd8', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D8 — Damaging admission',
    headline: 'It\'s not Tom Hanks narrating.',
    primary: 'Theodore\'s voice is AI. It will not win an Audie. / But it will narrate your whole novel by tomorrow morning while you sleep. / Press play to hear what one user generated last night. Free.' },
  { id: 'd9', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D9 — Who / who-not',
    headline: 'Not for people who hate reading.',
    primary: 'If you\'ve never wanted to write a book, scroll on. This isn\'t for you. / If you\'ve been chewing on an idea for years — Theodore writes the novel and narrates the audiobook from one sentence. / Press play on the demo. Free. / PS: only worth 60 seconds if you\'ve ever opened a blank doc and meant it.' },
  { id: 'd10', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D10 — Spouse status',
    headline: 'The book your spouse won\'t believe',
    primary: '"Wait — YOU wrote this?" / That\'s the moment Theodore is built for. Type a sentence Saturday night. Hand them the audiobook Sunday morning. / Free. One sentence is the whole input.' },
  { id: 'd11', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D11 — The moment',
    headline: 'Headphones in. Your novel.',
    primary: 'Coffee. Headphones. Press play. / The voice in your ear is reading a book that didn\'t exist yesterday — yours, generated from one sentence. / Free to try. 60 seconds.' },
  { id: 'd12', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D12 — Reason-why',
    headline: 'One sentence. One audiobook.',
    primary: 'Theodore works because it does the boring parts. The outline. The character sheets. The chapter-to-chapter consistency. The narration. / You bring the idea. It brings the book. / Press play to hear a chapter. Free.' },
  { id: 'd13', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D13 — Humor + status',
    headline: 'Your writer friend will be furious',
    primary: 'They\'ve been "working on the novel" since 2019. / You\'ll have a finished one — narrated — by Tuesday. / Don\'t tell them how. Or do. / Free. Press play on the demo.' },
  { id: 'd14', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D14 — Even-if hook',
    headline: 'Write a novel without writing one',
    primary: 'Even if you\'ve never finished a chapter. / Even if you can\'t outline. / Even if you "don\'t have the time." / Theodore writes it. Narrates it. You press play. Free.' },
  { id: 'd15', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D15 — 3rd-grade staccato',
    headline: 'Type a sentence. Get a book.',
    primary: 'Sentence in. / Theodore writes it. / Theodore narrates it. / You press play. / Free.' },
  { id: 'd16', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D16 — Speed proof',
    headline: '60 seconds, sentence to audiobook',
    primary: 'That\'s the whole loop. Type. Wait. Press play. / Theodore writes the chapters, designs the cover, narrates the whole thing. / Free. Worth 60 seconds.' },
  { id: 'd17', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D17 — PS-led',
    headline: 'The book in your head deserves out',
    primary: 'Theodore writes the novel. Theodore narrates it. You press play and hear the thing you\'ve been thinking about for years. / Free. One sentence is all it takes. / PS — if you\'ve already finished a novel, this isn\'t for you. This is for the rest of us.' },
  { id: 'd18', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D18 — CTA-led',
    headline: 'Three steps. One audiobook.',
    primary: '1) Type one sentence. / 2) Theodore writes and narrates the book. / 3) Press play. / That\'s it. Free to try.' },
  { id: 'd19', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D19 — Curiosity hook',
    headline: 'How the busy "write" novels now',
    primary: 'No mornings at 5am. No outlining workshops. No NaNoWriMo. / They type one sentence into Theodore. It writes the chapters, narrates the audiobook, hands it back. / Press play on a real one. Free.' },
  { id: 'd20', group: 'Audio player — D7–D20 (Hormozi batch)', label: 'D20 — Self-deprecating',
    headline: 'The lazy way to "write" a novel',
    primary: 'Honestly? You barely write anything. / You type one sentence. Theodore writes the rest, narrates the audiobook, designs the cover. / It\'s almost cheating. Free to try.' },

  // ─── Audio Player — D1–D6 (existing winners) ─────────────────────────────
  { id: 'audio-control', group: 'Audio player — control + D1–D6', label: 'Control — Send to writer friend',
    headline: 'Send this to your writer friend',
    primary: 'Your friend who "always wanted to write a book" needs to see this. / Type one sentence. Theodore writes the novel, designs the cover, and narrates the audiobook. / Free. Takes 60 seconds.' },
  { id: 'd1', group: 'Audio player — control + D1–D6', label: 'D1 — Press play',
    headline: 'Press play. That\'s an AI audiobook.',
    primary: 'That audio player? It\'s a chapter Theodore wrote and narrated from a single sentence — no recording booth, no narrator hire, no months of edits. / Type your idea. Hear the audiobook. Free for 60 seconds of curiosity.' },
  { id: 'd2', group: 'Audio player — control + D1–D6', label: 'D2 — Audible-shaped void',
    headline: 'Write the audiobook you can\'t find',
    primary: 'You\'ve searched Audible for the exact book you wanted. It doesn\'t exist. / Theodore makes it: type the premise, get a 12-chapter novel narrated start to finish. Yours, in your voice. Free to start.' },
  { id: 'd3', group: 'Audio player — control + D1–D6', label: 'D3 — Disbelief / proof',
    headline: 'This audiobook didn\'t exist 60 seconds ago',
    primary: 'No ghostwriter. No narrator. No editor. / One person typed one sentence, and Theodore wrote and narrated this chapter while they made coffee. / Try yours free. Hear it before you finish your cup.' },
  { id: 'd4', group: 'Audio player — control + D1–D6', label: 'D4 — Commuter pull',
    headline: 'Your commute, your novel, narrated',
    primary: '30 minutes each way. That\'s enough for a chapter. / Theodore turns one idea into a fully narrated audiobook — yours to listen to on the drive, the train, the walk. Free to try.' },
  { id: 'd5', group: 'Audio player — control + D1–D6', label: 'D5 — Dead-novel angle',
    headline: 'That novel rotting in Google Docs?',
    primary: 'It deserves better than Chapter 3 forever. / Type the premise into Theodore. Get a finished novel AND a narrated audiobook the same afternoon. Free to start. No account needed.' },
  { id: 'd6', group: 'Audio player — control + D1–D6', label: 'D6 — Show-don\'t-tell',
    headline: '"She\'d never expected the lighthouse to answer."',
    primary: 'That\'s the first line of an audiobook a Theodore user generated yesterday from one sentence. / Bring your weirdest premise. Theodore writes the chapters, designs the cover, and narrates the whole thing. Free.' },

  // ─── Indie Authors ad set ────────────────────────────────────────────────
  { id: 'ia-control', group: 'Indie Authors', label: 'Control — Sentence in. Audiobook out.',
    headline: 'Sentence in. Audiobook out.',
    primary: 'Indie author? Theodore turns one ambitious sentence into a finished audiobook — characters, world, voice, all consistent across every chapter. Write the novel and narrate it in one tool. Free to start.' },
  { id: 'ia-a', group: 'Indie Authors', label: 'A — Stop juggling 5 tools',
    headline: 'Stop juggling 5 writing tools',
    primary: 'Scrivener for writing. ProWritingAid for editing. ACX for narration. Theodore replaces all three: write your novel, generate the audiobook, all in one place. Built by indie authors, for indie authors. Free trial.' },
  { id: 'ia-b', group: 'Indie Authors', label: 'B — Audible angle',
    headline: 'Your novel, on Audible',
    primary: 'The Audible market doubled in 5 years. Theodore is the fastest path from "I have an idea" to "my book is on Audible" — write the novel in your voice, narrate it in one click. Free to try.' },
  { id: 'ia-c', group: 'Indie Authors', label: 'C — Concrete demo',
    headline: '"A grief-struck botanist..."',
    primary: 'That\'s the prompt one Theodore user typed in. By the end of the session they had a chapter outline, three character sheets, a first draft, AND an audiobook narration of chapter one. Bring your weirdest idea. Free.' },

  // ─── AI Tool Users ad set ────────────────────────────────────────────────
  { id: 'ai-control', group: 'AI Tool Users', label: 'Control — Write & narrate',
    headline: 'Write & narrate, one tool',
    primary: 'ChatGPT writes one paragraph at a time. Theodore writes the whole novel — and turns it into an audiobook. One sentence in, full audiobook out. Built for people who already pay for AI.' },
  { id: 'ai-a', group: 'AI Tool Users', label: 'A — Contrarian',
    headline: 'Most AI writing tools quit at chapter 2',
    primary: 'ChatGPT can write a chapter. It just can\'t write a *book* — by chapter 3 the characters have changed names. Theodore was built for the long form: consistent characters across 12 chapters, your voice throughout, audiobook export at the end. Free to try.' },
  { id: 'ai-b', group: 'AI Tool Users', label: 'B — Direct comparison',
    headline: 'ChatGPT + ElevenLabs in one tool',
    primary: 'You could glue ChatGPT to ElevenLabs to a manuscript editor and pay 3 subscriptions. Or you could use Theodore: write the novel, generate the audiobook, one place. Free to start.' },
  { id: 'ai-c', group: 'AI Tool Users', label: 'C — Novelty hook',
    headline: 'Type a sentence. Get an audiobook.',
    primary: 'Drop in any sentence. Theodore builds a structured story, three-dimensional characters, prose in your voice, AND an audiobook narration. Free trial. Worth 5 minutes.' },
];

export function CopyGraderTab() {
  const [headline, setHeadline] = useState('');
  const [primary, setPrimary] = useState('');
  const [showPrimary, setShowPrimary] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetScores, setPresetScores] = useState<Record<string, number>>({});

  const charCount = headline.length;
  const overLimit = charCount > 40;

  const runGrade = async (h: string, p: string | undefined, presetId?: string) => {
    setGrading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${API}/grade-copy`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: h, primary: p && p.trim() ? p : undefined }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `${r.status}`);
      }
      const j: GradeResult = await r.json();
      setResult(j);
      if (presetId) setPresetScores((prev) => ({ ...prev, [presetId]: j.overall }));
    } catch (e: any) {
      setError(e?.message || 'Grading failed');
    } finally {
      setGrading(false);
    }
  };

  const grade = () => {
    const trimmed = headline.trim();
    if (!trimmed) {
      setError('Enter a headline first');
      return;
    }
    setActivePresetId(null);
    runGrade(trimmed, showPrimary ? primary.trim() : undefined);
  };

  const loadAndGrade = (preset: Preset) => {
    setHeadline(preset.headline);
    if (preset.primary) {
      setPrimary(preset.primary);
      setShowPrimary(true);
    } else {
      setPrimary('');
      setShowPrimary(false);
    }
    setActivePresetId(preset.id);
    runGrade(preset.headline, preset.primary);
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
    setActivePresetId(null);
    setResult(null);
  };

  // Group presets for display
  const grouped = PRESETS.reduce<Record<string, Preset[]>>((acc, p) => {
    (acc[p.group] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={16} className="text-text-tertiary" />
        <h2 className="text-base font-serif font-semibold">Copy Grader</h2>
      </div>
      <p className="text-xs text-text-tertiary mb-5">
        Paste a headline (and optionally body copy). Grades against Hormozi's 12+1 rules and suggests rewrites. Tuned for Theodore audio-player ads.
      </p>

      {/* ─── Saved headlines (front-loaded) ──────────────────────────────── */}
      <div className="rounded-2xl border border-black/5 bg-white mb-4 overflow-hidden">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.02]"
        >
          <span className="text-sm font-semibold text-text-primary inline-flex items-center gap-1.5">
            {showPresets ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Bookmark size={13} className="text-text-tertiary" />
            Saved headlines ({PRESETS.length})
          </span>
          <span className="text-[11px] text-text-tertiary">
            {Object.keys(presetScores).length} graded
          </span>
        </button>

        {showPresets && (
          <div className="border-t border-black/5">
            {Object.entries(grouped).map(([groupName, items]) => (
              <div key={groupName} className="border-b border-black/5 last:border-b-0">
                <div className="px-4 py-2 bg-black/[0.02] text-[10px] uppercase tracking-wider font-semibold text-text-tertiary">
                  {groupName}
                </div>
                <div>
                  {items.map((p) => {
                    const score = presetScores[p.id];
                    const isActive = activePresetId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 px-4 py-2 border-t border-black/5 first:border-t-0 ${
                          isActive ? 'bg-amber-50/50' : 'hover:bg-black/[0.02]'
                        }`}
                      >
                        <span className="text-[11px] font-mono text-text-tertiary w-14 shrink-0 truncate">{p.label.split(' — ')[0]}</span>
                        <span className="flex-1 min-w-0 text-sm text-text-primary truncate font-serif">{p.headline}</span>
                        <span className={`text-[10px] tabular-nums shrink-0 ${p.headline.length > 40 ? 'text-red-600 font-semibold' : 'text-text-tertiary'}`}>
                          {p.headline.length}c
                        </span>
                        {score !== undefined && (
                          <span className={`text-[11px] tabular-nums font-semibold shrink-0 px-1.5 py-0.5 rounded ${scoreColor(score)}`}>
                            {score}
                          </span>
                        )}
                        <button
                          onClick={() => loadAndGrade(p)}
                          disabled={grading}
                          className="text-[11px] font-semibold text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-black/5 shrink-0 disabled:opacity-40"
                        >
                          Grade
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Manual editor ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 mb-4">
        <label className="block text-xs font-semibold text-text-secondary mb-1.5">Headline</label>
        <textarea
          value={headline}
          onChange={(e) => { setHeadline(e.target.value); setActivePresetId(null); }}
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

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  if (score >= 40) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
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
