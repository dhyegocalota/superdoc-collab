import { LARGE_BREAKPOINT_PX } from './breakpoints';
import { useMinWidth } from './use-min-width';

export function useIsPhoneLayout(): boolean {
  return !useMinWidth(LARGE_BREAKPOINT_PX);
}
