import type { BookEntry } from "../types.ts";

/** Normalize free-text search input for simple substring matching. */
export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Return books whose title, authors, or library name match the query. */
export function searchBooks(entries: BookEntry[], query: string, limit = 100): BookEntry[] {
  const needle = normalizeSearchTerm(query);
  if (!needle) return [];

  return entries
    .filter((entry) => {
      const haystacks = [
        entry.title,
        entry.libraryName,
        entry.librarySlug,
        ...entry.authors,
      ].map((value) => normalizeSearchTerm(value));
      return haystacks.some((value) => value.includes(needle));
    })
    .slice(0, limit);
}
