import type { AppConfig, BookEntry } from "../types.ts";
import type { PageInfo } from "../util/pagination.ts";
import { xmlEscape } from "./xml.ts";

/** Build an absolute URL from the configured base URL and a relative path. */
function abs(config: AppConfig, path: string): string {
  return `${config.baseUrl}${path}`;
}

/** Use updated timestamp when present, falling back to added timestamp. */
function entryUpdated(entry: BookEntry): string {
  return entry.updatedAt || entry.addedAt || new Date(0).toISOString();
}

/** Build one OPDS acquisition entry for an EPUB book. */
function renderBookEntry(config: AppConfig, entry: BookEntry): string {
  const authors = entry.authors.length
    ? entry.authors.map((author) => `<author><name>${xmlEscape(author)}</name></author>`).join("\n")
    : "<author><name>Unknown</name></author>";

  const coverLinks = entry.coverPath
    ? [
        `<link rel="http://opds-spec.org/image" type="image/jpeg" href="${xmlEscape(abs(config, `/cover/${entry.librarySlug}/${entry.bookId}`))}" />`,
        `<link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="${xmlEscape(abs(config, `/cover/${entry.librarySlug}/${entry.bookId}`))}" />`,
      ].join("\n")
    : "";

  return `
  <entry>
    <id>${xmlEscape(`tag:calibre-opds,2026:${entry.uid}`)}</id>
    <title>${xmlEscape(entry.title)}</title>
    <updated>${xmlEscape(entryUpdated(entry))}</updated>
    ${authors}
    <category term="${xmlEscape(entry.librarySlug)}" label="${xmlEscape(entry.libraryName)}" />
    <content type="text">${xmlEscape(`${entry.libraryName}${entry.authors.length ? ` — ${entry.authors.join(", ")}` : ""}`)}</content>
    ${coverLinks}
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="${xmlEscape(abs(config, `/download/${entry.librarySlug}/${entry.bookId}/epub`))}" />
  </entry>`.trim();
}

/** Build a minimal OPDS navigation feed. */
export function renderNavigationFeed(config: AppConfig, title: string, id: string, links: Array<{ href: string; title: string }>): string {
  const updated = new Date().toISOString();
  const entries = links
    .map((link) => `
  <entry>
    <id>${xmlEscape(`tag:calibre-opds,2026:${id}:${link.href}`)}</id>
    <title>${xmlEscape(link.title)}</title>
    <updated>${xmlEscape(updated)}</updated>
    <link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=navigation" href="${xmlEscape(abs(config, link.href))}" />
  </entry>`.trim())
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${xmlEscape(`tag:calibre-opds,2026:${id}`)}</id>
  <title>${xmlEscape(title)}</title>
  <updated>${xmlEscape(updated)}</updated>
  <link rel="self" href="${xmlEscape(abs(config, "/opds"))}" />
${entries}
</feed>`;
}

/** Build an OPDS acquisition feed from EPUB book entries. */
export function renderAcquisitionFeed(
  config: AppConfig,
  title: string,
  id: string,
  entries: BookEntry[],
  options?: { selfPath?: string; pageInfo?: PageInfo; basePath?: string },
): string {
  const updated = new Date().toISOString();
  const rendered = entries.map((entry) => renderBookEntry(config, entry)).join("\n");
  const selfPath = options?.selfPath || `/opds/${id}`;
  const paginationLinks: string[] = [];
  const pageInfo = options?.pageInfo;
  const basePath = options?.basePath || selfPath;

  if (pageInfo) {
    if (pageInfo.page > 1) {
      paginationLinks.push(`  <link rel="previous" href="${xmlEscape(abs(config, `${basePath}${basePath.includes("?") ? "&" : "?"}page=${pageInfo.page - 1}`))}" />`);
    }
    if (pageInfo.page < pageInfo.totalPages) {
      paginationLinks.push(`  <link rel="next" href="${xmlEscape(abs(config, `${basePath}${basePath.includes("?") ? "&" : "?"}page=${pageInfo.page + 1}`))}" />`);
    }
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${xmlEscape(`tag:calibre-opds,2026:${id}`)}</id>
  <title>${xmlEscape(title)}</title>
  <updated>${xmlEscape(updated)}</updated>
  <link rel="self" href="${xmlEscape(abs(config, selfPath))}" />
${paginationLinks.join("\n")}
${rendered}
</feed>`;
}
