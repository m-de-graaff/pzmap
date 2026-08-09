import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

function floorLabel(floor: number): string {
  if (floor === 0) return 'Ground';
  if (floor > 0) return `Floor ${floor}`;
  return `Basement ${-floor}`;
}

interface FloorControlProps {
  floor: number;
  onFloorChange: (floor: number) => void;
  range: { min: number; max: number } | null;
}

export default function FloorControl({ floor, onFloorChange, range }: FloorControlProps) {
  if (!range || range.max - range.min < 1) return null;

  return (
    <div
      role="group"
      aria-label="Building floor"
      className="flex min-h-9 items-center gap-2.5 rounded-lg border border-border bg-secondary px-3 text-[13px] text-muted-foreground"
    >
      <button
        type="button"
        aria-label="Floor down"
        disabled={floor <= range.min}
        onClick={() => onFloorChange(Math.max(range.min, floor - 1))}
        className={cn(
          'flex h-6 w-6 flex-none items-center justify-center rounded-md hover:bg-muted hover:text-sidebar-foreground',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        −
      </button>
      <Slider
        min={range.min}
        max={range.max}
        step={1}
        value={[floor]}
        onValueChange={([v]) => onFloorChange(v)}
        aria-label="Building floor"
        aria-valuetext={floorLabel(floor)}
        className="flex-1"
      />
      <button
        type="button"
        aria-label="Floor up"
        disabled={floor >= range.max}
        onClick={() => onFloorChange(Math.min(range.max, floor + 1))}
        className={cn(
          'flex h-6 w-6 flex-none items-center justify-center rounded-md hover:bg-muted hover:text-sidebar-foreground',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        +
      </button>
      <span className="w-20 flex-none text-right tabular-nums text-sidebar-foreground" aria-hidden="true">
        {floorLabel(floor)}
      </span>
    </div>
  );
}
