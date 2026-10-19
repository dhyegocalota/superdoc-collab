import { ClientActor, TimelineBandKind, type TimelineBand } from '@superdoc-collab/types';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { AgentHatchPattern, agentPatternId } from './agent-hatch';
import { BandLabel } from './band-label';
import type { BandShape } from './streamgraph-layout';
import type { StreamgraphInteraction } from './use-streamgraph-interaction';
import { bandAriaLabel } from './timeline-copy';

class MissingBandHueError extends Error {}

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

export function StreamgraphBands({
  shapes,
  highlightedBandId,
  describedById,
  bandHandlers,
}: {
  shapes: BandShape[];
  highlightedBandId: string | null;
  describedById: string | undefined;
  bandHandlers: StreamgraphInteraction['bandHandlers'];
}) {
  const focusableBandId = focusableBandIdOf({ shapes, highlightedBandId });
  const agentShapes = shapes.filter((shape) => shape.agentPath !== null);

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
        aria-describedby={describedById}
        {...bandHandlers}
      />
    );
  }

  return (
    <>
      {agentShapes.length > 0 && (
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
      {shapes.map(renderBand)}
      {shapes.map(renderAgentLayer)}
      {shapes
        .filter((shape) => shape.label !== null)
        .map((shape) => (
          <BandLabel key={shape.band.id} name={shape.band.name} x={shape.label!.x} y={shape.label!.y} />
        ))}
    </>
  );
}
