import { useEffect, useRef } from 'react';
import { KeyboardKey } from './keyboard';

export function useEscapeKey({ isEnabled, onEscape }: { isEnabled: boolean; onEscape: (event: KeyboardEvent) => void }): void {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isEnabled) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== KeyboardKey.Escape || event.defaultPrevented) return;
      onEscapeRef.current(event);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
