import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

/** Auth headers expected by KOReader sync clients. */
export type KoSyncAuth = {
  username: string;
  key: string;
};

/** Stored progress payload for a single document. */
export type KoSyncProgress = {
  document: string;
  progress: string;
  percentage: number;
  device?: string;
  device_id?: string;
  updated_at: string;
};

/** Small SQLite-backed KOReader sync store. */
export class KoSyncStore {
  private readonly db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        auth_key_md5 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS progress (
        username TEXT NOT NULL,
        document_md5 TEXT NOT NULL,
        progress TEXT NOT NULL,
        percentage REAL NOT NULL,
        device TEXT,
        device_id TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (username, document_md5),
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_progress_user_updated
        ON progress(username, updated_at DESC);
    `);
  }

  /** Create the user if missing, otherwise verify key matches. */
  ensureUser(auth: KoSyncAuth): boolean {
    const row = this.db
      .query("SELECT auth_key_md5 FROM users WHERE username = ?1")
      .get(auth.username) as { auth_key_md5: string } | null;

    const now = new Date().toISOString();
    if (!row) {
      this.db
        .query(
          "INSERT INTO users (username, auth_key_md5, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        )
        .run(auth.username, auth.key, now);
      return true;
    }

    return row.auth_key_md5 === auth.key;
  }

  /** Create a user only if absent. Returns true when created. */
  createUser(auth: KoSyncAuth): boolean {
    const row = this.db
      .query("SELECT username FROM users WHERE username = ?1")
      .get(auth.username) as { username: string } | null;
    if (row) return false;

    const now = new Date().toISOString();
    this.db
      .query(
        "INSERT INTO users (username, auth_key_md5, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
      )
      .run(auth.username, auth.key, now);
    return true;
  }

  /** Upsert latest reading progress for a document. */
  updateProgress(auth: KoSyncAuth, payload: Omit<KoSyncProgress, "updated_at">): KoSyncProgress {
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO progress (username, document_md5, progress, percentage, device, device_id, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(username, document_md5) DO UPDATE SET
           progress = excluded.progress,
           percentage = excluded.percentage,
           device = excluded.device,
           device_id = excluded.device_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        auth.username,
        payload.document,
        payload.progress,
        payload.percentage,
        payload.device ?? null,
        payload.device_id ?? null,
        now,
      );

    this.db.query("UPDATE users SET updated_at = ?2 WHERE username = ?1").run(auth.username, now);

    return {
      ...payload,
      updated_at: now,
    };
  }

  /** Fetch stored progress for a document, or null if none exists. */
  getProgress(auth: KoSyncAuth, document: string): KoSyncProgress | null {
    const row = this.db
      .query(
        `SELECT document_md5, progress, percentage, device, device_id, updated_at
         FROM progress WHERE username = ?1 AND document_md5 = ?2`,
      )
      .get(auth.username, document) as
      | {
          document_md5: string;
          progress: string;
          percentage: number;
          device: string | null;
          device_id: string | null;
          updated_at: string;
        }
      | null;

    if (!row) return null;

    return {
      document: row.document_md5,
      progress: row.progress,
      percentage: row.percentage,
      device: row.device ?? undefined,
      device_id: row.device_id ?? undefined,
      updated_at: row.updated_at,
    };
  }
}

/** Extract KOReader auth headers from a request. */
export function getKoSyncAuth(request: Request): KoSyncAuth | null {
  const username = request.headers.get("x-auth-user")?.trim();
  const key = request.headers.get("x-auth-key")?.trim();
  if (!username || !key) return null;
  return { username, key };
}

/** Read a JSON or form-urlencoded request body into a plain object. */
export async function readBodyParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v == null ? "" : String(v)]));
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  }

  const text = await request.text();
  if (!text.trim()) return {};

  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v == null ? "" : String(v)]));
  } catch {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
}
