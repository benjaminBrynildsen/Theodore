import { useState } from 'react';
import { UserPlus, Sparkles, Loader2, Copy, Check, RefreshCw, Heart, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';

type NameType = 'character' | 'place' | 'organization';
type Origin = 'any' | 'english' | 'celtic' | 'norse' | 'latin' | 'japanese' | 'arabic' | 'slavic' | 'african' | 'fantasy';
type Gender = 'any' | 'masculine' | 'feminine' | 'neutral';

interface GeneratedName {
  id: string;
  name: string;
  meaning: string;
  origin: string;
  phonetic: string;
  favorited: boolean;
}

const MOCK_CHARACTER_NAMES: GeneratedName[] = [
  { id: '1', name: 'Caelen Ashford', meaning: '"Slender" + "Ford by the ash trees"', origin: 'Celtic/English', phonetic: '/ˈkeɪ.lən ˈæʃ.fərd/', favorited: false },
  { id: '2', name: 'Eira Thornwell', meaning: '"Snow" + "Spring among thorns"', origin: 'Welsh/English', phonetic: '/ˈaɪ.rə ˈθɔːrn.wɛl/', favorited: false },
  { id: '3', name: 'Ronan Blackmere', meaning: '"Little seal" + "Dark lake"', origin: 'Irish/English', phonetic: '/ˈroʊ.nən ˈblæk.mɪər/', favorited: false },
  { id: '4', name: 'Isolde Veren', meaning: '"Ice ruler" + "Truth"', origin: 'Germanic/Dutch', phonetic: '/ɪˈzoʊl.də ˈvɛr.ən/', favorited: false },
  { id: '5', name: 'Theron Dusk', meaning: '"Hunter" + "Twilight"', origin: 'Greek/English', phonetic: '/ˈθɪr.ɒn dʌsk/', favorited: false },
  { id: '6', name: 'Linnea Stormgaard', meaning: '"Lime tree" + "Storm garden"', origin: 'Swedish/Norse', phonetic: '/lɪˈneɪ.ə ˈstɔːrm.gɑːrd/', favorited: false },
];

const MOCK_PLACE_NAMES: GeneratedName[] = [
  { id: 'p1', name: 'Ashenmoor', meaning: 'Moorland after fire', origin: 'English', phonetic: '/ˈæʃ.ən.mʊər/', favorited: false },
  { id: 'p2', name: 'Thornhallow', meaning: 'Sheltered valley of thorns', origin: 'English', phonetic: '/ˈθɔːrn.hæl.oʊ/', favorited: false },
  { id: 'p3', name: 'Veldris', meaning: 'Field of mist', origin: 'Dutch/Fantasy', phonetic: '/ˈvɛl.drɪs/', favorited: false },
  { id: 'p4', name: 'Cairn Solace', meaning: 'Stone marker of comfort', origin: 'Celtic/Latin', phonetic: '/kɛərn ˈsɒl.ɪs/', favorited: false },
  { id: 'p5', name: 'Nightfen', meaning: 'Marshland of darkness', origin: 'English', phonetic: '/ˈnaɪt.fɛn/', favorited: false },
  { id: 'p6', name: 'Séraphine Bay', meaning: 'Bay of the burning ones', origin: 'French/Hebrew', phonetic: '/ˌsɛr.əˈfiːn beɪ/', favorited: false },
];

const MOCK_ORG_NAMES: GeneratedName[] = [
  { id: 'o1', name: 'The Verdant Order', meaning: 'Green/flourishing organization', origin: 'Latin/English', phonetic: '/ˈvɜːr.dənt/', favorited: false },
  { id: 'o2', name: 'House Valdris', meaning: 'Ruling house of power', origin: 'Norse/Fantasy', phonetic: '/ˈvæl.drɪs/', favorited: false },
  { id: 'o3', name: 'The Ashbloom Collective', meaning: 'Union of decay-wielders', origin: 'English', phonetic: '/ˈæʃ.bluːm/', favorited: false },
  { id: 'o4', name: 'Circle of the Quiet Thorn', meaning: 'Silent protectors', origin: 'English', phonetic: '—', favorited: false },
  { id: 'o5', name: 'The Wrenmarch Society', meaning: 'Guild of small-bird scouts', origin: 'English', phonetic: '/ˈrɛn.mɑːrtʃ/', favorited: false },
  { id: 'o6', name: 'Covenant of Iron Root', meaning: 'Unbreakable foundation pact', origin: 'English/Latin', phonetic: '—', favorited: false },
];

export function NameGenerator() {
  const [nameType, setNameType] = useState<NameType>('character');
  const [origin, setOrigin] = useState<Origin>('any');
  const [gender, setGender] = useState<Gender>('any');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedName[]>([]);
  const [favorites, setFavorites] = useState<GeneratedName[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const mock = nameType === 'character' ? MOCK_CHARACTER_NAMES : nameType === 'place' ? MOCK_PLACE_NAMES : MOCK_ORG_NAMES;
      setResults(mock.map(n => ({ ...n, favorited: false })));
      setGenerating(false);
    }, 1500);
  };

  const handleCopy = (name: string, id: string) => {
    navigator.clipboard.writeText(name);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleFavorite = (name: GeneratedName) => {
    if (favorites.find(f => f.id === name.id)) {
      setFavorites(favorites.filter(f => f.id !== name.id));
    } else {
      setFavorites([...favorites, name]);
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <UserPlus size={20} className="text-text-tertiary" />
          <h2 className="text-2xl font-serif font-semibold">Name Generator</h2>
        </div>
        <p className="text-sm text-text-tertiary mb-8">
          Genre-aware names with etymology and phonetics
        </p>

        {/* Controls */}
        <div className="glass-subtle rounded-2xl p-6 mb-6 space-y-5">
          {/* Type */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Name Type</label>
            <div className="flex gap-2">
              {([
                { id: 'character' as NameType, icon: UserPlus, label: 'Character' },
                { id: 'place' as NameType, icon: MapPin, label: 'Place' },
                { id: 'organization' as NameType, icon: UserPlus, label: 'Organization' },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setNameType(t.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all',
                    nameType === t.id ? 'border-black/20 bg-black/[0.04]' : 'border-black/5 hover:border-black/10'
                  )}
                >
                  <t.icon size={14} />
                  <span className="text-sm">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Origin */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-2 block">Cultural Origin</label>
            <div className="flex flex-wrap gap-1.5">
              {(['any', 'english', 'celtic', 'norse', 'latin', 'japanese', 'arabic', 'slavic', 'african', 'fantasy'] as Origin[]).map(o => (
                <button
                  key={o}
                  onClick={() => setOrigin(o)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs capitalize transition-all',
                    origin === o ? 'bg-black text-white' : 'bg-black/5 text-text-secondary hover:bg-black/10'
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Gender (only for characters) */}
          {nameType === 'character' && (
            <div>
              <label className="text-xs font-medium text-text-secondary mb-2 block">Gender Coding</label>
              <div className="flex gap-2">
                {(['any', 'masculine', 'feminine', 'neutral'] as Gender[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs capitalize transition-all',
                      gender === g ? 'bg-black text-white' : 'bg-black/5 text-text-secondary hover:bg-black/10'
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-black/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> Generating...</>
            ) : results.length > 0 ? (
              <><RefreshCw size={16} /> Generate More</>
            ) : (
              <><Sparkles size={16} /> Generate Names</>
            )}
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2 mb-8">
            {results.map(name => (
              <div key={name.id} className="glass-subtle rounded-xl p-4 flex items-start gap-4 hover:bg-black/[0.02] transition-colors">
                <div className="flex-1">
                  <div className="text-lg font-serif font-semibold">{name.name}</div>
                  <div className="text-xs text-text-tertiary mt-1">{name.phonetic}</div>
                  <div className="text-sm text-text-secondary mt-1">{name.meaning}</div>
                  <div className="text-xs text-text-tertiary mt-1">Origin: {name.origin}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleFavorite(name)}
                    className={cn('p-2 rounded-lg transition-colors', favorites.find(f => f.id === name.id) ? 'text-red-500' : 'text-text-tertiary hover:text-text-primary')}
                  >
                    <Heart size={14} fill={favorites.find(f => f.id === name.id) ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => handleCopy(name.name, name.id)}
                    className="p-2 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {copiedId === name.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <div className="glass-subtle rounded-2xl p-6">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Heart size={14} className="text-red-500" /> Saved Names ({favorites.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {favorites.map(f => (
                <span key={f.id} className="px-3 py-1.5 rounded-xl bg-black/5 text-sm font-medium">
                  {f.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
