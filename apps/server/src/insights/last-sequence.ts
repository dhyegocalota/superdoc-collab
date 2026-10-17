export function lastSequenceOf(sequences: number[]): number {
  return sequences.reduce((latest, sequence) => Math.max(latest, sequence), 0);
}
