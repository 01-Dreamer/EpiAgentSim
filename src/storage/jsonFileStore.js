import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const HEALTH_TO_STORAGE = {
  susceptible: "S",
  exposed: "E",
  infected: "I",
  recovered: "R",
  deceased: "D"
};

export async function saveSimulationBase({ baseDir, config, agents, buildings, initialSnapshot, snapshots, stepHours = 1 }) {
  const absoluteBaseDir = path.resolve(baseDir);
  await Promise.all([
    writeJson(path.join(absoluteBaseDir, "config.json"), config),
    writeJson(path.join(absoluteBaseDir, "agent", "agents.json"), agents),
    writeJson(path.join(absoluteBaseDir, "building", "buildings.json"), buildings),
    writeMovement(absoluteBaseDir, 0, initialSnapshot, initialSnapshot.time, stepHours)
  ]);

  for (const snapshot of snapshots) {
    await writeMovement(absoluteBaseDir, snapshot.step, snapshot, initialSnapshot.time, stepHours);
  }

  return absoluteBaseDir;
}

async function writeMovement(baseDir, movementId, snapshot, startTime, stepHours) {
  const movement = toMovementDocument(snapshot, movementId, startTime, stepHours);
  return writeJson(path.join(baseDir, "movement", `${movementId}.json`), movement);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

function toMovementDocument(snapshot, movementId, startTime, stepHours) {
  const currentTime = new Date(new Date(startTime).getTime() + movementId * stepHours * 36e5);
  const document = {
    id: String(movementId),
    current_time: formatStorageTime(currentTime)
  };

  for (const agent of snapshot.agents) {
    document[agent.id] = {
      feeling: agent.feeling ?? inferFeeling(agent),
      emotion: agent.emotion ?? "平和",
      health_state: HEALTH_TO_STORAGE[agent.healthState] ?? "S",
      exposure_step: dateToStep(agent.exposedAt, startTime, stepHours),
      infectious_step: dateToStep(agent.infectedAt, startTime, stepHours),
      recovery_step: dateToStep(agent.recoveredAt, startTime, stepHours),
      death_step: dateToStep(agent.deceasedAt, startTime, stepHours),
      chat: agent.chat ?? {},
      publish: agent.publish ?? null,
      current_location: numericIdIfPossible(agent.currentPlaceId),
      current_action_description: agent.actionDescription ?? "保持当前状态。",
      current_environment_description: agent.environmentDescription ?? null,
      daily_plan: agent.plan ? { text: agent.plan } : {},
      memory: agent.memory ?? []
    };
  }

  return document;
}

function dateToStep(value, startTime, stepHours) {
  if (!value) {
    return null;
  }
  return Math.max(0, Math.round((new Date(value).getTime() - new Date(startTime).getTime()) / (stepHours * 36e5)));
}

function formatStorageTime(value) {
  return value.toISOString().replace(/\.\d{3}Z$/, "");
}

function numericIdIfPossible(value) {
  const text = String(value);
  return /^\d+$/.test(text) ? Number(text) : text;
}

function inferFeeling(agent) {
  if (agent.healthState === "deceased") {
    return "无生命体征";
  }
  if (agent.healthState === "infected") {
    return (agent.symptomLevel ?? 0) > 0.7 ? "症状明显" : "身体不适";
  }
  if (agent.healthState === "exposed") {
    return "略感不适";
  }
  if (agent.healthState === "recovered") {
    return "恢复中";
  }
  return "平静";
}
