import "dotenv/config";
import { Simulation } from "./core/simulation.js";
import { loadDefaultWorld } from "./dataLoader.js";
import { OpenAIPlanner } from "./services/openaiPlanner.js";
import { saveSimulationBase } from "./storage/jsonFileStore.js";

const args = parseArgs(process.argv.slice(2));
const baseDir = args.base ?? process.env.SIM_BASE ?? "storage/base";
const world = await loadDefaultWorld(process.cwd(), baseDir);
const simulation = new Simulation({
  ...world,
  seed: args.seed ?? process.env.SIM_SEED ?? "epi-agent-sim"
});

const planner = new OpenAIPlanner();
const initialSnapshot = simulation.snapshot();
const snapshots = await simulation.run(Number(args.steps ?? 24), {
  planner,
  useLLM: Boolean(args.llm)
});

const finalSnapshot = snapshots.at(-1) ?? simulation.snapshot();
const result = {
  steps: snapshots.length,
  time: finalSnapshot.time,
  summary: finalSnapshot.summary,
  llm: Boolean(args.llm && planner.isEnabled()),
  snapshots
};

console.log(JSON.stringify({
  steps: result.steps,
  time: result.time,
  summary: result.summary,
  llm: result.llm,
  base: baseDir
}, null, 2));

const savedPath = await saveSimulationBase({
  baseDir: world.baseDir,
  config: world.config,
  agents: world.storageAgents,
  buildings: world.storageBuildings,
  initialSnapshot,
  snapshots,
  stepHours: simulation.stepHours
});
console.log(`Saved movement/0.json through movement/${snapshots.length}.json under ${savedPath}`);

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
