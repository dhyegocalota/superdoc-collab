import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CHART_HEIGHT, type BreakColumn } from './streamgraph-layout';
import { GLIDE_ANIMATION_STYLE } from './streamgraph-motion';

const BREAK_DASH_ARRAY = '4 4';

function IdleBreakDivider({ centerX }: { centerX: number }) {
  const [glide, setGlide] = useState({ centerX, offset: 0 });
  if (glide.centerX !== centerX) setGlide({ centerX, offset: glide.centerX - centerX });
  return (
    <line
      key={centerX}
      x1={centerX}
      x2={centerX}
      y1={0}
      y2={CHART_HEIGHT}
      strokeDasharray={BREAK_DASH_ARRAY}
      aria-hidden
      className="streamgraph-glide pointer-events-none stroke-muted-foreground motion-reduce:animate-none"
      style={{ ...GLIDE_ANIMATION_STYLE, '--glide-offset': `${glide.offset}px` } as CSSProperties}
    />
  );
}

export function IdleBreakMarkers({ breaks }: { breaks: BreakColumn[] }) {
  return breaks.map((column) => <IdleBreakDivider key={column.firstIndex} centerX={column.centerX} />);
}

export function SelectionMarker({ x }: { x: number }) {
  return <line x1={x} x2={x} y1={0} y2={CHART_HEIGHT} className="pointer-events-none stroke-foreground" />;
}
