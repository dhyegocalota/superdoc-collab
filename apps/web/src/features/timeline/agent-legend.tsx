import { AGENT_LEGEND_LABEL } from './timeline-copy';

export function AgentLegend() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className="agent-swatch size-2.5 shrink-0 rounded-full" />
      {AGENT_LEGEND_LABEL}
    </p>
  );
}
