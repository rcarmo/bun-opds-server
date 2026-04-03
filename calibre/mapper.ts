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

/** Split a Calibre GROUP_CONCAT field into a clean list. */
function parseList(value?: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

/** Reduce HTML-ish Calibre comments to a compact text summary. */
function normalizeDescription(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

/** Map a raw Calibre row to a merged downloadable book entry if at least one file exists. */
export function mapRowToBook(library: Library, row: CalibreBookRow): BookEntry | undefined {
  const epubPath = row.epub_file_stem ? join(library.root, row.book_path, `${row.epub_file_stem}.epub`) : undefined;
  const pdfPath = row.pdf_file_stem ? join(library.root, row.book_path, `${row.pdf_file_stem}.pdf`) : undefined;
  const hasEpub = Boolean(epubPath && existsSync(epubPath));
  const hasPdf = Boolean(pdfPath && existsSync(pdfPath));
  if (!hasEpub && !hasPdf) return undefined;

  const coverPath = join(library.root, row.book_path, "cover.jpg");
  const formats = parseList(row.formats).map((format) => format.toUpperCase()).filter((format) => (format === "EPUB" && hasEpub) || (format === "PDF" && hasPdf));

  return {
    uid: `${library.slug}:${row.book_id}`,
    librarySlug: library.slug,
    libraryName: library.name,
    bookId: row.book_id,
    title: row.title,
    authors: parseList(row.authors),
    series: row.series || undefined,
    description: normalizeDescription(row.description),
    publishedAt: normalizeDate(row.published_at),
    tags: parseList(row.tags),
    bookPath: row.book_path,
    formats,
    epubPath: hasEpub ? epubPath : undefined,
    pdfPath: hasPdf ? pdfPath : undefined,
    coverPath: existsSync(coverPath) ? coverPath : undefined,
    addedAt: normalizeDate(row.added_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}
