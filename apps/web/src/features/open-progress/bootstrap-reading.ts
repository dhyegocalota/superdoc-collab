import type { BootstrapProgress } from '@superdoc-collab/types';

export type BootstrapReading = BootstrapProgress & { preparingElapsedMs: number | null };
