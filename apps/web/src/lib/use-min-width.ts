import { minWidthQuery } from './breakpoints';
import { useMediaQuery } from './use-media-query';

export function useMinWidth(pixels: number): boolean {
  return useMediaQuery(minWidthQuery(pixels));
}
