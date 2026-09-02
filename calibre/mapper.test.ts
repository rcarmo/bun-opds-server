import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CalibreBookRow, Library } from "../types.ts";
import { mapRowToBook } from "./mapper.ts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeFixture(authors: string): { library: Library; row: CalibreBookRow } {
  const root = mkdtempSync(join(tmpdir(), "bun-opds-mapper-"));
  tempRoots.push(root);
  const bookPath = "Pierce Brown/Dark Age (1)";
  mkdirSync(join(root, bookPath), { recursive: true });
  writeFileSync(join(root, bookPath, "Dark Age.epub"), "fixture");

  return {
    library: {
      slug: "library",
      name: "Library",
      root,
      dbPath: join(root, "metadata.db"),
    },
    row: {
      book_id: 1,
      title: "Dark Age",
      book_path: bookPath,
      epub_file_stem: "Dark Age",
      formats: "EPUB",
      authors,
    },
  };
}

describe("mapRowToBook", () => {
  test("preserves a comma within a single author name", () => {
    const { library, row } = makeFixture("Brown, Pierce");
    expect(mapRowToBook(library, row)?.authors).toEqual(["Brown, Pierce"]);
  });

  test("splits multiple authors on the query delimiter", () => {
    const { library, row } = makeFixture("Brown, Pierce\x1fLe Guin, Ursula");
    expect(mapRowToBook(library, row)?.authors).toEqual(["Brown, Pierce", "Le Guin, Ursula"]);
  });
});
