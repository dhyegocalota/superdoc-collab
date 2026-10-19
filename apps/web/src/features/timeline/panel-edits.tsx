import type { DocumentTimeline, TimelineBin, TimelineFilter, TopicSummaries } from '@superdoc-collab/types';
import { BinEdits } from './bin-edits';
import { TopEdits } from './top-edits';

type PanelEditsProps = {
  documentId: string;
  timeline: DocumentTimeline;
  selectedBin: TimelineBin | null;
  filter: TimelineFilter;
  summaries: TopicSummaries | undefined;
};

export function PanelEdits({ documentId, timeline, selectedBin, filter, summaries }: PanelEditsProps) {
  if (selectedBin) return <BinEdits documentId={documentId} timeline={timeline} bin={selectedBin} filter={filter} />;
  return <TopEdits timeline={timeline} summaries={summaries} />;
}
