import { describe, expect, test } from "bun:test";
import { renderBookListPage } from "./html.ts";
import type { BookEntry } from "../types.ts";
import type { PageInfo } from "../util/pagination.ts";

const entry: BookEntry = {
  uid: "main:7",
  librarySlug: "main",
  libraryName: "Main",
  bookId: 7,
  title: "Dune",
  authors: ["Frank Herbert"],
  series: "Dune",
  description: "Epic science fiction novel on Arrakis.",
  publishedAt: "1965-01-01T00:00:00.000Z",
  tags: ["science fiction", "classic"],
  bookPath: "Herbert, Frank/Dune (7)",
  formats: ["EPUB", "PDF", "CBZ", "CBR"],
  epubPath: "/books/dune.epub",
  pdfPath: "/books/dune.pdf",
  cbzPath: "/books/dune.cbz",
  cbrPath: "/books/dune.cbr",
  coverPath: "/books/cover.jpg",
  addedAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z",
};

const pageInfo: PageInfo = {
  page: 1,
  pageSize: 100,
  offset: 0,
  totalPages: 2,
  totalItems: 150,
};

describe("renderBookListPage", () => {
  test("renders constrained covers, metadata, and download link", () => {
    const html = renderBookListPage("Recent", [entry], pageInfo, "/browse/recent");
    expect(html).toContain("Download EPUB");
    expect(html).toContain("Download PDF");
    expect(html).toContain("Download CBZ");
    expect(html).toContain("Download CBR");
    expect(html).toContain("Frank Herbert");
    expect(html).toContain("Series:");
    expect(html).toContain("science fiction");
    expect(html).toContain("Formats:");
    expect(html).toContain("max-height: 144px");
    expect(html).toContain("/download/main/7/epub");
    expect(html).toContain("/download/main/7/pdf");
    expect(html).toContain("/download/main/7/cbz");
    expect(html).toContain("/download/main/7/cbr");
  });
});
