import { cn } from '@/lib/utils';
import { CHART_HEIGHT, type BreakColumn } from './streamgraph-layout';
import { GLIDE_STYLE, MOTION_CLASS_NAME, translateXOf } from './streamgraph-motion';

const BREAK_DASH_ARRAY = '4 4';

export function IdleBreakMarkers({ breaks }: { breaks: BreakColumn[] }) {
  return breaks.map((column) => (
    <line
      key={column.firstIndex}
      x1={0}
      x2={0}
      y1={0}
      y2={CHART_HEIGHT}
      strokeDasharray={BREAK_DASH_ARRAY}
      aria-hidden
      className={cn('pointer-events-none stroke-muted-foreground', MOTION_CLASS_NAME)}
      style={{ ...GLIDE_STYLE, transform: translateXOf(column.centerX) }}
    />
  ));
}

export function SelectionMarker({ x }: { x: number }) {
  return <line x1={x} x2={x} y1={0} y2={CHART_HEIGHT} className="pointer-events-none stroke-foreground" />;
}
