import "dotenv/config";
import express from "express";
import cors from "cors";
import { Simulation } from "./core/simulation.js";
import { loadDefaultWorld } from "./dataLoader.js";
import { OpenAIPlanner } from "./services/openaiPlanner.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const world = await loadDefaultWorld();
const planner = new OpenAIPlanner();
let simulation = createSimulation(world);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    llmEnabled: planner.isEnabled(),
    time: simulation.currentTime.toISOString()
  });
});

app.get("/state", (_req, res) => {
  res.json(simulation.snapshot());
});

app.post("/simulate/step", async (req, res, next) => {
  try {
    const steps = Math.max(1, Number(req.body?.steps ?? 1));
    const snapshots = await simulation.run(steps, {
      planner,
      useLLM: Boolean(req.body?.useLLM)
    });
    res.json({
      status: "success",
      snapshots,
      final: snapshots.at(-1)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/simulate/run", async (req, res, next) => {
  try {
    simulation = createSimulation({
      agents: req.body?.agents ?? world.agents,
      places: req.body?.places ?? world.places,
      disease: req.body?.disease ?? world.disease
    });
    const steps = Math.max(1, Number(req.body?.steps ?? 24));
    const snapshots = await simulation.run(steps, {
      planner,
      useLLM: Boolean(req.body?.useLLM)
    });
    res.json({
      status: "success",
      snapshots,
      final: snapshots.at(-1)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/agents", (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be an agent array." });
    return;
  }
  world.agents = req.body;
  simulation = createSimulation(world);
  res.json({ status: "success", count: world.agents.length });
});

app.post("/reset", (_req, res) => {
  simulation = createSimulation(world);
  res.json({ status: "success", state: simulation.snapshot() });
});

app.use((error, _req, res, _next) => {
  res.status(500).json({
    error: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`EpiAgentSim server listening on http://localhost:${port}`);
});

function createSimulation(inputWorld) {
  return new Simulation({
    ...inputWorld,
    seed: process.env.SIM_SEED ?? "epi-agent-sim"
  });
}
