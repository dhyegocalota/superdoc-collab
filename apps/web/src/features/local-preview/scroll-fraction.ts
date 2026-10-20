export function scrollFractionOf(element: HTMLElement): number {
  const scrollableHeight = element.scrollHeight - element.clientHeight;
  if (scrollableHeight <= 0) return 0;
  return element.scrollTop / scrollableHeight;
}

export function scrollToFraction({ element, fraction }: { element: HTMLElement; fraction: number }): void {
  element.scrollTop = fraction * (element.scrollHeight - element.clientHeight);
}
