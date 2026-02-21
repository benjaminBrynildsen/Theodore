import { cn } from '../../lib/utils';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}

export function Slider({ value, onChange, min = 0, max = 100, leftLabel, rightLabel, className }: SliderProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {leftLabel && <span className="text-xs text-text-tertiary w-20 text-right">{leftLabel}</span>}
      <div className="relative flex-1 h-8 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-primary
            [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150
            [&::-webkit-slider-thumb]:hover:scale-125"
        />
      </div>
      {rightLabel && <span className="text-xs text-text-tertiary w-20">{rightLabel}</span>}
    </div>
  );
}
