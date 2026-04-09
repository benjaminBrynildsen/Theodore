import { useState } from 'react';
import { Headphones, ImageIcon } from 'lucide-react';
import { AudiobookPanel } from '../features/AudiobookPanel';
import { BookCoverSection } from '../features/BookCoverSection';
import { MobilePlayerBar } from '../features/MobilePlayer';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type StudioTab = 'audio' | 'cover';

interface Props {
  onClose: () => void;
  onExpandPlayer: () => void;
}

export function MobileStudioPanel({ onClose, onExpandPlayer }: Props) {
  const [tab, setTab] = useState<StudioTab>('audio');
  const project = useStore((s) => s.getActiveProject());

  return (
    <div className="sm:hidden fixed inset-0 z-40 bg-bg flex flex-col animate-fade-in">
      {/* Header with segmented control */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04]">
          <button
            onClick={() => setTab('audio')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              tab === 'audio' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary'
            )}
          >
            <Headphones size={13} />
            Audio
          </button>
          <button
            onClick={() => setTab('cover')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              tab === 'cover' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary'
            )}
          >
            <ImageIcon size={13} />
            Cover
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
        >
          <span className="text-xs font-medium">Done</span>
        </button>
      </div>

      {/* Content */}
      {tab === 'audio' && (
        <div className="flex-1 overflow-y-auto pb-16 min-h-0 [&>div]:h-auto [&>div]:min-h-0">
          <AudiobookPanel />
        </div>
      )}
      {tab === 'cover' && project && (
        <div className="flex-1 overflow-y-auto pb-16 min-h-0">
          <BookCoverSection projectId={project.id} />
        </div>
      )}

      {/* Player bar */}
      {tab === 'audio' && (
        <div className="flex-shrink-0 mb-14">
          <MobilePlayerBar onExpand={onExpandPlayer} />
        </div>
      )}
    </div>
  );
}
