import { CHART_HEIGHT, type BreakColumn } from './streamgraph-layout';

const BREAK_DASH_ARRAY = '4 4';

export function IdleBreakMarkers({ breaks }: { breaks: BreakColumn[] }) {
  return breaks.map((column) => (
    <line
      key={column.firstIndex}
      x1={column.centerX}
      x2={column.centerX}
      y1={0}
      y2={CHART_HEIGHT}
      strokeDasharray={BREAK_DASH_ARRAY}
      aria-hidden
      className="pointer-events-none stroke-muted-foreground"
    />
  ));
}

export function SelectionMarker({ x }: { x: number }) {
  return <line x1={x} x2={x} y1={0} y2={CHART_HEIGHT} className="pointer-events-none stroke-foreground" />;
}
