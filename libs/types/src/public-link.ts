import { z } from 'zod';
import type { AuthorColorSlot } from './author-colors';

export const publicFlagSchema = z.object({ isPublic: z.boolean() });

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

export type PublicViewer = { id: string; name: string; colorSlot: AuthorColorSlot; animal: PublicAnimal | null };

export function anonymousViewerOf(visitorId: string): PublicViewer {
  throw new Error(`anonymousViewerOf is not implemented for ${visitorId}`);
}

export function signedInViewerOf({ visitorId, name }: { visitorId: string; name: string }): PublicViewer {
  throw new Error(`signedInViewerOf is not implemented for ${visitorId} ${name}`);
}
