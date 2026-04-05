import { accessSync, constants } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "./types.ts";

/** Parse an integer env var with a safe fallback. */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

/** Trim one trailing slash from a URL-like string. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function resolveKoSyncDbPath(calibreRoot: string): string {
  const explicit = process.env.KOSYNC_DB_PATH;
  if (explicit) return explicit;

  const preferred = `${calibreRoot.replace(/\/$/, "")}/koreader.db`;
  try {
    accessSync(dirname(preferred), constants.W_OK);
    return preferred;
  } catch {
    return "/tmp/koreader.db";
  }
}

/** Load runtime config from environment variables. */
export function loadConfig(): AppConfig {
  const host = process.env.HOST || "0.0.0.0";
  const port = intEnv("PORT", 8787);
  const calibreRoot = process.env.CALIBRE_ROOT || "/volume1/books";
  const baseUrl = trimTrailingSlash(process.env.BASE_URL || `http://localhost:${port}`);
  const feedLimit = intEnv("FEED_LIMIT", 100);
  const refreshMs = intEnv("REFRESH_MS", 10 * 60 * 1000);
  const koSyncDbPath = resolveKoSyncDbPath(calibreRoot);

  return {
    calibreRoot,
    host,
    port,
    baseUrl,
    feedLimit,
    refreshMs,
    basicAuthUser: process.env.BASIC_AUTH_USER,
    basicAuthPass: process.env.BASIC_AUTH_PASS,
    koSyncDbPath,
  };
}
