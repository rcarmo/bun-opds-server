import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [profileRoot, outputPath] = process.argv.slice(2);
if (!profileRoot || !outputPath) {
  throw new Error("usage: analyze-test-profiles.ts <test-processes-dir> <output.md>");
}

type CpuFrame = {
  name?: string;
  sourceURL?: string;
  line?: number;
};
type CpuTrace = { timestamp?: number; frames?: CpuFrame[] };
type CpuProfile = {
  stackTraces?: { interval?: number; traces?: CpuTrace[] };
};
type HeapSnapshot = {
  nodes?: number[];
  nodeClassNames?: string[];
  strings?: string[];
  snapshot?: {
    meta?: {
      node_fields?: string[];
      node_types?: unknown[];
    };
  };
};
type ProcessSummary = {
  pid: string;
  command: string;
  samples: number;
  sampledMs: number;
  heapObjects: number;
  heapSelfBytes: number;
};

const cumulativeUs = new Map<string, number>();
const selfUs = new Map<string, number>();
const heapTypes = new Map<string, { count: number; selfBytes: number }>();
const processes: ProcessSummary[] = [];

function add(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) || 0) + value);
}

function frameKey(frame: CpuFrame): string {
  const name = frame.name || "(anonymous)";
  const source = frame.sourceURL || "(runtime)";
  const line = Number.isInteger(frame.line) && frame.line !== 4_294_967_295 ? `:${frame.line}` : "";
  return `${name} — ${source}${line}`;
}

function addHeapType(name: string, count: number, selfBytes: number): void {
  const current = heapTypes.get(name) || { count: 0, selfBytes: 0 };
  current.count += count;
  current.selfBytes += selfBytes;
  heapTypes.set(name, current);
}

function parseHeap(heap: HeapSnapshot): { objects: number; selfBytes: number } {
  const nodes = heap.nodes || [];
  const fields = heap.snapshot?.meta?.node_fields;
  if (fields?.length) {
    const width = fields.length;
    const typeIndex = fields.indexOf("type");
    const sizeIndex = fields.indexOf("self_size");
    const typeNames = heap.snapshot?.meta?.node_types?.[typeIndex];
    if (typeIndex < 0 || sizeIndex < 0 || !Array.isArray(typeNames) || nodes.length % width !== 0) {
      throw new Error("unsupported Inspector heap snapshot schema");
    }
    let selfBytes = 0;
    for (let offset = 0; offset < nodes.length; offset += width) {
      const size = nodes[offset + sizeIndex] || 0;
      const name = String(typeNames[nodes[offset + typeIndex]!] || "unknown");
      selfBytes += size;
      addHeapType(name, 1, size);
    }
    return { objects: nodes.length / width, selfBytes };
  }

  const width = 4;
  if (!heap.nodeClassNames || nodes.length % width !== 0) {
    throw new Error("unsupported Bun heap snapshot schema");
  }
  let selfBytes = 0;
  for (let offset = 0; offset < nodes.length; offset += width) {
    const size = nodes[offset + 1] || 0;
    const name = heap.nodeClassNames[nodes[offset + 2]!] || "unknown";
    selfBytes += size;
    addHeapType(name, 1, size);
  }
  return { objects: nodes.length / width, selfBytes };
}

const processDirs = readdirSync(profileRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => Number(a) - Number(b));

if (!processDirs.length) throw new Error("no test process profile directories found");

for (const pid of processDirs) {
  const dir = join(profileRoot, pid);
  const cpu = JSON.parse(readFileSync(join(dir, "cpu.json"), "utf8")) as CpuProfile;
  const heap = JSON.parse(readFileSync(join(dir, "heap.json"), "utf8")) as HeapSnapshot;
  const command = JSON.parse(readFileSync(join(dir, "command.json"), "utf8")) as string[];
  const intervalSeconds = cpu.stackTraces?.interval;
  const traces = cpu.stackTraces?.traces || [];
  if (!intervalSeconds || !Number.isFinite(intervalSeconds) || !traces.length) {
    throw new Error(`CPU profile for process ${pid} has no samples`);
  }
  const intervalUs = intervalSeconds * 1_000_000;
  for (const trace of traces) {
    const frames = trace.frames || [];
    if (!frames.length) continue;
    add(selfUs, frameKey(frames[0]!), intervalUs);
    const seen = new Set<string>();
    for (const frame of frames) {
      const key = frameKey(frame);
      if (seen.has(key)) continue;
      seen.add(key);
      add(cumulativeUs, key, intervalUs);
    }
  }
  const heapSummary = parseHeap(heap);
  processes.push({
    pid,
    command: command.join(" "),
    samples: traces.length,
    sampledMs: (traces.length * intervalUs) / 1000,
    heapObjects: heapSummary.objects,
    heapSelfBytes: heapSummary.selfBytes,
  });
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function cpuTable(applicationOnly: boolean): string {
  const rows = [...cumulativeUs]
    .filter(([key]) => !applicationOnly || (key.includes("/bun-opds-server/") && !key.includes("/node_modules/")))
    .map(([key, cumulative]) => ({ key, cumulative, self: selfUs.get(key) || 0 }))
    .sort((a, b) => b.cumulative - a.cumulative)
    .slice(0, 15);
  if (!rows.length) return "_No sampled frames._\n";
  return [
    "| Cumulative sampled ms | Self sampled ms | Frame |",
    "|---:|---:|---|",
    ...rows.map((row) => `| ${(row.cumulative / 1000).toFixed(3)} | ${(row.self / 1000).toFixed(3)} | ${escapeCell(row.key)} |`),
    "",
  ].join("\n");
}

const totalSamples = processes.reduce((sum, item) => sum + item.samples, 0);
const totalSampledMs = processes.reduce((sum, item) => sum + item.sampledMs, 0);
const totalHeapObjects = processes.reduce((sum, item) => sum + item.heapObjects, 0);
const totalHeapBytes = processes.reduce((sum, item) => sum + item.heapSelfBytes, 0);
const heapRows = [...heapTypes]
  .map(([name, values]) => ({ name, ...values }))
  .sort((a, b) => b.selfBytes - a.selfBytes)
  .slice(0, 15);

const report = `## Actual Bun test run — CPU and heap

- Profiled processes: ${processes.length}
- CPU samples: ${totalSamples}
- CPU sampled interval total: ${totalSampledMs.toFixed(3)} ms
- End-of-run live heap self size: ${(totalHeapBytes / 1024).toFixed(1)} KB (${totalHeapBytes} bytes)
- End-of-run live heap objects: ${totalHeapObjects}
- CPU interpretation: sampled milliseconds are interval-weighted stack hits. Timer, sleep, and I/O gaps can be attributed to the next sample, so use them to identify hotspots rather than as measured wall or on-CPU duration.
- Allocation limitation: Bun.generateHeapSnapshot() records live objects and self size at the end of the real test process; it is not cumulative allocation history and does not provide alloc_space or alloc_objects.

### Test processes

| PID | Samples | Sampled ms | Heap objects | Heap self size | Command |
|---:|---:|---:|---:|---:|---|
${processes.map((item) => `| ${item.pid} | ${item.samples} | ${item.sampledMs.toFixed(3)} | ${item.heapObjects} | ${(item.heapSelfBytes / 1024).toFixed(1)} KB | ${escapeCell(item.command)} |`).join("\n")}

### CPU — cumulative and self samples

${cpuTable(false)}
### CPU — application frames

${cpuTable(true)}
### Heap — top types by live self size

| Rank | Type | Objects | Self size |
|---:|---|---:|---:|
${heapRows.map((row, index) => `| ${index + 1} | ${escapeCell(row.name)} | ${row.count} | ${(row.selfBytes / 1024).toFixed(1)} KB |`).join("\n")}

Heap rows aggregate end-of-run live self size across test processes; they do not represent retained size or cumulative allocations.
`;

writeFileSync(outputPath, report);
