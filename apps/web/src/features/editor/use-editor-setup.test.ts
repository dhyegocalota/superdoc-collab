import { DocumentRole, RoomMode } from '@superdoc-collab/types';
import { renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { openedAs, SESSION_USER } from '@/testing/opened-document';
import { useEditorSetup } from './use-editor-setup';

const TICKET = { attempt: 1, epoch: 'epoch-1' };

test('the setup captures the creator ticket of the open answer', async () => {
  const opened = { ...openedAs(DocumentRole.Editor, RoomMode.Create), creatorAttempt: TICKET.attempt, creatorEpoch: TICKET.epoch };
  const { result } = renderHook(() => useEditorSetup({ opened, user: SESSION_USER, file: new Blob(), generation: 0 }));
  await waitFor(() => expect(result.current?.creatorTicket).toEqual(TICKET));
});

test('the setup has no ticket for a joined room', async () => {
  const opened = openedAs(DocumentRole.Editor, RoomMode.Join);
  const { result } = renderHook(() => useEditorSetup({ opened, user: SESSION_USER, file: new Blob(), generation: 0 }));
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current?.creatorTicket).toBeNull();
});
