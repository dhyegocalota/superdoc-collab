export enum DocumentListKind {
  Mine = 'mine',
  Shared = 'shared',
}

export enum DocumentColumn {
  Title = 'title',
  Owner = 'owner',
  Updated = 'updated',
  Access = 'access',
}

export const COLUMNS_BY_KIND: Record<DocumentListKind, DocumentColumn[]> = {
  [DocumentListKind.Mine]: [DocumentColumn.Title, DocumentColumn.Updated],
  [DocumentListKind.Shared]: [DocumentColumn.Title, DocumentColumn.Owner, DocumentColumn.Updated, DocumentColumn.Access],
};

export const NARROW_HIDDEN_COLUMNS: Record<DocumentListKind, DocumentColumn[]> = {
  [DocumentListKind.Mine]: [],
  [DocumentListKind.Shared]: [DocumentColumn.Owner, DocumentColumn.Updated],
};
