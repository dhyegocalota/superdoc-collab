import { MINUTE_MS, OTHER_BAND_ID, TimelineBandKind, TopicState, type DocumentTimeline, type TimelineBand } from '@superdoc-collab/types';

const FIRST_BIN_START = 1_792_165_200_000;
const HUE_START = 205;
const HUE_END = 25;
export const FIXTURE_AUTHOR_KEY = 'ana';
export const FIXTURE_AUTHOR_NAME = 'Ana';

function bandOf({
  name,
  kind,
  index,
  count,
  volume,
}: {
  name: string;
  kind: TimelineBandKind;
  index: number;
  count: number;
  volume: number;
}): TimelineBand {
  const isOther = kind === TimelineBandKind.Other;
  const hue = isOther ? null : HUE_START + ((HUE_END - HUE_START) * index) / Math.max(1, count - 1);
  return { id: isOther ? OTHER_BAND_ID : `band-${index}`, kind, name, hue, onsetTime: FIRST_BIN_START + index, volume };
}

export function timelineWith({
  volumes,
  names,
  kinds = names.map(() => TimelineBandKind.Topic),
}: {
  volumes: number[][];
  names: string[];
  kinds?: TimelineBandKind[];
}): DocumentTimeline {
  const bands = names.map((name, index) =>
    bandOf({ name, kind: kinds[index]!, index, count: names.length, volume: volumes.reduce((sum, row) => sum + row[index]!, 0) }),
  );
  const bins = volumes.map((row, binIndex) => ({
    start: FIRST_BIN_START + binIndex * MINUTE_MS,
    end: FIRST_BIN_START + (binIndex + 1) * MINUTE_MS,
    versionSequence: null,
    byBand: Object.fromEntries(
      bands.map((band, index) => [band.id, { inserted: row[index]!, deleted: 0, authorKeys: [FIXTURE_AUTHOR_KEY] }]),
    ),
  }));
  return {
    binMs: MINUTE_MS,
    bins,
    bands,
    contributorsByBand: {},
    authors: { [FIXTURE_AUTHOR_KEY]: { id: 'user-1', name: FIXTURE_AUTHOR_NAME } },
    topics: { state: TopicState.Ready, failure: null, computedAtSequence: 1 },
    projection: { isBehind: false, lagMs: null, isDegraded: false, cursor: 1 },
  };
}
