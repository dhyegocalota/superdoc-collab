import { useEffect, useRef } from 'react';

export function useWindowMessage(handler: (event: MessageEvent) => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      handlerRef.current(event);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
}
