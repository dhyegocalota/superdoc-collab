import type { SuperDoc } from 'superdoc';
import { vi } from 'vitest';

const SUPPORTED_COMMAND = { getState: () => ({ enabled: true, supported: true }), execute: vi.fn() };

export function superdocStub(overrides: Record<string, unknown> = {}): SuperDoc {
  return { on: vi.fn(), off: vi.fn(), ui: { commands: { get: () => SUPPORTED_COMMAND } }, ...overrides } as unknown as SuperDoc;
}
