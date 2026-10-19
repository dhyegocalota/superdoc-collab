import { HistoryIllustration } from '@/components/history-illustration';
import { EMPTY_PANEL_DESCRIPTION, NO_EDITS_YET_MESSAGE } from './timeline-copy';

export const PANEL_EMPTY_STATE_TEST_ID = 'panel-empty-state';

export function PanelEmptyState() {
  return (
    <section
      data-testid={PANEL_EMPTY_STATE_TEST_ID}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-4 pb-4 text-center"
    >
      <HistoryIllustration className="max-w-32" />
      <h3 className="text-sm font-medium">{NO_EDITS_YET_MESSAGE}</h3>
      <p className="text-sm text-muted-foreground">{EMPTY_PANEL_DESCRIPTION}</p>
    </section>
  );
}
