import { describe, expect, test } from "bun:test";
import { renderAcquisitionFeed } from "./opds.ts";
import type { AppConfig, BookEntry } from "../types.ts";

const config: AppConfig = {
  calibreRoot: "/books",
  host: "0.0.0.0",
  port: 8787,
  baseUrl: "http://localhost:8787",
  feedLimit: 100,
  refreshMs: 600000,
};

const entry: BookEntry = {
  uid: "main:7",
  librarySlug: "main",
  libraryName: "Main",
  bookId: 7,
  title: "The Left Hand of Darkness",
  authors: ["Ursula K. Le Guin"],
  series: "Hainish Cycle",
  description: "A science fiction classic.",
  publishedAt: "1969-01-01T00:00:00.000Z",
  tags: ["science fiction"],
  bookPath: "Le Guin, Ursula K/The Left Hand of Darkness (7)",
  formats: ["EPUB", "PDF", "CBZ", "CBR"],
  epubPath: "/books/Main/The Left Hand of Darkness.epub",
  pdfPath: "/books/Main/The Left Hand of Darkness.pdf",
  cbzPath: "/books/Main/The Left Hand of Darkness.cbz",
  cbrPath: "/books/Main/The Left Hand of Darkness.cbr",
  addedAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z",
};

describe("renderAcquisitionFeed", () => {
  test("includes an EPUB acquisition link", () => {
    const xml = renderAcquisitionFeed(config, "Recent additions", "recent", [entry]);

    expect(xml).toContain("application/epub+zip");
    expect(xml).toContain("application/pdf");
    expect(xml).toContain("application/vnd.comicbook+zip");
    expect(xml).toContain("application/vnd.comicbook-rar");
    expect(xml).toContain("/download/main/7/epub");
    expect(xml).toContain("/download/main/7/pdf");
    expect(xml).toContain("/download/main/7/cbz");
    expect(xml).toContain("/download/main/7/cbr");
    expect(xml).toContain("The Left Hand of Darkness");
    expect(xml).toContain("Hainish Cycle");
    expect(xml).toContain("science fiction");
  });
});
