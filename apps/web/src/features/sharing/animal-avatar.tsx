import { PublicAnimal, type AuthorColorSlot } from '@superdoc-collab/types';
import { cn } from '@/lib/utils';

export enum AnimalAvatarSize {
  Small = 24,
  Large = 32,
}

const SIZE_CLASSES: Record<AnimalAvatarSize, string> = {
  [AnimalAvatarSize.Small]: 'size-6 text-sm',
  [AnimalAvatarSize.Large]: 'size-8 text-base',
};

const COLOR_CLASSES: Record<AuthorColorSlot, string> = {
  1: 'bg-author-1',
  2: 'bg-author-2',
  3: 'bg-author-3',
  4: 'bg-author-4',
  5: 'bg-author-5',
  6: 'bg-author-6',
};

export const ANIMAL_ICONS: Record<PublicAnimal, string> = {
  [PublicAnimal.Alligator]: '🐊',
  [PublicAnimal.Badger]: '🦡',
  [PublicAnimal.Beaver]: '🦫',
  [PublicAnimal.Capybara]: '🐹',
  [PublicAnimal.Chameleon]: '🦎',
  [PublicAnimal.Cheetah]: '🐆',
  [PublicAnimal.Dolphin]: '🐬',
  [PublicAnimal.Elephant]: '🐘',
  [PublicAnimal.Fox]: '🦊',
  [PublicAnimal.Giraffe]: '🦒',
  [PublicAnimal.Hedgehog]: '🦔',
  [PublicAnimal.Hippo]: '🦛',
  [PublicAnimal.Iguana]: '🦎',
  [PublicAnimal.Koala]: '🐨',
  [PublicAnimal.Lemur]: '🐒',
  [PublicAnimal.Llama]: '🦙',
  [PublicAnimal.Otter]: '🦦',
  [PublicAnimal.Panda]: '🐼',
  [PublicAnimal.Penguin]: '🐧',
  [PublicAnimal.Platypus]: '🦆',
  [PublicAnimal.Raccoon]: '🦝',
  [PublicAnimal.Squirrel]: '🐿️',
  [PublicAnimal.Tiger]: '🐯',
  [PublicAnimal.Walrus]: '🦭',
};

export function AnimalAvatar({ animal, colorSlot, size }: { animal: PublicAnimal; colorSlot: AuthorColorSlot; size: AnimalAvatarSize }) {
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full', SIZE_CLASSES[size], COLOR_CLASSES[colorSlot])}
    >
      {ANIMAL_ICONS[animal]}
    </span>
  );
}
