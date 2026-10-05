import { profile } from "bun:jsc";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const profileRoot = process.env.OPDS_TEST_PROFILE_DIR;
const isTestProcess = process.argv[1] === "test" || process.argv[1]?.endsWith(".test.ts");

if (profileRoot && isTestProcess) {
  const interval = Number.parseInt(process.env.OPDS_TEST_CPU_INTERVAL_US || "100", 10);
  if (!Number.isInteger(interval) || interval < 100 || interval > 1_000_000) {
    throw new Error("OPDS_TEST_CPU_INTERVAL_US must be an integer from 100 to 1000000");
  }

  const { afterAll } = await import("bun:test");
  const processDir = join(profileRoot, String(process.pid));
  if (existsSync(processDir)) throw new Error(`refusing to overwrite test profile directory: ${processDir}`);
  mkdirSync(processDir, { mode: 0o700 });
  writeFileSync(join(processDir, "command.json"), `${JSON.stringify(process.argv, null, 2)}\n`);

  let stopProfile!: () => void;
  const finish = new Promise<void>((resolve) => {
    stopProfile = resolve;
  });
  const capture = profile(() => finish, interval);
  let finished = false;

  afterAll(async () => {
    if (finished) return;
    finished = true;
    stopProfile();
    try {
      const cpu = await capture;
      writeFileSync(join(processDir, "cpu.json"), JSON.stringify(cpu));
      writeFileSync(join(processDir, "heap.json"), JSON.stringify(Bun.generateHeapSnapshot()));
    } catch (error) {
      writeFileSync(join(processDir, "capture-error.txt"), `${String(error)}\n`);
      throw error;
    }
  }, 120_000);
}
