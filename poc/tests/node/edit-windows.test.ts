import { describe, expect, test } from 'vitest';
import { BlockChangeKind, type EditEvent } from '../../lib/edit-events';
import { groupIntoWindows } from '../../lib/edit-windows';

const RULES = { idleGapMs: 1000, maxWindowMs: 10_000, coEditGapMs: 300 };

function event({ sequence, serverTime, authorId }: { sequence: number; serverTime: number; authorId: string }): EditEvent {
  return { sequence, serverTime, authorIds: [authorId], blockId: 'b1', kind: BlockChangeKind.Modified, inserted: 'x', deleted: '' };
}

describe('groupIntoWindows', () => {
  test('cuts on idle gap', () => {
    const windows = groupIntoWindows({ events: [event({ sequence: 1, serverTime: 0, authorId: 'ana' }), event({ sequence: 2, serverTime: 1500, authorId: 'ana' })], rules: RULES });
    expect(windows.map((window) => [window.startSequence, window.endSequence])).toEqual([[1, 1], [2, 2]]);
  });

  test('cuts when a window exceeds the maximum duration', () => {
    const events = Array.from({ length: 30 }, (_, index) => event({ sequence: index + 1, serverTime: index * 500, authorId: 'ana' }));
    const windows = groupIntoWindows({ events, rules: RULES });
    expect(windows.every((window) => window.endTime - window.startTime <= RULES.maxWindowMs)).toBe(true);
    expect(windows).toHaveLength(2);
  });

  test('cuts on a sequential handoff between authors', () => {
    const events = [event({ sequence: 1, serverTime: 0, authorId: 'ana' }), event({ sequence: 2, serverTime: 500, authorId: 'bruno' })];
    expect(groupIntoWindows({ events, rules: RULES }).map((window) => window.authorIds)).toEqual([['ana'], ['bruno']]);
  });

  test('merges interleaved authors into one co-edited window', () => {
    const events = [
      event({ sequence: 1, serverTime: 0, authorId: 'ana' }),
      event({ sequence: 2, serverTime: 100, authorId: 'bruno' }),
      event({ sequence: 3, serverTime: 200, authorId: 'ana' }),
    ];
    const [window] = groupIntoWindows({ events, rules: RULES });
    expect(window.coEdited).toBe(true);
    expect(window.authorIds).toEqual(['ana', 'bruno']);
    expect(window.insertedCharacters).toBe(3);
  });

  test('is deterministic', () => {
    const events = Array.from({ length: 200 }, (_, index) => event({ sequence: index + 1, serverTime: index * 137, authorId: index % 3 === 0 ? 'ana' : 'bruno' }));
    expect(groupIntoWindows({ events, rules: RULES })).toEqual(groupIntoWindows({ events, rules: RULES }));
  });
});
