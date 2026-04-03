import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Library } from "../types.ts";

/** Convert a filesystem name into a stable URL-safe slug. */
function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "library";
}

/** Recursively discover Calibre libraries by locating metadata.db files. */
export function discoverLibraries(root: string): Library[] {
  const found: Library[] = [];
  const used = new Set<string>();

  function walk(dir: string) {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const hasMetadataDb = entries.some((entry) => entry.isFile() && entry.name === "metadata.db");
    if (hasMetadataDb) {
      const name = basename(dir);
      const baseSlug = slugify(name);
      let slug = baseSlug;
      let n = 2;
      while (used.has(slug)) slug = `${baseSlug}-${n++}`;
      used.add(slug);
      found.push({
        slug,
        name,
        root: dir,
        dbPath: join(dir, "metadata.db"),
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const child = join(dir, entry.name);
      try {
        if (!statSync(child).isDirectory()) continue;
      } catch {
        continue;
      }
      walk(child);
    }
  }

  walk(root);
  found.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}
