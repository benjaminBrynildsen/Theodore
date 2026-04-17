export interface Creator {
  slug: string;
  firstName: string;
  fullName: string;
  channelName: string;
  channelUrl: string;
  photo: string;
  handle: string;
  pronunciation?: string;
  email: string;
  subject: string;
  body: string;
}

const GREETING = (name: string) => `Hey ${name},`;

export const CREATORS: Creator[] = [
  {
    slug: 'malva',
    firstName: 'Malva',
    fullName: 'Malva',
    channelName: 'Malva AI',
    channelUrl: 'https://www.youtube.com/@malvaAI',
    photo: '/creators/malva.jpg',
    handle: '@malvaAI',
    email: 'aimalvabusiness@gmail.com',
    subject: 'Theodore AI & Malva — partnership idea',
    body: `${GREETING('Malva')}

Just caught your "3 Free AI Video Generators That Actually Work" — the way you stress-test stuff is exactly the lens I'd want on what I've been building.

I'm the solo dev behind Theodore (theodore.tools). Single sentence in → a full audiobook comes out. It plans the book, writes the chapters, and narrates with voice characters — all in one pipeline, no stitching tools together.

Would love to send you a free account with enough credits to generate a full audiobook end-to-end. No expectation of a video, but if it ends up being something you'd want to cover I'm happy to support with whatever you need (early access to new features, founder interview, paid partnership, whatever fits).

Cheers,
Ben`,
  },
  {
    slug: 'manu',
    firstName: 'Manu',
    fullName: 'Manu Arora',
    channelName: 'Manu Arora',
    channelUrl: 'https://www.youtube.com/@manuarora',
    photo: '/creators/manu.jpg',
    handle: '@manuarora',
    pronunciation: 'MAH-noo ah-ROAR-ah',
    email: 'team@aceternity.com',
    subject: 'Theodore AI & Manu — partnership idea',
    body: `${GREETING('Manu')}

Loved the Rishi episode — the "2 profitable SaaS, no team, no funding" framing hit close to home. I'm building solo on the AI product side and always learn something from your conversations.

Quick context: I built Theodore (theodore.tools) — a sentence → full audiobook pipeline. Writes characters, chapters, and narrates the whole thing. Running lean, shipping fast.

Two things I'd love:
1. Send you a free account with credits if you want to kick the tires
2. If you're ever looking for a guest on the indie SaaS side, happy to do a deep-dive on the stack (Remotion for promos, multi-model orchestration for the writing pipeline, ElevenLabs + OpenAI TTS for voice)

No pressure either way — just a fan.

Ben`,
  },
  {
    slug: 'tommy',
    firstName: 'Tommy',
    fullName: 'Tommy Geoco',
    channelName: 'Tommy Geoco',
    channelUrl: 'https://www.youtube.com/@designertom',
    photo: '/creators/tommy.jpg',
    handle: '@designertom',
    pronunciation: 'JOH-koh (soft G, Italian)',
    email: 'tommy@smoothmedia.co',
    subject: 'Theodore AI & Tommy — partnership idea',
    body: `${GREETING('Tommy')}

Saw the Lovable Design System for Agents piece — really like the way you cover product design at that depth. Want to put something in front of you.

I've been building Theodore (theodore.tools). It takes a single sentence and produces a fully narrated audiobook — planning, chapter generation, voice casting, narration, all in one app. The UI and the agent orchestration behind it are the parts I'm most proud of.

Would love to comp you a free account with plenty of credits. If it sparks anything — review, breakdown, even a "tools I'm watching" mention — that's a bonus, but mainly I'd value your eye on it.

Ben`,
  },
  {
    slug: 'tom',
    firstName: 'Tom',
    fullName: 'Tom',
    channelName: 'The AI Growth Lab with Tom',
    channelUrl: 'https://www.youtube.com/@theaigrowthlabwithtom',
    photo: '/creators/tom.jpg',
    handle: '@theaigrowthlabwithtom',
    email: 'tom@emailalchemy.co',
    subject: 'Theodore AI & Tom — partnership idea',
    body: `${GREETING('Tom')}

Your "OpenClaw for 95% cheaper" video caught my attention — the kind of practical "actually cheaper stack" breakdown I rarely see done well.

I'm behind Theodore (theodore.tools). Takes a sentence, returns a full audiobook — writing + narration in one pipe. A lot of your audience (creators, automation folks, "how do I turn my ideas into content") is exactly who's been signing up.

Happy to send you a free account with credits. If you'd like to feature it as an "AI tool that actually ships" or wire it into a workflow demo, even better — can give you early access to the API as we roll it out.

Ben`,
  },
  {
    slug: 'thomas',
    firstName: 'Thomas',
    fullName: 'Thomas Lundström',
    channelName: 'Thomas Lundström',
    channelUrl: 'https://www.youtube.com/@thomaslundstrm',
    photo: '/creators/thomas.jpg',
    handle: '@thomaslundstrm',
    pronunciation: 'TOH-mas LOOND-strurm (Swedish)',
    email: 'thomas@grovemedia.fi',
    subject: 'Theodore AI & Thomas — partnership idea',
    body: `${GREETING('Thomas')}

The "Secret Seedance 2 Workflow" video was great — that's the kind of "here's actually how" content I wish more AI channels did.

I built Theodore (theodore.tools) — essentially the audiobook version of what Seedance is for video. One sentence in, a full narrated audiobook comes out. Plans the book, writes chapters, casts voices, narrates.

Want to send you a free account with credits? If you end up making something around it — workflow walkthrough, even just "tools I tested" — happy to dive in on technical details. If not, no pressure.

Ben`,
  },
  {
    slug: 'dan',
    firstName: 'Dan',
    fullName: 'Dan Kieft',
    channelName: 'Dan Kieft',
    channelUrl: 'https://www.youtube.com/@Dankieft',
    photo: '/creators/dan.jpg',
    handle: '@Dankieft',
    pronunciation: 'KEEFT',
    email: 'business@dankieft.com',
    subject: 'Theodore AI & Dan — partnership idea',
    body: `${GREETING('Dan')}

Your "Long AI videos with ONE prompt" video was great — and you're exactly the kind of channel where I'd love this to land.

Theodore (theodore.tools) is a sentence-in → full audiobook-out tool. Plans, writes, narrates. Basically what Sora/Seedance do for video, Theodore does for text+audio in one pipeline.

Would love to comp you a pro account with credits to generate a full book and poke at everything. If it ends up being video-worthy I'm happy to support with early access, founder Q&A, paid partnership — whatever fits your usual flow.

Ben`,
  },
  {
    slug: 'dom',
    firstName: 'Dom',
    fullName: 'Dom',
    channelName: 'Tech Tutor Zones',
    channelUrl: 'https://www.youtube.com/@TechTutorZones',
    photo: '/creators/dom.jpg',
    handle: '@TechTutorZones',
    email: 'contact@techtutorzone.com',
    subject: 'Theodore AI & Dom — partnership idea',
    body: `${GREETING('Dom')}

Your Seedance + Higgsfield tutorial was a clean walkthrough — appreciate the "full workflow" format, it's rare.

I built Theodore (theodore.tools) — sentence → full narrated audiobook in one tool. Writing, voice casting, and narration all in one pipeline, no stitching.

It'd slot well into a step-by-step tutorial format: "here's how I turned one idea into a finished audiobook in X minutes." Happy to send a free pro account with credits, jump on a call to walk you through the more advanced controls, and support whatever format makes sense.

Ben`,
  },
  {
    slug: 'alamin',
    firstName: 'Alamin',
    fullName: 'Alamin',
    channelName: '8020ai',
    channelUrl: 'https://www.youtube.com/@iam_chonchol',
    photo: '/creators/alamin.jpg',
    handle: '@iam_chonchol',
    pronunciation: 'ah-lah-MEEN (Bengali)',
    email: 'hello@8020ai.co',
    subject: 'Theodore AI & Alamin — partnership idea',
    body: `${GREETING('Alamin')}

The Lessie AI video was really clean — specifically how you frame "who's this actually for" is something I think about a lot for my own product.

Theodore (theodore.tools) — sentence → fully realized audiobook (writing + narration). Solo-built, live at theodore.tools. The kind of tool your audience ("how do I actually use AI to do X") tends to click with.

Want a free pro account + credits to generate a book end-to-end? If it turns into a review or a "tools I tested this week" spot, great; if not, no worries.

Ben`,
  },
  {
    slug: 'tim',
    firstName: 'Tim',
    fullName: 'Tim Harris',
    channelName: 'Tim Harris AI',
    channelUrl: 'https://www.youtube.com/@TimHarrisAI',
    photo: '/creators/tim.jpg',
    handle: '@TimHarrisAI',
    email: 'tim@timharrisvideo.com.au',
    subject: 'Theodore AI & Tim — partnership idea',
    body: `${GREETING('Tim')}

The "One Prompt, Full Movie Scene" Seedance tutorial was sharp. Same idea, different medium — I'd love to put what I've built in front of you.

Theodore (theodore.tools): one sentence → complete audiobook. Plans the book, writes the chapters, narrates with voice characters, exports finished audio. Basically the Seedance/Sora pattern applied to long-form audio stories.

Free pro account + credits on me. If it sparks a video, happy to dive in on the pipeline (voice orchestration is fun). If not, appreciate you taking a look.

Ben`,
  },
  {
    slug: 'artturi',
    firstName: 'Artturi',
    fullName: 'Artturi',
    channelName: 'Artturi Explores',
    channelUrl: 'https://www.youtube.com/@artturiexplores',
    photo: '/creators/artturi.jpg',
    handle: '@artturiexplores',
    pronunciation: 'ART-too-ree (Finnish)',
    email: 'artturi@softwareviews.net',
    subject: 'Theodore AI & Artturi — partnership idea',
    body: `${GREETING('Artturi')}

Your "Controlla Voice" review was great — I appreciate how you actually test these things rather than just describe them.

I built Theodore (theodore.tools). Sentence → fully narrated audiobook, all in one app. It fits the kind of "does this actually work or is it marketing?" stress-test your channel is known for.

Want me to set you up with a free pro account + enough credits to generate a full book? Curious what holds up and what falls apart under real testing.

Ben`,
  },
  {
    slug: 'bitnext',
    firstName: 'the BitNext team',
    fullName: 'BitNext',
    channelName: 'BitNext',
    channelUrl: 'https://www.youtube.com/@TheBitNext',
    photo: '/creators/bitnext.jpg',
    handle: '@TheBitNext',
    email: 'bitnextofficial@gmail.com',
    subject: 'Theodore AI & BitNext — partnership idea',
    body: `Hey,

Caught the "FULL AI Story Video with Just ONE Prompt" video — we're chasing similar territory, just in audio instead of video.

Theodore (theodore.tools) turns one sentence into a full audiobook. Writes the book, voices the characters, narrates it. Same "one prompt → finished product" spirit as what you cover.

Happy to comp a pro account + credits to test. If you end up stacking it into a "one-prompt workflows" video or doing a comparison, I can hook you up with whatever early access / technical support you want.

Ben`,
  },
  {
    slug: 'ken',
    firstName: 'Ken',
    fullName: 'Ken Fornari',
    channelName: 'Ken Fornari',
    channelUrl: 'https://www.youtube.com/@KenFornari',
    photo: '/creators/ken.jpg',
    handle: '@KenFornari',
    pronunciation: 'for-NAR-ee',
    email: 'kenfornarico@gmail.com',
    subject: 'Theodore AI & Ken — partnership idea',
    body: `${GREETING('Ken')}

Your "AI to scale high-content KDP" video was exactly the right frame — people are skittish about AI in this space, but the ones using it smartly are printing money. Want to show you something.

Theodore (theodore.tools): one sentence → a fully realized audiobook. Writes, plans, casts voices, narrates. For KDP indie authors, it's a way to ship audio editions without touching ACX/findaway.

Want a pro account + credits on me? If it ends up being a fit for your audience ("AI tools I'd actually recommend"), I'll support whatever makes sense — affiliate code, review copy, Q&A, etc.

Ben`,
  },
];

export function findCreator(slug: string | undefined | null): Creator | null {
  if (!slug) return null;
  const norm = slug.toLowerCase().trim();
  return CREATORS.find((c) => c.slug === norm) ?? null;
}
