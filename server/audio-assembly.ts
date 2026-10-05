// ========== Narration assembly with real silence ==========
//
// Narration used to rely on the TTS voice to pause: stacked newlines, "—"
// markers and "read slowly" instructions. Voices honour that unevenly, so
// paragraph and speaker changes could run together while other spots dragged.
//
// Now each piece (a paragraph, or one speaker's turn) is synthesised on its
// own and the chapter is assembled here with exact, deterministic gaps:
//
//   1. decode every piece to the same raw format (44.1 kHz mono PCM)
//   2. trim the clip's own leading/trailing silence (random 50–400 ms per
//      clip — the main source of uneven gaps), keeping a tiny tail so soft
//      endings and breaths survive
//   3. 8 ms fades at every edge (no clicks)
//   4. match loudness across voices (multi-voice), then one loudness pass for
//      the whole chapter (audiobook level)
//   5. insert room tone (near-silent pink noise, not digital zero) of a set
//      length per boundary type, varied ±10% by position so it never sounds
//      mechanical — seeded, so regenerating gives identical timing
//   6. encode ONCE to MP3 (concatenating separately encoded MP3s adds hidden
//      padding and breaks duration metadata)
//   7. verify: detect the silences in the finished file and check them
//      against the plan; measure speaking pace with the silence excluded.

import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type Boundary = 'none' | 'sentence' | 'speaker' | 'paragraph' | 'scene' | 'title';

/** Seconds of silence after a piece, by what follows it. */
export const GAP_SECONDS: Record<Boundary, number> = {
  none: 0,
  sentence: 0.6,   // between sentences (also used when an over-long paragraph had to be split)
  speaker: 0.75,   // back-and-forth dialogue: a beat, not a full stop
  paragraph: 1.1,
  scene: 3.0,
  title: 2.0,
};

/** Shortest a pause inside a sentence (comma, dash, colon) is allowed to be. */
export const CLAUSE_PAUSE_SECONDS = 0.28;

/** Gap lengths are scaled by the pace setting. */
export const PACE_GAP_SCALE = { relaxed: 1.25, standard: 1, brisk: 0.8 } as const;
export type NarrationPace = keyof typeof PACE_GAP_SCALE;

const SAMPLE_RATE = 44100;
const BYTES_PER_SECOND = SAMPLE_RATE * 2; // s16le mono

// ---------- Text → pieces (pure) ----------

export interface TextPiece {
  text: string;
  gapAfter: Boundary;
}

const SCENE_BREAK = /^\s*(?:[-*_~=#•·◆◇—–]\s*){3,}$|^\s*(?:#|[◆◇§])\s*$/;
const MAX_PIECE_CHARS = 4000;

function isDialogueParagraph(p: string): boolean {
  return /^["“]/.test(p.trim());
}

/** Split an over-long paragraph at sentence ends (lossless). */
export function splitLongParagraph(p: string, max = MAX_PIECE_CHARS): string[] {
  if (p.length <= max) return [p];
  const sentences = p.match(/[^.!?]*[.!?]+["”’)]*\s*|[^.!?]+$/g) || [p];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) { out.push(cur.trim()); cur = s; } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Prose → pieces for single-voice narration: one per paragraph, with the gap
 * that follows each. Scene-break lines become a scene gap; a run of short
 * dialogue paragraphs (a conversation) gets the shorter speaker gap.
 */
export function splitNarration(prose: string, announcement = ''): TextPiece[] {
  const pieces: TextPiece[] = [];
  if (announcement.trim()) pieces.push({ text: announcement.trim(), gapAfter: 'title' });
  const paras = prose.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (SCENE_BREAK.test(p)) {
      if (pieces.length) pieces[pieces.length - 1].gapAfter = 'scene';
      continue;
    }
    const next = paras.slice(i + 1).find((x) => x.trim());
    const conversational = isDialogueParagraph(p) && !!next && isDialogueParagraph(next) && p.length < 400;
    const parts = splitLongParagraph(p);
    parts.forEach((part, j) => {
      const last = j === parts.length - 1;
      pieces.push({ text: part, gapAfter: last ? (conversational ? 'speaker' : 'paragraph') : 'sentence' });
    });
  }
  if (pieces.length) pieces[pieces.length - 1].gapAfter = 'none';
  return pieces;
}

/** Deterministic ±10% variation for gap i of a chapter. */
export function jitteredGap(seconds: number, seed: string, index: number): number {
  if (seconds <= 0) return 0;
  const h = crypto.createHash('md5').update(`${seed}:${index}`).digest();
  const unit = h.readUInt16BE(0) / 0xffff; // 0..1
  return Math.round(seconds * (0.9 + unit * 0.2) * 1000) / 1000;
}

/** Words per minute of actual speech (silence excluded). */
export function speakingWpm(words: number, speechSeconds: number): number {
  return speechSeconds > 0 ? Math.round(words / (speechSeconds / 60)) : 0;
}

export function countWords(text: string): number {
  return (text.replace(/\[[^\]]+\]/g, ' ').match(/[\p{L}\p{N}’']+/gu) || []).length;
}

// ---------- Audio (ffmpeg) ----------

function ffmpeg(args: string[], timeoutMs = 120_000): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${String(stderr).slice(-600)}`));
      else resolve({ stdout: stdout as Buffer, stderr: String(stderr) });
    });
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const TRIM_THRESHOLD = '-50dB';
/** Lead-in (0.04 s) + tail (0.09 s) kept on every trimmed clip. */
const KEPT_EDGE_SECONDS = 0.13;

/** Decode → trim edge silence → fade edges → raw PCM. Returns PCM and its mean volume (dB). */
async function preparePiece(input: Buffer, dir: string, i: number): Promise<{ pcm: Buffer; meanDb: number }> {
  const src = path.join(dir, `in-${i}`);
  fs.writeFileSync(src, input);
  const trim = [
    `aresample=${SAMPLE_RATE}`,
    'aformat=sample_fmts=s16:channel_layouts=mono',
    // leading silence: keep 40 ms
    `silenceremove=start_periods=1:start_threshold=${TRIM_THRESHOLD}:start_silence=0.04`,
    // trailing silence: reverse, trim keeping 90 ms (breath / soft consonants), reverse back
    'areverse',
    `silenceremove=start_periods=1:start_threshold=${TRIM_THRESHOLD}:start_silence=0.09`,
    'afade=t=in:d=0.008',
    'areverse',
    'afade=t=in:d=0.008',
  ].join(',');
  const { stdout } = await ffmpeg(['-i', src, '-af', trim, '-f', 's16le', '-ac', '1', '-ar', String(SAMPLE_RATE), 'pipe:1']);
  return { pcm: stdout, meanDb: meanVolumeDb(stdout) };
}

/** Mean level (dBFS) of non-silent samples in s16le PCM. */
export function meanVolumeDb(pcm: Buffer): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const v = pcm.readInt16LE(i) / 32768;
    if (Math.abs(v) > 0.003) { sum += v * v; n++; }
  }
  if (!n) return -90;
  return 10 * Math.log10(sum / n);
}

function applyGain(pcm: Buffer, db: number): Buffer {
  if (Math.abs(db) < 0.3) return pcm;
  const g = Math.pow(10, db / 20);
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * g))), i);
  }
  return out;
}

/** Near-silent pink-ish noise (~-70 dBFS): room tone, so gaps don't sound like dropouts. */
export function roomTone(seconds: number, seed: number): Buffer {
  const samples = Math.round(seconds * SAMPLE_RATE);
  const buf = Buffer.alloc(samples * 2);
  let s = seed >>> 0 || 1;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < samples; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const white = s / 2 ** 32 * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099;
    b1 = 0.963 * b1 + white * 0.2965;
    b2 = 0.57 * b2 + white * 1.0526;
    const pink = (b0 + b1 + b2 + white * 0.1848) * 0.05;
    buf.writeInt16LE(Math.round(pink * 32768 * 0.0006), i * 2);
  }
  return buf;
}

export interface AudioPiece {
  audio: Buffer;     // encoded audio from the TTS provider (mp3/wav/…)
  gapAfter: Boundary;
  voice?: string;    // for cross-voice loudness matching
  words?: number;
  /** The text spoken, so pauses inside the clip can be matched to its sentences. */
  text?: string;
}

// ---------- Pauses inside a clip ----------
//
// A voice reads a paragraph's sentences back to back with short, uneven
// breaths between them. Rather than synthesising sentence by sentence (which
// breaks intonation), find the clip's own pauses and lengthen them: the
// longest ones line up with sentence ends (as many as the text has), and get
// the sentence pause; shorter clause pauses (commas, dashes) get a small floor.

/** Sentence ends inside a piece of text (not counting the final one). */
export function countSentenceBreaks(text: string): number {
  const t = (text || '').replace(/\[[^\]]+\]/g, ' ').trim();
  const breaks = t.match(/[.!?…]+["”’)\]]*\s+(?=["“‘(]?[\p{Lu}\p{N}])/gu);
  return breaks ? breaks.length : 0;
}

/** Pauses inside sentences the text calls for (commas, semicolons, colons, dashes). */
export function countClauseBreaks(text: string): number {
  const t = (text || '').replace(/\[[^\]]+\]/g, ' ');
  return (t.match(/[,;:](?=\s)|\s[—–]\s?|—|\.{3}(?=\s*[\p{Ll}])|…(?=\s*[\p{Ll}])/gu) || []).length;
}

/** A clause pause must be at least this long in the voice's own reading to be stretched (shorter = inside a word). */
const MIN_CLAUSE_RUN_SECONDS = 0.11;

export interface SilentRun { start: number; end: number } // sample indices

const FRAME = Math.round(SAMPLE_RATE * 0.01); // 10 ms

/** Pauses inside s16le PCM (not at the edges), at least `minSeconds` long. */
export function findInternalPauses(pcm: Buffer, minSeconds = 0.09): SilentRun[] {
  const samples = Math.floor(pcm.length / 2);
  const frames = Math.floor(samples / FRAME);
  if (frames < 3) return [];
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) { const v = pcm.readInt16LE(i * 2) / 32768; sum += v * v; }
    rms.push(Math.sqrt(sum / FRAME));
  }
  // Quiet = 32 dB under the clip's loud frames (robust to voice level).
  const sorted = [...rms].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0;
  if (loud <= 0) return [];
  const threshold = Math.max(loud * Math.pow(10, -32 / 20), 0.0005);
  const minFrames = Math.ceil(minSeconds / 0.01);
  const runs: SilentRun[] = [];
  let runStart = -1;
  for (let f = 0; f <= frames; f++) {
    const quiet = f < frames && rms[f] < threshold;
    if (quiet && runStart < 0) runStart = f;
    if (!quiet && runStart >= 0) {
      // Internal only: speech on both sides.
      if (runStart > 0 && f < frames && f - runStart >= minFrames) runs.push({ start: runStart * FRAME, end: f * FRAME });
      runStart = -1;
    }
  }
  return runs;
}

/**
 * Lengthen the clip's pauses to match its text: the longest `sentenceBreaks`
 * pauses become sentence pauses; the next `clauseBreaks` (if clearly pauses,
 * not a gap inside a word) get at least the clause pause; all others are left
 * alone. Silence is extended in the middle of each pause with room tone, so
 * speech is never touched. Returns the new PCM and each pause length (s).
 */
export function stretchPauses(pcm: Buffer, sentenceBreaks: number, sentencePause: number, clausePause: number, seed = 1, clauseBreaks = 0): { pcm: Buffer; pauses: number[] } {
  const runs = findInternalPauses(pcm);
  if (!runs.length) return { pcm, pauses: [] };
  const bySize = [...runs].sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const nSentence = Math.max(0, sentenceBreaks);
  const sentenceRuns = new Set(bySize.slice(0, nSentence));
  const clauseRuns = new Set(bySize.slice(nSentence, nSentence + Math.max(0, clauseBreaks))
    .filter((r) => (r.end - r.start) / SAMPLE_RATE >= MIN_CLAUSE_RUN_SECONDS));
  const parts: Buffer[] = [];
  const pauses: number[] = [];
  let at = 0;
  runs.forEach((r, k) => {
    const len = (r.end - r.start) / SAMPLE_RATE;
    const target = sentenceRuns.has(r) ? sentencePause : clauseRuns.has(r) ? clausePause : 0;
    const add = Math.max(0, target - len);
    const mid = Math.round((r.start + r.end) / 2);
    parts.push(pcm.subarray(at * 2, mid * 2));
    if (add >= 0.02) parts.push(roomTone(add, seed * 131 + k));
    at = mid;
    pauses.push(Math.round((len + (add >= 0.02 ? add : 0)) * 1000) / 1000);
  });
  parts.push(pcm.subarray(at * 2));
  return { pcm: Buffer.concat(parts), pauses };
}

export interface AssemblyResult {
  mp3: Buffer;
  /** Start time (s) of each piece in the final audio. */
  pieceStarts: number[];
  speechSeconds: number;
  silenceSeconds: number;
  totalSeconds: number;
  /** Planned gaps (s) in order, for verification. */
  plannedGaps: number[];
}

export async function assembleNarration(pieces: AudioPiece[], opts: { seed: string; pace?: NarrationPace; concurrency?: number; leadIn?: Boundary }): Promise<AssemblyResult> {
  if (!pieces.length) throw new Error('assembleNarration: no pieces');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narr-'));
  const scale = PACE_GAP_SCALE[opts.pace || 'standard'];
  try {
    const prepared = await mapLimit(pieces, opts.concurrency ?? 4, (p, i) => preparePiece(p.audio, dir, i));

    // Match loudness across voices: bring each voice's median level to the narrator's.
    const byVoice = new Map<string, number[]>();
    prepared.forEach((p, i) => {
      const v = pieces[i].voice || 'narrator';
      if (p.meanDb > -80) byVoice.set(v, [...(byVoice.get(v) || []), p.meanDb]);
    });
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const levels = new Map([...byVoice].map(([v, xs]) => [v, median(xs)]));
    const reference = levels.get(pieces[0].voice || 'narrator') ?? [...levels.values()][0] ?? -20;

    const parts: Buffer[] = [];
    const pieceStarts: number[] = [];
    const plannedGaps: number[] = [];
    let cursor = 0;
    let speech = 0;
    let silence = 0;
    // A scene rendered as its own file opens with the scene-break silence, so
    // the pause between scene files matches a break inside one file.
    if (opts.leadIn && GAP_SECONDS[opts.leadIn] > 0) {
      const lead = Math.max(0.05, jitteredGap(GAP_SECONDS[opts.leadIn] * scale, opts.seed, -1) - KEPT_EDGE_SECONDS);
      const tone = roomTone(lead, 0);
      parts.push(tone);
      cursor += tone.length;
      silence += lead;
    }
    prepared.forEach((p, i) => {
      const level = levels.get(pieces[i].voice || 'narrator');
      const gain = level !== undefined && byVoice.size > 1 ? Math.max(-6, Math.min(6, reference - level)) : 0;
      const stretched = stretchPauses(
        applyGain(p.pcm, gain),
        countSentenceBreaks(pieces[i].text || ''),
        jitteredGap(GAP_SECONDS.sentence * scale, opts.seed, 10_000 + i),
        CLAUSE_PAUSE_SECONDS * scale,
        i + 1,
        countClauseBreaks(pieces[i].text || ''),
      );
      const pcm = stretched.pcm;
      const added = (pcm.length - p.pcm.length) / BYTES_PER_SECOND;
      plannedGaps.push(...stretched.pauses);
      pieceStarts.push(cursor / BYTES_PER_SECOND);
      parts.push(pcm);
      cursor += pcm.length;
      speech += pcm.length / BYTES_PER_SECOND - added;
      silence += added;
      if (i < prepared.length - 1) {
        const gap = jitteredGap(GAP_SECONDS[pieces[i].gapAfter] * scale, opts.seed, i);
        if (gap > 0) {
          // Each clip keeps ~0.13 s of its own edge (breath tail + lead-in), which
          // the ear hears as part of the pause — insert only the remainder.
          const inserted = Math.max(0.05, gap - KEPT_EDGE_SECONDS);
          const tone = roomTone(inserted, i + 1);
          parts.push(tone);
          cursor += tone.length;
          silence += inserted;
          plannedGaps.push(gap);
        }
      }
    });

    // One loudness pass for the whole chapter (audiobook level), encoded once.
    const rawPath = path.join(dir, 'all.pcm');
    fs.writeFileSync(rawPath, Buffer.concat(parts));
    const { stdout: mp3 } = await ffmpeg([
      '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', rawPath,
      '-af', 'loudnorm=I=-18:TP=-3:LRA=11',
      '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1',
    ], 300_000);
    return { mp3, pieceStarts, speechSeconds: speech, silenceSeconds: silence, totalSeconds: cursor / BYTES_PER_SECOND, plannedGaps };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Check the finished audio's silences against the plan: every planned gap
 * of 0.35 s or more should be found with roughly that length.
 * Returns how many matched and the worst deviation.
 */
export async function verifyGaps(mp3: Buffer, plannedGaps: number[]): Promise<{ checked: number; matched: number; worstDeviation: number }> {
  const expected = plannedGaps.filter((g) => g >= 0.35);
  if (!expected.length) return { checked: 0, matched: 0, worstDeviation: 0 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gapchk-'));
  try {
    const src = path.join(dir, 'a.mp3');
    fs.writeFileSync(src, mp3);
    const { stderr } = await ffmpeg(['-i', src, '-af', 'silencedetect=noise=-45dB:d=0.3', '-f', 'null', '-']);
    const found = [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    // Walk both lists in order; a found silence matches the next expected gap within 0.25 s.
    let j = 0;
    let matched = 0;
    let worst = 0;
    for (const want of expected) {
      while (j < found.length && found[j] < want - 0.25) j++;
      if (j < found.length && Math.abs(found[j] - want) <= 0.25 + want * 0.15) {
        matched++;
        worst = Math.max(worst, Math.abs(found[j] - want));
        j++;
      }
    }
    return { checked: expected.length, matched, worstDeviation: Math.round(worst * 1000) / 1000 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export { mapLimit };
