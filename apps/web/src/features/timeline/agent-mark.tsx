import { Sparkles } from 'lucide-react';
import { agentMarkLabel } from './timeline-copy';

export function AgentMark({ name }: { name: string }) {
  const label = agentMarkLabel(name);
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex align-middle">
      <Sparkles aria-hidden className="size-3" />
    </span>
  );
}
