import { MAX_TWEENED_BANDS, STREAMGRAPH_TRANSITION_MS } from '@superdoc-collab/types';
import { interpolatePath } from 'd3-interpolate-path';
import { useEffect, useRef, useState } from 'react';
import type { BandShape } from './streamgraph-layout';

const NUMBER_PATTERN = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const CUBIC_EXPONENT = 3;
const SEGMENT_START = 'M';
const WARNING = 'Streamgraph path interpolation failed; the band snaps instead of tweening.';

type PathAt = (eased: number) => string;
type Step = { shape: BandShape; pathAt: PathAt; agentPathAt: PathAt | null; isLeaving: boolean };
type Shown = { shapes: BandShape[]; snapKey: number };

let hasWarned = false;

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** CUBIC_EXPONENT;
}

function baselineOf(path: string): string {
  const verticals = path
    .match(NUMBER_PATTERN)!
    .map(Number)
    .filter((_, position) => position % 2 === 1);
  const middle = verticals.reduce((total, vertical) => total + vertical, 0) / verticals.length;
  let position = 0;
  return path.replace(NUMBER_PATTERN, (coordinate) => {
    const isVertical = position++ % 2 === 1;
    return isVertical ? String(middle) : coordinate;
  });
}

function segmentCountOf(path: string): number {
  return path.split(SEGMENT_START).length;
}

function pathAtOf({ from, to }: { from: string; to: string }): PathAt {
  if (segmentCountOf(from) !== segmentCountOf(to)) return (eased) => (eased <= 0 ? from : to);
  try {
    const interpolate = interpolatePath(from, to);
    return (eased) => {
      if (eased <= 0) return from;
      if (eased >= 1) return to;
      return interpolate(eased);
    };
  } catch {
    if (!hasWarned) console.warn(WARNING);
    hasWarned = true;
    return () => to;
  }
}

function stepOf({ shape, before, isLeaving }: { shape: BandShape; before: BandShape | undefined; isLeaving: boolean }): Step {
  if (isLeaving) {
    return {
      shape,
      pathAt: pathAtOf({ from: shape.path, to: baselineOf(shape.path) }),
      agentPathAt: shape.agentPath === null ? null : pathAtOf({ from: shape.agentPath, to: baselineOf(shape.agentPath) }),
      isLeaving,
    };
  }
  const agentFrom = before && before.agentPath !== null ? before.agentPath : null;
  return {
    shape,
    pathAt: pathAtOf({ from: before ? before.path : baselineOf(shape.path), to: shape.path }),
    agentPathAt:
      shape.agentPath === null
        ? null
        : pathAtOf({ from: agentFrom === null ? baselineOf(shape.agentPath) : agentFrom, to: shape.agentPath }),
    isLeaving,
  };
}

function planOf({ from, to }: { from: BandShape[]; to: BandShape[] }): Step[] {
  const isShown = (shape: BandShape) => to.some((target) => target.band.id === shape.band.id);
  const staying = to.map((shape) => stepOf({ shape, before: from.find((before) => before.band.id === shape.band.id), isLeaving: false }));
  const leaving = from.filter((shape) => !isShown(shape)).map((shape) => stepOf({ shape, before: undefined, isLeaving: true }));
  return [...staying, ...leaving];
}

function frameOf({ plan, progress }: { plan: Step[]; progress: number }): BandShape[] {
  const eased = easeOutCubic(progress);
  return plan
    .filter((step) => !(step.isLeaving && progress >= 1))
    .map((step) => ({
      ...step.shape,
      path: step.pathAt(eased),
      agentPath: step.agentPathAt === null ? null : step.agentPathAt(eased),
    }));
}

export function useTweenedPaths({ shapes, isEnabled, snapKey }: { shapes: BandShape[]; isEnabled: boolean; snapKey: number }): BandShape[] {
  const [shown, setShown] = useState<Shown>({ shapes, snapKey });
  const shownShapes = useRef(shapes);
  const shapesKey = shapes.map((shape) => `${shape.band.id}|${shape.path}|${shape.agentPath}`).join(';');
  const targetKey = useRef(shapesKey);
  const isTweening = isEnabled && shapes.length <= MAX_TWEENED_BANDS;

  function show(next: Shown): void {
    shownShapes.current = next.shapes;
    setShown(next);
  }

  useEffect(() => {
    const isResize = shown.snapKey !== snapKey;
    const isUnchanged = targetKey.current === shapesKey && !isResize;
    targetKey.current = shapesKey;
    if (isUnchanged) return;
    if (!isTweening || isResize) {
      show({ shapes, snapKey });
      return;
    }
    const plan = planOf({ from: shownShapes.current, to: shapes });
    const startedAt = performance.now();
    let frameHandle = 0;
    function step(): void {
      const progress = Math.min(1, (performance.now() - startedAt) / STREAMGRAPH_TRANSITION_MS);
      show({ shapes: frameOf({ plan, progress }), snapKey });
      if (progress < 1) frameHandle = requestAnimationFrame(step);
    }
    step();
    return () => cancelAnimationFrame(frameHandle);
  }, [shapesKey, snapKey, isTweening]);

  if (!isTweening || shown.snapKey !== snapKey) return shapes;
  return shown.shapes;
}
