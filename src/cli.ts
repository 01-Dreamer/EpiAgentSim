import "dotenv/config";
import { Simulation } from "./core/simulation";
import { loadDefaultWorld } from "./dataLoader";
import { OpenAIPlanner } from "./services/openaiPlanner";
import { saveSimulationBase } from "./storage/jsonFileStore";

const args = parseArgs(process.argv.slice(2));
const environment = args.positionals[0] ?? "example";
const steps = Number(args.positionals[1] ?? args.steps ?? 24);
const world = await loadDefaultWorld(process.cwd(), environment);
const simulation = new Simulation({
  ...world,
  seed: String(world.config.rand_seed ?? "epi-agent-sim")
});

const planner = new OpenAIPlanner();
const initialSnapshot = simulation.snapshot();
const snapshots = await simulation.run(steps, {
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
  environment
}, null, 2));

const savedPath = await saveSimulationBase({
  baseDir: world.baseDir,
  config: world.config,
  agents: world.storageAgents,
  buildings: world.storageBuildings,
  world: world.storageWorld,
  startTimeText: world.storageStartTime,
  initialSnapshot,
  snapshots,
  stepHours: simulation.stepHours
});
console.log(`Saved movement/0.json through movement/${snapshots.length}.json under ${savedPath}`);

function parseArgs(argv) {
  const parsed: any = { positionals: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--llm") {
      parsed.llm = true;
    } else if (arg.startsWith("--")) {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      parsed.positionals.push(arg);
    }
  }
  return parsed;
}
