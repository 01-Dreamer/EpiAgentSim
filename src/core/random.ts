export function hashSeed(seed) {
  const text = String(seed ?? "epi-agent-sim");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed);
  return function rng() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function choice(items, rng) {
  if (!items.length) {
    return undefined;
  }
  return items[Math.floor(rng() * items.length)];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
