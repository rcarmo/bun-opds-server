/** Parse a download route into library slug, book id, and format. */
export function parseDownloadPath(pathname: string): { librarySlug: string; bookId: number; format: "epub" | "pdf" } | null {
  const match = pathname.match(/^\/download\/([^/]+)\/(\d+)\/(epub|pdf)$/);
  if (!match) return null;
  return {
    librarySlug: decodeURIComponent(match[1]),
    bookId: Number.parseInt(match[2] || "0", 10),
    format: match[3] as "epub" | "pdf",
  };
}

/** Parse a cover route into library slug and book id. */
export function parseCoverPath(pathname: string): { librarySlug: string; bookId: number } | null {
  const match = pathname.match(/^\/cover\/([^/]+)\/(\d+)$/);
  if (!match) return null;
  return { librarySlug: decodeURIComponent(match[1]), bookId: Number.parseInt(match[2] || "0", 10) };
}
