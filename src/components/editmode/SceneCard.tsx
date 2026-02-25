import { GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Scene } from '../../types';

interface Props {
  scene: Scene;
  isActive: boolean;
  onClick: () => void;
}

const statusColors: Record<Scene['status'], string> = {
  outline: 'bg-amber-400',
  drafted: 'bg-blue-400',
  edited: 'bg-emerald-400',
};

export function SceneCard({ scene, isActive, onClick }: Props) {
  const wordCount = scene.prose.trim() ? scene.prose.trim().split(/\s+/).length : 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-2 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group',
        isActive
          ? 'bg-text-primary text-text-inverse shadow-sm'
          : 'hover:bg-white/40 text-text-secondary hover:text-text-primary'
      )}
    >
      <GripVertical
        size={14}
        className={cn(
          'mt-0.5 flex-shrink-0 cursor-grab',
          isActive ? 'text-white/40' : 'text-text-tertiary opacity-0 group-hover:opacity-100'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isActive ? 'bg-white/60' : statusColors[scene.status]
          )} />
          <span className="text-[15px] font-medium truncate">{scene.title}</span>
        </div>
        {scene.summary && (
          <p className={cn(
            'text-xs mt-0.5 line-clamp-2 leading-relaxed',
            isActive ? 'text-white/60' : 'text-text-tertiary'
          )}>
            {scene.summary}
          </p>
        )}
        <div className={cn(
          'text-[10px] mt-1 font-mono',
          isActive ? 'text-white/40' : 'text-text-tertiary'
        )}>
          {wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'No prose yet'}
        </div>
      </div>
    </button>
  );
}
