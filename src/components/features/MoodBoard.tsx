import { useState } from 'react';
import { Image, Music, FileText, Link2, Plus, X, Palette, GripVertical } from 'lucide-react';
import { cn, generateId } from '../../lib/utils';

type PinType = 'image' | 'color' | 'text' | 'link' | 'music';

interface Pin {
  id: string;
  type: PinType;
  content: string; // URL for image/link/music, hex for color, text for text
  label?: string;
}

interface Props {
  projectId: string;
}

export function MoodBoard({ projectId }: Props) {
  const [pins, setPins] = useState<Pin[]>([
    { id: '1', type: 'color', content: '#1a1a2e', label: 'Night sky' },
    { id: '2', type: 'color', content: '#e2d1c3', label: 'Aged paper' },
    { id: '3', type: 'color', content: '#2d5016', label: 'Deep forest' },
    { id: '4', type: 'text', content: '"The world is full of magic things, patiently waiting for our senses to grow sharper." — W.B. Yeats' },
    { id: '5', type: 'link', content: 'https://open.spotify.com/playlist/...', label: 'Writing playlist' },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<PinType>('text');
  const [newContent, setNewContent] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const addPin = () => {
    if (!newContent.trim()) return;
    setPins(prev => [...prev, { id: generateId(), type: newType, content: newContent.trim(), label: newLabel.trim() || undefined }]);
    setNewContent('');
    setNewLabel('');
    setShowAdd(false);
  };

  const removePin = (id: string) => {
    setPins(prev => prev.filter(p => p.id !== id));
  };

  const typeIcons: Record<PinType, typeof Image> = { image: Image, color: Palette, text: FileText, link: Link2, music: Music };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Image size={14} className="text-text-tertiary" />
          <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Mood Board</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary">
          <Plus size={14} />
        </button>
      </div>

      {/* Add new pin */}
      {showAdd && (
        <div className="glass-pill rounded-xl p-3 mb-3 animate-fade-in space-y-2">
          <div className="flex gap-1">
            {(['text', 'color', 'image', 'link', 'music'] as PinType[]).map(type => {
              const Icon = typeIcons[type];
              return (
                <button
                  key={type}
                  onClick={() => setNewType(type)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-[10px] capitalize flex items-center justify-center gap-1 transition-all',
                    newType === type ? 'bg-text-primary text-text-inverse' : 'bg-black/5 text-text-tertiary'
                  )}
                >
                  <Icon size={10} /> {type}
                </button>
              );
            })}
          </div>
          <input
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder={newType === 'color' ? '#hex or color name' : newType === 'image' ? 'Image URL' : newType === 'link' ? 'URL' : newType === 'music' ? 'Spotify/YouTube URL' : 'Quote, note, or snippet...'}
            className="w-full px-3 py-2 rounded-lg glass-input text-xs"
          />
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full px-3 py-1.5 rounded-lg glass-input text-xs"
          />
          <button onClick={addPin} disabled={!newContent.trim()} className="w-full py-1.5 rounded-lg bg-text-primary text-text-inverse text-xs font-medium disabled:opacity-50">
            Add to Board
          </button>
        </div>
      )}

      {/* Pins grid */}
      <div className="space-y-2">
        {pins.map(pin => (
          <div key={pin.id} className="group glass-pill rounded-xl p-3 relative">
            <button
              onClick={() => removePin(pin.id)}
              className="absolute top-2 right-2 p-0.5 rounded-full bg-black/5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>

            {pin.type === 'color' && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg shadow-inner flex-shrink-0" style={{ backgroundColor: pin.content }} />
                <div>
                  <div className="text-xs font-mono">{pin.content}</div>
                  {pin.label && <div className="text-[10px] text-text-tertiary">{pin.label}</div>}
                </div>
              </div>
            )}

            {pin.type === 'text' && (
              <div>
                <div className="text-xs italic leading-relaxed text-text-secondary">"{pin.content}"</div>
                {pin.label && <div className="text-[10px] text-text-tertiary mt-1">— {pin.label}</div>}
              </div>
            )}

            {pin.type === 'image' && (
              <div>
                <div className="w-full h-24 rounded-lg bg-black/5 flex items-center justify-center">
                  <Image size={20} className="text-text-tertiary" />
                </div>
                {pin.label && <div className="text-[10px] text-text-tertiary mt-1">{pin.label}</div>}
              </div>
            )}

            {(pin.type === 'link' || pin.type === 'music') && (
              <div className="flex items-center gap-2">
                {pin.type === 'music' ? <Music size={14} className="text-text-tertiary" /> : <Link2 size={14} className="text-text-tertiary" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{pin.label || pin.content}</div>
                  <div className="text-[10px] text-text-tertiary truncate">{pin.content}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {pins.length === 0 && (
        <div className="text-center py-6 text-text-tertiary text-xs">
          Drop in images, colors, quotes, and music to inspire your writing.
        </div>
      )}
    </div>
  );
}
