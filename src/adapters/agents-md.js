// AGENTS.md is the shared source every tool reads: Codex, Copilot and Cursor
// natively, Claude Code through an `@AGENTS.md` import in CLAUDE.md.
import { TOOL_LABELS } from "../config.js";

const COMMAND_LABELS = { install: "Install", dev: "Run locally", build: "Build", test: "Test", lint: "Lint" };

export function renderAgentsMd({ config, packs }) {
  const { project, tools } = config;
  const lines = [
    "# Agent instructions",
    "",
    `Shared instructions for every AI coding agent working in this repository (${tools.map((t) => TOOL_LABELS[t]).join(", ")}).`,
    "",
    "## Project",
    "",
    `- **Name:** ${project.name ?? "(unnamed)"}`,
  ];
  if (project.description) lines.push(`- **About:** ${project.description}`);
  if (project.stack.length) lines.push(`- **Stack:** ${project.stack.join(", ")}`);
  if (project.packageManager) lines.push(`- **Package manager:** ${project.packageManager}`);

  const commands = Object.entries(COMMAND_LABELS).filter(([k]) => project.commands[k]);
  if (commands.length) {
    lines.push("", "### Commands", "", "| Task | Command |", "|---|---|");
    for (const [k, label] of commands) lines.push(`| ${label} | \`${project.commands[k]}\` |`);
  }

  for (const pack of packs) for (const rule of pack.rules) lines.push("", rule.content);

  const skills = packs.flatMap((p) => p.skills);
  if (skills.length) {
    lines.push("", "## Skills", "", "Load a skill only when the task needs it:", "");
    for (const s of skills) lines.push(`- **${s.name}**: ${s.description}`);
  }

  // Tools without native sub-agents still get the roles as plain guidance.
  const agents = packs.flatMap((p) => p.agents);
  if (agents.length && tools.some((t) => t === "cursor" || t === "codex")) {
    lines.push("", "## Roles", "", "When asked to act as one of these roles, follow its description:", "");
    for (const a of agents) lines.push(`- **${a.name}**: ${a.description}`);
  }
  return lines.join("\n");
}
