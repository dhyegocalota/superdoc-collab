import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export const WORD_REVEAL_INTERVAL_MS = 40;
const WORD_SEPARATOR = ' ';

type Reveal = { text: string; count: number };

function wordsOf(text: string): string[] {
  return text.split(WORD_SEPARATOR);
}

function revealedCount({ previous, text, isStreaming }: { previous: Reveal | null; text: string; isStreaming: boolean }): number {
  const wordCount = wordsOf(text).length;
  if (previous !== null && text.startsWith(previous.text)) return Math.min(previous.count, wordCount);
  if (isStreaming) return 0;
  return wordCount;
}

export function useWordReveal({ text, isStreaming }: { text: string; isStreaming: boolean }): string {
  const isReducedMotion = useReducedMotion();
  const [reveal, setReveal] = useState<Reveal>({ text, count: revealedCount({ previous: null, text, isStreaming }) });
  const current = reveal.text === text ? reveal : { text, count: revealedCount({ previous: reveal, text, isStreaming }) };
  if (current !== reveal) setReveal(current);
  const words = wordsOf(text);
  const isCatchingUp = !isReducedMotion && current.count < words.length;

  useEffect(() => {
    if (!isCatchingUp) return;
    const timer = setInterval(() => setReveal((previous) => ({ ...previous, count: previous.count + 1 })), WORD_REVEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isCatchingUp, text]);

  if (isReducedMotion) return text;
  return words.slice(0, current.count).join(WORD_SEPARATOR);
}
