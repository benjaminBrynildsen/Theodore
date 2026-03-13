import { PenLine, BookOpen, Headphones } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

export function BottomNav() {
  const { mobilePanel, setMobilePanel, showReadingMode, setShowReadingMode, activeProjectId } = useStore();

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 glass-strong border-t border-white/30 safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-2">
        {/* Left sidebar — chapters & canon */}
        <button
          onClick={() => setMobilePanel(mobilePanel === 'left' ? null : 'left')}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
            mobilePanel === 'left' ? 'text-text-primary' : 'text-text-tertiary active:text-text-primary'
          )}
        >
          <PenLine size={20} strokeWidth={mobilePanel === 'left' ? 2.2 : 1.8} />
          <span className="text-[10px] font-medium">Edit</span>
        </button>

        {/* Reading mode */}
        <button
          onClick={() => {
            setMobilePanel(null);
            setShowReadingMode(!showReadingMode);
          }}
          disabled={!activeProjectId}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
            showReadingMode ? 'text-text-primary' : 'text-text-tertiary active:text-text-primary',
            !activeProjectId && 'opacity-40'
          )}
        >
          <BookOpen size={20} strokeWidth={showReadingMode ? 2.2 : 1.8} />
          <span className="text-[10px] font-medium">Read</span>
        </button>

        {/* Studio — audiobook panel */}
        <button
          onClick={() => setMobilePanel(mobilePanel === 'studio' ? null : 'studio')}
          disabled={!activeProjectId}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200',
            mobilePanel === 'studio' ? 'text-text-primary' : 'text-text-tertiary active:text-text-primary',
            !activeProjectId && 'opacity-40'
          )}
        >
          <Headphones size={20} strokeWidth={mobilePanel === 'studio' ? 2.2 : 1.8} />
          <span className="text-[10px] font-medium">Studio</span>
        </button>
      </div>
    </nav>
  );
}
