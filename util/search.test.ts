import { describe, expect, test } from "bun:test";
import type { BookEntry } from "../types.ts";
import { normalizeSearchTerm, searchBooks } from "./search.ts";

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
  return {
    uid: "lib:1",
    librarySlug: "lib",
    libraryName: "Library",
    bookId: 1,
    title: "Example Book",
    authors: ["Author"],
    bookPath: "Author/Example Book (1)",
    fileStem: "Example Book",
    epubPath: "/tmp/example.epub",
    addedAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeSearchTerm", () => {
  test("normalizes case and whitespace", () => {
    expect(normalizeSearchTerm("  Ursula   Le Guin ")).toBe("ursula le guin");
  });
});

describe("searchBooks", () => {
  const entries = [
    makeBook({ uid: "main:1", title: "The Left Hand of Darkness", authors: ["Ursula K. Le Guin"], libraryName: "Sci-Fi" }),
    makeBook({ uid: "main:2", bookId: 2, title: "The Dispossessed", authors: ["Ursula K. Le Guin"], libraryName: "Sci-Fi" }),
    makeBook({ uid: "other:3", bookId: 3, title: "Pattern Recognition", authors: ["William Gibson"], libraryName: "Modern Fiction" }),
  ];

  test("matches by title", () => {
    const result = searchBooks(entries, "dispossessed");
    expect(result.map((entry) => entry.uid)).toEqual(["main:2"]);
  });

  test("matches by author", () => {
    const result = searchBooks(entries, "ursula");
    expect(result.map((entry) => entry.uid)).toEqual(["main:1", "main:2"]);
  });

  test("matches by library name", () => {
    const result = searchBooks(entries, "modern fiction");
    expect(result.map((entry) => entry.uid)).toEqual(["other:3"]);
  });

  test("returns empty for blank query", () => {
    expect(searchBooks(entries, "   ")).toEqual([]);
  });
}
