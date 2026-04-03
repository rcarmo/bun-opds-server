import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BookEntry, CalibreBookRow, Library } from "../types.ts";

/** Normalize timestamps to ISO-ish strings without throwing on bad values. */
function normalizeDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** Split a Calibre GROUP_CONCAT authors field into a clean list. */
function parseAuthors(value?: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

/** Map a raw Calibre row to a merged EPUB book entry if the file exists. */
export function mapRowToBook(library: Library, row: CalibreBookRow): BookEntry | undefined {
  const epubPath = join(library.root, row.book_path, `${row.file_stem}.epub`);
  if (!existsSync(epubPath)) return undefined;

  const coverPath = join(library.root, row.book_path, "cover.jpg");

  return {
    uid: `${library.slug}:${row.book_id}`,
    librarySlug: library.slug,
    libraryName: library.name,
    bookId: row.book_id,
    title: row.title,
    authors: parseAuthors(row.authors),
    bookPath: row.book_path,
    fileStem: row.file_stem,
    epubPath,
    coverPath: existsSync(coverPath) ? coverPath : undefined,
    addedAt: normalizeDate(row.added_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}
