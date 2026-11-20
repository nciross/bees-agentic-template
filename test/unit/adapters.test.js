import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { renderAll } from "../../src/adapters/index.js";
import { validateConfig } from "../../src/config.js";
import { parseFrontmatter } from "../../src/frontmatter.js";
import { listPacks, loadPack } from "../../src/packs.js";
import { FIXTURES } from "../helpers.js";

const core = loadPack("core");
const team = loadPack("team-demo", join(FIXTURES, "packs"));
const ctx = (tools, packs = [core]) => ({
  config: validateConfig({ version: 1, tools, packs: packs.map((p) => p.name), project: { name: "demo", commands: { test: "npm test" } } }).config,
  packs,
});
const paths = (outs) => outs.map((o) => o.path);

test("the built-in core pack is valid", () => {
  assert.ok(listPacks().includes("core"));
  assert.equal(core.skills[0].name, "project-context");
  assert.ok(core.rules.length > 0);
});

test("AGENTS.md is always generated, with project facts and rules", () => {
  const outs = renderAll(ctx(["codex"]));
  const agents = outs.find((o) => o.path === "AGENTS.md");
  assert.match(agents.region, /\*\*Name:\*\* demo/);
  assert.match(agents.region, /\| Test \| `npm test` \|/);
  assert.match(agents.region, /## Working agreements/);
  assert.match(agents.region, /\*\*project-context\*\*/);
});

test("claude: CLAUDE.md imports AGENTS.md; skills, commands, agents, settings", () => {
  const outs = renderAll(ctx(["claude"], [core, team]));
  assert.deepEqual(paths(outs), [
    ".claude/agents/kenji.md",
    ".claude/commands/onboard.md",
    ".claude/settings.json",
    ".claude/skills/project-context/SKILL.md",
    "AGENTS.md",
    "CLAUDE.md",
  ]);
  assert.match(outs.find((o) => o.path === "CLAUDE.md").region, /^@AGENTS\.md/);
  const agent = parseFrontmatter(outs.find((o) => o.path === ".claude/agents/kenji.md").content);
  assert.equal(agent.data.name, "kenji");
  assert.equal(agent.data.tools, "Read, Grep, Glob");
  const settings = outs.find((o) => o.path === ".claude/settings.json").json({ permissions: { deny: ["Read(./.env)"] }, model: "x" });
  assert.equal(settings.model, "x");
  assert.deepEqual(settings.permissions.deny, ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]);
});

test("copilot: instructions, prompt files with input variables, agents, skills", () => {
  const outs = renderAll(ctx(["copilot"], [core, team]));
  assert.deepEqual(paths(outs), [
    ".github/agents/kenji.agent.md",
    ".github/copilot-instructions.md",
    ".github/prompts/onboard.prompt.md",
    ".github/skills/project-context/SKILL.md",
    "AGENTS.md",
  ]);
  const prompt = outs.find((o) => o.path === ".github/prompts/onboard.prompt.md").content;
  assert.match(prompt, /\$\{input:arguments\}/);
  assert.doesNotMatch(prompt, /\$ARGUMENTS/);
});

test("cursor: agent-requested rule per skill, commands, roles fallback in AGENTS.md", () => {
  const outs = renderAll(ctx(["cursor"], [core, team]));
  const rule = parseFrontmatter(outs.find((o) => o.path === ".cursor/rules/bees-project-context.mdc").content);
  assert.equal(rule.data.alwaysApply, false);
  assert.match(rule.body, /\.cursor\/skills\/project-context\/SKILL\.md/);
  assert.ok(paths(outs).includes(".cursor/commands/onboard.md"));
  assert.match(outs.find((o) => o.path === "AGENTS.md").region, /## Roles[\s\S]*\*\*kenji\*\*/);
});

test("codex: skills under .agents/skills, no commands", () => {
  assert.deepEqual(paths(renderAll(ctx(["codex"]))), [".agents/skills/project-context/SKILL.md", "AGENTS.md"]);
});

test("rendering is deterministic", () => {
  const all = ["claude", "copilot", "cursor", "codex"];
  const strip = (outs) => outs.map(({ json, ...rest }) => rest);
  assert.deepEqual(strip(renderAll(ctx(all))), strip(renderAll(ctx(all))));
});
