import OpenAI from "openai";

export class OpenAIPlanner {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    baseURL = process.env.OPENAI_BASE_URL,
    model = process.env.OPENAI_MODEL ?? "deepseek-ai/DeepSeek-V3.2"
  } = {}) {
    this.model = model;
    this.client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;
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

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: [
            "You are controlling one agent in an infectious disease simulation.",
            "Return only compact JSON with keys: plan, actionDescription, destinationId, treatmentDecision.",
            "destinationId must be one of the provided place ids.",
            "treatmentDecision must be one of: none, hospital."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
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
        }
      ]
    });

    return parseDecision(response.choices?.[0]?.message?.content ?? "");
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
