import type Database from 'better-sqlite3';

type LastSequenceRow = { document_name: string; last_sequence: number };

const LAST_LOGGED_SEQUENCES = 'SELECT document_name, MAX(sequence) AS last_sequence FROM updates GROUP BY document_name';
const PROJECTED_CURSORS = 'SELECT document_name, last_sequence FROM projection_cursor';
const PREVIEWED_DOCUMENTS = 'SELECT document_name FROM document_previews';

export function findDocumentsToProject({
  historySqlite,
  readModelSqlite,
}: {
  historySqlite: Database.Database;
  readModelSqlite: Database.Database;
}): string[] {
  const cursors = new Map(
    (readModelSqlite.prepare(PROJECTED_CURSORS).all() as LastSequenceRow[]).map((row) => [row.document_name, row.last_sequence]),
  );
  const previewed = new Set(
    (readModelSqlite.prepare(PREVIEWED_DOCUMENTS).all() as { document_name: string }[]).map((row) => row.document_name),
  );
  const logged = historySqlite.prepare(LAST_LOGGED_SEQUENCES).all() as LastSequenceRow[];
  return logged
    .filter((row) => {
      const cursor = cursors.get(row.document_name);
      const isUnprojected = cursor === undefined || row.last_sequence > cursor;
      const isMissingPreview = cursor !== undefined && !previewed.has(row.document_name);
      return isUnprojected || isMissingPreview;
    })
    .map((row) => row.document_name);
}

const DOCUMENTS_WITHOUT_MARKS =
  'SELECT document_name FROM projection_cursor WHERE document_name NOT IN (SELECT document_name FROM version_marks)';

export function findDocumentsWithoutMarks(readModelSqlite: Database.Database): string[] {
  return (readModelSqlite.prepare(DOCUMENTS_WITHOUT_MARKS).all() as { document_name: string }[]).map((row) => row.document_name);
}
