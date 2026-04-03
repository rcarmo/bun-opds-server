/** Pagination parameters and derived values. */
export type PageInfo = {
  /** Current page number, 1-indexed. */
  page: number;
  /** Requested page size. */
  pageSize: number;
  /** Zero-based offset into the source array. */
  offset: number;
  /** Total number of pages for the source array. */
  totalPages: number;
  /** Total number of items in the source array. */
  totalItems: number;
};

/** Clamp a page number to a safe positive integer. */
function positiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Paginate an array using page and page size query parameters. */
export function paginate<T>(items: T[], pageRaw?: string | null, pageSizeRaw?: string | null, defaultPageSize = 100): { items: T[]; info: PageInfo } {
  const pageSize = positiveInt(pageSizeRaw, defaultPageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(positiveInt(pageRaw, 1), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    info: {
      page,
      pageSize,
      offset,
      totalPages,
      totalItems,
    },
  };
}
