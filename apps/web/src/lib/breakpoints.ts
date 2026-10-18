export const MEDIUM_BREAKPOINT_PX = 768;
export const LARGE_BREAKPOINT_PX = 1024;
export const WIDE_BREAKPOINT_PX = 1536;

export function minWidthQuery(pixels: number): string {
  return `(min-width: ${pixels}px)`;
}
