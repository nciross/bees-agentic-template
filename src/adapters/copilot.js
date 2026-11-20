// GitHub Copilot: repository instructions, prompt files, custom agents and skills under .github/.
import { stringifyFrontmatter } from "../frontmatter.js";
import { skillFiles } from "./shared.js";

export function copilot({ packs }) {
  const out = [
    {
      path: ".github/copilot-instructions.md",
      region: "Follow the shared agent instructions in [AGENTS.md](../AGENTS.md): project facts, commands and team conventions live there.",
    },
    ...skillFiles(packs, ".github/skills"),
  ];
  for (const cmd of packs.flatMap((p) => p.commands)) {
    out.push({
      path: `.github/prompts/${cmd.name}.prompt.md`,
      content: stringifyFrontmatter({ description: cmd.description, agent: "agent" }, cmd.body.replace(/\$ARGUMENTS/g, "${input:arguments}")),
    });
  }
  for (const agent of packs.flatMap((p) => p.agents)) {
    out.push({
      path: `.github/agents/${agent.name}.agent.md`,
      content: stringifyFrontmatter({ name: agent.name, description: agent.description }, agent.body),
    });
  }
  return out;
}
