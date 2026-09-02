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

/** Reduce text to word tokens for punctuation- and order-insensitive author matching. */
function wordTokens(value: string): string[] {
  return normalizeSearchTerm(value).match(/[\p{L}\p{N}]+/gu) || [];
}

/** Score authors while allowing all query words to appear in any order. */
function scoreAuthors(authors: string[], needle: string): number {
  const orderedScore = Math.max(0, ...authors.map((author) => scoreText(author, needle, 60, 45, 30)), 0);
  const queryTokens = wordTokens(needle);
  const authorTokens = new Set(authors.flatMap(wordTokens));
  const tokenScore = queryTokens.length > 0 && queryTokens.every((token) => authorTokens.has(token)) ? 60 : 0;
  return Math.max(orderedScore, tokenScore);
}

/** Score one book entry, weighting title matches highest. */
export function scoreBook(entry: BookEntry, needle: string): number {
  let score = 0;
  score += scoreText(entry.title, needle, 120, 90, 70);
  score += scoreAuthors(entry.authors, needle);
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
