// Cursor: reads AGENTS.md natively. Skills are exposed as agent-requested rules
// that point at the skill folder; commands go to .cursor/commands/.
import { stringifyFrontmatter } from "../frontmatter.js";
import { skillFiles } from "./shared.js";

export function cursor({ packs }) {
  const out = [...skillFiles(packs, ".cursor/skills")];
  for (const skill of packs.flatMap((p) => p.skills)) {
    out.push({
      path: `.cursor/rules/bees-${skill.name}.mdc`,
      content: stringifyFrontmatter(
        { description: skill.description, alwaysApply: false },
        `When this applies, read and follow \`.cursor/skills/${skill.name}/SKILL.md\`.`,
      ),
    });
  }
  for (const cmd of packs.flatMap((p) => p.commands)) {
    out.push({ path: `.cursor/commands/${cmd.name}.md`, content: cmd.body.trim() + "\n" });
  }
  return out;
}
