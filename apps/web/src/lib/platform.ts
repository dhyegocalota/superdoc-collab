export enum Platform {
  Mac = 'mac',
  Other = 'other',
}

export function detectPlatform(): Platform {
  throw new Error('detectPlatform is not implemented');
}
