#!/usr/bin/env bun
import { file } from "bun";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { discoverLibraries } from "./calibre/discover.ts";
import { mapRowToBook } from "./calibre/mapper.ts";
import { readLibraryBooks } from "./calibre/sqlite.ts";
import { renderBookListPage, renderLandingPage } from "./server/html.ts";
import { renderAcquisitionFeed, renderNavigationFeed } from "./server/opds.ts";
import type { AppConfig, AppState, BookEntry, Library } from "./types.ts";
import { getKoSyncAuth, KoSyncStore, readBodyParams } from "./koreader/sync.ts";
import { dedupeByTitle, sortByDate } from "./util/catalog.ts";
import { paginate } from "./util/pagination.ts";
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
    const result = readLibraryBooks(library);
    if (result.error) {
      console.warn(`[calibre-opds] skipping library=${library.name} db=${library.dbPath} error=${result.error}`);
      continue;
    }
    for (const row of result.rows) {
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
const koSync = new KoSyncStore(config.koSyncDbPath);
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
    const url = new URL(request.url);
    const pathname = url.pathname;

    const isKoSyncRoute = pathname === "/users/create"
      || pathname === "/users/auth"
      || pathname === "/syncs/progress"
      || pathname.startsWith("/syncs/progress/");

    if (!isKoSyncRoute) {
      const authFailure = authorize(request, config);
      if (authFailure) return authFailure;
    }

    if (pathname === "/users/create" && request.method === "POST") {
      const params = await readBodyParams(request);
      const username = params.username?.trim();
      const password = params.password?.trim();
      if (!username || !password) {
        return Response.json({ error: "username and password are required" }, { status: 400 });
      }
      const created = koSync.createUser({ username, key: password });
      if (!created) {
        return Response.json({ error: "user already exists" }, { status: 402 });
      }
      return Response.json({ username }, { status: 201 });
    }

    if (pathname === "/users/auth" && request.method === "GET") {
      const auth = getKoSyncAuth(request);
      if (!auth) {
        return Response.json({ error: "missing x-auth-user or x-auth-key" }, { status: 401 });
      }
      const ok = koSync.ensureUser(auth);
      if (!ok) {
        return Response.json({ error: "invalid credentials" }, { status: 401 });
      }
      return Response.json({ authorized: true, username: auth.username });
    }

    if (pathname === "/syncs/progress" && request.method === "PUT") {
      const auth = getKoSyncAuth(request);
      if (!auth) {
        return Response.json({ error: "missing x-auth-user or x-auth-key" }, { status: 401 });
      }
      const ok = koSync.ensureUser(auth);
      if (!ok) {
        return Response.json({ error: "invalid credentials" }, { status: 401 });
      }
      const params = await readBodyParams(request);
      const document = params.document?.trim();
      const progress = params.progress?.trim();
      const percentageRaw = params.percentage?.trim();
      const device = params.device?.trim();
      const deviceId = params.device_id?.trim();
      const percentage = percentageRaw ? Number.parseFloat(percentageRaw) : Number.NaN;

      if (!document || !progress || !Number.isFinite(percentage)) {
        return Response.json({ error: "document, progress and percentage are required" }, { status: 400 });
      }

      const stored = koSync.updateProgress(auth, {
        document,
        progress,
        percentage,
        device,
        device_id: deviceId,
      });
      return Response.json(stored, { status: 200 });
    }

    if (pathname.startsWith("/syncs/progress/") && request.method === "GET") {
      const auth = getKoSyncAuth(request);
      if (!auth) {
        return Response.json({ error: "missing x-auth-user or x-auth-key" }, { status: 401 });
      }
      const ok = koSync.ensureUser(auth);
      if (!ok) {
        return Response.json({ error: "invalid credentials" }, { status: 401 });
      }
      const document = decodeURIComponent(pathname.slice("/syncs/progress/".length));
      const stored = koSync.getProgress(auth, document);
      return Response.json(stored ?? {}, { status: 200 });
    }

    if (pathname === "/") {
      return new Response(renderLandingPage(config, state), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === "/health") {
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
        ...state.libraries.map((library) => ({ href: `/opds/library/${encodeURIComponent(library.slug)}`, title: `Library: ${library.name}` })),
        { href: "/opds/search?q=dune", title: "Search (replace ?q=... with your query)" },
      ]);
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=navigation; charset=utf-8" } });
    }

    if (pathname === "/opds/recent") {
      const paged = paginate(state.recentAdded, url.searchParams.get("page"), url.searchParams.get("pageSize"), config.feedLimit);
      const xml = renderAcquisitionFeed(config, "Recent additions", "recent", paged.items, {
        selfPath: `/opds/recent?page=${paged.info.page}`,
        pageInfo: paged.info,
        basePath: "/opds/recent",
      });
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    if (pathname === "/opds/updated") {
      const paged = paginate(state.recentUpdated, url.searchParams.get("page"), url.searchParams.get("pageSize"), config.feedLimit);
      const xml = renderAcquisitionFeed(config, "Recently updated", "updated", paged.items, {
        selfPath: `/opds/updated?page=${paged.info.page}`,
        pageInfo: paged.info,
        basePath: "/opds/updated",
      });
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    if (pathname.startsWith("/opds/library/")) {
      const librarySlug = decodeURIComponent(pathname.slice("/opds/library/".length));
      const library = state.libraries.find((item) => item.slug === librarySlug);
      if (!library) return new Response("Not found", { status: 404 });
      const libraryBooks = sortByDate(state.books.filter((book) => book.librarySlug === librarySlug), (entry) => entry.updatedAt || entry.addedAt);
      const paged = paginate(libraryBooks, url.searchParams.get("page"), url.searchParams.get("pageSize"), config.feedLimit);
      const xml = renderAcquisitionFeed(config, `Library: ${library.name}`, `library/${librarySlug}`, paged.items, {
        selfPath: `/opds/library/${encodeURIComponent(librarySlug)}?page=${paged.info.page}`,
        pageInfo: paged.info,
        basePath: `/opds/library/${encodeURIComponent(librarySlug)}`,
      });
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    if (pathname === "/opds/search") {
      const query = url.searchParams.get("q") || "";
      const matches = searchBooks(state.books, query, config.feedLimit);
      const paged = paginate(matches, url.searchParams.get("page"), url.searchParams.get("pageSize"), config.feedLimit);
      const basePath = `/opds/search?q=${encodeURIComponent(query)}`;
      const xml = renderAcquisitionFeed(config, `Search results for: ${query || "(empty query)"}`, `search?q=${encodeURIComponent(query)}`, paged.items, {
        selfPath: `${basePath}&page=${paged.info.page}`,
        pageInfo: paged.info,
        basePath,
      });
      return new Response(xml, { headers: { "Content-Type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8" } });
    }

    if (pathname === "/browse/recent") {
      const allRecent = sortByDate(state.books, (entry) => entry.addedAt);
      const paged = paginate(allRecent, url.searchParams.get("page"), url.searchParams.get("pageSize"), 24);
      return new Response(renderBookListPage("Recent additions", paged.items, paged.info, "/browse/recent"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === "/browse/updated") {
      const allUpdated = sortByDate(state.books, (entry) => entry.updatedAt || entry.addedAt);
      const paged = paginate(allUpdated, url.searchParams.get("page"), url.searchParams.get("pageSize"), 24);
      return new Response(renderBookListPage("Recently updated", paged.items, paged.info, "/browse/updated"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (pathname.startsWith("/library/")) {
      const librarySlug = decodeURIComponent(pathname.slice("/library/".length));
      const library = state.libraries.find((item) => item.slug === librarySlug);
      if (!library) return new Response("Not found", { status: 404 });
      const libraryBooks = sortByDate(state.books.filter((book) => book.librarySlug === librarySlug), (entry) => entry.updatedAt || entry.addedAt);
      const paged = paginate(libraryBooks, url.searchParams.get("page"), url.searchParams.get("pageSize"), 24);
      return new Response(renderBookListPage(`Library: ${library.name}`, paged.items, paged.info, `/library/${encodeURIComponent(librarySlug)}`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === "/search") {
      const query = url.searchParams.get("q") || "";
      const matches = searchBooks(state.books, query, Number.MAX_SAFE_INTEGER);
      const basePath = `/search?q=${encodeURIComponent(query)}`;
      const paged = paginate(matches, url.searchParams.get("page"), url.searchParams.get("pageSize"), 24);
      return new Response(renderBookListPage(`Search: ${query || "(empty query)"}`, paged.items, paged.info, basePath), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const download = parseDownloadPath(pathname);
    if (download) {
      const entry = state.books.find((book) => book.librarySlug === download.librarySlug && book.bookId === download.bookId);
      if (!entry) return new Response("Not found", { status: 404 });
      const pathByFormat = {
        epub: entry.epubPath,
        pdf: entry.pdfPath,
        cbz: entry.cbzPath,
        cbr: entry.cbrPath,
      };
      const typeByFormat = {
        epub: "application/epub+zip",
        pdf: "application/pdf",
        cbz: "application/vnd.comicbook+zip",
        cbr: "application/vnd.comicbook-rar",
      } as const;
      const targetPath = pathByFormat[download.format];
      if (!targetPath || !existsSync(targetPath)) return new Response("Missing file", { status: 404 });
      return new Response(file(targetPath), {
        headers: {
          "Content-Type": typeByFormat[download.format],
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${entry.title}.${download.format}`)}`,
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

console.log(`[calibre-opds] listening on ${config.host}:${config.port} root=${config.calibreRoot} kosync_db=${config.koSyncDbPath}`);
