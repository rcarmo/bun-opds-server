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

/** One downloadable book entry merged from a Calibre library. */
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
  /** Optional series name from Calibre metadata. */
  series?: string;
  /** Optional short description/comments text. */
  description?: string;
  /** Optional published timestamp as ISO string. */
  publishedAt?: string;
  /** Tags derived from Calibre metadata. */
  tags: string[];
  /** Relative Calibre book path from `books.path`. */
  bookPath: string;
  /** Available download formats for this entry. */
  formats: string[];
  /** Optional EPUB file path on disk. */
  epubPath?: string;
  /** Optional PDF file path on disk. */
  pdfPath?: string;
  /** Optional CBZ file path on disk. */
  cbzPath?: string;
  /** Optional CBR file path on disk. */
  cbrPath?: string;
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
  /** SQLite path for KOReader progress sync state. */
  koSyncDbPath: string;
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
  /** Optional publication timestamp. */
  published_at?: string | null;
  /** EPUB file stem in the library, if present. */
  epub_file_stem?: string | null;
  /** PDF file stem in the library, if present. */
  pdf_file_stem?: string | null;
  /** CBZ file stem in the library, if present. */
  cbz_file_stem?: string | null;
  /** CBR file stem in the library, if present. */
  cbr_file_stem?: string | null;
  /** Comma-separated available formats. */
  formats?: string | null;
  /** Comma-separated authors list. */
  authors?: string | null;
  /** Optional series name. */
  series?: string | null;
  /** Optional comma-separated tag list. */
  tags?: string | null;
  /** Optional comments / description text. */
  description?: string | null;
};
