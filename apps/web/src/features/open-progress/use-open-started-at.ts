import { useEffect, useState } from 'react';

export function useOpenStartedAt(documentId: string): number {
  const [startedAt, setStartedAt] = useState(Date.now);

  useEffect(() => {
    setStartedAt(Date.now());
  }, [documentId]);

  return startedAt;
}
