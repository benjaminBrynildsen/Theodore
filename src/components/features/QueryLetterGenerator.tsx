import { useState } from 'react';
import { FileSignature, Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type OutputType = 'query' | 'blurb' | 'amazon';

export function QueryLetterGenerator() {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id) : [];
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputType>('query');
  const [outputs, setOutputs] = useState<Record<OutputType, string | null>>({ query: null, blurb: null, amazon: null });
  const [copied, setCopied] = useState(false);

  const totalWords = chapters.reduce((s, c) => s + (c.prose ? c.prose.split(/\s+/).length : 0), 0);

  const generate = async (type: OutputType) => {
    setGenerating(true);
    setActiveTab(type);
    await new Promise(r => setTimeout(r, 2000));

    const title = project?.title || 'Untitled';

    const mock: Record<OutputType, string> = {
      query: `Dear [Agent Name],

I am seeking representation for ${title.toUpperCase()}, a literary fantasy complete at ${totalWords > 0 ? totalWords.toLocaleString() : '80,000'} words. It will appeal to fans of Erin Morgenstern's The Night Circus and Susanna Clarke's Piranesi.

Dr. Elara Voss studies root networks in old-growth forests — the invisible conversations between trees. She believes in data, in observable phenomena, in things she can put her hands on. So when the ivy pulls back to reveal a door in the wall she's passed every morning for three years, she does what any rational scientist would do: she opens it.

The garden on the other side shouldn't exist. It's vast where the estate is small. Its flowers track her movement. And its Gardener — a figure dressed in clothes a century out of fashion — speaks of the garden as if it's alive. Because it is.

As Elara is drawn deeper into the garden's impossible ecology, she discovers that her grandmother didn't just know about this place — she was its previous keeper. Now the garden is choosing Elara, and what it's asking her to become may cost her everything she thinks she knows about the natural world.

${title.toUpperCase()} is a standalone novel with series potential. I hold a [degree] from [university] and my work has appeared in [publications].

Thank you for your time and consideration.

Sincerely,
[Your Name]`,

      blurb: `Some gardens grow. This one remembers.

Dr. Elara Voss is a scientist who believes in what she can measure. When a hidden door appears in a wall she's passed every day for years, she steps through — and into an impossible garden that stretches beyond the boundaries of physics, tended by a figure who's been waiting for her.

The Gardener says the garden chose her. That her grandmother was its last keeper. That it's alive, and it's dying, and Elara is the only one who can hear what it's trying to say.

But listening to the garden means accepting truths that science can't explain. And what the garden remembers about Elara's family is far more dangerous than anything growing in its soil.

A lyrical fantasy about the conversations between humans and the living world, ${title.toUpperCase()} asks what happens when a woman who believes in data is asked to believe in something she can't prove — and what she stands to lose if she doesn't.`,

      amazon: `**${title}**

*For fans of The Night Circus, Piranesi, and The Overstory*

A scientist walks through an impossible door. The garden on the other side has been waiting for her.

When Dr. Elara Voss discovers a hidden garden behind a crumbling estate wall, she finds an ecosystem that defies everything she knows about biology. Flowers that track movement. Trees that whisper. A Gardener who speaks of the land as a living, thinking entity.

The garden chose her — just as it chose her grandmother before her. But being chosen comes with a cost, and Elara must decide whether to trust the science that built her career or the impossible truth growing beneath her feet.

**A lyrical literary fantasy about nature, memory, and what it means to truly listen.**

⭐ *"Morgenstern meets VanderMeer in this stunning debut"*
⭐ *"I couldn't put it down — the garden felt real"*
⭐ *"The best botanical fantasy since The Overstory"*`,
    };

    setOutputs(prev => ({ ...prev, [type]: mock[type] }));
    setGenerating(false);
  };

  const copyToClipboard = () => {
    const text = outputs[activeTab];
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Query Letter & Blurb</h3>
        <p className="text-xs text-text-tertiary">Auto-generated from your manuscript. Three formats, one click.</p>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 mb-4">
        {([
          { id: 'query' as const, label: 'Query Letter' },
          { id: 'blurb' as const, label: 'Back Cover' },
          { id: 'amazon' as const, label: 'Amazon Description' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => outputs[id] ? setActiveTab(id) : generate(id)}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-medium transition-all',
              activeTab === id ? 'bg-text-primary text-text-inverse' : 'glass-pill text-text-tertiary'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Output area */}
      {!outputs[activeTab] && !generating && (
        <div className="text-center py-8">
          <FileSignature size={28} className="mx-auto mb-3 text-text-tertiary" />
          <p className="text-sm text-text-secondary mb-4">Theodore reads your full manuscript and crafts publication-ready copy.</p>
          <button
            onClick={() => generate(activeTab)}
            className="px-5 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center gap-2 mx-auto hover:shadow-lg transition-all"
          >
            <Sparkles size={15} /> Generate {activeTab === 'query' ? 'Query Letter' : activeTab === 'blurb' ? 'Back Cover' : 'Amazon Description'}
          </button>
        </div>
      )}

      {generating && (
        <div className="text-center py-8 animate-fade-in">
          <Loader2 size={28} className="mx-auto mb-3 text-text-tertiary animate-spin" />
          <p className="text-sm text-text-secondary">Reading your manuscript and crafting copy...</p>
        </div>
      )}

      {outputs[activeTab] && !generating && (
        <div className="animate-fade-in">
          <div className="glass-pill rounded-xl p-5 mb-3 max-h-[400px] overflow-y-auto">
            <pre className="text-sm font-serif leading-relaxed whitespace-pre-wrap text-text-primary">{outputs[activeTab]}</pre>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="flex-1 py-2 rounded-xl glass-pill text-xs text-text-secondary hover:bg-white/60 flex items-center justify-center gap-1.5"
            >
              {copied ? <><Check size={12} className="text-success" /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
            <button
              onClick={() => generate(activeTab)}
              className="flex-1 py-2 rounded-xl glass-pill text-xs text-text-secondary hover:bg-white/60 flex items-center justify-center gap-1.5"
            >
              <Sparkles size={12} /> Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
