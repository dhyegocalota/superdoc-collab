import { STREAMGRAPH_TRANSITION_MS } from '@superdoc-collab/types';
import type { CSSProperties } from 'react';

const EASE_OUT_CUBIC = 'cubic-bezier(0.215, 0.61, 0.355, 1)';
const DURATION = `${STREAMGRAPH_TRANSITION_MS}ms`;

export const TRANSITION_CLASS_NAME = 'motion-reduce:transition-none';

export const GLIDE_TRANSITION_STYLE: CSSProperties = {
  transitionProperty: 'transform',
  transitionDuration: DURATION,
  transitionTimingFunction: EASE_OUT_CUBIC,
};

export const GLIDE_ANIMATION_STYLE: CSSProperties = {
  animationDuration: DURATION,
  animationTimingFunction: EASE_OUT_CUBIC,
};

export function translateXOf(x: number): string {
  return `translateX(${x}px)`;
}
