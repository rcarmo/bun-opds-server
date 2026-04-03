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
  bookPath: "Le Guin, Ursula K/The Left Hand of Darkness (7)",
  fileStem: "The Left Hand of Darkness",
  epubPath: "/books/Main/The Left Hand of Darkness.epub",
  addedAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z",
};

describe("renderAcquisitionFeed", () => {
  test("includes an EPUB acquisition link", () => {
    const xml = renderAcquisitionFeed(config, "Recent additions", "recent", [entry]);

    expect(xml).toContain("application/epub+zip");
    expect(xml).toContain("/download/main/7/epub");
    expect(xml).toContain("The Left Hand of Darkness");
  });
});
