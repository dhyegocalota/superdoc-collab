import { OTHER_BAND_ID } from '@superdoc-collab/types';
import { MAX_TOPICS, type TopicsOutput } from './topic-schema';

export type NormalizedTopic = { name: string; blockIds: string[] };

export function normalizeTopics({ output, knownBlockIds }: { output: TopicsOutput; knownBlockIds: Set<string> }): {
  topics: NormalizedTopic[];
  unknownBlockIds: string[];
} {
  const unknownBlockIds = [...new Set(output.topics.flatMap((topic) => topic.blockIds))].filter((blockId) => !knownBlockIds.has(blockId));
  const claimed = new Set<string>();
  const known = output.topics
    .map((topic) => {
      const blockIds = [...new Set(topic.blockIds)].filter((blockId) => knownBlockIds.has(blockId) && !claimed.has(blockId));
      blockIds.forEach((blockId) => claimed.add(blockId));
      return { name: topic.name, blockIds };
    })
    .filter((topic) => topic.blockIds.length > 0);
  const largest = new Set([...known].sort((left, right) => right.blockIds.length - left.blockIds.length).slice(0, MAX_TOPICS));
  return { topics: known.filter((topic) => largest.has(topic)), unknownBlockIds };
}

export type IdentifiedTopic = NormalizedTopic & { id: string | null };

function sharedBlocks({ blockIds, previousBlockIds }: { blockIds: string[]; previousBlockIds: string[] }): number {
  return blockIds.filter((blockId) => previousBlockIds.includes(blockId)).length;
}

function chosenId({ chosen, index }: { chosen: Map<number, string>; index: number }): string | null {
  const id = chosen.get(index);
  if (id === undefined) return null;
  return id;
}

// NB ADR 0015: a recomputed topic keeps an earlier id when at least half of its blocks were in that earlier topic; otherwise it is new.
export function matchPreviousTopics({
  previous,
  next,
}: {
  previous: { id: string; blockIds: string[] }[];
  next: NormalizedTopic[];
}): IdentifiedTopic[] {
  const candidates = next
    .flatMap((topic, index) =>
      previous.map((old) => ({
        index,
        id: old.id,
        needed: topic.blockIds.length,
        shared: sharedBlocks({ blockIds: topic.blockIds, previousBlockIds: old.blockIds }),
      })),
    )
    .filter((candidate) => candidate.shared * 2 >= candidate.needed)
    .sort((left, right) => right.shared - left.shared);
  const taken = new Set<string>();
  const chosen = new Map<number, string>();
  candidates.forEach((candidate) => {
    const isAlreadyAssigned = taken.has(candidate.id) || chosen.has(candidate.index);
    if (isAlreadyAssigned) return;
    taken.add(candidate.id);
    chosen.set(candidate.index, candidate.id);
  });
  return next.map((topic, index) => ({ ...topic, id: chosenId({ chosen, index }) }));
}

export function assignBlocks(topics: { id: string; blockIds: string[] }[]): Map<string, string> {
  return new Map(topics.flatMap((topic) => topic.blockIds.map((blockId): [string, string] => [blockId, topic.id])));
}

export function topicBandId({ assignment, blockId }: { assignment: Map<string, string>; blockId: string }): string {
  const topicId = assignment.get(blockId);
  if (!topicId) return OTHER_BAND_ID;
  return topicId;
}
