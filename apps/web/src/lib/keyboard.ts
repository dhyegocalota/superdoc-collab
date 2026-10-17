export enum KeyboardKey {
  Escape = 'Escape',
  Enter = 'Enter',
  ArrowLeft = 'ArrowLeft',
  ArrowRight = 'ArrowRight',
  Home = 'Home',
  End = 'End',
}

export function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  return isTextField && target.value !== '';
}
