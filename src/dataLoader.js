import { readFile } from "node:fs/promises";
import path from "node:path";

const HEALTH_FROM_STORAGE = {
  S: "susceptible",
  E: "exposed",
  I: "infected",
  R: "recovered",
  D: "deceased"
};

export async function loadJson(filePath) {
  const absolutePath = path.resolve(filePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export async function loadDefaultWorld(rootDir = process.cwd(), baseDir = "storage/base") {
  const resolvedBaseDir = path.resolve(rootDir, baseDir);
  const [config, agentDocument, buildingDocument, initialMovement] = await Promise.all([
    loadJson(path.join(resolvedBaseDir, "config.json")),
    loadJson(path.join(resolvedBaseDir, "agent", "agents.json")),
    loadJson(path.join(resolvedBaseDir, "building", "buildings.json")),
    loadJson(path.join(resolvedBaseDir, "movement", "0.json"))
  ]);

  const startTime = storageTimeToIso(initialMovement.current_time ?? config.startTime);
  const places = buildingDocument.buildings.map(toPlace);
  const agents = agentDocument.agents.map((agent) => {
    const movement = initialMovement[agent.id] ?? {};
    return toAgent(agent, movement, startTime);
  });

  return {
    agents,
    places,
    disease: config.disease,
    startTime,
    stepHours: config.stepHours ?? 1,
    baseDir: resolvedBaseDir,
    config,
    storageAgents: agentDocument,
    storageBuildings: buildingDocument
  };
}

function toPlace(building) {
  return {
    id: String(building.id),
    name: building.name,
    type: toInternalPlaceType(building),
    location: building.location,
    storageType: building.type
  };
}

function toAgent(agent, movement, startTime) {
  const healthState = HEALTH_FROM_STORAGE[movement.health_state] ?? "susceptible";
  const currentPlaceId = String(movement.current_location ?? agent.home);

  return {
    id: String(agent.id),
    name: agent.name,
    age: agent.age,
    gender: agent.sex,
    role: String(agent.role ?? "worker").toLowerCase(),
    homePlaceId: String(agent.home),
    workPlaceId: agent.work_place == null ? null : String(agent.work_place),
    currentPlaceId,
    healthState,
    riskPerception: wealthToRisk(agent.wealth),
    feeling: movement.feeling,
    emotion: movement.emotion,
    symptomLevel: healthState === "infected" ? 0.45 : 0,
    exposedAt: movement.exposure_step == null ? undefined : stepToIso(startTime, movement.exposure_step),
    infectedAt: movement.infectious_step == null ? undefined : stepToIso(startTime, movement.infectious_step),
    recoveredAt: movement.recovery_step == null ? undefined : stepToIso(startTime, movement.recovery_step),
    deceasedAt: movement.death_step == null ? undefined : stepToIso(startTime, movement.death_step),
    chat: movement.chat ?? {},
    publish: movement.publish ?? null,
    plan: movement.daily_plan?.text ?? "",
    actionDescription: movement.current_action_description,
    environmentDescription: movement.current_environment_description,
    memory: movement.memory ?? []
  };
}

function toInternalPlaceType(building) {
  if (building.type === "RESIDENTIAL") {
    return "home";
  }
  if (building.type === "MEDICAL") {
    return "hospital";
  }
  if (building.type === "OCCUPATION") {
    return /school|小学|中学|高中|教育/i.test(building.name) ? "school" : "work";
  }
  return "market";
}

function wealthToRisk(wealth) {
  if (wealth === "H") {
    return 0.65;
  }
  if (wealth === "M") {
    return 0.45;
  }
  return 0.3;
}

function storageTimeToIso(value) {
  if (value.endsWith("Z")) {
    return value;
  }
  if (/\.\d{3}$/.test(value)) {
    return `${value}Z`;
  }
  return `${value}.000Z`;
}

function stepToIso(startTime, step) {
  return new Date(new Date(startTime).getTime() + Number(step) * 36e5).toISOString();
}
