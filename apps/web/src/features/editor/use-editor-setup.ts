import type { DocumentRole, OpenedDocument, RoomMode, SessionUser } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';
import { type CreatorTicket, creatorTicketOf } from './collaboration-config';

export type EditorSetup = { roomMode: RoomMode; role: DocumentRole; creatorTicket: CreatorTicket | null; user: SessionUser; file: Blob };

export function useEditorSetup({
  opened,
  user,
  file,
}: {
  opened: OpenedDocument | undefined;
  user: SessionUser | null;
  file: Blob | undefined;
}): EditorSetup | null {
  const [setup, setSetup] = useState<EditorSetup | null>(null);

  useEffect(() => {
    const canCapture = setup === null && opened !== undefined && user !== null && file !== undefined;
    if (!canCapture) return;
    setSetup({ roomMode: opened.roomMode, role: opened.role, creatorTicket: creatorTicketOf(opened), user, file });
  }, [setup, opened, user, file]);

  return setup;
}
