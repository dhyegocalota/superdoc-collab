import type { DocumentTimeline, TimelineContributor, TopicSummaries } from '@superdoc-history/types';
import { ContributorAvatars } from './contributor-avatars';
import { TOP_EDITS_LABEL, wordsDeltaLabel } from './timeline-copy';
import { TopicChip } from './topic-chip';

function sumWords(contributors: TimelineContributor[]): { inserted: number; deleted: number } {
  return contributors.reduce((total, contributor) => ({ inserted: total.inserted + contributor.wordsInserted, deleted: total.deleted + contributor.wordsDeleted }), { inserted: 0, deleted: 0 });
}

export function TopEdits({ timeline, summaries }: { timeline: DocumentTimeline; summaries: TopicSummaries | undefined }) {
  const maxVolume = Math.max(0, ...timeline.bands.map((band) => band.volume));
  const rows = timeline.bands.filter((band) => band.volume > 0).sort((left, right) => right.volume - left.volume);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{TOP_EDITS_LABEL}</h3>
      <ul className="flex flex-col gap-3">
        {rows.map((band) => {
          const contributors = timeline.contributorsByBand[band.id];
          const sentence = summaries?.summaries.find((summary) => summary.topicId === band.id)?.sentence;
          return (
            <li key={band.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <TopicChip band={band} maxVolume={maxVolume} />
                {contributors && <ContributorAvatars contributors={contributors} authors={timeline.authors} />}
              </div>
              {contributors && <p className="text-xs text-muted-foreground">{wordsDeltaLabel(sumWords(contributors))}</p>}
              {sentence && <p className="text-sm">{sentence}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
