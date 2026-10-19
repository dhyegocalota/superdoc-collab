export function createRetainedHeapReader(parameters: { memoryUsage: () => NodeJS.MemoryUsage; collectGarbage: () => void }): () => number {
  void parameters;
  throw new Error('createRetainedHeapReader is not implemented');
}
