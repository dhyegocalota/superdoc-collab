import type { CSSProperties } from 'react';

const HATCH_SIZE = 6;
const HATCH_STRIPE = 2;
const HATCH_ANGLE = 45;

export function agentPatternId(bandId: string): string {
  return `agent-hatch-${bandId}`;
}

export function AgentHatchPattern({
  bandId,
  stripeClassName,
  stripeStyle,
}: {
  bandId: string;
  stripeClassName: string;
  stripeStyle: CSSProperties | undefined;
}) {
  return (
    <pattern
      id={agentPatternId(bandId)}
      width={HATCH_SIZE}
      height={HATCH_SIZE}
      patternUnits="userSpaceOnUse"
      patternTransform={`rotate(${HATCH_ANGLE})`}
    >
      <rect width={HATCH_SIZE} height={HATCH_SIZE} className="fill-background" />
      <rect width={HATCH_STRIPE} height={HATCH_SIZE} className={stripeClassName} style={stripeStyle} />
    </pattern>
  );
}
