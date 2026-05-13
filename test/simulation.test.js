import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/core/simulation.js";

const places = [
  { id: "home", name: "Home", type: "home", location: [39.9042, 116.4074] },
  { id: "school", name: "School", type: "school", location: [39.9042, 116.4074] },
  { id: "clinic", name: "Clinic", type: "hospital", location: [39.9043, 116.4075] }
];

const disease = {
  latentPeriodHours: 1,
  infectiousPeriodHours: 10,
  infectedRadiusMeters: 100,
  infectionProbability: 1,
  mortalityRate: 0,
  treatedMortalityRate: 0
};

test("infectious agents can expose susceptible agents in range", async () => {
  const simulation = new Simulation({
    places,
    disease,
    seed: "infection-test",
    agents: [
      {
        id: "a",
        name: "A",
        healthState: "infected",
        homePlaceId: "home",
        workPlaceId: "school",
        currentPlaceId: "school",
        infectedAt: "2026-05-13T00:00:00.000Z"
      },
      {
        id: "b",
        name: "B",
        healthState: "susceptible",
        homePlaceId: "home",
        workPlaceId: "school",
        currentPlaceId: "school"
      }
    ]
  });

  const snapshot = await simulation.step();
  assert.equal(snapshot.agents.find((agent) => agent.id === "b").healthState, "exposed");
  assert.equal(snapshot.events.some((event) => event.type === "infection"), true);
});

test("exposed agents become infected after latent period", async () => {
  const simulation = new Simulation({
    places,
    disease,
    seed: "latent-test",
    agents: [
      {
        id: "a",
        name: "A",
        healthState: "exposed",
        exposedAt: "2026-05-12T22:00:00.000Z",
        homePlaceId: "home",
        currentPlaceId: "home"
      }
    ]
  });

  const snapshot = await simulation.step();
  assert.equal(snapshot.agents[0].healthState, "infected");
});
