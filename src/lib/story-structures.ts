// ========== 9 Story Structures ==========
// Based on: https://thejohnfox.com/2021/01/9-story-structures-to-plot-your-next-novel/

export interface StoryBeat {
  name: string;
  description: string;
}

export interface StoryStructure {
  id: string;
  name: string;
  author: string;
  shortDesc: string;
  bestFor: string;
  beats: StoryBeat[];
  /** If true, this is more of a process than a chapter-mapping structure */
  isProcess?: boolean;
}

export const STORY_STRUCTURES: StoryStructure[] = [
  {
    id: 'plot-pyramid',
    name: 'Plot Pyramid',
    author: 'Freytag',
    shortDesc: 'The classic 5-act structure',
    bestFor: 'Any genre — the universal foundation',
    beats: [
      { name: 'Exposition', description: 'Set up the main characters, setting, and status quo.' },
      { name: 'Rising Action', description: 'Conflict begins. Tension and suspense build as the plot picks up.' },
      { name: 'Climax', description: 'Maximum suspense — the peak of conflict and a turning point.' },
      { name: 'Falling Action', description: 'Conflict unravels, pieces fall into place toward resolution.' },
      { name: 'Denouement', description: 'The conflict is resolved and the story concludes.' },
    ],
  },
  {
    id: 'tragic-pyramid',
    name: 'Tragic Pyramid',
    author: 'Freytag (original)',
    shortDesc: 'The classic structure ending in catastrophe',
    bestFor: 'Anti-heroes, villains, and tragic endings',
    beats: [
      { name: 'Exposition', description: 'Introduce the protagonist and their world.' },
      { name: 'Rising Action', description: 'Conflict escalates — the protagonist pursues their goal.' },
      { name: 'Climax', description: 'The peak moment — everything changes.' },
      { name: 'Falling Action', description: 'Things begin to unravel for the protagonist.' },
      { name: 'Catastrophe', description: 'Everything goes wrong. The protagonist meets their tragic end.' },
    ],
  },
  {
    id: 'heros-journey',
    name: "Hero's Journey",
    author: 'Campbell / Vogler',
    shortDesc: '12-step monomyth across Known and Unknown worlds',
    bestFor: 'Epic quests, coming-of-age, adventure',
    beats: [
      { name: 'Ordinary World', description: 'The hero in their normal life — status quo before the adventure.' },
      { name: 'Call to Adventure', description: 'Something disrupts the ordinary world. The inciting incident.' },
      { name: 'Refusal of the Call', description: 'The hero hesitates or resists the adventure.' },
      { name: 'Meeting the Mentor', description: 'A guide appears to prepare the hero for what lies ahead.' },
      { name: 'Crossing the Threshold', description: 'The hero leaves the Known World and enters the Unknown.' },
      { name: 'Tests, Allies, Enemies', description: 'The hero faces challenges and meets new characters.' },
      { name: 'Approach to the Inmost Cave', description: 'The hero nears their deepest challenge. Suspense builds.' },
      { name: 'The Ordeal', description: 'The hero faces their greatest fear — a dark, transformative moment.' },
      { name: 'Reward', description: 'The hero seizes what they came for — the key to victory.' },
      { name: 'The Road Back', description: 'Returning to the Known World, but new obstacles appear.' },
      { name: 'Resurrection', description: 'The climax — the hero is transformed through a final trial.' },
      { name: 'Return with the Elixir', description: 'The hero returns home, changed forever.' },
    ],
  },
  {
    id: 'plot-embryo',
    name: 'Plot Embryo',
    author: 'Dan Harmon',
    shortDesc: '8-step circle — Known/Unknown meets Ignorance/Enlightenment',
    bestFor: 'Character-driven stories with big revelations',
    beats: [
      { name: 'You', description: 'Establish the protagonist in their normal world.' },
      { name: 'Need', description: "Something isn't right — the character discovers a goal or motive." },
      { name: 'Go', description: 'The protagonist crosses into the Unknown World.' },
      { name: 'Search', description: 'Trials and tests force the character to adapt and possibly break down.' },
      { name: 'Find', description: 'A pivotal, vulnerable moment — the character must make a crucial choice.' },
      { name: 'Take', description: 'The lowest point. A high price is paid — sacrifice is required.' },
      { name: 'Return', description: 'The character brings home what they gained, crossing back to the Known.' },
      { name: 'Change', description: 'The character has transformed and can now change their world.' },
    ],
  },
  {
    id: 'tragic-plot-embryo',
    name: 'Tragic Plot Embryo',
    author: 'Rachael Stephen',
    shortDesc: '6-step tragic arc — the hero never completes the circle',
    bestFor: 'Tragic heroes, villains, stories about fatal flaws',
    beats: [
      { name: 'You', description: 'The protagonist and their backstory — including the seeds of their fatal flaw.' },
      { name: 'Anticipation', description: 'The character wants something, informed by their backstory. We see why.' },
      { name: 'Dream', description: 'The character pursues what they want, making increasingly bad choices.' },
      { name: 'Frustration', description: 'Conflict picks up. Opposing forces close in.' },
      { name: 'Nightmare', description: 'The awful truth is revealed. Instead of changing, the character doubles down.' },
      { name: 'Destruction', description: 'The price is too high. The character loses and cannot escape.' },
    ],
  },
  {
    id: 'seven-point',
    name: 'Seven Point Plot',
    author: 'Dan Wells',
    shortDesc: '7 beats with intentional parallels between beginning and end',
    bestFor: 'Stories built on symmetry and mirroring',
    beats: [
      { name: 'Hook', description: 'The starting point — should feel like the opposite of the ending.' },
      { name: 'Plot Turn 1', description: 'The inciting incident. Something changes and launches the story.' },
      { name: 'Pinch 1', description: 'Pressure applied — something goes wrong, the character must step up.' },
      { name: 'Midpoint', description: 'The switch from reaction to action. The character takes charge.' },
      { name: 'Pinch 2', description: 'More pressure — an "all is lost" moment. The jaws of defeat.' },
      { name: 'Plot Turn 2', description: 'The character gains the key to resolution. "The power is in you."' },
      { name: 'Resolution', description: 'The ending — the opposite of where the character started.' },
    ],
  },
  {
    id: 'poetics',
    name: 'Poetics',
    author: 'Aristotle',
    shortDesc: 'The oldest dramatic theory — character goals and revelations',
    bestFor: 'Mystery, revelation-driven plots, character motivation focus',
    beats: [
      { name: 'Dramatic Action', description: 'The central action: a character and what they are trying to do.' },
      { name: 'Inciting Incident', description: 'The catalyst that kicks off the action of the story.' },
      { name: 'Super-Objective', description: "What the character wants most of all — their ultimate goal." },
      { name: 'Objective', description: 'Scene-by-scene goals that build toward the super-objective.' },
      { name: 'Recognition', description: 'A revelation near the end that changes everything.' },
      { name: 'Reversal', description: 'The character makes a final choice — they achieve their goal, or they don\'t.' },
    ],
  },
  {
    id: 'snowflake',
    name: 'Snowflake Method',
    author: 'Randy Ingermanson',
    shortDesc: 'Build outward from a single sentence to a full draft',
    bestFor: 'Intuitive plotters who want flexible, organic structure',
    isProcess: true,
    beats: [
      { name: 'Sentence Summary', description: 'One sentence that captures the entire novel.' },
      { name: 'Paragraph Summary', description: 'Expand to a paragraph: setup, conflict, resolution.' },
      { name: 'Character Summaries', description: 'One page per major character: name, goals, conflict, epiphany.' },
      { name: 'Plot Expansion', description: 'Expand the paragraph into a four-page plot summary.' },
      { name: 'Character Charts', description: 'Full character descriptions and arcs.' },
      { name: 'Scene Chart', description: 'Break the plot summary into individual scenes.' },
      { name: 'Chapter Prototypes', description: 'One-to-two page summary of each chapter.' },
      { name: 'First Draft', description: 'Write the real first draft from your detailed outline.' },
    ],
  },
  {
    id: 'save-the-cat',
    name: 'Save the Cat',
    author: 'Blake Snyder',
    shortDesc: '15 beats with built-in pacing guidance',
    bestFor: 'Screenwriting, heavily paced stories, maximum guidance',
    beats: [
      { name: 'Opening Image', description: 'A snapshot of the tone and the main character before the story.' },
      { name: 'Set-Up', description: 'The normal world — more context for the status quo.' },
      { name: 'Theme Stated', description: 'A hint at the theme the character will come to understand.' },
      { name: 'Catalyst', description: 'The inciting incident — the story takes off.' },
      { name: 'Debate', description: 'Hesitation and doubt. The character wrestles with the call.' },
      { name: 'Break into Two', description: 'The character chooses to enter Act Two and pursue their goal.' },
      { name: 'B Story', description: 'An emotional subplot begins — love, friendship, parallel arc.' },
      { name: 'Fun and Games', description: 'The promise of the premise — the character explores their new world.' },
      { name: 'Midpoint', description: 'A twist that redefines the story. Stakes shift.' },
      { name: 'Bad Guys Close In', description: 'Opposing forces gain ground. Stakes get higher.' },
      { name: 'All is Lost', description: 'A significant loss — mentor, home, hope.' },
      { name: 'Dark Night of the Soul', description: 'Rock bottom. Hope is gone. Maximum despair.' },
      { name: 'Break into Three', description: 'A discovery from the B Story provides the key to Act Three.' },
      { name: 'Finale', description: 'Everything learned comes together. The character succeeds.' },
      { name: 'Final Image', description: 'Mirror of the opening — showing how the character has changed.' },
    ],
  },
];

export function getStructureById(id: string): StoryStructure | undefined {
  return STORY_STRUCTURES.find(s => s.id === id);
}

/**
 * Given a story structure and total chapter count, compute which chapters
 * are the start of each beat. Returns a Map<chapterIndex, beatName>.
 */
export function computeArcBreakpoints(
  structureId: string,
  totalChapters: number,
): Map<number, StoryBeat> {
  const structure = getStructureById(structureId);
  if (!structure || totalChapters < 2) return new Map();

  const { beats } = structure;
  const breakpoints = new Map<number, StoryBeat>();

  if (structure.isProcess) {
    // Process structures don't map to chapter positions
    return breakpoints;
  }

  // Distribute beats evenly across chapters
  const beatCount = beats.length;

  if (totalChapters < beatCount) {
    // Fewer chapters than beats — only place beats that fit
    for (let i = 0; i < totalChapters && i < beatCount; i++) {
      breakpoints.set(i, beats[i]);
    }
  } else {
    // More chapters than beats — spread beats across chapters
    for (let i = 0; i < beatCount; i++) {
      const chapterIndex = Math.round((i / beatCount) * totalChapters);
      breakpoints.set(Math.min(chapterIndex, totalChapters - 1), beats[i]);
    }
  }

  return breakpoints;
}
