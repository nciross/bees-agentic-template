// Claude Code: CLAUDE.md imports AGENTS.md; skills, commands and agents go under .claude/.
import { stringifyFrontmatter } from "../frontmatter.js";
import { skillFiles } from "./shared.js";

export function claude({ packs }) {
  const out = [
    {
      path: "CLAUDE.md",
      region: ["@AGENTS.md", "", "Claude Code-specific notes for this project can go below, outside the bees markers."].join("\n"),
    },
    ...skillFiles(packs, ".claude/skills"),
  ];
  for (const cmd of packs.flatMap((p) => p.commands)) {
    out.push({
      path: `.claude/commands/${cmd.name}.md`,
      content: stringifyFrontmatter({ description: cmd.description, "argument-hint": cmd.data["argument-hint"] }, cmd.body),
    });
  }
  for (const agent of packs.flatMap((p) => p.agents)) {
    out.push({
      path: `.claude/agents/${agent.name}.md`,
      content: stringifyFrontmatter(
        { name: agent.name, description: agent.description, tools: agent.data.tools, model: agent.data.model },
        agent.body,
      ),
    });
  }

  const deny = [...new Set(packs.flatMap((p) => p.permissions.deny))];
  if (deny.length) {
    out.push({
      path: ".claude/settings.json",
      json: (settings) => {
        const permissions = settings.permissions ?? {};
        const current = Array.isArray(permissions.deny) ? permissions.deny : [];
        return { ...settings, permissions: { ...permissions, deny: [...current, ...deny.filter((d) => !current.includes(d))] } };
      },
    });
  }
  return out;
}
