import { CREATOR_RESERVATION_MS, SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { CreatorReservations } from './creator-reservations';

const DOCUMENT_ID = 'document-1';
const FIRST_EDITOR = 'editor-1';
const SECOND_EDITOR = 'editor-2';
const BEFORE_EXPIRY_MS = 10 * SECOND_MS;
const HALF_RESERVATION_MS = CREATOR_RESERVATION_MS / 2;
const PAST_EXPIRY_MS = CREATOR_RESERVATION_MS + SECOND_MS;

type Context = { reservations: CreatorReservations; advance: (milliseconds: number) => void };
type Scenario = { name: string; act: (context: Context) => unknown; expected: unknown };

function contextAt(start: number): Context {
  const clock = { time: start };
  return {
    reservations: new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now: () => clock.time }),
    advance: (milliseconds) => {
      clock.time += milliseconds;
    },
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: 'reserves attempt 1 for the first editor',
    act: ({ reservations }) => reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR }),
    expected: 1,
  },
  {
    name: 'refuses a second editor while the reservation is live',
    act: ({ reservations, advance }) => {
      reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      advance(BEFORE_EXPIRY_MS);
      return reservations.reserve({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR });
    },
    expected: null,
  },
  {
    name: "keeps the holder's attempt on a second open without extending the expiry",
    act: ({ reservations, advance }) => {
      reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      advance(HALF_RESERVATION_MS);
      const reopened = reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      advance(HALF_RESERVATION_MS + SECOND_MS);
      return [reopened, reservations.reserve({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR })];
    },
    expected: [1, 2],
  },
  {
    name: 'passes an expired reservation to the next editor with the next attempt',
    act: ({ reservations, advance }) => {
      reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      advance(PAST_EXPIRY_MS);
      return reservations.reserve({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR });
    },
    expected: 2,
  },
  {
    name: 'refuses writes from the superseded attempt after takeover',
    act: ({ reservations, advance }) => {
      reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      advance(PAST_EXPIRY_MS);
      reservations.reserve({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR });
      return [1, 2].map((attempt) => reservations.mayWrite({ documentId: DOCUMENT_ID, attempt }));
    },
    expected: [false, true],
  },
  {
    name: 'gives the next attempt number after a release',
    act: ({ reservations }) => {
      reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      reservations.release({ documentId: DOCUMENT_ID, attempt: 1 });
      return reservations.reserve({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR });
    },
    expected: 2,
  },
  {
    name: 'starts again at attempt 1 after forget',
    act: ({ reservations }) => {
      reservations.reserve({ documentId: DOCUMENT_ID, userId: FIRST_EDITOR });
      reservations.forget(DOCUMENT_ID);
      return reservations.reserve({ documentId: DOCUMENT_ID, userId: SECOND_EDITOR });
    },
    expected: 1,
  },
];

test.each(SCENARIOS)('$name', ({ act, expected }) => {
  expect(act(contextAt(0))).toEqual(expected);
});
