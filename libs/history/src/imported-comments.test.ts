import { BlockChangeKind } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { IncompleteCommentError, toImportedComments, type ListedComment } from './imported-comments';

const CREATED_TIME = Date.parse('2026-02-13T10:00:00Z');
const COMMENT: ListedComment = {
  id: '0',
  text: 'Please cite a source',
  creatorName: 'Dana Reviewer',
  createdTime: CREATED_TIME,
  target: { segments: [{ blockId: '00000002' }] },
};

test('maps a comment to an imported revision', () => {
  expect(toImportedComments([COMMENT])).toEqual([
    {
      revisionId: 'comment:0',
      kind: BlockChangeKind.Commented,
      authorName: 'Dana Reviewer',
      serverTime: CREATED_TIME,
      blockId: '00000002',
      inserted: 'Please cite a source',
      deleted: '',
    },
  ]);
});

test("a reply without a target takes its parent's block", () => {
  const reply: ListedComment = { id: '1', text: 'Done', creatorName: 'Ana Souza', createdTime: CREATED_TIME, parentCommentId: '0' };
  const [, imported] = toImportedComments([COMMENT, reply]);
  expect(imported).toMatchObject({ revisionId: 'comment:1', authorName: 'Ana Souza', blockId: '00000002' });
});

test('skips tracked-change cards', () => {
  expect(toImportedComments([{ ...COMMENT, trackedChange: true }])).toEqual([]);
});

test('a comment without an author throws naming the comment', () => {
  const anonymous: ListedComment = { ...COMMENT, creatorName: undefined };
  expect(() => toImportedComments([anonymous])).toThrow(IncompleteCommentError);
  expect(() => toImportedComments([anonymous])).toThrow('Comment 0 has no author.');
});

test('a reply whose parent is missing throws', () => {
  const orphan: ListedComment = { id: '2', text: 'Hm', creatorName: 'Ana Souza', createdTime: CREATED_TIME, parentCommentId: '9' };
  expect(() => toImportedComments([orphan])).toThrow('Comment 2 has no target.');
});
