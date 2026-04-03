import { describe, expect, test } from "bun:test";
import type { BookEntry } from "../types.ts";
import { dedupeByTitle, normalizeTitle, sortByDate } from "./catalog.ts";

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
  return {
    uid: "lib:1",
    librarySlug: "lib",
    libraryName: "Library",
    bookId: 1,
    title: "Example Book",
    authors: ["Author"],
    series: undefined,
    description: undefined,
    publishedAt: undefined,
    tags: [],
    bookPath: "Author/Example Book (1)",
    formats: ["EPUB"],
    epubPath: "/tmp/example.epub",
    pdfPath: undefined,
    addedAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  test("collapses case and whitespace", () => {
    expect(normalizeTitle("  The   Book  Title ")).toBe("the book title");
  });
});

describe("dedupeByTitle", () => {
  test("keeps the newest duplicate title across libraries", () => {
    const older = makeBook({ uid: "lib-a:1", librarySlug: "lib-a", libraryName: "A", title: "Dune", updatedAt: "2026-04-01T00:00:00.000Z" });
    const newer = makeBook({ uid: "lib-b:2", librarySlug: "lib-b", libraryName: "B", bookId: 2, title: "dune", updatedAt: "2026-04-02T00:00:00.000Z" });
    const unique = makeBook({ uid: "lib-c:3", librarySlug: "lib-c", libraryName: "C", bookId: 3, title: "Neuromancer" });

    const deduped = dedupeByTitle([older, newer, unique]);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((entry) => entry.title.toLowerCase() === "dune")?.uid).toBe("lib-b:2");
    expect(deduped.find((entry) => entry.title === "Neuromancer")?.uid).toBe("lib-c:3");
  });

  test("prefers an entry with a cover when timestamps tie", () => {
    const withoutCover = makeBook({ uid: "lib-a:1", title: "Snow Crash", updatedAt: "2026-04-01T00:00:00.000Z", coverPath: undefined });
    const withCover = makeBook({ uid: "lib-b:2", bookId: 2, title: "Snow Crash", updatedAt: "2026-04-01T00:00:00.000Z", coverPath: "/tmp/cover.jpg" });

    const deduped = dedupeByTitle([withoutCover, withCover]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.uid).toBe("lib-b:2");
  });
});

describe("sortByDate", () => {
  test("orders newest first", () => {
    const older = makeBook({ uid: "a:1", updatedAt: "2026-04-01T00:00:00.000Z" });
    const newer = makeBook({ uid: "b:2", bookId: 2, updatedAt: "2026-04-03T00:00:00.000Z" });

    const sorted = sortByDate([older, newer], (entry) => entry.updatedAt);

    expect(sorted.map((entry) => entry.uid)).toEqual(["b:2", "a:1"]);
  });
});
