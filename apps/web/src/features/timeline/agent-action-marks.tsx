import type { AgentActionView, EventAuthor } from '@superdoc-history/types';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { authorOf } from './author-of';
import { agentActionLabel } from './timeline-copy';
import { ALIGNMENT_CLASS, tooltipAlignment, tooltipAnchorLeft, TOOLTIP_WIDTH } from './timeline-tooltip';

type AgentActionMarksProps = {
  actions: AgentActionView[];
  authors: Record<string, EventAuthor>;
  timeX: (time: number) => number;
  chartWidth: number;
};

export function AgentActionMarks({ actions, authors, timeX, chartWidth }: AgentActionMarksProps) {
  const tooltipId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const labels = actions.map((action) =>
    agentActionLabel({ name: authorOf({ authors, authorKey: action.authorKey }).name, kind: action.kind }),
  );
  const activeLeft = activeIndex === null ? null : timeX(actions[activeIndex]!.createdAt);

  return (
    <div className="relative h-3" style={{ width: chartWidth }}>
      {actions.map((action, index) => (
        <button
          key={`${action.createdAt}-${index}`}
          type="button"
          aria-label={labels[index]}
          aria-describedby={activeIndex === index ? tooltipId : undefined}
          className="absolute top-0.5 size-2 -translate-x-1/2 rotate-45 bg-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: timeX(action.createdAt) }}
          onPointerEnter={() => setActiveIndex(index)}
          onPointerLeave={() => setActiveIndex(null)}
          onFocus={() => setActiveIndex(index)}
          onBlur={() => setActiveIndex(null)}
        />
      ))}
      {activeIndex !== null && activeLeft !== null && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltipAnchorLeft({ left: activeLeft, chartWidth }), maxWidth: Math.min(TOOLTIP_WIDTH, chartWidth) }}
          className={cn(
            'pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md',
            ALIGNMENT_CLASS[tooltipAlignment({ left: activeLeft, chartWidth })],
          )}
        >
          {labels[activeIndex]}
        </div>
      )}
    </div>
  );
}
