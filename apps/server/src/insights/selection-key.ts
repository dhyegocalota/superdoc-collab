import type { EditSelection } from '@superdoc-collab/types';
import { createHash } from 'node:crypto';

const SELECTION_KEY_ALGORITHM = 'sha256';
const SELECTION_KEY_ENCODING = 'hex';
const TEXT_NORMALIZATION = 'NFC';

function normalizedText(value: string | null): string | null {
  if (value === null) return null;
  return value.trim().normalize(TEXT_NORMALIZATION).toLowerCase();
}

function periodBinMs({ selection, binMs }: { selection: EditSelection; binMs: number }): number | null {
  if (selection.at === null) return null;
  return binMs;
}

export function selectionKeyOf({ selection, binMs }: { selection: EditSelection; binMs: number; timeZone: string }): string {
  const normalized = [
    normalizedText(selection.term),
    normalizedText(selection.author),
    selection.topic,
    selection.at,
    periodBinMs({ selection, binMs }),
  ];
  return createHash(SELECTION_KEY_ALGORITHM).update(JSON.stringify(normalized)).digest(SELECTION_KEY_ENCODING);
}
