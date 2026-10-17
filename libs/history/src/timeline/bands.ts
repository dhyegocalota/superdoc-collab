import { TimelineBandKind, type TimelineBand, type TimelineContributor } from '@superdoc-history/types';
import { runVolume, type EditRun } from './runs';
import { huesByOnset } from './stack';
import { countWords } from './words';

export type BandIdentity = { id: string; kind: TimelineBandKind; name: string };

function runsOf({ runs, bandId }: { runs: EditRun[]; bandId: string }): EditRun[] {
  return runs.filter((run) => run.bandId === bandId);
}

function hueOf({ hues, bandId }: { hues: Map<string, number>; bandId: string }): number | null {
  const hue = hues.get(bandId);
  if (hue === undefined) return null;
  return hue;
}

export function buildBands({
  identities,
  allRuns,
  matchedRuns,
}: {
  identities: BandIdentity[];
  allRuns: EditRun[];
  matchedRuns: EditRun[];
}): TimelineBand[] {
  const present = identities
    .map((identity) => ({ identity, runs: runsOf({ runs: allRuns, bandId: identity.id }) }))
    .filter(({ runs }) => runs.length > 0)
    .map(({ identity, runs }) => ({ ...identity, onsetTime: Math.min(...runs.map((run) => run.firstServerTime)) }));
  const hues = huesByOnset(present.filter((band) => band.kind !== TimelineBandKind.Other));
  return present.map((band) => ({
    ...band,
    hue: hueOf({ hues, bandId: band.id }),
    volume: runsOf({ runs: matchedRuns, bandId: band.id }).reduce((sum, run) => sum + runVolume(run), 0),
  }));
}

function addRun({ contributor, run }: { contributor: TimelineContributor; run: EditRun }): TimelineContributor {
  return {
    ...contributor,
    inserted: contributor.inserted + run.inserted.length,
    deleted: contributor.deleted + run.deleted.length,
    wordsInserted: contributor.wordsInserted + countWords(run.inserted),
    wordsDeleted: contributor.wordsDeleted + countWords(run.deleted),
  };
}

function contributorOf({ byAuthor, authorKey }: { byAuthor: Map<string, TimelineContributor>; authorKey: string }): TimelineContributor {
  const existing = byAuthor.get(authorKey);
  if (existing) return existing;
  return { authorKey, inserted: 0, deleted: 0, wordsInserted: 0, wordsDeleted: 0 };
}

function authorsOfBand({
  totals,
  bandId,
}: {
  totals: Map<string, Map<string, TimelineContributor>>;
  bandId: string;
}): Map<string, TimelineContributor> {
  const existing = totals.get(bandId);
  if (existing) return existing;
  const created = new Map<string, TimelineContributor>();
  totals.set(bandId, created);
  return created;
}

export function byVolumeDescending(left: TimelineContributor, right: TimelineContributor): number {
  return right.inserted + right.deleted - (left.inserted + left.deleted);
}

export function contributorsByBand(runs: EditRun[]): Record<string, TimelineContributor[]> {
  const totals = new Map<string, Map<string, TimelineContributor>>();
  runs.forEach((run) => {
    const byAuthor = authorsOfBand({ totals, bandId: run.bandId });
    run.authorKeys.forEach((key) => byAuthor.set(key, addRun({ contributor: contributorOf({ byAuthor, authorKey: key }), run })));
  });
  return Object.fromEntries([...totals].map(([bandId, byAuthor]) => [bandId, [...byAuthor.values()].sort(byVolumeDescending)]));
}
