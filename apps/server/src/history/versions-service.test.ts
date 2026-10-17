import { expect, test } from 'vitest';
import { keysOfDocument, marksAround, VERSION_MARKS_AROUND } from './versions-service';

const MARK_COUNT = 30;
const marks = Array.from({ length: MARK_COUNT }, (_, index) => ({
  sequence: (index + 1) * 10,
  serverTime: index,
  minuteStart: 0,
  isBootstrap: false,
}));

test('keysOfDocument keeps only the keys of that document', () => {
  expect(keysOfDocument({ keys: ['d1/1', 'd10/1', 'd1/20'], documentId: 'd1' })).toEqual(['d1/1', 'd1/20']);
});

test('marksAround centres on the last mark at or before the sequence', () => {
  expect(marksAround({ marks, sequence: 155 }).map((mark) => mark.sequence)).toEqual(
    marks.slice(14 - VERSION_MARKS_AROUND, 14 + VERSION_MARKS_AROUND + 1).map((mark) => mark.sequence),
  );
});

test('marksAround before the first mark starts at the first mark', () => {
  expect(marksAround({ marks, sequence: 0 })).toEqual(marks.slice(0, VERSION_MARKS_AROUND + 1));
});
