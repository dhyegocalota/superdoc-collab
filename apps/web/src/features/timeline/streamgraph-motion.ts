import { STREAMGRAPH_TRANSITION_MS } from '@superdoc-collab/types';
import type { CSSProperties } from 'react';

const EASE_OUT_CUBIC = 'cubic-bezier(0.215, 0.61, 0.355, 1)';

export const MOTION_CLASS_NAME = 'motion-reduce:transition-none';

export const GLIDE_STYLE: CSSProperties = {
  transitionProperty: 'transform',
  transitionDuration: `${STREAMGRAPH_TRANSITION_MS}ms`,
  transitionTimingFunction: EASE_OUT_CUBIC,
};

export function translateXOf(x: number): string {
  return `translateX(${x}px)`;
}
