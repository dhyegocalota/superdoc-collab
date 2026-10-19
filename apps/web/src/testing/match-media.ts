import { act } from '@testing-library/react';
import { vi } from 'vitest';

type MediaListener = () => void;

export type MatchMediaStub = { notifyChange: () => void };

export function stubMatchMedia({ matches }: { matches: (query: string) => boolean }): MatchMediaStub {
  let listeners: MediaListener[] = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    addEventListener: (_type: string, listener: MediaListener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: MediaListener) => {
      listeners = listeners.filter((registered) => registered !== listener);
    },
  }));
  return { notifyChange: () => act(() => listeners.forEach((listener) => listener())) };
}
