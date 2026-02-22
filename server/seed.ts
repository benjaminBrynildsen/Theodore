import { db, pool } from './db.js';
import { users, projects, chapters, canonEntries } from './schema.js';

const USER_ID = 'user-ben';
const PROJECT_ID = 'demo-1';

async function seed() {
  console.log('Seeding database...');

  // Check if already seeded
  const existing = await db.select().from(users);
  if (existing.length > 0) {
    console.log('Database already seeded, skipping.');
    await pool.end();
    return;
  }

  // User
  await db.insert(users).values({
    id: USER_ID,
    email: 'ben@theodore.app',
    name: 'Ben',
    plan: 'writer',
    creditsRemaining: 10000,
    creditsTotal: 10000,
    settings: {},
  });
  console.log('✓ User created');

  // Project
  await db.insert(projects).values({
    id: PROJECT_ID,
    userId: USER_ID,
    title: 'The Midnight Garden',
    type: 'book',
    subtype: 'novel',
    targetLength: 'long',
    toneBaseline: 'mysterious, lyrical',
    assistanceLevel: 3,
    narrativeControls: {
      toneMood: { lightDark: 65, hopefulGrim: 40, whimsicalSerious: 55 },
      pacing: 'balanced',
      dialogueWeight: 'balanced',
      focusMix: { character: 45, plot: 30, world: 25 },
      genreEmphasis: ['mystery', 'adventure'],
    },
    status: 'active',
  });
  console.log('✓ Project created');

  // Chapters
  const chaptersData = [
    {
      id: 'ch-1',
      projectId: PROJECT_ID,
      number: 1,
      title: 'The Door in the Wall',
      timelinePosition: 1,
      status: 'draft-generated',
      premise: {
        purpose: 'Introduce Elara and the discovery of the hidden garden behind the crumbling estate wall.',
        changes: 'Elara discovers the key; garden is revealed as a living, breathing entity.',
        characters: ['Elara Voss', 'The Gardener'],
        emotionalBeat: 'Wonder and unease — beauty that feels too perfect',
        setupPayoff: [{ setup: 'The iron key found in grandmother\'s journal', payoff: 'Unlocks the garden gate in Ch. 3' }],
        constraints: ['Must establish Elara\'s skepticism before the reveal', 'Garden should feel inviting but subtly wrong'],
      },
      prose: `The wall had always been there, of course. Elara had passed it every morning on her way to the university — a crumbling stretch of limestone that separated the Ashworth estate from the rest of the world. Ivy had claimed most of it decades ago, thick and dark and possessive, and the locals had long since stopped wondering what lay beyond.

But today the ivy had pulled back.

Not all of it — just enough to reveal a door. Narrow, arched at the top, set deep into the stone like a secret the wall had been keeping. The wood was old, nearly black, and the iron hinges were red with rust. But the handle — the handle gleamed as if someone had polished it that morning.

Elara stopped. Her coffee cooled in her hand. She told herself it was the light, some trick of the early autumn sun slanting through the oaks. Doors didn't just appear. That wasn't how the world worked, and Elara Voss was, above all things, a woman who understood how the world worked.

She was a postdoctoral researcher in botanical ecology. She had spent four years studying root networks in old-growth forests, mapping the invisible conversations between trees. She believed in data. In observable phenomena. In things she could put her hands on.

And yet.

Her hand was already reaching for the handle before she'd made the conscious decision to move. The metal was warm — not sun-warm, but the kind of warmth that suggested something alive on the other side. She pressed down and felt the mechanism give with a soft, oiled click that had no business coming from a door this old.

The garden opened before her like a held breath finally released.

It was impossible. That was her first thought, and she would stand by it later when she tried to describe what she'd seen. The Ashworth estate was perhaps two acres — she'd checked the county records once for a research project. But the space beyond the door stretched further than her eyes could follow, a vast and rolling landscape of green that seemed to generate its own light.

Paths of pale stone wound between beds of flowers she didn't recognize — and Elara recognized most flowers. These were larger than they should have been, more vivid, their petals moving in patterns that had nothing to do with the breeze. Some of them turned toward her as she stepped through the doorway, tracking her movement with a slow, deliberate attention.

"You're early," said a voice.

Elara spun. A figure stood beside a trellis of climbing roses — except the roses were black, and the figure was not quite what she'd expected. He was tall, thin, dressed in clothes that might have been fashionable a century ago. His hands were gloved in soft leather, and his face was kind in the way that old paintings are kind: composed, careful, revealing nothing.

"I'm sorry?" Elara managed.

"Early," he repeated, as if that clarified everything. He pulled a dead bloom from the trellis and it crumbled to dust between his fingers. "The garden wasn't expecting you until Thursday. But—" He tilted his head, studying her the way she'd been studied by the flowers. "Perhaps it knows something I don't. It usually does."

"Who are you?" She hated how small her voice sounded.

"The Gardener." He said it the way someone might say 'the sky' or 'the ground' — as a fact so obvious it barely warranted stating. "And you, Dr. Voss, are standing on a Whispering Fern. It would appreciate it if you moved."

Elara looked down. The fern beneath her boots was trembling — not from her weight, but with something that looked uncomfortably like irritation. She stepped sideways onto the stone path.

"Thank you," the Gardener said. Then, after a pause: "It thanks you too."`,
      referencedCanonIds: ['canon-1', 'canon-2'],
      aiIntentMetadata: {
        model: 'Claude Opus 4',
        role: 'architect',
        prompt: 'Generate opening chapter establishing Elara\'s discovery of the garden',
        generatedAt: '2026-02-21T15:28:00Z',
      },
      validationStatus: { isValid: true, checks: [] },
    },
    {
      id: 'ch-2',
      projectId: PROJECT_ID,
      number: 2,
      title: 'Root Systems',
      timelinePosition: 2,
      status: 'premise-only',
      premise: {
        purpose: 'Elara returns to the university and tries to rationalize what she saw.',
        changes: 'She discovers her grandmother\'s journal mentions the garden.',
        characters: ['Elara Voss', 'Dr. Marcus Webb'],
        emotionalBeat: 'Denial cracking into obsessive curiosity',
        setupPayoff: [],
        constraints: [],
      },
      prose: '',
      referencedCanonIds: [],
      validationStatus: { isValid: true, checks: [] },
    },
    {
      id: 'ch-3',
      projectId: PROJECT_ID,
      number: 3,
      title: 'The Iron Key',
      timelinePosition: 3,
      status: 'premise-only',
      premise: {
        purpose: 'Elara finds the iron key in her grandmother\'s journal and returns to the garden.',
        changes: 'The key unlocks a deeper section of the garden.',
        characters: ['Elara Voss', 'The Gardener'],
        emotionalBeat: 'Crossing the threshold — commitment to the unknown',
        setupPayoff: [],
        constraints: [],
      },
      prose: '',
      referencedCanonIds: [],
      validationStatus: { isValid: true, checks: [] },
    },
  ];

  for (const ch of chaptersData) {
    await db.insert(chapters).values(ch as any);
  }
  console.log('✓ 3 chapters created');

  // Canon entries
  const canonData = [
    {
      id: 'canon-1',
      projectId: PROJECT_ID,
      type: 'character',
      name: 'Elara Voss',
      description: 'A postdoctoral researcher in botanical ecology who discovers the hidden garden.',
      tags: ['protagonist', 'scientist'],
      notes: '',
      version: 1,
      linkedCanonIds: ['canon-2'],
      data: {
        fullName: 'Dr. Elara Voss',
        aliases: [],
        age: '32',
        gender: 'Female',
        pronouns: 'she/her',
        species: 'Human',
        occupation: 'Postdoctoral researcher in botanical ecology',
        role: 'protagonist',
      },
    },
    {
      id: 'canon-2',
      projectId: PROJECT_ID,
      type: 'character',
      name: 'The Gardener',
      description: 'A mysterious figure who tends the hidden garden. Appears ageless.',
      tags: ['mysterious', 'guardian'],
      notes: '',
      version: 1,
      linkedCanonIds: ['canon-1', 'canon-3'],
      data: {
        fullName: 'The Gardener',
        aliases: [],
        age: 'Unknown',
        gender: 'Male',
        pronouns: 'he/him',
        species: 'Unknown',
        occupation: 'Guardian of the garden',
        role: 'supporting',
      },
    },
    {
      id: 'canon-3',
      projectId: PROJECT_ID,
      type: 'location',
      name: 'The Midnight Garden',
      description: 'A vast, impossible garden hidden beneath the Ashworth estate.',
      tags: ['setting', 'magical'],
      notes: '',
      version: 1,
      linkedCanonIds: ['canon-2'],
      data: {
        fullName: 'The Midnight Garden',
        locationType: 'Hidden garden',
        region: 'Beneath Ashworth Estate',
      },
    },
  ];

  for (const entry of canonData) {
    await db.insert(canonEntries).values(entry as any);
  }
  console.log('✓ 3 canon entries created');

  console.log('Seed complete!');
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
