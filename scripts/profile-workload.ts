import type { AppConfig, BookEntry } from "../types.ts";
import { renderAcquisitionFeed } from "../server/opds.ts";
import { renderBookListPage } from "../server/html.ts";
import { searchBooks } from "../util/search.ts";

const bookCount = 4_053;
const queryRounds = 250;
const authors = ["Brown, Pierce", "Le Guin, Ursula K.", "Gibson, William", "Butler, Octavia E."];
const entries: BookEntry[] = Array.from({ length: bookCount }, (_, index) => ({
  uid: `main:${index + 1}`,
  librarySlug: "main",
  libraryName: "Main Library",
  bookId: index + 1,
  title: index % 101 === 0 ? `Dark Age ${index}` : `Example Book ${index}`,
  authors: [authors[index % authors.length]!],
  series: index % 3 === 0 ? "Example Series" : undefined,
  description: "Representative Calibre catalogue entry.",
  publishedAt: "2026-01-01T00:00:00.000Z",
  tags: index % 2 === 0 ? ["science fiction", "space opera"] : ["fiction"],
  bookPath: `Author/Example Book (${index + 1})`,
  formats: ["EPUB"],
  epubPath: `/books/Example Book ${index}.epub`,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
}));

let matched = 0;
for (let round = 0; round < queryRounds; round++) {
  matched += searchBooks(entries, round % 2 === 0 ? "Pierce Brown" : "science fiction", 100).length;
}

const config: AppConfig = {
  calibreRoot: "/books",
  host: "0.0.0.0",
  port: 8787,
  baseUrl: "http://localhost:8787",
  feedLimit: 100,
  refreshMs: 600_000,
  koSyncDbPath: "/books/koreader.db",
};
const representative = searchBooks(entries, "Pierce Brown", 100);
const xmlBytes = Buffer.byteLength(renderAcquisitionFeed(config, "Search", "search", representative));
const htmlBytes = Buffer.byteLength(renderBookListPage("Search", representative, {
  page: 1,
  pageSize: 100,
  offset: 0,
  totalItems: representative.length,
  totalPages: 1,
}, "/search?q=Pierce%20Brown"));

console.log(JSON.stringify({ bookCount, queryRounds, matched, xmlBytes, htmlBytes }));
