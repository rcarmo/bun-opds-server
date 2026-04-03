import type { BookEntry } from "../types.ts";

/** Normalize a title for deduplication across libraries. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse an ISO-ish timestamp into a comparable number. */
export function entryTimestamp(entry: BookEntry, pick: (entry: BookEntry) => string | undefined): number {
  return Date.parse(pick(entry) || "1970-01-01T00:00:00Z");
}

/** Sort entries newest-first using the selected timestamp. */
export function sortByDate(entries: BookEntry[], pick: (entry: BookEntry) => string | undefined): BookEntry[] {
  return [...entries].sort((a, b) => entryTimestamp(b, pick) - entryTimestamp(a, pick));
}

/**
 * Deduplicate entries by normalized title, keeping the newest item.
 * Ties are broken by preferring the entry with a cover and then by uid.
 */
export function dedupeByTitle(entries: BookEntry[]): BookEntry[] {
  const chosen = new Map<string, BookEntry>();

  for (const entry of entries) {
    const key = normalizeTitle(entry.title);
    const current = chosen.get(key);
    if (!current) {
      chosen.set(key, entry);
      continue;
    }

    const currentTs = entryTimestamp(current, (item) => item.updatedAt || item.addedAt);
    const nextTs = entryTimestamp(entry, (item) => item.updatedAt || item.addedAt);

    if (nextTs > currentTs) {
      chosen.set(key, entry);
      continue;
    }

    if (nextTs === currentTs) {
      const currentHasCover = Boolean(current.coverPath);
      const nextHasCover = Boolean(entry.coverPath);
      if (nextHasCover && !currentHasCover) {
        chosen.set(key, entry);
        continue;
      }
      if (nextHasCover === currentHasCover && entry.uid.localeCompare(current.uid) < 0) {
        chosen.set(key, entry);
      }
    }
  }

  return [...chosen.values()];
}
