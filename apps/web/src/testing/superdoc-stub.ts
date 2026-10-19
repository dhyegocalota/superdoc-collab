import type { SuperDoc } from 'superdoc';
import { vi } from 'vitest';

export function superdocStub(overrides: Record<string, unknown> = {}): SuperDoc {
  return { on: vi.fn(), off: vi.fn(), ...overrides } as unknown as SuperDoc;
}
