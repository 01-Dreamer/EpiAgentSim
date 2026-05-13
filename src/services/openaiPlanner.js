import OpenAI from "openai";

export class OpenAIPlanner {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini" } = {}) {
    this.model = model;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isEnabled() {
    return Boolean(this.client);
  }

  async decide(agent, context) {
    const places = context.places.map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type
    }));

    const response = await this.client.responses.create({
      model: this.model,
      instructions: [
        "You are controlling one agent in an infectious disease simulation.",
        "Return only compact JSON with keys: plan, actionDescription, destinationId, treatmentDecision.",
        "destinationId must be one of the provided place ids.",
        "treatmentDecision must be one of: none, hospital."
      ].join(" "),
      input: JSON.stringify({
        time: context.currentTime.toISOString(),
        disease: context.disease,
        outbreakSummary: context.summary,
        agent: {
          id: agent.id,
          name: agent.name,
          age: agent.age,
          role: agent.role,
          healthState: agent.healthState,
          symptomLevel: agent.symptomLevel,
          riskPerception: agent.riskPerception,
          homePlaceId: agent.homePlaceId,
          workPlaceId: agent.workPlaceId,
          currentPlaceId: agent.currentPlaceId,
          treatmentType: agent.treatmentType
        },
        places
      })
    });

    return parseDecision(response.output_text);
  }
}

function parseDecision(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OpenAI response did not contain JSON.");
  }

  const parsed = JSON.parse(text.slice(start, end + 1));
  return {
    plan: String(parsed.plan ?? ""),
    actionDescription: String(parsed.actionDescription ?? "move"),
    destinationId: String(parsed.destinationId ?? ""),
    treatmentDecision: parsed.treatmentDecision === "hospital" ? "hospital" : "none"
  };
}
