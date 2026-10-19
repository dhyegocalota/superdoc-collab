import { DAY_MS, MINUTE_MS } from '@superdoc-collab/types';
import { TrackedChangeKind, type SeedParagraph, type SeedTrackedChange } from '../seed-docx';
import { SHOWCASE_BASE_TEXTS } from './showcase-content';
import { SHOWCASE_DELETION_LEAD, SHOWCASE_OBJECTS, SHOWCASE_QUALIFIERS, SHOWCASE_SUBJECTS, SHOWCASE_VERBS } from './showcase-phrases';
import { SHOWCASE_SESSIONS } from './showcase-sessions';

export const SHOWCASE_START = '2026-03-02T00:00:00.000Z';
const SLOWEST_INTERVAL_MINUTES = 15;
const INTERVAL_SWING_MINUTES = 9;
const DELETION_EVERY = 4;
const PARAGRAPH_STRIDE = 7;
const OBJECT_STRIDE = 5;
const SUBJECT_STRIDE = 3;
const PHRASES_PER_VERB = 16;

type DatedEdit = { time: number; paragraph: number; change: Omit<SeedTrackedChange, 'date'> };

function densityOf(progress: number): number {
  return Math.sin(Math.PI * progress);
}

function phraseOf({ kind, count, density }: { kind: TrackedChangeKind; count: number; density: number }): string {
  const lap = Math.floor(count / PHRASES_PER_VERB);
  const object = SHOWCASE_OBJECTS[(count * OBJECT_STRIDE + lap) % SHOWCASE_OBJECTS.length]!;
  if (kind === TrackedChangeKind.Delete) return `${SHOWCASE_DELETION_LEAD}${object}.`;
  const subject = SHOWCASE_SUBJECTS[(count * SUBJECT_STRIDE + Math.floor(count / SHOWCASE_SUBJECTS.length)) % SHOWCASE_SUBJECTS.length]!;
  const verb = SHOWCASE_VERBS[(count + lap) % SHOWCASE_VERBS.length]!;
  const qualifier = SHOWCASE_QUALIFIERS[Math.floor(density * (SHOWCASE_QUALIFIERS.length - 1))]!;
  return ` ${subject} ${verb} ${object}${qualifier}.`;
}

function offsetsOf({ offset, durationMinutes }: { offset: number; durationMinutes: number }): number[] {
  if (offset > durationMinutes) return [];
  const interval = Math.round(SLOWEST_INTERVAL_MINUTES - INTERVAL_SWING_MINUTES * densityOf(offset / durationMinutes));
  return [offset, ...offsetsOf({ offset: offset + interval, durationMinutes })];
}

function datedEdits(): DatedEdit[] {
  const startTime = Date.parse(SHOWCASE_START);
  return SHOWCASE_SESSIONS.flatMap((session) =>
    offsetsOf({ offset: 0, durationMinutes: session.durationMinutes }).map((offset) => ({ session, offset })),
  ).map(({ session, offset }, index) => {
    const density = densityOf(offset / session.durationMinutes);
    const kind = index % DELETION_EVERY === DELETION_EVERY - 1 ? TrackedChangeKind.Delete : TrackedChangeKind.Insert;
    const author = session.authors[(index + session.day) % session.authors.length]!;
    const paragraph = (index * PARAGRAPH_STRIDE + session.day) % SHOWCASE_BASE_TEXTS.length;
    const time = startTime + session.day * DAY_MS + (session.startMinute + offset) * MINUTE_MS;
    return { time, paragraph, change: { kind, author, text: phraseOf({ kind, count: index, density }) } };
  });
}

export function buildShowcaseParagraphs({ now }: { now: number }): SeedParagraph[] {
  const edits = datedEdits();
  const lastTime = Math.max(...edits.map(({ time }) => time));
  const shiftMs = (Math.floor(now / DAY_MS) - 1 - Math.floor(lastTime / DAY_MS)) * DAY_MS;
  return SHOWCASE_BASE_TEXTS.map((text, paragraph) => ({
    text,
    trackedChanges: edits
      .filter((edit) => edit.paragraph === paragraph)
      .map(({ time, change }) => ({ ...change, date: new Date(time + shiftMs).toISOString() })),
  }));
}
