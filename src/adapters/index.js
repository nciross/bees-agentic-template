// Adapters are pure: (config, packs) → list of outputs.
//   { path, content }            file fully owned by bees (tracked in bees.lock)
//   { path, region }             managed region inside a file the team also edits
//   { path, json: (obj) => obj } JSON file bees merges into, keeping other keys
import { renderAgentsMd } from "./agents-md.js";
import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { copilot } from "./copilot.js";
import { cursor } from "./cursor.js";
import { BeesError } from "../util.js";

export const ADAPTERS = { claude, copilot, cursor, codex };

export function renderAll(ctx) {
  const outputs = [{ path: "AGENTS.md", region: renderAgentsMd(ctx) }];
  for (const tool of ctx.config.tools) outputs.push(...ADAPTERS[tool](ctx));

  const seen = new Map();
  const merged = [];
  for (const out of outputs) {
    const prev = seen.get(out.path);
    if (!prev) {
      seen.set(out.path, out);
      merged.push(out);
    } else if (prev.content === undefined || prev.content !== out.content) {
      throw new BeesError(`Two outputs want to write ${out.path}. Check for duplicate skill or command names across packs.`);
    }
    // identical owned files from two adapters (shared folders) are fine
  }
  return merged.sort((a, b) => a.path.localeCompare(b.path));
}
