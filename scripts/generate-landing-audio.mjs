#!/usr/bin/env node
// One-off generator for the landing page audio samples. Pulls the first
// ~25 seconds of prose from each featured book's chapter, runs it through
// Grok TTS with Ben's chosen voice, and writes MP3s into public/landing/audio
// so they ship with the build (no /uploads disk dependency).
//
// Usage: node scripts/generate-landing-audio.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROD = 'https://theodore.tools';
const ADMIN_KEY = 'theodore-claude-admin-2026';

const BOOKS = [
  {
    slug: 'blind-target',
    projectId: 'bdc7836e-f6ee-41f9-9efc-24790f601f98',
    chapterNumber: 2,
    chapterTitle: 'Touch and Go',
    voice: 'leo', // Leo — multilingual, authoritative
  },
  {
    slug: 'henry-and-husky',
    projectId: 'd48e390f-9c04-426f-835a-855448794e77',
    chapterNumber: 1,
    chapterTitle: 'The Robot in the Workshop',
    voice: '96819d0bd28d', // Daniel — English, clear
  },
  {
    slug: 'on-ice-and-lanes',
    projectId: '31555c96-e7e2-42f1-b45a-8155389d9682',
    chapterNumber: 4,
    chapterTitle: 'Spare Time',
    voice: 'bedd6226', // Olivia — British, young & bright
  },
];

const TARGET_CHARS = 650; // ~25-30s at normal TTS pace

function readXaiKey() {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, 'utf8').match(/XAI_API_KEY\s*=\s*(\S+)/);
    if (m) return m[1];
  }
  throw new Error('XAI_API_KEY not found');
}

function trimToSentence(prose, target) {
  if (prose.length <= target) return prose.trim();
  // Cut at the last sentence terminator before `target`.
  const slice = prose.slice(0, target);
  const last = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('."'),
    slice.lastIndexOf('!"'),
    slice.lastIndexOf('?"'),
  );
  if (last < target * 0.5) return slice + '…'; // sentence too long — soft cut
  return prose.slice(0, last + 1).trim();
}

async function fetchChapter(projectId, chapterNumber) {
  const r = await fetch(`${PROD}/api/admin/projects/${projectId}/chapters`, {
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const d = await r.json();
  const ch = (d.chapters || []).find((c) => c.number === chapterNumber);
  if (!ch) throw new Error(`Chapter ${chapterNumber} not found in ${projectId}`);
  return ch;
}

async function ttsGrok(text, voiceId, xaiKey) {
  const r = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${xaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: 'en',
      output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
    }),
  });
  if (!r.ok) throw new Error(`xAI TTS ${r.status}: ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const xaiKey = readXaiKey();
  const outDir = path.join(process.cwd(), 'public', 'landing', 'audio');
  fs.mkdirSync(outDir, { recursive: true });

  for (const book of BOOKS) {
    console.log(`→ ${book.slug}: fetching chapter ${book.chapterNumber} "${book.chapterTitle}"`);
    const ch = await fetchChapter(book.projectId, book.chapterNumber);
    if (!ch.prose || !ch.prose.trim()) {
      console.warn(`  ! empty prose, skipping`);
      continue;
    }
    const snippet = trimToSentence(ch.prose, TARGET_CHARS);
    console.log(`  prose: ${snippet.length} chars (~${Math.round(snippet.length / 25)}s)`);
    console.log(`  voice: ${book.voice}`);
    const mp3 = await ttsGrok(snippet, book.voice, xaiKey);
    const outPath = path.join(outDir, `${book.slug}.mp3`);
    fs.writeFileSync(outPath, mp3);
    console.log(`  ✓ wrote ${outPath} (${(mp3.length / 1024).toFixed(1)} KB)\n`);
  }
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
