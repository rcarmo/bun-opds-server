import { Database } from "bun:sqlite";
import type { CalibreBookRow, Library } from "../types.ts";
import { EPUB_BOOKS_QUERY } from "./queries.ts";

/** Open a Calibre SQLite database in read-only mode. */
function openReadOnly(dbPath: string): Database {
  return new Database(dbPath, { readonly: true });
}

/** Read EPUB-capable books from one Calibre library. */
export function readLibraryBooks(library: Library): CalibreBookRow[] {
  const db = openReadOnly(library.dbPath);
  try {
    const stmt = db.query<CalibreBookRow, []>(EPUB_BOOKS_QUERY);
    return stmt.all();
  } finally {
    db.close(false);
  }
}
