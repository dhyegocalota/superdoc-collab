export function offsetAt(_: { time: number; timeZone: string }): number {
  throw new Error('offsetAt is not implemented');
}

export function zonedBinStartOf(_: { time: number; binMs: number; timeZone: string }): number {
  throw new Error('zonedBinStartOf is not implemented');
}

export function nextZonedBinStart(_: { start: number; binMs: number; timeZone: string }): number {
  throw new Error('nextZonedBinStart is not implemented');
}
