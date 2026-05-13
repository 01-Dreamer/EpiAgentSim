import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadJson(filePath) {
  const absolutePath = path.resolve(filePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export async function loadDefaultWorld(rootDir = process.cwd()) {
  const [agents, places, disease] = await Promise.all([
    loadJson(path.join(rootDir, "data", "agents.json")),
    loadJson(path.join(rootDir, "data", "places.json")),
    loadJson(path.join(rootDir, "data", "disease.json"))
  ]);

  return { agents, places, disease };
}
