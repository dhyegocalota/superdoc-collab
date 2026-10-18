import { vi } from 'vitest';

export const WIDE_VIEWPORT_WIDTH = 1280;
export const NARROW_VIEWPORT_WIDTH = 768;
export const PHONE_VIEWPORT_WIDTH = 640;

export function stubViewportWidth(width: number): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const minimumWidth = Number(/min-width:\s*(\d+)px/.exec(query)?.[1]);
    return {
      matches: width >= minimumWidth,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
  });
}
