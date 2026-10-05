import { readFileSync, writeFileSync } from "node:fs";

const [cpuPath, heapPath, outputPath] = process.argv.slice(2);
if (!cpuPath || !heapPath || !outputPath) {
  throw new Error("usage: analyze-bun-profiles.ts <cpu.cpuprofile> <heap.md> <output.md>");
}

type Frame = { functionName?: string; url?: string; lineNumber?: number };
type CpuNode = { id: number; callFrame?: Frame; children?: number[] };
type CpuProfile = { nodes?: CpuNode[]; samples?: number[]; timeDeltas?: number[] };

function label(frame?: Frame): string {
  const name = frame?.functionName || "(anonymous)";
  const url = frame?.url || "(runtime)";
  const line = typeof frame?.lineNumber === "number" && frame.lineNumber >= 0 ? `:${frame.lineNumber + 1}` : "";
  return `${name} — ${url}${line}`.replaceAll("|", "\\|");
}

function isApplication(frame?: Frame): boolean {
  const url = frame?.url || "";
  return url.includes("/bun-opds-server/") && !url.includes("/node_modules/");
}

function addAncestors(id: number, value: number, totals: Map<number, number>, parents: Map<number, number>): void {
  let current: number | undefined = id;
  const seen = new Set<number>();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    totals.set(current, (totals.get(current) || 0) + value);
    current = parents.get(current);
  }
}

function cpuTable(profile: CpuProfile, applicationOnly: boolean): string {
  const nodes = new Map((profile.nodes || []).map((node) => [node.id, node]));
  const parents = new Map<number, number>();
  for (const node of nodes.values()) {
    for (const child of node.children || []) parents.set(child, node.id);
  }
  const cumulative = new Map<number, number>();
  const self = new Map<number, number>();
  const samples = profile.samples || [];
  const deltas = profile.timeDeltas || [];
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i]!;
    const value = deltas[i] || 0;
    self.set(id, (self.get(id) || 0) + value);
    addAncestors(id, value, cumulative, parents);
  }
  const rows = [...nodes.values()]
    .filter((node) => !applicationOnly || isApplication(node.callFrame))
    .map((node) => ({ node, cumulative: cumulative.get(node.id) || 0, self: self.get(node.id) || 0 }))
    .filter((row) => row.cumulative > 0)
    .sort((a, b) => b.cumulative - a.cumulative)
    .slice(0, 15);
  if (!rows.length) return "_No sampled frames._\n";
  return [
    "| Cumulative ms | Self ms | Frame |",
    "|---:|---:|---|",
    ...rows.map((row) => `| ${(row.cumulative / 1000).toFixed(3)} | ${(row.self / 1000).toFixed(3)} | ${label(row.node.callFrame)} |`),
    "",
  ].join("\n");
}

function markdownSection(markdown: string, heading: string, dataRows: number): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return "_Section unavailable in Bun heap report._\n";
  const selected: string[] = [];
  let rows = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) break;
    if (!line.trim()) {
      if (selected.length) break;
      continue;
    }
    selected.push(line);
    if (line.startsWith("|") && !line.includes("---") && !line.includes("Metric") && !line.includes("Rank")) {
      rows++;
      if (rows >= dataRows) break;
    }
  }
  return selected.length ? `${selected.join("\n")}\n` : "_Section unavailable in Bun heap report._\n";
}

const cpu = JSON.parse(readFileSync(cpuPath, "utf8")) as CpuProfile;
const heapMarkdown = readFileSync(heapPath, "utf8");
const cpuSamples = cpu.samples?.length || 0;
const totalCpuMs = (cpu.timeDeltas || []).reduce((sum, value) => sum + value, 0) / 1000;

const report = `## Supplemental representative workload — CPU and heap

- CPU samples: ${cpuSamples}
- CPU sampled duration: ${totalCpuMs.toFixed(3)} ms
- Heap format: Bun end-of-run heap snapshot Markdown.
- Allocation limitation: Bun 1.4.2 does not expose cumulative allocation-space or allocation-object samples here; the tables report live object counts plus self and retained size.

## CPU — cumulative and self time

${cpuTable(cpu, false)}
## CPU — application frames

${cpuTable(cpu, true)}
## Heap — summary

${markdownSection(heapMarkdown, "## Summary", 5)}
## Heap — top types by retained size

${markdownSection(heapMarkdown, "## Top 50 Types by Retained Size", 15)}
Heap type rows combine application and runtime objects because Bun's snapshot report does not attribute retained types to source frames.
`;

writeFileSync(outputPath, report);
