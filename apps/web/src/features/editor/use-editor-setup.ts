import type { AuthorColorSlot, DocumentRole, OpenedDocument, RoomMode, SessionUser } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';

export type EditorSetup = {
  roomMode: RoomMode;
  role: DocumentRole;
  user: SessionUser;
  colorSlot: AuthorColorSlot;
  file: Blob;
};

type CapturedSetup = { generation: number; setup: EditorSetup };

export function useEditorSetup({
  opened,
  user,
  file,
  generation,
}: {
  opened: OpenedDocument | undefined;
  user: SessionUser | null;
  file: Blob | undefined;
  generation: number;
}): EditorSetup | null {
  const [captured, setCaptured] = useState<CapturedSetup | null>(null);
  const setup = captured !== null && captured.generation === generation ? captured.setup : null;

  useEffect(() => {
    const canCapture = setup === null && opened !== undefined && user !== null && file !== undefined;
    if (!canCapture) return;
    setCaptured({
      generation,
      setup: {
        roomMode: opened.roomMode,
        role: opened.role,
        user,
        colorSlot: opened.colorSlot,
        file,
      },
    });
  }, [setup, generation, opened, user, file]);

  return setup;
}
