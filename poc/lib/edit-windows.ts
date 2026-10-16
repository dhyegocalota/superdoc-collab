import type { EditEvent } from './edit-events';

export type WindowRules = {
  idleGapMs: number;
  maxWindowMs: number;
  coEditGapMs: number;
};

export type EditWindow = {
  startSequence: number;
  endSequence: number;
  startTime: number;
  endTime: number;
  authorIds: string[];
  coEdited: boolean;
  insertedCharacters: number;
  deletedCharacters: number;
  events: EditEvent[];
};

function openWindow(event: EditEvent): EditWindow {
  return {
    startSequence: event.sequence,
    endSequence: event.sequence,
    startTime: event.serverTime,
    endTime: event.serverTime,
    authorIds: event.authorIds,
    coEdited: event.authorIds.length > 1,
    insertedCharacters: event.inserted.length,
    deletedCharacters: event.deleted.length,
    events: [event],
  };
}

function extendWindow({ window, event }: { window: EditWindow; event: EditEvent }): EditWindow {
  const authorIds = [...new Set([...window.authorIds, ...event.authorIds])].sort();
  return {
    ...window,
    endSequence: event.sequence,
    endTime: event.serverTime,
    authorIds,
    coEdited: authorIds.length > 1,
    insertedCharacters: window.insertedCharacters + event.inserted.length,
    deletedCharacters: window.deletedCharacters + event.deleted.length,
    events: [...window.events, event],
  };
}

function shouldCut({ window, event, rules }: { window: EditWindow; event: EditEvent; rules: WindowRules }): boolean {
  const gapMs = event.serverTime - window.endTime;
  const isIdle = gapMs > rules.idleGapMs;
  const isTooLong = event.serverTime - window.startTime > rules.maxWindowMs;
  const isNewAuthor = event.authorIds.some((authorId) => !window.authorIds.includes(authorId));
  const isSequentialHandoff = isNewAuthor && gapMs > rules.coEditGapMs;
  return isIdle || isTooLong || isSequentialHandoff;
}

export function groupIntoWindows({ events, rules }: { events: EditEvent[]; rules: WindowRules }): EditWindow[] {
  return events.reduce<EditWindow[]>((windows, event) => {
    const current = windows.at(-1);
    if (!current || shouldCut({ window: current, event, rules })) return [...windows, openWindow(event)];
    return [...windows.slice(0, -1), extendWindow({ window: current, event })];
  }, []);
}
