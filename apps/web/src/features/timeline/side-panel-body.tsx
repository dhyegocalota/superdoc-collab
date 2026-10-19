import type { ReactNode } from 'react';

type SidePanelBodyProps = {
  notices: ReactNode;
  chart: ReactNode;
  filter: ReactNode;
  card: ReactNode;
  edits: ReactNode;
};

export function SidePanelBody({ notices, chart, filter, card, edits }: SidePanelBodyProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      {notices}
      {chart}
      {filter}
      {card}
      {edits}
    </div>
  );
}
