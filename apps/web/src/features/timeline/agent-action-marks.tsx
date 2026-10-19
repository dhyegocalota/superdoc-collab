import type { AgentActionView, EventAuthor } from '@superdoc-collab/types';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { authorOf } from './author-of';
import { GLIDE_TRANSITION_STYLE, TRANSITION_CLASS_NAME, translateXOf } from './streamgraph-motion';
import { agentActionLabel } from './timeline-copy';
import { ALIGNMENT_CLASS, tooltipAlignment, tooltipAnchorLeft, TOOLTIP_WIDTH } from './timeline-tooltip';

const CENTERED_DIAMOND = 'translateX(-50%) rotate(45deg)';

type AgentActionMarksProps = {
  actions: AgentActionView[];
  authors: Record<string, EventAuthor>;
  timeX: (time: number) => number;
  chartWidth: number;
};

function markKey(action: AgentActionView): string {
  return `${action.kind}-${action.createdAt}-${action.authorKey}`;
}

export function AgentActionMarks({ actions, authors, timeX, chartWidth }: AgentActionMarksProps) {
  const tooltipId = useId();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const marks = actions.map((action) => ({
    action,
    key: markKey(action),
    label: agentActionLabel({ name: authorOf({ authors, authorKey: action.authorKey }).name, kind: action.kind }),
    left: timeX(action.createdAt),
  }));
  const active = marks.find((mark) => mark.key === activeKey);

  return (
    <div className="relative h-3" style={{ width: chartWidth }}>
      {marks.map((mark) => (
        <span
          key={mark.key}
          role="img"
          tabIndex={0}
          aria-label={mark.label}
          aria-describedby={active === mark ? tooltipId : undefined}
          className={cn(
            'absolute left-0 top-0.5 size-2 bg-primary outline-none focus-visible:ring-2 focus-visible:ring-ring',
            TRANSITION_CLASS_NAME,
          )}
          style={{ ...GLIDE_TRANSITION_STYLE, transform: `${translateXOf(mark.left)} ${CENTERED_DIAMOND}` }}
          onPointerEnter={() => setActiveKey(mark.key)}
          onPointerLeave={() => setActiveKey(null)}
          onFocus={() => setActiveKey(mark.key)}
          onBlur={() => setActiveKey(null)}
        />
      ))}
      {active && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltipAnchorLeft({ left: active.left, chartWidth }), maxWidth: Math.min(TOOLTIP_WIDTH, chartWidth) }}
          className={cn(
            'pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md',
            ALIGNMENT_CLASS[tooltipAlignment({ left: active.left, chartWidth })],
          )}
        >
          {active.label}
        </div>
      )}
    </div>
  );
}
