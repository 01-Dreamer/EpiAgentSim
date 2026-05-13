import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { choice, createRng } from "./core/random";

type Distribution = Record<string, number>;

type GeneratorConfig = {
  rand_seed?: number | string;
  step_minutes?: number;
  start_time?: string;
  total_agents?: number;
  total_buildings?: number;
  initial_infected?: number;
  initial_infected_agents?: number;
  center_location?: [number, number];
  agent_role_distribution?: Distribution;
  building_type_distribution?: Distribution;
  sex_distribution?: Distribution;
  state_feelings?: Record<string, string[]>;
};

const ROLE_TO_WORK_BUILDING: Record<string, string | null> = {
  STUDENT: "SCHOOL",
  TEACHER: "SCHOOL",
  WORKER: "OFFICE",
  MERCHANT: "MARKET",
  DOCTOR: "MEDICAL",
  RETIRED: null,
  UNEMPLOYED: null
};

const BUILDING_CAPACITY: Record<string, number> = {
  RESIDENTIAL: 6,
  SCHOOL: 200,
  OFFICE: 45,
  MARKET: 90,
  MEDICAL: 60,
  PUBLIC: 120
};

const GIVEN_NAMES = [
  "Alex", "Ava", "Ben", "Chen", "Dora", "Eli", "Fang", "Grace", "Hao", "Iris",
  "Jin", "Kai", "Lina", "Mia", "Noah", "Owen", "Ping", "Qiao", "Rui", "Sara",
  "Tao", "Uma", "Vera", "Wei", "Xiao", "Yan", "Zane"
];

const FAMILY_NAMES = [
  "Wang", "Li", "Zhang", "Chen", "Liu", "Yang", "Zhao", "Huang", "Wu", "Zhou",
  "Xu", "Sun", "Ma", "Hu", "Guo", "Lin"
];

const args = process.argv.slice(2);
const environment = args[0] ?? "example";
const baseDir = resolveBaseDir(process.cwd(), environment);
const config = await readJson<GeneratorConfig>(path.join(baseDir, "config.json"));
const rng = createRng(config.rand_seed ?? 42);

const buildings = generateBuildings(config, rng);
const agents = generateAgents(config, buildings, rng);
const movement0 = generateInitialMovement(config, agents, rng);

await mkdir(path.join(baseDir, "movement"), { recursive: true });
await Promise.all([
  writeJson(path.join(baseDir, "buildings.json"), buildings),
  writeJson(path.join(baseDir, "agents.json"), agents),
  writeJson(path.join(baseDir, "movement", "0.json"), movement0)
]);
await clearGeneratedMovements(path.join(baseDir, "movement"));

console.log(JSON.stringify({
  environment,
  baseDir,
  agents: agents.length,
  buildings: buildings.length,
  movement: "movement/0.json"
}, null, 2));

function generateBuildings(config: GeneratorConfig, rng: () => number) {
  const totalAgents = config.total_agents ?? 100;
  const totalBuildings = config.total_buildings ?? Math.max(8, Math.ceil(totalAgents / 4));
  const counts = distributionToCounts(config.building_type_distribution ?? {}, totalBuildings);
  ensureMinimum(counts, "RESIDENTIAL", 1);
  ensureMinimum(counts, "SCHOOL", 1);
  ensureMinimum(counts, "OFFICE", 1);
  ensureMinimum(counts, "MARKET", 1);
  ensureMinimum(counts, "MEDICAL", 1);
  ensureMinimum(counts, "PUBLIC", 1);

  const center = config.center_location ?? [39.9042, 116.4074];
  const buildings: any[] = [];
  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) {
      const id = `building_${buildings.length + 1}`;
      buildings.push({
        id,
        name: `${toTitle(type)}_${i + 1}`,
        type,
        location: jitterLocation(center, rng),
        capacity: BUILDING_CAPACITY[type] ?? 50
      });
    }
  }
  return buildings;
}

function generateAgents(config: GeneratorConfig, buildings: any[], rng: () => number) {
  const totalAgents = config.total_agents ?? 100;
  const roleCounts = distributionToCounts(config.agent_role_distribution ?? {}, totalAgents);
  const sexCounts = distributionToCounts(config.sex_distribution ?? { MALE: 0.5, FEMALE: 0.5 }, totalAgents);
  const roles = shuffle(expandCounts(roleCounts), rng);
  const sexes = shuffle(expandCounts(sexCounts), rng);

  const homes = buildings.filter((building) => building.type === "RESIDENTIAL");
  const byType = new Map<string, any[]>();
  for (const building of buildings) {
    const list = byType.get(building.type) ?? [];
    list.push(building);
    byType.set(building.type, list);
  }

  return roles.map((role, index) => {
    const home = homes[index % homes.length];
    const workplaceType = ROLE_TO_WORK_BUILDING[role] ?? "PUBLIC";
    const workplace = workplaceType ? choice(byType.get(workplaceType) ?? [], rng) : null;
    return {
      id: `agent_${index + 1}`,
      name: `${choice(GIVEN_NAMES, rng)} ${choice(FAMILY_NAMES, rng)}`,
      age: ageForRole(role, rng),
      sex: sexes[index] ?? "MALE",
      role,
      home_building_id: home.id,
      workplace_building_id: workplace?.id ?? null,
      personality: {
        big5: {
          openness: level(rng),
          conscientiousness: level(rng),
          extraversion: level(rng),
          agreeableness: level(rng),
          neuroticism: level(rng)
        }
      },
      behavior_tendencies: {
        risk_tolerance: level(rng),
        policy_compliance: level(rng),
        health_awareness: role === "DOCTOR" ? "H" : level(rng),
        social_activity: role === "RETIRED" ? "L" : level(rng)
      },
      socioeconomic: {
        wealth_level: wealthForRole(role, rng)
      }
    };
  });
}

function generateInitialMovement(config: GeneratorConfig, agents: any[], rng: () => number) {
  const startTime = normalizeStartTime(config.start_time);
  const initialInfected = clampCount(
    config.initial_infected ?? config.initial_infected_agents ?? Math.max(1, Math.ceil(agents.length * 0.03)),
    agents.length
  );
  const infectedIds = new Set(shuffle(agents.map((agent) => agent.id), rng).slice(0, initialInfected));
  const movementAgents: Record<string, any> = {};

  for (const agent of agents) {
    const isInfected = infectedIds.has(agent.id);
    const healthState = isInfected ? "I" : "S";
    movementAgents[agent.id] = {
      feeling: pickFeeling(config, healthState, rng),
      health_state: healthState,
      exposure_step: isInfected ? 0 : null,
      infectious_step: isInfected ? 0 : null,
      recovery_step: null,
      death_step: null,
      current_location: agent.home_building_id,
      current_action: {
        type: "RESTING",
        description: "Just woke up and is getting ready to start a new day."
      },
      daily_plan: [],
      memory: {
        today: [],
        daily_summaries: [],
        weekly_summaries: [],
        monthly_summaries: []
      }
    };
  }

  return {
    step: 0,
    current_time: startTime,
    world: {
      news: ""
    },
    agents: movementAgents
  };
}

function distributionToCounts(distribution: Distribution, total: number) {
  const entries = Object.entries(distribution);
  if (!entries.length) {
    return { UNKNOWN: total };
  }

  const sum = entries.reduce((acc, [, value]) => acc + value, 0);
  if (sum <= 0) {
    return { UNKNOWN: total };
  }
  const raw = entries.map(([key, value]) => {
    const exact = (value / sum) * total;
    return { key, exact, count: Math.floor(exact) };
  });
  let remaining = total - raw.reduce((acc, item) => acc + item.count, 0);
  raw.sort((a, b) => (b.exact - b.count) - (a.exact - a.count));
  for (let i = 0; i < raw.length && remaining > 0; i += 1, remaining -= 1) {
    raw[i].count += 1;
  }
  return Object.fromEntries(raw.map((item) => [item.key, item.count]));
}

function expandCounts(counts: Record<string, number>) {
  return Object.entries(counts).flatMap(([key, count]) => Array.from({ length: count }, () => key));
}

function ensureMinimum(counts: Record<string, number>, key: string, minimum: number) {
  counts[key] = Math.max(counts[key] ?? 0, minimum);
}

function shuffle<T>(items: T[], rng: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function jitterLocation(center: [number, number], rng: () => number): [number, number] {
  const radiusMeters = 1200;
  const distance = Math.sqrt(rng()) * radiusMeters;
  const angle = rng() * Math.PI * 2;
  const northMeters = Math.cos(angle) * distance;
  const eastMeters = Math.sin(angle) * distance;
  const lat = center[0] + northMeters / 111320;
  const lon = center[1] + eastMeters / (111320 * Math.cos((center[0] * Math.PI) / 180));

  return [
    roundCoord(clamp(lat, -90, 90)),
    roundCoord(clamp(lon, -180, 180))
  ];
}

function roundCoord(value: number) {
  return Number(value.toFixed(7));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function level(rng: () => number) {
  return choice(["L", "M", "H"], rng);
}

function ageForRole(role: string, rng: () => number) {
  if (role === "STUDENT") {
    return randomInt(7, 22, rng);
  }
  if (role === "RETIRED") {
    return randomInt(60, 85, rng);
  }
  return randomInt(23, 59, rng);
}

function wealthForRole(role: string, rng: () => number) {
  if (role === "DOCTOR") {
    return choice(["M", "H"], rng);
  }
  if (role === "RETIRED" || role === "UNEMPLOYED" || role === "STUDENT") {
    return choice(["L", "M"], rng);
  }
  return level(rng);
}

function randomInt(min: number, max: number, rng: () => number) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickFeeling(config: GeneratorConfig, state: string, rng: () => number) {
  return choice(config.state_feelings?.[state] ?? ["平静"], rng);
}

function clampCount(value: number, max: number) {
  return Math.min(max, Math.max(0, Math.floor(value)));
}

function normalizeStartTime(value?: string) {
  if (!value) {
    return "2026-05-13T08:00:00+08:00";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T08:00:00+08:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00+08:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value}+08:00`;
  }

  return value;
}

function toTitle(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function resolveBaseDir(rootDir: string, environment: string) {
  if (path.isAbsolute(environment) || environment.includes(path.sep)) {
    return path.resolve(rootDir, environment);
  }
  return path.resolve(rootDir, "storage", environment);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function clearGeneratedMovements(movementDir: string) {
  const entries = await readdir(movementDir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name) && entry.name !== "0.json")
    .map((entry) => rm(path.join(movementDir, entry.name))));
}
