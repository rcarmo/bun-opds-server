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
    series: undefined,
    description: undefined,
    publishedAt: undefined,
    tags: [],
    bookPath: "Author/Example Book (1)",
    formats: ["EPUB"],
    epubPath: "/tmp/example.epub",
    pdfPath: undefined,
    cbzPath: undefined,
    cbrPath: undefined,
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

  test("prefers title matches over library-only matches", () => {
    const result = searchBooks([
      makeBook({ uid: "libtitle:1", title: "Dune Messiah", libraryName: "Sci-Fi" }),
      makeBook({ uid: "libname:2", bookId: 2, title: "Random Book", libraryName: "Dune Shelf" }),
    ], "dune");
    expect(result.map((entry) => entry.uid)).toEqual(["libtitle:1", "libname:2"]);
  });

  test("matches by author and orders by recency when scores tie", () => {
    const result = searchBooks(entries, "ursula");
    expect(result.map((entry) => entry.uid)).toEqual(["main:2", "main:1"]);
  });

  test("matches comma-form authors regardless of name order", () => {
    const result = searchBooks([
      makeBook({ uid: "author:1", title: "Dark Age", authors: ["Brown, Pierce"] }),
    ], "  PIERCE   BROWN ");
    expect(result.map((entry) => entry.uid)).toEqual(["author:1"]);
  });

  test("matches accidentally split author names across entries", () => {
    const result = searchBooks([
      makeBook({ uid: "author:1", title: "Dark Age", authors: ["Brown", "Pierce"] }),
    ], "Pierce Brown");
    expect(result.map((entry) => entry.uid)).toEqual(["author:1"]);
  });

  test("keeps title matches ranked above unordered author matches", () => {
    const result = searchBooks([
      makeBook({ uid: "author:1", title: "Dark Age", authors: ["Brown, Pierce"] }),
      makeBook({ uid: "title:2", bookId: 2, title: "Pierce Brown", authors: ["Someone Else"] }),
    ], "Pierce Brown");
    expect(result.map((entry) => entry.uid)).toEqual(["title:2", "author:1"]);
  });

  test("matches by library name", () => {
    const result = searchBooks(entries, "modern fiction");
    expect(result.map((entry) => entry.uid)).toEqual(["other:3"]);
  });

  test("matches by tags and series", () => {
    const result = searchBooks([
      makeBook({ uid: "tag:1", title: "Book A", tags: ["space opera"] }),
      makeBook({ uid: "series:2", bookId: 2, title: "Book B", series: "Culture" }),
    ], "culture");
    expect(result.map((entry) => entry.uid)).toEqual(["series:2"]);
  });

  test("returns empty for blank query", () => {
    expect(searchBooks(entries, "   ")).toEqual([]);
  });
});
