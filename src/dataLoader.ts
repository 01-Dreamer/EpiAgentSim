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

export async function loadDefaultWorld(rootDir = process.cwd(), environment = "example") {
  const resolvedBaseDir = resolveBaseDir(rootDir, environment);
  const [config, agentDocument, buildingDocument, initialMovement] = await Promise.all([
    loadJson(path.join(resolvedBaseDir, "config.json")),
    loadJson(path.join(resolvedBaseDir, "agents.json")),
    loadJson(path.join(resolvedBaseDir, "buildings.json")),
    loadJson(path.join(resolvedBaseDir, "movement", "0.json"))
  ]);

  const startTime = storageTimeToIso(initialMovement.current_time ?? config.startTime);
  const stepHours = (config.step_minutes ?? 60) / 60;
  const buildings = normalizeBuildings(buildingDocument);
  const agentsInput = normalizeAgents(agentDocument);
  const movementAgents = initialMovement.agents ?? {};
  const places = buildings.map(toPlace);
  const agents = agentsInput.map((agent) => {
    const movement = movementAgents[agent.id] ?? {};
    return toAgent(agent, movement, startTime, stepHours);
  });

  return {
    agents,
    places,
    disease: toDiseaseConfig(config),
    startTime,
    stepHours,
    baseDir: resolvedBaseDir,
    config,
    storageAgents: agentDocument,
    storageBuildings: buildingDocument,
    storageWorld: initialMovement.world ?? {},
    storageStartTime: initialMovement.current_time ?? config.startTime
  };
}

function resolveBaseDir(rootDir, environment) {
  if (path.isAbsolute(environment) || environment.includes(path.sep)) {
    return path.resolve(rootDir, environment);
  }
  return path.resolve(rootDir, "storage", environment);
}

function normalizeAgents(agentDocument) {
  return Array.isArray(agentDocument) ? agentDocument : agentDocument.agents ?? [];
}

function normalizeBuildings(buildingDocument) {
  if (Array.isArray(buildingDocument)) {
    return buildingDocument;
  }
  if (Array.isArray(buildingDocument.buildings)) {
    return buildingDocument.buildings;
  }
  return [buildingDocument];
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

function toAgent(agent, movement, startTime, stepHours) {
  const healthState = HEALTH_FROM_STORAGE[movement.health_state] ?? "susceptible";
  const currentPlaceId = String(movement.current_location ?? agent.home_building_id);

  return {
    id: String(agent.id),
    name: agent.name,
    age: agent.age,
    gender: agent.sex,
    role: String(agent.role ?? "worker").toLowerCase(),
    homePlaceId: String(agent.home_building_id),
    workPlaceId: agent.workplace_building_id == null ? null : String(agent.workplace_building_id),
    currentPlaceId,
    healthState,
    riskPerception: awarenessToRisk(agent.behavior_tendencies?.health_awareness),
    riskTolerance: agent.behavior_tendencies?.risk_tolerance,
    policyCompliance: agent.behavior_tendencies?.policy_compliance,
    socialActivity: agent.behavior_tendencies?.social_activity,
    feeling: movement.feeling,
    symptomLevel: healthState === "infected" ? 0.45 : 0,
    exposedAt: movement.exposure_step == null ? undefined : stepToIso(startTime, movement.exposure_step, stepHours),
    infectedAt: movement.infectious_step == null ? undefined : stepToIso(startTime, movement.infectious_step, stepHours),
    recoveredAt: movement.recovery_step == null ? undefined : stepToIso(startTime, movement.recovery_step, stepHours),
    deceasedAt: movement.death_step == null ? undefined : stepToIso(startTime, movement.death_step, stepHours),
    plan: movement.daily_plan ?? [],
    actionType: movement.current_action?.type,
    actionDescription: movement.current_action?.description,
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
  if (building.type === "SCHOOL") {
    return "school";
  }
  if (building.type === "OFFICE" || building.type === "OCCUPATION") {
    return /school|小学|中学|高中|教育/i.test(building.name) ? "school" : "work";
  }
  return "market";
}

function awarenessToRisk(level) {
  if (level === "H") {
    return 0.65;
  }
  if (level === "M") {
    return 0.45;
  }
  return 0.3;
}

function toDiseaseConfig(config) {
  const probabilities = config.transition_probabilities_per_step ?? {};
  return {
    name: config.disease?.name ?? "configured disease",
    infectedRadiusMeters: config.infected_radius_meters ?? config.contact_radius_meters ?? 50,
    infectionProbability: probabilities.S_to_E ?? probabilities.S_to_E_per_contact ?? 0,
    transitionProbabilities: {
      E_to_I: probabilities.E_to_I ?? 0,
      I_to_R: probabilities.I_to_R ?? 0,
      I_to_D: probabilities.I_to_D ?? 0
    },
    stateFeelings: config.state_feelings ?? {}
  };
}

function storageTimeToIso(value) {
  if (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  if (/\.\d{3}$/.test(value)) {
    return `${value}Z`;
  }
  return `${value}.000Z`;
}

function stepToIso(startTime, step, stepHours) {
  return new Date(new Date(startTime).getTime() + Number(step) * stepHours * 36e5).toISOString();
}
