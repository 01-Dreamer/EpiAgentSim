import { createRng } from "./random";
import { distanceMeters } from "./geo";
import { advanceDisease, appendMemory, exposeAgent, HealthState, isContagious } from "./health";
import { chooseRuleBasedDecision } from "./policy";

export class Simulation {
  constructor({ agents, places, disease, seed = "epi-agent-sim", startTime = "2026-05-13T00:00:00.000Z", stepHours = 1 }) {
    this.initialAgents = structuredClone(agents);
    this.places = structuredClone(places);
    this.disease = { ...disease };
    this.seed = seed;
    this.stepHours = stepHours;
    this.rng = createRng(seed);
    this.currentTime = new Date(startTime);
    this.stepIndex = 0;
    this.agents = normalizeAgents(structuredClone(agents), this.places, this.currentTime);
    this.placeById = new Map(this.places.map((place) => [place.id, place]));
    this.history = [];
  }

  reset(startTime = "2026-05-13T00:00:00.000Z") {
    this.rng = createRng(this.seed);
    this.currentTime = new Date(startTime);
    this.stepIndex = 0;
    this.agents = normalizeAgents(structuredClone(this.initialAgents), this.places, this.currentTime);
    this.history = [];
    return this.snapshot();
  }

  async step({ planner = null, useLLM = false } = {}) {
    const events = [];

    for (const agent of this.agents) {
      advanceDisease(agent, this.disease, this.currentTime, this.rng);
    }

    for (const agent of this.agents) {
      const decision = await this.decide(agent, planner, useLLM);
      applyDecision(agent, decision, this.placeById, this.currentTime, events);
    }

    events.push(...this.spreadInfections());

    this.stepIndex += 1;
    this.currentTime = new Date(this.currentTime.getTime() + this.stepHours * 36e5);
    const snapshot = this.snapshot(events);
    this.history.push(snapshot);
    return snapshot;
  }

  async run(steps, options = {}) {
    const snapshots = [];
    for (let i = 0; i < steps; i += 1) {
      snapshots.push(await this.step(options));
    }
    return snapshots;
  }

  async decide(agent, planner, useLLM) {
    const context = this.contextForDecision();
    if (useLLM && planner?.isEnabled?.()) {
      try {
        const decision = await planner.decide(agent, context);
        if (decision?.destinationId && this.placeById.has(decision.destinationId)) {
          return decision;
        }
      } catch (error) {
        appendMemory(agent, {
          time: this.currentTime.toISOString(),
          event: "llm_decision_failed",
          detail: error.message
        });
      }
    }

    return chooseRuleBasedDecision(agent, context, this.rng);
  }

  spreadInfections() {
    const events = [];
    for (const source of this.agents.filter(isContagious)) {
      const sourcePlace = this.placeById.get(source.currentPlaceId);
      if (!sourcePlace) {
        continue;
      }

      for (const target of this.agents) {
        if (target.id === source.id || target.healthState !== HealthState.SUSCEPTIBLE) {
          continue;
        }

        const targetPlace = this.placeById.get(target.currentPlaceId);
        if (!targetPlace) {
          continue;
        }

        const distance = distanceMeters(sourcePlace.location, targetPlace.location);
        if (distance <= this.disease.infectedRadiusMeters && this.rng() < this.disease.infectionProbability) {
          exposeAgent(target, this.currentTime, source.id);
          events.push({
            type: "infection",
            time: this.currentTime.toISOString(),
            sourceId: source.id,
            targetId: target.id,
            distanceMeters: Math.round(distance)
          });
        }
      }
    }
    return events;
  }

  contextForDecision() {
    return {
      currentTime: this.currentTime,
      disease: this.disease,
      places: this.places,
      placeById: this.placeById,
      summary: this.summary()
    };
  }

  summary() {
    return this.agents.reduce((acc, agent) => {
      acc[agent.healthState] = (acc[agent.healthState] ?? 0) + 1;
      return acc;
    }, {});
  }

  snapshot(events = []) {
    return {
      step: this.stepIndex,
      time: this.currentTime.toISOString(),
      summary: this.summary(),
      events,
      agents: structuredClone(this.agents)
    };
  }
}

function normalizeAgents(agents, places, now) {
  const placeIds = new Set(places.map((place) => place.id));
  return agents.map((agent) => {
    const homePlaceId = placeIds.has(agent.homePlaceId) ? agent.homePlaceId : places[0]?.id;
    const currentPlaceId = placeIds.has(agent.currentPlaceId) ? agent.currentPlaceId : homePlaceId;
    return {
      riskPerception: 0.4,
      symptomLevel: agent.healthState === HealthState.INFECTED ? 0.45 : 0,
      memory: [],
      ...agent,
      homePlaceId,
      currentPlaceId,
      infectedAt: agent.healthState === HealthState.INFECTED
        ? agent.infectedAt ?? now.toISOString()
        : agent.infectedAt
    };
  });
}

function applyDecision(agent, decision, placeById, now, events) {
  if (!decision?.destinationId || !placeById.has(decision.destinationId)) {
    return;
  }

  const previousPlaceId = agent.currentPlaceId;
  agent.plan = decision.plan ?? agent.plan ?? "";
  agent.actionDescription = decision.actionDescription ?? "move";
  agent.currentPlaceId = decision.destinationId;

  if (decision.treatmentDecision === "hospital") {
    agent.treatmentType = "hospital";
    agent.treatedAt ??= now.toISOString();
  }

  if (previousPlaceId !== agent.currentPlaceId) {
    events.push({
      type: "movement",
      time: now.toISOString(),
      agentId: agent.id,
      from: previousPlaceId,
      to: agent.currentPlaceId,
      action: agent.actionDescription
    });
  }
}
