import { CREATOR_RESERVATION_MAX_MS, CREATOR_RESERVATION_MS, SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { CreatorReservations } from './creator-reservations';

const DOCUMENT_ID = 'document-1';
const FIRST_EDITOR = 'editor-1';
const SECOND_EDITOR = 'editor-2';
const FIRST_ATTEMPT = 1;
const SECOND_ATTEMPT = 2;
const FOREIGN_EPOCH = 'another-process';
const BEFORE_EXPIRY_MS = 10 * SECOND_MS;
const HALF_RESERVATION_MS = CREATOR_RESERVATION_MS / 2;
const NEAR_EXPIRY_MS = 50 * SECOND_MS;
const PAST_EXPIRY_MS = CREATOR_RESERVATION_MS + SECOND_MS;

type Context = {
  reservations: CreatorReservations;
  advance: (milliseconds: number) => void;
  reserveAs: (userId: string) => number | undefined;
  mayWrite: (parameters: { attempt: number | null; isCommitted?: boolean }) => boolean;
};
type Scenario = { name: string; act: (context: Context) => unknown; expected: unknown };

function contextAt(start: number): Context {
  const clock = { time: start };
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time });
  return {
    reservations,
    advance: (milliseconds) => {
      clock.time += milliseconds;
    },
    reserveAs: (userId) => reservations.reserve({ documentId: DOCUMENT_ID, userId })?.attempt,
    mayWrite: ({ attempt, isCommitted = false }) =>
      reservations.mayWrite({ documentId: DOCUMENT_ID, attempt, epoch: reservations.epoch, isCommitted }),
  };
}

function holdUntilCap(context: Context): void {
  context.reserveAs(FIRST_EDITOR);
  context.advance(CREATOR_RESERVATION_MAX_MS - SECOND_MS);
  context.reservations.touch({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
  context.advance(SECOND_MS + 1);
}

const SCENARIOS: Scenario[] = [
  {
    name: 'reserves attempt 1 for the first editor',
    act: ({ reserveAs }) => reserveAs(FIRST_EDITOR),
    expected: FIRST_ATTEMPT,
  },
  {
    name: 'refuses a second editor while the reservation is live',
    act: ({ reserveAs, advance }) => {
      reserveAs(FIRST_EDITOR);
      advance(BEFORE_EXPIRY_MS);
      return reserveAs(SECOND_EDITOR);
    },
    expected: undefined,
  },
  {
    name: "supersedes the holder's own attempt on a second open and still refuses a second editor",
    act: ({ reservations, reserveAs, mayWrite, advance }) => {
      reserveAs(FIRST_EDITOR);
      advance(HALF_RESERVATION_MS);
      const reopened = reserveAs(FIRST_EDITOR);
      return [
        reopened,
        mayWrite({ attempt: FIRST_ATTEMPT }),
        mayWrite({ attempt: SECOND_ATTEMPT }),
        reserveAs(SECOND_EDITOR),
        reservations.attemptOf({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR }),
      ];
    },
    expected: [SECOND_ATTEMPT, false, true, undefined, SECOND_ATTEMPT],
  },
  {
    name: 'passes an expired reservation to the next editor with the next attempt',
    act: ({ reserveAs, advance }) => {
      reserveAs(FIRST_EDITOR);
      advance(PAST_EXPIRY_MS);
      return reserveAs(SECOND_EDITOR);
    },
    expected: SECOND_ATTEMPT,
  },
  {
    name: 'refuses writes from the superseded attempt after takeover',
    act: ({ reserveAs, advance, mayWrite }) => {
      reserveAs(FIRST_EDITOR);
      advance(PAST_EXPIRY_MS);
      reserveAs(SECOND_EDITOR);
      return [FIRST_ATTEMPT, SECOND_ATTEMPT].map((attempt) => mayWrite({ attempt }));
    },
    expected: [false, true],
  },
  {
    name: 'gives the next attempt number after a release',
    act: ({ reservations, reserveAs }) => {
      reserveAs(FIRST_EDITOR);
      reservations.release({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
      return reserveAs(SECOND_EDITOR);
    },
    expected: SECOND_ATTEMPT,
  },
  {
    name: 'starts again at attempt 1 after forget',
    act: ({ reservations, reserveAs }) => {
      reserveAs(FIRST_EDITOR);
      reservations.forget(DOCUMENT_ID);
      return reserveAs(SECOND_EDITOR);
    },
    expected: FIRST_ATTEMPT,
  },
  {
    name: 'the holder reconnects after a drop and keeps attempt 1',
    act: ({ reservations, reserveAs }) => {
      reserveAs(FIRST_EDITOR);
      reservations.release({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
      return reservations.attemptOf({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
    },
    expected: FIRST_ATTEMPT,
  },
  {
    name: 'the dropped holder loses the attempt once another editor reserves',
    act: ({ reservations, reserveAs }) => {
      reserveAs(FIRST_EDITOR);
      reservations.release({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
      reserveAs(SECOND_EDITOR);
      return reservations.attemptOf({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
    },
    expected: null,
  },
  {
    name: 'an update at 50 s extends the expiry',
    act: ({ reservations, reserveAs, advance }) => {
      reserveAs(FIRST_EDITOR);
      advance(NEAR_EXPIRY_MS);
      reservations.touch({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
      advance(NEAR_EXPIRY_MS);
      return reserveAs(SECOND_EDITOR);
    },
    expected: undefined,
  },
  {
    name: 'refuses a claimed attempt from another process epoch',
    act: ({ reservations, reserveAs }) => {
      reserveAs(FIRST_EDITOR);
      return reservations.mayWrite({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT, epoch: FOREIGN_EPOCH, isCommitted: false });
    },
    expected: false,
  },
  {
    name: 'an uncommitted room refuses a socket that claims no attempt',
    act: ({ mayWrite }) => mayWrite({ attempt: null }),
    expected: false,
  },
  {
    name: 'a committed room accepts a socket that claims no attempt and the attempt that committed',
    act: ({ reservations, reserveAs, mayWrite }) => {
      reserveAs(FIRST_EDITOR);
      reservations.commit({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
      return [null, FIRST_ATTEMPT, SECOND_ATTEMPT].map((attempt) => mayWrite({ attempt, isCommitted: true }));
    },
    expected: [true, true, false],
  },
  {
    name: 'a committed room refuses the attempt of an abandoned creator',
    act: ({ reservations, reserveAs, advance, mayWrite }) => {
      reserveAs(FIRST_EDITOR);
      advance(PAST_EXPIRY_MS);
      reserveAs(SECOND_EDITOR);
      reservations.commit({ documentId: DOCUMENT_ID, attempt: SECOND_ATTEMPT });
      return mayWrite({ attempt: FIRST_ATTEMPT, isCommitted: true });
    },
    expected: false,
  },
];

test.each(SCENARIOS)('$name', ({ act, expected }) => {
  expect(act(contextAt(0))).toEqual(expected);
});

test('reserve answers the process epoch, which differs between processes', () => {
  const [first, second] = [contextAt(0), contextAt(0)];
  const ticket = first.reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
  expect(ticket?.epoch).toBe(first.reservations.epoch);
  expect(first.reservations.epoch).not.toBe(second.reservations.epoch);
});

test('touches at 59 second intervals stop extending after the lifetime cap and the next editor takes over', () => {
  const context = contextAt(0);
  const touchInterval = CREATOR_RESERVATION_MS - SECOND_MS;
  context.reserveAs(FIRST_EDITOR);
  const touches = Math.ceil(CREATOR_RESERVATION_MAX_MS / touchInterval);
  Array.from({ length: touches }).forEach(() => {
    context.advance(touchInterval);
    context.reservations.touch({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
  });
  context.advance(touchInterval);
  expect(context.reserveAs(SECOND_EDITOR)).toBe(SECOND_ATTEMPT);
});

test('a holder whose reservation lapsed at the lifetime cap is refused for one reservation period while another editor takes over', () => {
  const context = contextAt(0);
  holdUntilCap(context);
  expect(context.reserveAs(FIRST_EDITOR)).toBeUndefined();
  context.advance(CREATOR_RESERVATION_MS - 1);
  expect(context.reserveAs(FIRST_EDITOR)).toBeUndefined();
  expect(context.reserveAs(SECOND_EDITOR)).toBe(SECOND_ATTEMPT);
});

test('the lapsed holder reserves again once the cooldown has passed and nobody took over', () => {
  const context = contextAt(0);
  holdUntilCap(context);
  context.reserveAs(FIRST_EDITOR);
  context.advance(CREATOR_RESERVATION_MS + 1);
  expect(context.reserveAs(FIRST_EDITOR)).toBe(SECOND_ATTEMPT);
});

test('a holder that releases and reopens at once keeps its original start and still lapses at the cap', () => {
  const context = contextAt(0);
  context.reserveAs(FIRST_EDITOR);
  context.advance(CREATOR_RESERVATION_MAX_MS - SECOND_MS);
  context.reservations.release({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
  expect(context.reserveAs(FIRST_EDITOR)).toBe(SECOND_ATTEMPT);
  context.advance(2 * SECOND_MS);
  expect(context.reserveAs(FIRST_EDITOR)).toBeUndefined();
});

test('a holder that reopens after the release window starts a fresh lifetime', () => {
  const context = contextAt(0);
  context.reserveAs(FIRST_EDITOR);
  context.advance(CREATOR_RESERVATION_MAX_MS - SECOND_MS);
  context.reservations.release({ documentId: DOCUMENT_ID, attempt: FIRST_ATTEMPT });
  context.advance(CREATOR_RESERVATION_MS + SECOND_MS);
  expect(context.reserveAs(FIRST_EDITOR)).toBe(SECOND_ATTEMPT);
  context.advance(CREATOR_RESERVATION_MAX_MS - 2 * SECOND_MS);
  context.reservations.touch({ documentId: DOCUMENT_ID, attempt: SECOND_ATTEMPT });
  expect(context.reserveAs(FIRST_EDITOR)).toBe(3);
});

test('a holder reopening every 59 seconds past the lifetime cap lapses and the next editor takes over', () => {
  const context = contextAt(0);
  const reopenInterval = CREATOR_RESERVATION_MS - SECOND_MS;
  const reopens = Math.ceil(CREATOR_RESERVATION_MAX_MS / reopenInterval) + 1;
  context.reserveAs(FIRST_EDITOR);
  const answers = Array.from({ length: reopens }, () => {
    context.advance(reopenInterval);
    return context.reserveAs(FIRST_EDITOR);
  });
  expect(answers.at(-1)).toBeUndefined();
  expect(context.reserveAs(SECOND_EDITOR)).toBe(reopens);
});
