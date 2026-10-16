import type Database from 'better-sqlite3';

type LastSequenceRow = { document_name: string; last_sequence: number };

const LAST_LOGGED_SEQUENCES = 'SELECT document_name, MAX(sequence) AS last_sequence FROM updates GROUP BY document_name';
const PROJECTED_CURSORS = 'SELECT document_name, last_sequence FROM projection_cursor';

export function findDocumentsToProject({ historySqlite, readModelSqlite }: { historySqlite: Database.Database; readModelSqlite: Database.Database }): string[] {
  const cursors = new Map((readModelSqlite.prepare(PROJECTED_CURSORS).all() as LastSequenceRow[]).map((row) => [row.document_name, row.last_sequence]));
  const logged = historySqlite.prepare(LAST_LOGGED_SEQUENCES).all() as LastSequenceRow[];
  return logged
    .filter((row) => {
      const cursor = cursors.get(row.document_name);
      return cursor === undefined || row.last_sequence > cursor;
    })
    .map((row) => row.document_name);
}
