import { describe, expect, test } from "bun:test";
import { parseCoverPath, parseDownloadPath } from "./routes.ts";

describe("parseDownloadPath", () => {
  test("parses valid EPUB download routes", () => {
    expect(parseDownloadPath("/download/scifi/42/epub")).toEqual({
      librarySlug: "scifi",
      bookId: 42,
    });
  });

  test("rejects invalid download routes", () => {
    expect(parseDownloadPath("/download/scifi/42/pdf")).toBeNull();
  });
});

describe("parseCoverPath", () => {
  test("parses valid cover routes", () => {
    expect(parseCoverPath("/cover/scifi/42")).toEqual({
      librarySlug: "scifi",
      bookId: 42,
    });
  });

  test("rejects invalid cover routes", () => {
    expect(parseCoverPath("/cover/scifi/not-a-number")).toBeNull();
  });
});
