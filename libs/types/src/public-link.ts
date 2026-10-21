import { z } from 'zod';
import type { SummaryAuthor } from './timeline';
import { AUTHOR_COLOR_SLOT_COUNT, authorColorHash, authorColorSlot, type AuthorColorSlot } from './author-colors';

export const publicFlagSchema = z.object({ isPublic: z.boolean() });

export const PUBLIC_RATE_LIMITED_MESSAGE = 'Too many requests for this public document';
export const PUBLIC_PREPARING_MESSAGE = 'This document is still being prepared';

export enum PublicAccess {
  Member = 'member',
  Visitor = 'visitor',
}

export type PublicFlag = z.infer<typeof publicFlagSchema>;

export enum PublicAnimal {
  Alligator = 'Alligator',
  Badger = 'Badger',
  Beaver = 'Beaver',
  Capybara = 'Capybara',
  Chameleon = 'Chameleon',
  Cheetah = 'Cheetah',
  Dolphin = 'Dolphin',
  Elephant = 'Elephant',
  Fox = 'Fox',
  Giraffe = 'Giraffe',
  Hedgehog = 'Hedgehog',
  Hippo = 'Hippo',
  Iguana = 'Iguana',
  Koala = 'Koala',
  Lemur = 'Lemur',
  Llama = 'Llama',
  Otter = 'Otter',
  Panda = 'Panda',
  Penguin = 'Penguin',
  Platypus = 'Platypus',
  Raccoon = 'Raccoon',
  Squirrel = 'Squirrel',
  Tiger = 'Tiger',
  Walrus = 'Walrus',
}

const ANONYMOUS_NAME_PREFIX = 'Anonymous';
const ANIMALS = Object.values(PublicAnimal);

class UnknownPublicAnimalError extends Error {}

export type PublicViewer = { id: string; name: string; colorSlot: AuthorColorSlot; animal: PublicAnimal | null };

export function anonymousVisitorName(animal: PublicAnimal): string {
  return `${ANONYMOUS_NAME_PREFIX} ${animal}`;
}

export function anonymousViewerOf(visitorId: string): PublicViewer {
  const animal = ANIMALS[Math.floor(authorColorHash(visitorId) / AUTHOR_COLOR_SLOT_COUNT) % ANIMALS.length];
  if (animal === undefined) throw new UnknownPublicAnimalError(visitorId);
  return { id: visitorId, name: anonymousVisitorName(animal), animal, colorSlot: authorColorSlot(visitorId) };
}

export function signedInViewerOf({ visitorId, name }: { visitorId: string; name: string }): PublicViewer {
  return { id: visitorId, name, animal: null, colorSlot: authorColorSlot(visitorId) };
}

export type LatestSummary = { sentence: string; authors: SummaryAuthor[]; computedAtSequence: number; updatedAt: number };

export type PublicDocument = { id: string; title: string };
export type PublicOpened =
  { access: PublicAccess.Member } | { access: PublicAccess.Visitor; document: PublicDocument; viewer: PublicViewer; roomToken: string };
export type PublicSummary = { summary: LatestSummary | null };
