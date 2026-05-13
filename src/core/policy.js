import { choice, clamp } from "./random.js";
import { HealthState } from "./health.js";

export function chooseRuleBasedDecision(agent, context, rng) {
  const { places, currentTime } = context;
  const hour = currentTime.getUTCHours();
  const hospitals = places.filter((place) => place.type === "hospital");
  const markets = places.filter((place) => place.type === "market");
  const publicPlaces = places.filter((place) => ["market", "school", "work"].includes(place.type));

  if (agent.healthState === HealthState.DECEASED) {
    return {
      plan: "No action.",
      actionDescription: "deceased",
      destinationId: agent.currentPlaceId,
      treatmentDecision: "none"
    };
  }

  if (agent.healthState === HealthState.INFECTED) {
    const treatmentChance = clamp((agent.riskPerception ?? 0.4) + (agent.symptomLevel ?? 0.4), 0, 0.95);
    if (!agent.treatmentType && hospitals.length && rng() < treatmentChance) {
      return {
        plan: "Seek medical help because symptoms are present.",
        actionDescription: "go_to_hospital",
        destinationId: nearestHospitalId(agent, hospitals, context),
        treatmentDecision: "hospital"
      };
    }
  }

  if (agent.treatmentType === "hospital") {
    const hospital = hospitals.find((place) => place.id === agent.currentPlaceId) ?? hospitals[0];
    return {
      plan: "Stay in hospital care.",
      actionDescription: "receive_treatment",
      destinationId: hospital?.id ?? agent.currentPlaceId,
      treatmentDecision: "hospital"
    };
  }

  if (hour < 7 || hour >= 20) {
    return {
      plan: "Stay at home and rest.",
      actionDescription: "stay_home",
      destinationId: agent.homePlaceId,
      treatmentDecision: "none"
    };
  }

  if (hour >= 8 && hour <= 17 && agent.workPlaceId) {
    return {
      plan: `Do daily ${agent.role ?? "work"} activities.`,
      actionDescription: "work_or_school",
      destinationId: agent.workPlaceId,
      treatmentDecision: "none"
    };
  }

  const destination = choice(markets.length ? markets : publicPlaces, rng);
  return {
    plan: "Run errands in the community.",
    actionDescription: "community_activity",
    destinationId: destination?.id ?? agent.homePlaceId,
    treatmentDecision: "none"
  };
}

function nearestHospitalId(agent, hospitals, context) {
  const current = context.placeById.get(agent.currentPlaceId);
  if (!current) {
    return hospitals[0]?.id;
  }

  return hospitals
    .map((hospital) => ({
      hospital,
      score: Math.abs(hospital.location[0] - current.location[0]) + Math.abs(hospital.location[1] - current.location[1])
    }))
    .sort((a, b) => a.score - b.score)[0]?.hospital.id;
}
