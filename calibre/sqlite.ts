import { Database } from "bun:sqlite";
import type { CalibreBookRow, Library } from "../types.ts";
import { EPUB_BOOKS_QUERY } from "./queries.ts";

/** Open a Calibre SQLite database in read-only mode. */
function openReadOnly(dbPath: string): Database {
  return new Database(dbPath, { readonly: true });
}

export interface LibraryReadResult {
  rows: CalibreBookRow[];
  error?: string;
}

/** Read EPUB-capable books from one Calibre library. */
export function readLibraryBooks(library: Library): LibraryReadResult {
  let db: Database | undefined;
  try {
    db = openReadOnly(library.dbPath);
    const stmt = db.query<CalibreBookRow, []>(EPUB_BOOKS_QUERY);
    return { rows: stmt.all() };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db?.close(false);
  }
}
