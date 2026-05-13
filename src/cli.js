import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Simulation } from "./core/simulation.js";
import { loadDefaultWorld } from "./dataLoader.js";
import { OpenAIPlanner } from "./services/openaiPlanner.js";

const args = parseArgs(process.argv.slice(2));
const world = await loadDefaultWorld();
const simulation = new Simulation({
  ...world,
  seed: args.seed ?? process.env.SIM_SEED ?? "epi-agent-sim"
});

const planner = new OpenAIPlanner();
const snapshots = await simulation.run(Number(args.steps ?? 24), {
  planner,
  useLLM: Boolean(args.llm)
});

const finalSnapshot = snapshots.at(-1) ?? simulation.snapshot();
console.log(JSON.stringify({
  steps: snapshots.length,
  time: finalSnapshot.time,
  summary: finalSnapshot.summary,
  llm: Boolean(args.llm && planner.isEnabled())
}, null, 2));

if (args.out) {
  const outPath = path.resolve(args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ snapshots }, null, 2));
  console.log(`Saved ${snapshots.length} snapshots to ${outPath}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--llm") {
      parsed.llm = true;
    } else if (arg.startsWith("--")) {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
