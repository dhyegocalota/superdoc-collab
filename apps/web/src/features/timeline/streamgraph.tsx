import { TimelineBandKind, type DocumentTimeline, type TimelineBand } from '@superdoc-history/types';
import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { BandLabel } from './band-label';
import { CHART_HEIGHT, layoutStreamgraph, type BandShape } from './streamgraph-layout';
import { bandAriaLabel, STREAMGRAPH_TITLE, streamgraphDescription } from './timeline-copy';
import { formatTimestamp, TimelineTooltip, TOOLTIP_POINTER_OFFSET } from './timeline-tooltip';

const PRIMARY_BUTTON_PRESSED = 1;

enum NavigationKey {
  Previous = 'ArrowLeft',
  Next = 'ArrowRight',
  First = 'Home',
  Last = 'End',
  Clear = 'Escape',
}

class MissingBandHueError extends Error {}

type StreamgraphProps = {
  timeline: DocumentTimeline;
  width: number;
  selectedIndex: number | null;
  highlightedBandId: string | null;
  onSelectIndex: (index: number) => void;
  onClearSelection: () => void;
};

function nextIndex({ key, selectedIndex, lastIndex }: { key: string; selectedIndex: number | null; lastIndex: number }): number | null {
  if (key === NavigationKey.First) return 0;
  if (key === NavigationKey.Last) return lastIndex;
  if (key === NavigationKey.Next && selectedIndex === null) return 0;
  if (key === NavigationKey.Previous && selectedIndex === null) return lastIndex;
  if (key === NavigationKey.Next) return Math.min(lastIndex, selectedIndex! + 1);
  if (key === NavigationKey.Previous) return Math.max(0, selectedIndex! - 1);
  return null;
}

type TooltipAnchor = { index: number; top: number };

function tooltipAnchorOf({
  hovered,
  selectedIndex,
  hasFocus,
}: {
  hovered: { index: number; y: number } | null;
  selectedIndex: number | null;
  hasFocus: boolean;
}): TooltipAnchor | null {
  if (hovered !== null) return { index: hovered.index, top: hovered.y + TOOLTIP_POINTER_OFFSET };
  if (!hasFocus || selectedIndex === null) return null;
  return { index: selectedIndex, top: TOOLTIP_POINTER_OFFSET };
}

function bandStyle(band: TimelineBand, saturation: number): CSSProperties | undefined {
  if (band.kind === TimelineBandKind.Other) return undefined;
  if (band.hue === null) throw new MissingBandHueError(band.id);
  return { '--topic-hue': String(band.hue), '--topic-saturation': `${saturation}%` } as CSSProperties;
}

export function Streamgraph({ timeline, width, selectedIndex, highlightedBandId, onSelectIndex, onClearSelection }: StreamgraphProps) {
  const titleId = useId();
  const descriptionId = useId();
  const tooltipId = useId();
  const [hovered, setHovered] = useState<{ index: number; y: number } | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const layout = useMemo(() => layoutStreamgraph({ timeline, width }), [timeline, width]);
  const lastIndex = timeline.bins.length - 1;
  const tooltipAnchor = tooltipAnchorOf({ hovered, selectedIndex, hasFocus });
  if (timeline.bins.length === 0) return null;

  function offsetOf(event: PointerEvent<SVGSVGElement>): number {
    return event.clientX - event.currentTarget.getBoundingClientRect().left;
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    onSelectIndex(layout.binAt(offsetOf(event)));
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    const index = layout.binAt(offsetOf(event));
    setHovered({ index, y: event.clientY - event.currentTarget.getBoundingClientRect().top });
    if (event.buttons === PRIMARY_BUTTON_PRESSED) onSelectIndex(index);
  }

  function handleKeyDown(event: KeyboardEvent<SVGPathElement>): void {
    if (event.key === NavigationKey.Clear) {
      event.stopPropagation();
      onClearSelection();
      return;
    }
    const index = nextIndex({ key: event.key, selectedIndex, lastIndex });
    if (index === null) return;
    event.preventDefault();
    onSelectIndex(index);
  }

  function renderBand(shape: BandShape) {
    const isOther = shape.band.kind === TimelineBandKind.Other;
    const isFaded = highlightedBandId !== null && highlightedBandId !== shape.band.id;
    return (
      <path
        key={shape.band.id}
        d={shape.path}
        tabIndex={0}
        aria-label={bandAriaLabel({ name: shape.band.name, volume: shape.band.volume })}
        className={cn(
          isOther ? 'topic-band-other' : 'topic-band',
          'cursor-pointer outline-none focus-visible:stroke-foreground focus-visible:stroke-2',
          isFaded && 'opacity-40',
        )}
        style={bandStyle(shape.band, shape.saturation)}
        aria-describedby={hasFocus && tooltipAnchor !== null ? tooltipId : undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => setHasFocus(true)}
        onBlur={() => setHasFocus(false)}
      />
    );
  }

  return (
    <div className="relative">
      <svg
        width={width}
        height={CHART_HEIGHT}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <title id={titleId}>{STREAMGRAPH_TITLE}</title>
        <desc id={descriptionId}>
          {streamgraphDescription({
            bandCount: timeline.bands.length,
            from: formatTimestamp(timeline.bins[0]!.start),
            to: formatTimestamp(timeline.bins[lastIndex]!.start + timeline.binMs),
          })}
        </desc>
        {layout.shapes.map(renderBand)}
        {layout.shapes
          .filter((shape) => shape.label !== null)
          .map((shape) => (
            <BandLabel key={shape.band.id} name={shape.band.name} x={shape.label!.x} y={shape.label!.y} />
          ))}
        {selectedIndex !== null && (
          <line
            x1={layout.binX(selectedIndex)}
            x2={layout.binX(selectedIndex)}
            y1={0}
            y2={CHART_HEIGHT}
            className="pointer-events-none stroke-foreground"
          />
        )}
      </svg>
      {tooltipAnchor !== null && (
        <TimelineTooltip
          id={tooltipId}
          timeline={timeline}
          index={tooltipAnchor.index}
          left={layout.binX(tooltipAnchor.index)}
          top={tooltipAnchor.top}
          chartWidth={width}
        />
      )}
    </div>
  );
}
