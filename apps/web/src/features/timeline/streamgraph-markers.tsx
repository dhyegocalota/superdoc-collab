import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CHART_HEIGHT, type BreakColumn } from './streamgraph-layout';
import { GLIDE_ANIMATION_STYLE } from './streamgraph-motion';
import { useWidthChanged } from './use-width-changed';

const BREAK_DASH_ARRAY = '4 4';

function IdleBreakDivider({ centerX, isResize }: { centerX: number; isResize: boolean }) {
  const [glide, setGlide] = useState({ centerX, offset: 0 });
  if (glide.centerX !== centerX) setGlide({ centerX, offset: isResize ? 0 : glide.centerX - centerX });
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

export function IdleBreakMarkers({ breaks, width }: { breaks: BreakColumn[]; width: number }) {
  const isResize = useWidthChanged(width);
  return breaks.map((column, index) => <IdleBreakDivider key={index} centerX={column.centerX} isResize={isResize} />);
}

export function SelectionMarker({ x }: { x: number }) {
  return <line x1={x} x2={x} y1={0} y2={CHART_HEIGHT} className="pointer-events-none stroke-foreground" />;
}
