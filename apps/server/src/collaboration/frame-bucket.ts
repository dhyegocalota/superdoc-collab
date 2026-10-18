import type { RawData } from 'ws';

export enum FrameBucket {
  Updates = 'updates',
  Awareness = 'awareness',
}

export function frameBucketOf(frame: RawData): FrameBucket {
  throw new Error(`frameBucketOf is not implemented for ${typeof frame}`);
}
