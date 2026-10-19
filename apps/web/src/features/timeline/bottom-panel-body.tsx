import type { ReactNode } from 'react';
import { PanelColumn } from './panel-layout';

type BottomPanelBodyProps = {
  isStackedLayout: boolean;
  notices: ReactNode;
  chart: ReactNode;
  header: ReactNode;
  filter: ReactNode;
  card: ReactNode;
  edits: ReactNode;
};

const COLUMN_CLASS = 'contents md:flex md:min-h-0 md:min-w-0 md:flex-col md:gap-3 md:overflow-y-auto';

export function BottomPanelBody({ isStackedLayout, notices, chart, header, filter, card, edits }: BottomPanelBodyProps) {
  return (
    <div
      data-panel-body
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-6 md:overflow-hidden"
    >
      <div data-column={PanelColumn.Chart} className={COLUMN_CLASS}>
        {chart}
        {isStackedLayout && header}
        {filter}
      </div>
      <div data-column={PanelColumn.List} className={COLUMN_CLASS}>
        {!isStackedLayout && header}
        {notices}
        {card}
        {edits}
      </div>
    </div>
  );
}
