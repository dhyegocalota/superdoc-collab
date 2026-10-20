import type { BootstrapProgress, OpenedDocument } from '@superdoc-collab/types';

export type BootstrapReading = BootstrapProgress & { preparingSince: number | null; fileBytes: number | null };

export type OpenedAnswer = Omit<OpenedDocument, 'bootstrap'> & { bootstrap: BootstrapReading };
