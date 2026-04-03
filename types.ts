/** One discovered Calibre library rooted at a directory containing metadata.db. */
export type Library = {
  /** Stable slug derived from the library path. */
  slug: string;
  /** Human-readable library name. */
  name: string;
  /** Absolute path to the library root. */
  root: string;
  /** Absolute path to metadata.db. */
  dbPath: string;
};

/** One EPUB-capable book entry merged from a Calibre library. */
export type BookEntry = {
  /** Stable unique identifier `${librarySlug}:${bookId}`. */
  uid: string;
  /** Owning library slug. */
  librarySlug: string;
  /** Owning library display name. */
  libraryName: string;
  /** Raw Calibre book id. */
  bookId: number;
  /** Title from metadata.db. */
  title: string;
  /** Ordered list of author names. */
  authors: string[];
  /** Relative Calibre book path from `books.path`. */
  bookPath: string;
  /** File stem from `data.name`. */
  fileStem: string;
  /** EPUB file path on disk. */
  epubPath: string;
  /** Optional cover file path on disk. */
  coverPath?: string;
  /** Added timestamp as ISO string if present. */
  addedAt?: string;
  /** Updated timestamp as ISO string if present. */
  updatedAt?: string;
};

/** Config for the OPDS server. */
export type AppConfig = {
  /** Root tree to scan recursively for Calibre libraries. */
  calibreRoot: string;
  /** Bind host for Bun.serve. */
  host: string;
  /** TCP port for Bun.serve. */
  port: number;
  /** Public base URL used in feed links. */
  baseUrl: string;
  /** Max entries returned in recent/updated feeds. */
  feedLimit: number;
  /** Interval in ms for background refresh. */
  refreshMs: number;
  /** Optional basic auth username. */
  basicAuthUser?: string;
  /** Optional basic auth password. */
  basicAuthPass?: string;
};

/** Aggregated in-memory view of all discovered libraries and books. */
export type AppState = {
  /** Refresh timestamp in ISO format. */
  refreshedAt?: string;
  /** Discovered libraries. */
  libraries: Library[];
  /** All EPUB books. */
  books: BookEntry[];
  /** Recent additions sorted descending. */
  recentAdded: BookEntry[];
  /** Recently updated sorted descending. */
  recentUpdated: BookEntry[];
};

/** Raw row returned from the merged Calibre EPUB query. */
export type CalibreBookRow = {
  /** Calibre book id. */
  book_id: number;
  /** Book title. */
  title: string;
  /** Relative book path. */
  book_path: string;
  /** Added timestamp. */
  added_at?: string | null;
  /** Updated timestamp. */
  updated_at?: string | null;
  /** File stem in the library. */
  file_stem: string;
  /** Comma-separated authors list. */
  authors?: string | null;
};
