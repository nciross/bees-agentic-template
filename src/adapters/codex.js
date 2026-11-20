// Codex: reads AGENTS.md natively and discovers repository skills in .agents/skills/.
// Custom prompts are user-scope only in Codex, so project commands are not rendered.
import { skillFiles } from "./shared.js";

export function codex({ packs }) {
  return skillFiles(packs, ".agents/skills");
}
