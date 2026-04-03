#!/usr/bin/env bun
import { file } from "bun";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { discoverLibraries } from "./calibre/discover.ts";
import { mapRowToBook } from "./calibre/mapper.ts";
import { readLibraryBooks } from "./calibre/sqlite.ts";
import { renderAcquisitionFeed, renderNavigationFeed } from "./server/opds.ts";
import type { AppConfig, AppState, BookEntry, Library } from "./types.ts";
import { dedupeByTitle, sortByDate } from "./util/catalog.ts";
import { parseCoverPath, parseDownloadPath } from "./util/routes.ts";
import { searchBooks } from "./util/search.ts";

/** Create an empty application state. */
function emptyState(): AppState {
  return {
    libraries: [],
    books: [],
    recentAdded: [],
    recentUpdated: [],
  };
}

/** Rebuild the in-memory catalog from all discovered Calibre libraries. */
async function buildState(config: AppConfig): Promise<AppState> {
  const libraries = discoverLibraries(config.calibreRoot);
  const books: BookEntry[] = [];

  for (const library of libraries) {
    const rows = readLibraryBooks(library);
    for (const row of rows) {
      const mapped = mapRowToBook(library, row);
      if (mapped) books.push(mapped);
    }
  }

  const dedupedBooks = dedupeByTitle(books);

  return {
    refreshedAt: new Date().toISOString(),
    libraries,
    books: dedupedBooks,
    recentAdded: sortByDate(dedupedBooks, (entry) => entry.addedAt).slice(0, config.feedLimit),
    recentUpdated: sortByDate(dedupedBooks, (entry) => entry.updatedAt || entry.addedAt).slice(0, config.feedLimit),
  };
}

/** Enforce optional HTTP basic auth. */
function authorize(request: Request, config: AppConfig): Response | null {
  if (!config.basicAuthUser) return null;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="calibre-opds"' },
    });
  }

  const raw = Buffer.from(header.slice(6), "base64").toString("utf8");
  const [user, pass] = raw.split(":");
  if (user !== config.basicAuthUser || pass !== (config.basicAuthPass || "")) {
    return new Response("Invalid credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="calibre-opds"' },
    });
  }
  return null;
}

/** Build a lightweight JSON summary. */
function jsonSummary(state: AppState) {
  return {
    refreshedAt: state.refreshedAt,
    libraryCount: state.libraries.length,
    bookCount: state.books.length,
    libraries: state.libraries.map((library: Library) => ({ slug: library.slug, name: library.name, root: library.root })),
  };
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Calibre OPDS server\n\nEnvironment:\n  CALIBRE_ROOT   Root directory to scan (default: /volume1/books)\n  HOST           Bind host (default: 0.0.0.0)\n  PORT           Bind port (default: 8787)\n  BASE_URL       Public base URL for OPDS links\n  FEED_LIMIT     Number of feed entries (default: 100)\n  REFRESH_MS     Background refresh interval (default: 600000)\n  BASIC_AUTH_USER / BASIC_AUTH_PASS  Optional HTTP basic auth\n`);
  process.exit(0);
}

const config = loadConfig();
let state: AppState = emptyState();
let lastRefreshError: string | undefined;

async function refresh() {
  try {
    state = await buildState(config);
    lastRefreshError = undefined;
    console.log(`[calibre-opds] refreshed libraries=${state.libraries.length} books=${state.books.length} at=${state.refreshedAt}`);
  } catch (error) {
    lastRefreshError = error instanceof Error ? error.message : String(error);
    console.error(`[calibre-opds] refresh failed: ${lastRefreshError}`);
  }
}

await refresh();
setInterval(() => {
  void refresh();
}, config.refreshMs);

Bun.serve({
  hostname: config.host,
  port: config.port,
  async fetch(request) {
    const authFailure = authorize(request, config);
    if (authFailure) return authFailure;

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/" || pathname === "/health") {
      return Response.json({
        ok: true,
        refreshedAt: state.refreshedAt,
        refreshError: lastRefreshError,
        libraryCount: state.libraries.length,
        bookCount: state.books.length,
      });
    }

    if (pathname === "/libraries") {
      return Response.json(jsonSummary(state));
    }

    if (pathname === "/opds") {
      const xml = renderNavigationFeed(config, "Calibre OPDS", "root", [
        { href: "/opds/recent", title: `Recent additions (${state.recentAdded.length})` },
        { href: "/opds/updated", title: `Recently updated (${state.recentUpdated.length})` },
        { href: "/opds/search?q=dune", title: "Search (replace ?q=... with your query)" },
      ]);
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=navigation; charset=utf-8" } });
    }

    if (pathname === "/opds/recent") {
      const xml = renderAcquisitionFeed(config, "Recent additions", "recent", state.recentAdded);
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    if (pathname === "/opds/updated") {
      const xml = renderAcquisitionFeed(config, "Recently updated", "updated", state.recentUpdated);
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    if (pathname === "/opds/search") {
      const query = url.searchParams.get("q") || "";
      const matches = searchBooks(state.books, query, config.feedLimit);
      const xml = renderAcquisitionFeed(config, `Search results for: ${query || "(empty query)"}`, `search?q=${encodeURIComponent(query)}`, matches);
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    const download = parseDownloadPath(pathname);
    if (download) {
      const entry = state.books.find((book) => book.librarySlug === download.librarySlug && book.bookId === download.bookId);
      if (!entry) return new Response("Not found", { status: 404 });
      if (!existsSync(entry.epubPath)) return new Response("Missing file", { status: 404 });
      return new Response(file(entry.epubPath), {
        headers: {
          "Content-Type": "application/epub+zip",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${entry.title}.epub`)}`,
        },
      });
    }

    const cover = parseCoverPath(pathname);
    if (cover) {
      const entry = state.books.find((book) => book.librarySlug === cover.librarySlug && book.bookId === cover.bookId);
      if (!entry?.coverPath || !existsSync(entry.coverPath)) return new Response("Not found", { status: 404 });
      return new Response(file(entry.coverPath), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[calibre-opds] listening on ${config.host}:${config.port} root=${config.calibreRoot}`);
