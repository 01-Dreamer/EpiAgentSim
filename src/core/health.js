import { clamp } from "./random.js";

export const HealthState = Object.freeze({
  SUSCEPTIBLE: "susceptible",
  EXPOSED: "exposed",
  INFECTED: "infected",
  RECOVERED: "recovered",
  DECEASED: "deceased"
});

export function exposeAgent(agent, now, sourceId = null) {
  if (agent.healthState !== HealthState.SUSCEPTIBLE) {
    return false;
  }

  agent.healthState = HealthState.EXPOSED;
  agent.exposedAt = now.toISOString();
  agent.exposedBy = sourceId;
  agent.memory ??= [];
  agent.memory.push({
    time: now.toISOString(),
    event: "exposed",
    sourceId
  });
  return true;
}

export function advanceDisease(agent, disease, now, rng) {
  if (agent.healthState === HealthState.EXPOSED) {
    const exposedHours = hoursBetween(agent.exposedAt, now);
    if (exposedHours >= disease.latentPeriodHours) {
      agent.healthState = HealthState.INFECTED;
      agent.infectedAt = now.toISOString();
      agent.symptomLevel = clamp((agent.symptomLevel ?? 0.3) + 0.25, 0, 1);
      addMemory(agent, now, "became_infectious");
    }
  }

  if (agent.healthState === HealthState.INFECTED) {
    agent.symptomLevel = clamp((agent.symptomLevel ?? 0.45) + 0.03, 0, 1);

    const infectedHours = hoursBetween(agent.infectedAt, now);
    if (infectedHours >= disease.infectiousPeriodHours) {
      const mortality = agent.treatmentType === "hospital"
        ? disease.treatedMortalityRate
        : disease.mortalityRate;

      if (rng() < mortality) {
        agent.healthState = HealthState.DECEASED;
        agent.deceasedAt = now.toISOString();
        addMemory(agent, now, "deceased");
      } else {
        agent.healthState = HealthState.RECOVERED;
        agent.recoveredAt = now.toISOString();
        agent.symptomLevel = 0;
        addMemory(agent, now, "recovered");
      }
    }
  }

  return agent;
}

export function isContagious(agent) {
  return agent.healthState === HealthState.INFECTED && agent.healthState !== HealthState.DECEASED;
}

function hoursBetween(dateLike, now) {
  if (!dateLike) {
    return 0;
  }
  return (now.getTime() - new Date(dateLike).getTime()) / 36e5;
}

function addMemory(agent, now, event) {
  agent.memory ??= [];
  agent.memory.push({ time: now.toISOString(), event });
}
