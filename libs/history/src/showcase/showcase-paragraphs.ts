import { DAY_MS, HOUR_MS, MINUTE_MS } from '@superdoc-collab/types';
import type { SeedParagraph } from '../seed-docx';
import { SHOWCASE_BURSTS } from './showcase-bursts';
import { SHOWCASE_BASE_TEXTS } from './showcase-content';

export const SHOWCASE_START = '2026-03-02T00:00:00.000Z';

function datedEdits() {
  const startTime = Date.parse(SHOWCASE_START);
  return SHOWCASE_BURSTS.flatMap((burst) => {
    const burstTime = startTime + burst.day * DAY_MS + burst.hour * HOUR_MS + burst.minute * MINUTE_MS;
    return burst.edits.map((edit, index) => ({ ...edit, author: burst.author, time: burstTime + index * MINUTE_MS }));
  });
}

export function buildShowcaseParagraphs({ now }: { now: number }): SeedParagraph[] {
  const edits = datedEdits();
  const lastTime = Math.max(...edits.map((edit) => edit.time));
  const shiftMs = (Math.floor(now / DAY_MS) - 1 - Math.floor(lastTime / DAY_MS)) * DAY_MS;
  return SHOWCASE_BASE_TEXTS.map((text, paragraph) => ({
    text,
    trackedChanges: edits
      .filter((edit) => edit.paragraph === paragraph)
      .map(({ kind, author, time, text: changeText }) => ({
        kind,
        author,
        date: new Date(time + shiftMs).toISOString(),
        text: changeText,
      })),
  }));
}
