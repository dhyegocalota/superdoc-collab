import type { EditRunView } from '@superdoc-history/types';
import type { RefObject } from 'react';
import type { SuperDoc } from 'superdoc';

export function useRunHighlights(_options: { superdocRef: RefObject<SuperDoc | null>; runs: EditRunView[] }): void {}
