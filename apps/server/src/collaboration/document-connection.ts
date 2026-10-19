import type { Document } from '@hocuspocus/server';

export type DocumentConnection = Document['connections'] extends Map<unknown, infer Entry> ? Entry : never;
