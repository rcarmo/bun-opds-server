/** Parse a download route into library slug and book id. */
export function parseDownloadPath(pathname: string): { librarySlug: string; bookId: number } | null {
  const match = pathname.match(/^\/download\/([^/]+)\/(\d+)\/epub$/);
  if (!match) return null;
  return { librarySlug: decodeURIComponent(match[1]), bookId: Number.parseInt(match[2] || "0", 10) };
}

/** Parse a cover route into library slug and book id. */
export function parseCoverPath(pathname: string): { librarySlug: string; bookId: number } | null {
  const match = pathname.match(/^\/cover\/([^/]+)\/(\d+)$/);
  if (!match) return null;
  return { librarySlug: decodeURIComponent(match[1]), bookId: Number.parseInt(match[2] || "0", 10) };
}
