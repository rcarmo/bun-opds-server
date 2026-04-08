import type { AppConfig, AppState, BookEntry } from "../types.ts";
import type { PageInfo } from "../util/pagination.ts";

/** Escape text for safe HTML output. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function displayText(value?: string): string {
  return value ? decodeHtmlEntities(value) : "";
}

/** Render a human-friendly timestamp. */
function shortDate(value?: string): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

/** Collapse long descriptions for compact card display. */
function shortDescription(value?: string): string | undefined {
  if (!value) return undefined;
  return value.length > 220 ? `${value.slice(0, 217)}…` : value;
}

/** Build one HTML card for a book entry. */
function renderBookCard(entry: BookEntry): string {
  const title = displayText(entry.title);
  const authors = entry.authors.map((author) => displayText(author));
  const libraryName = displayText(entry.libraryName);
  const seriesName = entry.series ? displayText(entry.series) : "";
  const summaryText = entry.description ? displayText(shortDescription(entry.description) || "") : "";
  const tagsText = entry.tags.map((tag) => displayText(tag));

  const preferredDownload = entry.epubPath
    ? `/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/epub`
    : entry.pdfPath
      ? `/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/pdf`
      : entry.cbzPath
        ? `/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/cbz`
        : entry.cbrPath
          ? `/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/cbr`
          : "#";
  const cover = entry.coverPath
    ? `<a class="cover-link" href="${preferredDownload}"><img class="cover" src="/cover/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}" alt="Cover for ${escapeHtml(title)}" loading="lazy" /></a>`
    : `<div class="cover placeholder">No cover</div>`;
  const summary = summaryText;
  const series = entry.series ? `<li><strong>Series:</strong> ${escapeHtml(seriesName)}</li>` : "";
  const published = entry.publishedAt ? `<li><strong>Published:</strong> ${escapeHtml(shortDate(entry.publishedAt))}</li>` : "";
  const tags = entry.tags.length ? `<li><strong>Tags:</strong> ${escapeHtml(tagsText.slice(0, 6).join(", "))}</li>` : "";
  const formats = entry.formats.length ? `<li><strong>Formats:</strong> ${escapeHtml(entry.formats.join(", "))}</li>` : "";
  const downloadLinks = [
    entry.epubPath ? `<a href="/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/epub">Download EPUB</a>` : "",
    entry.pdfPath ? `<a href="/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/pdf">Download PDF</a>` : "",
    entry.cbzPath ? `<a href="/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/cbz">Download CBZ</a>` : "",
    entry.cbrPath ? `<a href="/download/${encodeURIComponent(entry.librarySlug)}/${entry.bookId}/cbr">Download CBR</a>` : "",
    `<a href="/opds/library/${encodeURIComponent(entry.librarySlug)}">Library feed</a>`,
  ].filter(Boolean).join(" <span>·</span> ");

  return `
    <article class="book-card">
      ${cover}
      <div class="book-meta">
        <h3>${escapeHtml(title)}</h3>
        <p class="authors">${escapeHtml(authors.join(", ") || "Unknown author")}</p>
        <ul>
          <li><strong>Library:</strong> ${escapeHtml(libraryName)}</li>
          ${series}
          ${published}
          <li><strong>Updated:</strong> ${escapeHtml(shortDate(entry.updatedAt || entry.addedAt))}</li>
          ${formats}
          ${tags}
        </ul>
        ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ""}
        <p class="actions">${downloadLinks}</p>
      </div>
    </article>
  `;
}

/** Render pagination links for HTML pages. */
function renderPagination(basePath: string, info: PageInfo): string {
  const links: string[] = [];
  if (info.page > 1) {
    links.push(`<a href="${basePath}${basePath.includes("?") ? "&" : "?"}page=${info.page - 1}">← Previous</a>`);
  }
  links.push(`<span>Page ${info.page} / ${info.totalPages}</span>`);
  if (info.page < info.totalPages) {
    links.push(`<a href="${basePath}${basePath.includes("?") ? "&" : "?"}page=${info.page + 1}">Next →</a>`);
  }
  return `<nav class="pagination">${links.join(" ")}</nav>`;
}

/** Render the main landing page. */
export function renderLandingPage(config: AppConfig, state: AppState): string {
  const libraries = state.libraries
    .map((library) => `<li><a href="/library/${encodeURIComponent(library.slug)}">${escapeHtml(library.name)}</a></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>bun-opds-server</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; line-height: 1.45; }
    .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .panel { border: 1px solid #ddd; border-radius: 12px; padding: 1rem; }
    code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>bun-opds-server</h1>
  <p>Read-only OPDS server for multiple Calibre libraries.</p>
  <div class="grid">
    <section class="panel">
      <h2>Feeds</h2>
      <ul>
        <li><a href="/opds">Root OPDS feed</a></li>
        <li><a href="/opds/recent">Recent additions</a></li>
        <li><a href="/opds/updated">Recently updated</a></li>
        <li><a href="/opds/search?q=dune">Search example</a></li>
      </ul>
    </section>
    <section class="panel">
      <h2>Libraries</h2>
      <ul>${libraries}</ul>
    </section>
    <section class="panel">
      <h2>Server</h2>
      <ul>
        <li><strong>Libraries:</strong> ${state.libraries.length}</li>
        <li><strong>Books:</strong> ${state.books.length}</li>
        <li><strong>Base URL:</strong> <code>${escapeHtml(config.baseUrl)}</code></li>
        <li><strong>Last refresh:</strong> ${escapeHtml(state.refreshedAt || "unknown")}</li>
      </ul>
    </section>
  </div>
</body>
</html>`;
}

/** Render a minimal HTML browse page with constrained covers and download links. */
export function renderBookListPage(title: string, entries: BookEntry[], info: PageInfo, basePath: string): string {
  const cards = entries.map((entry) => renderBookCard(entry)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 2rem auto; padding: 0 1rem; line-height: 1.45; }
    a { color: #0b63ce; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topnav { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .books { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
    .book-card { display: grid; grid-template-columns: 110px 1fr; gap: 1rem; border: 1px solid #ddd; border-radius: 12px; padding: 1rem; align-items: start; }
    .cover { width: 96px; max-height: 144px; object-fit: cover; border-radius: 6px; border: 1px solid #ccc; background: #f5f5f5; }
    .placeholder { width: 96px; height: 144px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 0.9rem; }
    .book-meta h3 { margin: 0 0 0.35rem; font-size: 1.05rem; }
    .authors { margin: 0 0 0.5rem; color: #444; }
    .book-meta ul { margin: 0 0 0.75rem; padding-left: 1rem; color: #555; }
    .summary { margin: 0 0 0.75rem; color: #444; font-size: 0.95rem; }
    .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 0; }
    .pagination { display: flex; gap: 0.75rem; align-items: center; margin: 1rem 0 1.5rem; }
    .search { margin-bottom: 1rem; }
    .search input { min-width: 260px; padding: 0.5rem; }
    .search button { padding: 0.5rem 0.8rem; }
  </style>
</head>
<body>
  <nav class="topnav">
    <a href="/">Home</a>
    <a href="/browse/recent">Recent</a>
    <a href="/browse/updated">Updated</a>
  </nav>
  <h1>${escapeHtml(title)}</h1>
  <form class="search" method="get" action="/search">
    <input type="search" name="q" placeholder="Search title, author, library" />
    <button type="submit">Search</button>
  </form>
  ${renderPagination(basePath, info)}
  <section class="books">
    ${cards || "<p>No matching books.</p>"}
  </section>
  ${renderPagination(basePath, info)}
</body>
</html>`;
}
