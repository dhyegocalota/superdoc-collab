import { escapeXml } from './escape-xml';

export type EditOverhead<Edit> = (options: { edit: Edit; kept: Edit[] }) => number;
export type BudgetedEdit = { inserted: string; deleted: string };

function escapedLength(text: string): number {
  return escapeXml(text).length;
}

function prefixWithin({ text, characters }: { text: string; characters: number }): string {
  const fitted = [...text].reduce<{ prefix: string; used: number; isFull: boolean }>(
    (state, character) => {
      if (state.isFull) return state;
      const size = escapedLength(character);
      if (state.used + size > characters) return { ...state, isFull: true };
      return { prefix: state.prefix + character, used: state.used + size, isFull: false };
    },
    { prefix: '', used: 0, isFull: false },
  );
  return fitted.prefix;
}

function truncateTo<Edit extends BudgetedEdit>({ edit, characters }: { edit: Edit; characters: number }): Edit {
  const inserted = prefixWithin({ text: edit.inserted, characters });
  return { ...edit, inserted, deleted: prefixWithin({ text: edit.deleted, characters: characters - escapedLength(inserted) }) };
}

export function fitEdits<Edit extends BudgetedEdit>({
  edits,
  maxCharacters,
  overheadOf,
}: {
  edits: Edit[];
  maxCharacters: number;
  overheadOf: EditOverhead<Edit>;
}): Edit[] {
  const fitted = edits.reduce<{ kept: Edit[]; left: number }>(
    (budget, edit) => {
      if (budget.left === 0) return budget;
      const overhead = overheadOf({ edit, kept: budget.kept });
      const size = overhead + escapedLength(edit.inserted) + escapedLength(edit.deleted);
      if (size <= budget.left) return { kept: [...budget.kept, edit], left: budget.left - size };
      const room = budget.left - overhead;
      if (room <= 0) return { kept: budget.kept, left: 0 };
      return { kept: [...budget.kept, truncateTo({ edit, characters: room })], left: 0 };
    },
    { kept: [], left: maxCharacters },
  );
  return fitted.kept;
}
