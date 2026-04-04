import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KoSyncStore } from "./sync.ts";

const paths: string[] = [];

function tempDbPath(name: string): string {
  const path = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  paths.push(path);
  return path;
}

afterEach(() => {
  for (const path of paths.splice(0)) {
    try {
      rmSync(path, { force: true });
      rmSync(`${path}-shm`, { force: true });
      rmSync(`${path}-wal`, { force: true });
    } catch {
      // ignore cleanup failures
    }
  }
});

describe("KoSyncStore", () => {
  it("auto-creates users on first ensure and stores progress", () => {
    const store = new KoSyncStore(tempDbPath("kosync-test"));
    const auth = { username: "alice", key: "md5hash" };

    expect(store.ensureUser(auth)).toBe(true);

    const saved = store.updateProgress(auth, {
      document: "doc-md5",
      progress: "42",
      percentage: 0.42,
      device: "Kindle",
      device_id: "kindle-1",
    });

    expect(saved.document).toBe("doc-md5");
    expect(saved.percentage).toBe(0.42);

    const loaded = store.getProgress(auth, "doc-md5");
    expect(loaded).not.toBeNull();
    expect(loaded?.progress).toBe("42");
    expect(loaded?.device).toBe("Kindle");
    expect(loaded?.device_id).toBe("kindle-1");
  });

  it("rejects mismatched auth for existing users", () => {
    const store = new KoSyncStore(tempDbPath("kosync-auth"));

    expect(store.ensureUser({ username: "bob", key: "good" })).toBe(true);
    expect(store.ensureUser({ username: "bob", key: "bad" })).toBe(false);
  });
});
