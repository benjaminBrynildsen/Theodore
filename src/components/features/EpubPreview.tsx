import { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Tablet, Smartphone, Monitor, Download } from 'lucide-react';
import { cn } from '../../lib/utils';

type Device = 'kindle' | 'phone' | 'tablet';
type Theme = 'light' | 'sepia' | 'dark';

const DEVICE_SIZES: Record<Device, { w: number; h: number; label: string; icon: typeof Monitor }> = {
  kindle: { w: 380, h: 540, label: 'Kindle', icon: Tablet },
  phone: { w: 280, h: 500, label: 'Phone', icon: Smartphone },
  tablet: { w: 520, h: 680, label: 'Tablet', icon: Monitor },
};

const THEME_STYLES: Record<Theme, { bg: string; text: string; accent: string }> = {
  light: { bg: 'bg-white', text: 'text-gray-900', accent: 'border-gray-200' },
  sepia: { bg: 'bg-[#f5f0e8]', text: 'text-[#5b4636]', accent: 'border-[#d4c5a9]' },
  dark: { bg: 'bg-[#1a1a1a]', text: 'text-[#c8c8c8]', accent: 'border-[#333]' },
};

const MOCK_CHAPTERS = [
  {
    title: 'Chapter 1: The False Wall',
    content: `Eleanor Chen had spent three years cataloguing the restricted archives of Harrowgate Library, but it was a hairline crack in the plaster that changed everything. Following the fracture behind shelf R-17, she discovered that what she'd assumed was a load-bearing wall was actually a sealed doorway, its mortar conspicuously newer than the surrounding stonework — fifty years at most, she guessed, running her thumb along the join.

Behind it lay a descending staircase, its steps worn smooth by feet that had walked them long before the library was built. The air that seeped through smelled of damp earth and something older — a green, living scent that had no business existing three stories underground.

She stood at the top of the stairs for a long time, her phone flashlight cutting a white wedge into the darkness below. Every protocol she'd been trained on said to report this. Call security. Fill out a form. Let someone else decide.

Eleanor descended.

The passage curved gently to the left, following what she guessed was the foundation line of the original building. The walls transitioned from modern brick to rougher, older stone — and then to something she couldn't identify: a dark, smooth material that felt warm under her fingertips, like sun-heated rock, though no sun had touched it in centuries.

At the bottom, a door. Not locked, not sealed — simply closed, as if someone had pulled it shut behind them and never returned. The handle was brass, tarnished to a deep green, shaped like a coiled vine. Eleanor turned it.`,
  },
  {
    title: 'Chapter 2: The Garden Below',
    content: `The underground garden defied every expectation. Bioluminescent moss covered the vaulted ceiling, casting a perpetual blue-green twilight over beds of impossible plants — species that shouldn't exist together, from different continents and different centuries.

Eleanor stepped through the doorway and into air that was warm and humid, thick with the scent of growing things. The space was enormous — far larger than the library above, stretching away into a soft-edged darkness that the bioluminescent light couldn't quite penetrate.

Paths of fitted stone wound between raised beds, each one a small ecosystem. She recognized some of the plants: foxglove, nightshade, moonflower. Others were entirely unknown to her — a tree with silver bark that seemed to breathe, its trunk expanding and contracting in a slow, regular rhythm; a vine covered in flowers that opened and closed like tiny mouths, releasing puffs of luminous pollen.

The air hummed. Not a mechanical sound — something deeper, felt more in the bones than heard. It intensified as she walked toward the far wall, where three iron doors stood in a row, each one marked with a different symbol she didn't recognize.`,
  },
  {
    title: 'Chapter 3: The Archivist\'s Secret',
    content: `Marcus Webb appeared at the garden entrance as if summoned. The head archivist's calm acceptance of the impossible space told Eleanor he'd known about it all along. His tweed jacket was, as always, immaculate; his wire-rimmed glasses caught the bioluminescent light and turned his eyes into pools of green.

"I wondered how long it would take you," he said, without surprise or alarm. "Most people don't notice the crack. They see the shelf, the books, the wall behind them, and their mind fills in the rest. But you've always been the noticing sort."

Eleanor's flashlight was still on. She turned it off. In the garden's twilight, Marcus looked different — less like the fussy, particular man who alphabetized the staff kitchen and more like someone who had been waiting a very long time for this exact moment.`,
  },
];

export function EpubPreview() {
  const [device, setDevice] = useState<Device>('kindle');
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans'>('serif');
  const [currentChapter, setCurrentChapter] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.8);

  const deviceSpec = DEVICE_SIZES[device];
  const themeStyle = THEME_STYLES[theme];
  const chapter = MOCK_CHAPTERS[currentChapter];
  const exportEpubPreview = () => {
    const content = [
      '# EPUB PREVIEW EXPORT',
      '',
      ...MOCK_CHAPTERS.map((ch, idx) => `## ${idx + 1}. ${ch.title}\n\n${ch.content}`),
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'epub-preview.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">ePub Preview</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          See exactly how your book appears on Kindle, phone, and tablet
        </p>

        <div className="flex gap-8">
          {/* Controls */}
          <div className="w-56 flex-shrink-0 space-y-5">
            {/* Device */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">Device</label>
              <div className="space-y-1">
                {(Object.entries(DEVICE_SIZES) as [Device, typeof DEVICE_SIZES[Device]][]).map(([id, spec]) => (
                  <button
                    key={id}
                    onClick={() => setDevice(id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all',
                      device === id ? 'bg-black/[0.04] font-medium' : 'hover:bg-black/[0.02]'
                    )}
                  >
                    <spec.icon size={14} className={device === id ? 'text-text-primary' : 'text-text-tertiary'} />
                    {spec.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">Theme</label>
              <div className="flex gap-2">
                {(['light', 'sepia', 'dark'] as Theme[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={cn(
                      'flex-1 py-2 rounded-xl border-2 text-xs capitalize transition-all',
                      THEME_STYLES[t].bg,
                      theme === t ? 'border-black' : 'border-transparent'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Font Size — {fontSize}px
              </label>
              <input
                type="range"
                min={12}
                max={24}
                value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}
                className="w-full accent-black"
              />
            </div>

            {/* Line height */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Line Height — {lineHeight.toFixed(1)}
              </label>
              <input
                type="range"
                min={1.2}
                max={2.4}
                step={0.1}
                value={lineHeight}
                onChange={e => setLineHeight(Number(e.target.value))}
                className="w-full accent-black"
              />
            </div>

            {/* Font family */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">Font</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFontFamily('serif')}
                  className={cn('flex-1 py-2 rounded-xl border text-sm transition-all font-serif', fontFamily === 'serif' ? 'border-black/20 bg-black/[0.04]' : 'border-black/5')}
                >
                  Serif
                </button>
                <button
                  onClick={() => setFontFamily('sans')}
                  className={cn('flex-1 py-2 rounded-xl border text-sm transition-all font-sans', fontFamily === 'sans' ? 'border-black/20 bg-black/[0.04]' : 'border-black/5')}
                >
                  Sans
                </button>
              </div>
            </div>

            {/* TOC */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">Chapters</label>
              <div className="space-y-0.5">
                {MOCK_CHAPTERS.map((ch, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentChapter(i)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-xs transition-all',
                      currentChapter === i ? 'bg-black/[0.04] font-medium' : 'hover:bg-black/[0.02] text-text-secondary'
                    )}
                  >
                    {ch.title}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={exportEpubPreview}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-black/10 rounded-xl text-sm hover:bg-black/[0.02] transition-colors"
            >
              <Download size={14} />
              Export ePub
            </button>
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col items-center">
            {/* Device frame */}
            <div
              className="rounded-[20px] border-[3px] border-gray-800 shadow-2xl overflow-hidden relative"
              style={{ width: deviceSpec.w, height: deviceSpec.h }}
            >
              {/* Screen */}
              <div className={cn('h-full overflow-y-auto', themeStyle.bg, themeStyle.text)}>
                {/* Header */}
                <div className={cn('sticky top-0 px-4 py-2 text-[10px] flex justify-between border-b', themeStyle.bg, themeStyle.accent, 'opacity-60')}>
                  <span>The Midnight Garden</span>
                  <span>{currentChapter + 1} / {MOCK_CHAPTERS.length}</span>
                </div>

                {/* Content */}
                <div
                  className={cn('px-6 py-4', fontFamily === 'serif' ? 'font-serif' : 'font-sans')}
                  style={{ fontSize: `${fontSize}px`, lineHeight }}
                >
                  <h2 className="text-center mb-6 text-lg font-semibold">{chapter.title}</h2>
                  {chapter.content.split('\n\n').map((para, i) => (
                    <p key={i} className="mb-4 text-justify" style={{ textIndent: i > 0 ? '1.5em' : 0 }}>
                      {i === 0 && <span className="text-[2em] font-bold float-left mr-1 leading-[0.8]">{para[0]}</span>}
                      {i === 0 ? para.slice(1) : para}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-4 mt-4">
              <button
                onClick={() => setCurrentChapter(Math.max(0, currentChapter - 1))}
                disabled={currentChapter === 0}
                className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-20 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs text-text-tertiary">{chapter.title}</span>
              <button
                onClick={() => setCurrentChapter(Math.min(MOCK_CHAPTERS.length - 1, currentChapter + 1))}
                disabled={currentChapter === MOCK_CHAPTERS.length - 1}
                className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-20 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
