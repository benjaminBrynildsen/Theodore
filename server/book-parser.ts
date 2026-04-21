// Parses a finished book's extracted text into Theodore's project/chapter shape,
// cleaned and formatted for TTS narration. Front matter is dropped; chapter
// titles are stripped from body prose (so they aren't spoken twice); scenes
// are split on common break markers at import time.
//
// The input is plain text from pdf-parse or mammoth — no formatting survives,
// so chapter detection is regex-driven. DOCX tends to hold up well; PDF is
// messier (running headers, orphaned page numbers). The cleanup passes are
// deliberately conservative: when in doubt, leave prose alone.

import { randomUUID } from 'crypto';

export interface ParsedScene {
  id: string;
  title: string;
  summary: string;
  prose: string;
  order: number;
  status: 'outline' | 'drafted' | 'edited';
}

export interface ParsedChapter {
  title: string;
  prose: string;
  scenes: ParsedScene[];
}

export interface ParsedBook {
  title: string | null;
  chapters: ParsedChapter[];
}

const ROMAN_RE = /(?:M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))/i;
const WORD_NUMBERS = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|forty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|fifty|sixty|seventy|eighty|ninety|hundred)';

// Chapter heading patterns, ordered by confidence. A line fully matching any
// of these (after trim) is treated as a chapter boundary.
const CHAPTER_HEADING_PATTERNS: RegExp[] = [
  // "Chapter 12", "Chapter 12: The Fall", "Chapter 12 — The Fall"
  new RegExp(`^chapter\\s+(\\d+|${WORD_NUMBERS}|${ROMAN_RE.source})(?:\\s*[:\\-\\u2013\\u2014\\.]\\s*(.+))?$`, 'i'),
  // "CHAPTER ONE" (all caps, treated slightly differently but same structure)
  new RegExp(`^CHAPTER\\s+(\\d+|[A-Z -]+)(?:\\s*[:\\-\\u2013\\u2014\\.]\\s*(.+))?$`),
  // "Prologue", "Epilogue", "Introduction", "Foreword", "Preface"
  /^(prologue|epilogue|introduction|foreword|preface|afterword)(?:\s*[:\-–—\.]\s*(.+))?$/i,
  // "Part One", "Part 1" — also a natural break, treated as a chapter
  new RegExp(`^part\\s+(\\d+|${WORD_NUMBERS}|${ROMAN_RE.source})(?:\\s*[:\\-\\u2013\\u2014\\.]\\s*(.+))?$`, 'i'),
];

// Lines that look like page numbers or running headers we want to drop before
// chapter detection even runs. These get applied per-line.
const PAGE_NUMBER_LINE = /^\s*\d{1,4}\s*$/;
const ROMAN_PAGE_LINE = new RegExp(`^\\s*${ROMAN_RE.source}\\s*$`, 'i');

// Scene break markers — each is a line that signals a scene boundary.
const SCENE_BREAK_LINE = /^\s*(?:\*\s*\*\s*\*|\*{3,}|-{3,}|#{3,}|~{3,}|·{3,}|•{3,}|◆|§)\s*$/;

// URL stripping — we remove URLs entirely since TTS pronouncing them is awful.
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+\.\S+/gi;

// Footnote markers like [1], [23], or superscript digits. We strip them.
const BRACKETED_FOOTNOTE = /\[\s*\d{1,3}\s*\]/g;
const SUPERSCRIPT_DIGITS = /[⁰¹²³⁴-⁹]+/g;

// Invisible / problematic characters.
const ZERO_WIDTH = /[​-‍﻿⁠]/g;
const SOFT_HYPHEN = /­/g;

function normalizeQuotesAndDashes(text: string): string {
  return text
    // Smart double quotes → straight (TTS generally handles straight quotes better)
    .replace(/[“”„‟«»]/g, '"')
    // Smart single quotes / apostrophes → straight
    .replace(/[‘’‚‛]/g, "'")
    // Normalize ellipses to single char (TTS paces them correctly)
    .replace(/\.\s*\.\s*\./g, '…')
    // Non-breaking space → regular space
    .replace(/ /g, ' ');
}

function stripTtsNoise(text: string): string {
  return text
    .replace(URL_RE, '')
    .replace(BRACKETED_FOOTNOTE, '')
    .replace(SUPERSCRIPT_DIGITS, '')
    .replace(ZERO_WIDTH, '')
    .replace(SOFT_HYPHEN, '');
}

function collapseWhitespace(text: string): string {
  return text
    // Any run of horizontal whitespace → single space (but preserve newlines)
    .replace(/[ \t]+/g, ' ')
    // Trim trailing horizontal whitespace on each line
    .replace(/ +\n/g, '\n')
    // Collapse 3+ consecutive newlines to exactly 2 (paragraph break)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Re-join hyphenated line breaks that PDF extraction leaves behind:
// "rec-\nognize" → "recognize". Only applied when the tail looks like a
// lowercase word continuation; we don't want to join "Dr.-\nSmith".
function rejoinHyphenatedWraps(text: string): string {
  return text.replace(/(\w)-\n(\w)/g, (_, a: string, b: string) => {
    if (/[a-z]/.test(a) && /[a-z]/.test(b)) return a + b;
    return `${a}-\n${b}`;
  });
}

// Remove lines that are just a page number, or orphaned running headers that
// survived extraction. Only drops lines that are VERY likely noise.
function stripPageArtifacts(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (PAGE_NUMBER_LINE.test(line)) continue;
    if (ROMAN_PAGE_LINE.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

// Running-header detection: if the same short line (< 60 chars, no punctuation
// at end other than a page-style space) repeats many times across the text,
// it's almost certainly a header/footer from the book layout. Drop it.
function stripRepeatedRunningHeaders(text: string): string {
  const lines = text.split('\n');
  const counts = new Map<string, number>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 60) continue;
    // Skip lines that end in sentence punctuation — real prose.
    if (/[.!?"'…]$/.test(trimmed)) continue;
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
  }
  // A line that appears 5+ times is overwhelmingly likely a running header.
  const suspects = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= 5) suspects.add(line);
  }
  if (!suspects.size) return text;
  return lines.filter((line) => !suspects.has(line.trim())).join('\n');
}

function preCleanForDetection(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = stripTtsNoise(text);
  text = normalizeQuotesAndDashes(text);
  text = rejoinHyphenatedWraps(text);
  text = stripPageArtifacts(text);
  text = stripRepeatedRunningHeaders(text);
  text = collapseWhitespace(text);
  return text;
}

interface HeadingMatch {
  lineIndex: number;
  rawLine: string;
  title: string;
}

function detectChapterHeadings(lines: string[]): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // A chapter heading is never very long — guard against false positives
    // like a paragraph that happens to start with "Chapter".
    if (line.length > 80) continue;
    for (const pattern of CHAPTER_HEADING_PATTERNS) {
      const m = line.match(pattern);
      if (!m) continue;
      // Build the title. If there's a subtitle capture (group 2), include it;
      // otherwise fall back to the full heading line.
      const captured = (m[2] || '').trim();
      let title = line;
      if (captured) {
        // Prefix the number/label for clarity: "Chapter 3: The Fall" → keep as-is.
        title = line;
      }
      matches.push({ lineIndex: i, rawLine: line, title });
      break;
    }
  }
  return matches;
}

// Drop leading blank lines and any line inside the body that duplicates the
// chapter title. Needed because books often have the title printed above the
// first paragraph even though we've already assigned it to chapter.title.
function stripChapterTitleFromBody(body: string, title: string): string {
  const lines = body.split('\n');
  // Pop leading blank lines.
  while (lines.length && !lines[0].trim()) lines.shift();
  // Drop leading occurrences of the title or close variants (e.g. a chapter
  // subtitle printed on its own line).
  const titleNorm = title.trim().toLowerCase();
  while (lines.length) {
    const first = lines[0].trim().toLowerCase();
    if (!first) { lines.shift(); continue; }
    if (first === titleNorm) { lines.shift(); continue; }
    // Handle the case where the extraction produced the title split across
    // two lines (e.g. "Chapter 3" on one line and the subtitle on the next).
    if (titleNorm.startsWith(first) && first.length < titleNorm.length && first.length > 3) {
      lines.shift();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}

function splitIntoScenes(prose: string): ParsedScene[] {
  const lines = prose.split('\n');
  const buckets: string[][] = [[]];
  for (const line of lines) {
    if (SCENE_BREAK_LINE.test(line)) {
      if (buckets[buckets.length - 1].length) buckets.push([]);
      continue;
    }
    buckets[buckets.length - 1].push(line);
  }

  // If we only found one bucket via explicit break markers, try splitting on
  // large paragraph gaps (4+ blank lines) — some manuscripts use that instead
  // of ***. We only do this if the chapter is long enough to warrant splitting.
  if (buckets.length === 1 && prose.length > 4000) {
    const bigGapSplit = prose.split(/\n\s*\n\s*\n\s*\n+/);
    if (bigGapSplit.length > 1) {
      buckets.length = 0;
      for (const chunk of bigGapSplit) buckets.push(chunk.split('\n'));
    }
  }

  const scenes: ParsedScene[] = [];
  let order = 0;
  for (const bucket of buckets) {
    const sceneProse = bucket.join('\n').trim();
    if (!sceneProse) continue;
    scenes.push({
      id: `scene-${randomUUID()}`,
      title: '',
      summary: '',
      prose: sceneProse,
      order,
      status: 'edited',
    });
    order++;
  }

  // If splitting produced nothing (e.g. empty chapter), fall back to a single
  // scene so audio generation has something to work with.
  if (!scenes.length && prose.trim()) {
    scenes.push({
      id: `scene-${randomUUID()}`,
      title: '',
      summary: '',
      prose: prose.trim(),
      order: 0,
      status: 'edited',
    });
  }

  return scenes;
}

// Pull a book title out of the filename. Strips extension and common noise
// like underscores/dashes, title-cases the result.
export function inferTitleFromFilename(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Untitled Book';
  // Title-case only if the input looks lowercase or all-caps — otherwise trust
  // the user's capitalization.
  const isAllSameCase = base === base.toLowerCase() || base === base.toUpperCase();
  if (!isAllSameCase) return base;
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseBookText(rawText: string, fileName: string): ParsedBook {
  const cleaned = preCleanForDetection(rawText);
  const lines = cleaned.split('\n');
  const headings = detectChapterHeadings(lines);

  // Fallback: no headings detected. Treat the entire manuscript as one
  // chapter so the user can still narrate it; they can split manually later.
  if (headings.length === 0) {
    const prose = cleaned.trim();
    return {
      title: inferTitleFromFilename(fileName),
      chapters: prose
        ? [{
            title: 'Chapter 1',
            prose,
            scenes: splitIntoScenes(prose),
          }]
        : [],
    };
  }

  // Everything before the first heading is front matter. Discard it.
  // (Title page, copyright, dedication, TOC — all TTS noise.)
  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const next = headings[i + 1];
    const bodyStart = heading.lineIndex + 1;
    const bodyEnd = next ? next.lineIndex : lines.length;
    const rawBody = lines.slice(bodyStart, bodyEnd).join('\n');
    const body = stripChapterTitleFromBody(rawBody, heading.title);
    // Skip chapters that have no body — likely a "Part One" standalone heading
    // right before "Chapter 1", or a duplicate TOC entry that slipped through.
    if (!body.trim()) continue;
    chapters.push({
      title: heading.title,
      prose: body,
      scenes: splitIntoScenes(body),
    });
  }

  return {
    title: inferTitleFromFilename(fileName),
    chapters,
  };
}
