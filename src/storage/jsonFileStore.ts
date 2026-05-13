import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const HEALTH_TO_STORAGE = {
  susceptible: "S",
  exposed: "E",
  infected: "I",
  recovered: "R",
  deceased: "D"
};

export async function saveSimulationBase({
  baseDir,
  config,
  agents,
  buildings,
  world,
  startTimeText,
  initialSnapshot,
  snapshots,
  stepHours = 1
}) {
  const absoluteBaseDir = path.resolve(baseDir);
  await Promise.all([
    writeJson(path.join(absoluteBaseDir, "config.json"), config),
    writeJson(path.join(absoluteBaseDir, "agents.json"), agents),
    writeJson(path.join(absoluteBaseDir, "buildings.json"), buildings),
    writeMovement(absoluteBaseDir, 0, initialSnapshot, startTimeText, stepHours, world, config)
  ]);

  for (const snapshot of snapshots) {
    await writeMovement(absoluteBaseDir, snapshot.step, snapshot, startTimeText, stepHours, world, config);
  }

  return absoluteBaseDir;
}

async function writeMovement(baseDir, movementId, snapshot, startTimeText, stepHours, world, config) {
  const movement = toMovementDocument(snapshot, movementId, startTimeText, stepHours, world, config);
  return writeJson(path.join(baseDir, "movement", `${movementId}.json`), movement);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

function toMovementDocument(snapshot, movementId, startTimeText, stepHours, world, config) {
  const document: any = {
    step: movementId,
    current_time: addStepsToStorageTime(startTimeText, movementId, stepHours),
    world: world ?? {},
    agents: {}
  };

  for (const agent of snapshot.agents) {
    document.agents[agent.id] = {
      feeling: inferFeeling(agent, config, movementId),
      health_state: HEALTH_TO_STORAGE[agent.healthState] ?? "S",
      exposure_step: dateToStep(agent.exposedAt, startTimeText, stepHours),
      infectious_step: dateToStep(agent.infectedAt, startTimeText, stepHours),
      recovery_step: dateToStep(agent.recoveredAt, startTimeText, stepHours),
      death_step: dateToStep(agent.deceasedAt, startTimeText, stepHours),
      current_location: String(agent.currentPlaceId),
      current_action: {
        type: agent.actionType ?? actionTypeFromDescription(agent.actionDescription),
        description: agent.actionDescription ?? "保持当前状态。"
      },
      daily_plan: Array.isArray(agent.plan) ? agent.plan : planToArray(agent.plan, startTimeText, movementId, stepHours),
      memory: agent.memory ?? { today: [], daily_summaries: [], weekly_summaries: [], monthly_summaries: [] }
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

function addStepsToStorageTime(startTimeText, movementId, stepHours) {
  const offset = extractOffset(startTimeText);
  const date = new Date(normalizeStorageTime(startTimeText));
  const current = new Date(date.getTime() + movementId * stepHours * 36e5);
  return formatWithOffset(current, offset);
}

function normalizeStorageTime(value) {
  if (value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  if (/\.\d{3}$/.test(value)) {
    return `${value}Z`;
  }
  return `${value}.000Z`;
}

function extractOffset(value) {
  return value.match(/([+-]\d{2}:\d{2})$/)?.[1] ?? "+00:00";
}

function formatWithOffset(date, offset) {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  const shifted = new Date(date.getTime() + sign * (hours * 60 + minutes) * 60000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, offset);
}

function inferFeeling(agent, config, movementId) {
  const state = HEALTH_TO_STORAGE[agent.healthState] ?? "S";
  const feelings = config.state_feelings?.[state] ?? [];
  if (feelings.length) {
    const index = Math.abs(hashText(`${agent.id}:${movementId}:${state}`)) % feelings.length;
    return feelings[index];
  }

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

function actionTypeFromDescription(description) {
  if (description === "go_to_hospital" || description === "receive_treatment") {
    return "SEEK_MEDICAL_CARE";
  }
  if (description === "work_or_school") {
    return "WORK_OR_SCHOOL";
  }
  if (description === "stay_home") {
    return "RESTING";
  }
  return "MOVING";
}

function planToArray(plan, startTimeText, movementId, stepHours) {
  if (!plan) {
    return [];
  }
  return [
    {
      time: addStepsToStorageTime(startTimeText, movementId, stepHours),
      content: String(plan)
    }
  ];
}

function hashText(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}
