import { Slider } from '@/components/ui/slider';

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
    <div className="floor-control" role="group" aria-label="Building floor">
      <button
        type="button"
        aria-label="Floor up"
        disabled={floor >= range.max}
        onClick={() => onFloorChange(Math.min(range.max, floor + 1))}
        className="floor-control-btn"
      >
        +
      </button>
      <Slider
        orientation="vertical"
        min={range.min}
        max={range.max}
        step={1}
        value={[floor]}
        onValueChange={([v]) => onFloorChange(v)}
        aria-label="Building floor"
        aria-valuetext={floorLabel(floor)}
        className="floor-control-slider"
      />
      <button
        type="button"
        aria-label="Floor down"
        disabled={floor <= range.min}
        onClick={() => onFloorChange(Math.max(range.min, floor - 1))}
        className="floor-control-btn"
      >
        −
      </button>
      <span className="floor-control-label" aria-hidden="true">{floorLabel(floor)}</span>
    </div>
  );
}
