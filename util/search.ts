import type { BookEntry } from "../types.ts";

/** Normalize free-text search input for simple substring matching. */
export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Score one text field against the query. */
function scoreText(value: string, needle: string, exact: number, prefix: number, contains: number): number {
  const normalized = normalizeSearchTerm(value);
  if (!normalized) return 0;
  if (normalized === needle) return exact;
  if (normalized.startsWith(needle)) return prefix;
  if (normalized.includes(needle)) return contains;
  return 0;
}

/** Score one book entry, weighting title matches highest. */
export function scoreBook(entry: BookEntry, needle: string): number {
  let score = 0;
  score += scoreText(entry.title, needle, 120, 90, 70);
  score += Math.max(0, ...entry.authors.map((author) => scoreText(author, needle, 60, 45, 30)), 0);
  score += entry.series ? scoreText(entry.series, needle, 40, 30, 20) : 0;
  score += Math.max(0, ...entry.tags.map((tag) => scoreText(tag, needle, 20, 15, 10)), 0);
  score += scoreText(entry.libraryName, needle, 10, 8, 5);
  score += scoreText(entry.librarySlug, needle, 8, 6, 4);
  return score;
}

/** Return books ordered by relevance and then recency. */
export function searchBooks(entries: BookEntry[], query: string, limit = 100): BookEntry[] {
  const needle = normalizeSearchTerm(query);
  if (!needle) return [];

  return entries
    .map((entry) => ({
      entry,
      score: scoreBook(entry, needle),
      updated: Date.parse(entry.updatedAt || entry.addedAt || "1970-01-01T00:00:00Z"),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.updated - a.updated || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map((item) => item.entry);
}
