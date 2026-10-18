import { ClientActor, TimelineBandKind, type DocumentTimeline, type TimelineBand } from '@superdoc-collab/types';
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { formatBinMoment, formatTimestamp } from '@/lib/format-date-time';
import { KeyboardKey } from '@/lib/keyboard';
import { PRIMARY_BUTTON_PRESSED } from '@/lib/pointer';
import { cn } from '@/lib/utils';
import { AgentActionMarks } from './agent-action-marks';
import { AgentHatchPattern, agentPatternId } from './agent-hatch';
import { AgentLegend } from './agent-legend';
import { BandLabel } from './band-label';
import { maxBandVolume } from './max-band-volume';
import { CHART_HEIGHT, layoutStreamgraph, type BandShape } from './streamgraph-layout';
import { StreamgraphLegend } from './streamgraph-legend';
import { bandAriaLabel, CHART_HINT, STREAMGRAPH_TITLE, streamgraphDescription } from './timeline-copy';
import { TimelineTooltip, TOOLTIP_POINTER_OFFSET } from './timeline-tooltip';

class MissingBandHueError extends Error {}

type StreamgraphProps = {
  timeline: DocumentTimeline;
  width: number;
  selectedIndex: number | null;
  highlightedBandId: string | null;
  isLoadingVersion: boolean;
  onSelectIndex: (index: number) => void;
  onClearSelection: () => void;
};

function nextIndex({ key, selectedIndex, lastIndex }: { key: string; selectedIndex: number | null; lastIndex: number }): number | null {
  const isStep = key === KeyboardKey.ArrowRight || key === KeyboardKey.ArrowLeft;
  if (key === KeyboardKey.Home) return 0;
  if (key === KeyboardKey.End) return lastIndex;
  if (!isStep) return null;
  if (selectedIndex === null && key === KeyboardKey.ArrowRight) return 0;
  if (selectedIndex === null) return lastIndex;
  if (key === KeyboardKey.ArrowRight) return Math.min(lastIndex, selectedIndex + 1);
  return Math.max(0, selectedIndex - 1);
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

function focusableBandIdOf({ shapes, highlightedBandId }: { shapes: BandShape[]; highlightedBandId: string | null }): string | null {
  const highlighted = shapes.find((shape) => shape.band.id === highlightedBandId);
  if (highlighted) return highlighted.band.id;
  const [first] = shapes;
  if (!first) return null;
  return first.band.id;
}

function bandStyle(band: TimelineBand, saturation: number): CSSProperties | undefined {
  if (band.kind === TimelineBandKind.Other) return undefined;
  if (band.hue === null) throw new MissingBandHueError(band.id);
  return { '--topic-hue': String(band.hue), '--topic-saturation': `${saturation}%` } as CSSProperties;
}

export function Streamgraph({
  timeline,
  width,
  selectedIndex,
  highlightedBandId,
  isLoadingVersion,
  onSelectIndex,
  onClearSelection,
}: StreamgraphProps) {
  const { timeZone } = timeline;
  const titleId = useId();
  const descriptionId = useId();
  const tooltipId = useId();
  const [hovered, setHovered] = useState<{ index: number; y: number } | null>(null);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const isPointerFocus = useRef(false);
  const layout = useMemo(() => layoutStreamgraph({ timeline, width }), [timeline, width]);
  const lastIndex = timeline.bins.length - 1;
  const tooltipAnchor = tooltipAnchorOf({ hovered, selectedIndex, hasFocus: hasKeyboardFocus });
  if (timeline.bins.length === 0) return null;
  const maxVolume = maxBandVolume(timeline);
  const focusableBandId = focusableBandIdOf({ shapes: layout.shapes, highlightedBandId });
  const agentShapes = layout.shapes.filter((shape) => shape.agentPath !== null);
  const hasAgentLayer = agentShapes.length > 0;
  const hasUnlabelledBand = layout.shapes.some((shape) => shape.label === null);
  const firstMoment = timeline.bins[0]!.start;
  const lastMoment = timeline.bins[lastIndex]!.end;

  function offsetOf(event: PointerEvent<SVGSVGElement>): number {
    return event.clientX - event.currentTarget.getBoundingClientRect().left;
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    isPointerFocus.current = true;
    setHasKeyboardFocus(false);
    if (isLoadingVersion) return;
    onSelectIndex(layout.binAt(offsetOf(event)));
  }

  function endPointerPress(): void {
    isPointerFocus.current = false;
  }

  function handlePointerLeave(): void {
    endPointerPress();
    setHovered(null);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    const index = layout.binAt(offsetOf(event));
    setHovered({ index, y: event.clientY - event.currentTarget.getBoundingClientRect().top });
    const isScrubbing = event.buttons === PRIMARY_BUTTON_PRESSED && !isLoadingVersion;
    if (isScrubbing) onSelectIndex(index);
  }

  function handleFocus(): void {
    setHasKeyboardFocus(!isPointerFocus.current);
  }

  function handleBlur(): void {
    isPointerFocus.current = false;
    setHasKeyboardFocus(false);
  }

  function handleKeyDown(event: KeyboardEvent<SVGPathElement>): void {
    isPointerFocus.current = false;
    setHasKeyboardFocus(true);
    if (event.key === KeyboardKey.Escape) {
      event.stopPropagation();
      onClearSelection();
      return;
    }
    const index = nextIndex({ key: event.key, selectedIndex, lastIndex });
    if (index === null) return;
    event.preventDefault();
    onSelectIndex(index);
  }

  function isFadedBand(shape: BandShape): boolean {
    return highlightedBandId !== null && highlightedBandId !== shape.band.id;
  }

  function renderAgentLayer(shape: BandShape) {
    if (shape.agentPath === null) return null;
    return (
      <path
        key={shape.band.id}
        d={shape.agentPath}
        data-actor={ClientActor.Agent}
        fill={`url(#${agentPatternId(shape.band.id)})`}
        aria-hidden
        className={cn('pointer-events-none', isFadedBand(shape) && 'opacity-40')}
      />
    );
  }

  function renderBand(shape: BandShape) {
    const isOther = shape.band.kind === TimelineBandKind.Other;
    const isFaded = isFadedBand(shape);
    return (
      <path
        key={shape.band.id}
        d={shape.path}
        tabIndex={shape.band.id === focusableBandId ? 0 : -1}
        aria-label={bandAriaLabel({ name: shape.band.name, volume: shape.band.volume })}
        data-faded={isFaded}
        className={cn(
          isOther ? 'topic-band-other' : 'topic-band',
          'cursor-pointer outline-none focus-visible:stroke-foreground focus-visible:stroke-2',
          isFaded && 'opacity-40',
        )}
        style={bandStyle(shape.band, shape.saturation)}
        aria-describedby={hasKeyboardFocus && tooltipAnchor !== null ? tooltipId : undefined}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  }

  return (
    <div aria-busy={isLoadingVersion} className="relative flex flex-col gap-1">
      <svg
        width={width}
        height={CHART_HEIGHT}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerPress}
        onPointerLeave={handlePointerLeave}
      >
        <title id={titleId}>{STREAMGRAPH_TITLE}</title>
        <desc id={descriptionId}>
          {streamgraphDescription({
            bandCount: timeline.bands.length,
            from: formatTimestamp({ time: firstMoment, timeZone }),
            to: formatTimestamp({ time: lastMoment, timeZone }),
          })}
        </desc>
        {hasAgentLayer && (
          <defs>
            {agentShapes.map((shape) => (
              <AgentHatchPattern
                key={shape.band.id}
                bandId={shape.band.id}
                stripeClassName={shape.band.kind === TimelineBandKind.Other ? 'topic-band-other' : 'topic-band'}
                stripeStyle={bandStyle(shape.band, shape.saturation)}
              />
            ))}
          </defs>
        )}
        {layout.shapes.map(renderBand)}
        {layout.shapes.map(renderAgentLayer)}
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
      {timeline.agentActions.length > 0 && (
        <AgentActionMarks actions={timeline.agentActions} authors={timeline.authors} timeX={layout.timeX} chartWidth={width} />
      )}
      <div className="flex justify-between text-xs text-muted-foreground">
        <time dateTime={new Date(firstMoment).toISOString()}>
          {formatBinMoment({ time: firstMoment, binMs: timeline.binMs, timeZone })}
        </time>
        <time dateTime={new Date(lastMoment).toISOString()}>{formatBinMoment({ time: lastMoment, binMs: timeline.binMs, timeZone })}</time>
      </div>
      {hasUnlabelledBand && <StreamgraphLegend bands={layout.shapes.map((shape) => shape.band)} maxVolume={maxVolume} />}
      {hasAgentLayer && <AgentLegend />}
      <p className="text-xs text-muted-foreground">{CHART_HINT}</p>
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
