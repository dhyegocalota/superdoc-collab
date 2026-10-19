import { DocumentRole, RoomMode } from '@superdoc-collab/types';
import { renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { openedAs, SESSION_USER } from '@/testing/opened-document';
import { useEditorSetup } from './use-editor-setup';

test('pin: the setup captures the colour slot of the open answer', async () => {
  const opened = { ...openedAs(DocumentRole.Editor, RoomMode.Join), colorSlot: 4 as const };
  const { result } = renderHook(() => useEditorSetup({ opened, user: SESSION_USER, file: new Blob(), generation: 0 }));
  await waitFor(() => expect(result.current?.colorSlot).toBe(4));
});
