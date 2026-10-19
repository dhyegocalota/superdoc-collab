import type { SuperDoc } from 'superdoc';
import { ShortcutActionKind, type ShortcutDefinition } from './shortcuts';

export function commandHandleOf({ superdoc, commandId }: { superdoc: SuperDoc | null; commandId: string }) {
  if (!superdoc) return null;
  const handle = superdoc.ui.commands.get(commandId);
  return handle.getState().supported ? handle : null;
}

export function isShortcutAvailable({ definition, superdoc }: { definition: ShortcutDefinition; superdoc: SuperDoc | null }): boolean {
  const { action } = definition;
  if (action.kind !== ShortcutActionKind.Command || !superdoc) return true;
  return commandHandleOf({ superdoc, commandId: action.commandId }) !== null;
}
