import { useState } from 'react';
import { MessageSquare, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { CharacterEntry } from '../../types/canon';

interface Props {
  character: CharacterEntry;
}

const SCENARIOS = [
  'meeting a stranger for the first time',
  'confronting someone who betrayed them',
  'trying to comfort a friend',
  'being caught in a lie',
  'seeing something that terrifies them',
  'winning an argument they didn\'t expect to win',
  'saying goodbye to someone they love',
  'explaining something complex to a child',
];

export function VoicePreview({ character }: Props) {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const generatePreview = async () => {
    setGenerating(true);
    // Simulate AI generation — will use real API
    await new Promise(r => setTimeout(r, 1500));
    
    const c = character.character;
    const traits = c.personality.traits.join(', ') || 'guarded';
    const speech = c.personality.speechPattern || 'direct and measured';
    
    // Mock dialogue based on character traits
    const dialogues: Record<string, string> = {
      'meeting a stranger for the first time': `${character.name} studied the newcomer with ${traits.includes('cautious') ? 'wary' : 'curious'} eyes.\n\n"You're not from around here," ${character.name} said. ${speech.includes('formal') ? 'The words were precise, deliberately chosen.' : 'It wasn\'t a question.'}\n\nA pause. Then: "Neither was I, once."`,
      'confronting someone who betrayed them': `"I trusted you." ${character.name}'s voice was ${traits.includes('emotional') ? 'cracking at the edges' : 'terrifyingly calm'}. "That was my mistake, not yours. Yours was thinking I wouldn't find out."\n\n${speech.includes('metaphor') ? 'The words hung between them like smoke from a dying fire.' : 'The silence that followed said more than any threat could.'}`,
      'trying to comfort a friend': `${character.name} sat beside them, ${traits.includes('awkward') ? 'unsure what to do with their hands' : 'close but not touching'}.\n\n"I'm not going to tell you it gets better," ${character.name} said quietly. "But I'm not going anywhere, either."`,
    };

    setPreview(dialogues[scenario] || `${character.name} turned, expression unreadable.\n\n"Some things," ${character.name} said, "${speech.includes('formal') ? 'are best left undiscussed' : 'you just gotta figure out yourself'}."\n\nThe ${traits.includes('warm') ? 'warmth' : 'edge'} in the words was unmistakable.`);
    setGenerating(false);
  };

  const shuffleScenario = () => {
    const current = SCENARIOS.indexOf(scenario);
    const next = (current + 1) % SCENARIOS.length;
    setScenario(SCENARIOS[next]);
    setPreview(null);
  };

  return (
    <div className="border-t border-black/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={13} className="text-text-tertiary" />
        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Voice Preview</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={scenario}
          onChange={e => { setScenario(e.target.value); setPreview(null); }}
          className="flex-1 text-xs px-3 py-2 rounded-lg glass-input"
        >
          {SCENARIOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={shuffleScenario} className="p-2 rounded-lg text-text-tertiary hover:text-text-primary">
          <RefreshCw size={13} />
        </button>
      </div>

      {preview && (
        <div className="glass-pill rounded-xl p-4 mb-3 animate-fade-in">
          <div className="text-sm font-serif leading-relaxed whitespace-pre-line">{preview}</div>
        </div>
      )}

      <button
        onClick={generatePreview}
        disabled={generating}
        className={cn(
          'w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all',
          generating ? 'bg-black/5 text-text-tertiary' : 'bg-text-primary text-text-inverse hover:shadow-md'
        )}
      >
        {generating ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : <><Sparkles size={13} /> Preview Voice</>}
      </button>
    </div>
  );
}
