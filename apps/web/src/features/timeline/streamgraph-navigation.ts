import { KeyboardKey } from '@/lib/keyboard';
import { StepDirection, stepOutOfBreaks, type IdleBreak } from './idle-breaks';

export function nextIndex({
  key,
  selectedIndex,
  lastIndex,
  breaks,
}: {
  key: string;
  selectedIndex: number | null;
  lastIndex: number;
  breaks: IdleBreak[];
}): number | null {
  const isStep = key === KeyboardKey.ArrowRight || key === KeyboardKey.ArrowLeft;
  if (key === KeyboardKey.Home) return 0;
  if (key === KeyboardKey.End) return lastIndex;
  if (!isStep) return null;
  if (selectedIndex === null && key === KeyboardKey.ArrowRight) return 0;
  if (selectedIndex === null) return lastIndex;
  if (key === KeyboardKey.ArrowRight)
    return Math.min(lastIndex, stepOutOfBreaks({ breaks, index: selectedIndex + 1, direction: StepDirection.Forward }));
  return Math.max(0, stepOutOfBreaks({ breaks, index: selectedIndex - 1, direction: StepDirection.Backward }));
}
