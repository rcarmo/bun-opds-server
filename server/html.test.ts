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
  bookPath: "Herbert, Frank/Dune (7)",
  fileStem: "Dune",
  epubPath: "/books/dune.epub",
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
    expect(html).toContain("Frank Herbert");
    expect(html).toContain("max-height: 144px");
    expect(html).toContain("/download/main/7/epub");
  });
});
