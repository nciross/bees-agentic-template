import assert from "node:assert/strict";
import { test } from "node:test";
import { renderAll } from "../../src/adapters/index.js";
import { validateConfig } from "../../src/config.js";
import { loadPacks } from "../../src/packs.js";
import { applyTeam, validateTeam } from "../../src/team.js";

const AGENTS = ["architect", "designer", "developer", "qa", "reviewer", "security", "tech-lead", "token-optimizer", "writer"];
const load = () => loadPacks(["core", "team"]);

test("the team pack ships nine named agents, the drafts skill and its commands", () => {
  const [, team] = load();
  assert.deepEqual(team.requires, ["core"]);
  assert.deepEqual(team.agents.map((a) => a.name).sort(), AGENTS);
  for (const a of team.agents) assert.ok(a.data.persona && a.data.role, `${a.name} has a persona and a role`);
  assert.deepEqual(team.skills.map((s) => s.name), ["drafts"]);
  assert.deepEqual(team.commands.map((c) => c.name).sort(), ["drafts", "hive", "post"]);
  assert.deepEqual(team.files.map((f) => f.path), [".bees/drafts/.gitignore"]);
});

test("applyTeam fills every placeholder with default names", () => {
  const { packs, roster } = applyTeam(load());
  assert.equal(roster.find((m) => m.agent === "reviewer").name, "Kenji");
  const everything = JSON.stringify(packs);
  assert.doesNotMatch(everything, /\{\{/, "no placeholder left");
  const lead = packs[1].agents.find((a) => a.name === "tech-lead");
  assert.match(lead.body, /^You are Maya, the tech lead/);
  assert.match(lead.body, /every change to Kenji/);
});

test("bees.yaml can rename agents and switch them off", () => {
  const { team } = validateTeam({ reviewer: { name: "Ken" }, designer: false });
  const { packs, warnings } = applyTeam(load(), team);
  const agents = packs[1].agents;
  assert.ok(!agents.some((a) => a.name === "designer"), "designer removed");
  assert.match(agents.find((a) => a.name === "reviewer").description, /^Ken, code reviewer/);
  assert.match(agents.find((a) => a.name === "tech-lead").body, /UI to the designer/);
  assert.match(packs[1].rules[0].content, /— Ken, Reviewer · bees agent/);
  assert.deepEqual(warnings, []);
});

test("unknown agents in bees.yaml warn; bad names and shapes are errors", () => {
  assert.match(applyTeam(load(), { pilot: { enabled: true } }).warnings[0], /team\.pilot .* matches no agent/);
  assert.equal(validateTeam({ reviewer: { name: "Robert'); DROP" } }).errors.length, 1);
  assert.equal(validateTeam({ reviewer: "Ken" }).errors.length, 1);
  assert.equal(validateTeam([]).errors.length, 1);
  assert.equal(validateConfig({ version: 1, tools: ["claude"], packs: ["core"], team: { reviewer: { name: "Ada Lovelace" } } }).errors.length, 0);
});

test("unknown placeholders fail loudly", () => {
  const [core, team] = load();
  const broken = { ...team, rules: [{ name: "x", content: "Ask {{team.pilot}}." }] };
  assert.throws(() => applyTeam([core, broken]), /unknown teammate \{\{team\.pilot\}\}/);
});

test("adapters: agents for Claude and Copilot, roles with names in AGENTS.md, drafts .gitignore", () => {
  const { packs } = applyTeam(load());
  const config = validateConfig({ version: 1, tools: ["claude", "copilot", "codex"], packs: ["core", "team"], project: { name: "demo" } }).config;
  const outs = renderAll({ config, packs });
  const paths = outs.map((o) => o.path);
  assert.ok(paths.includes(".claude/agents/reviewer.md"));
  assert.ok(paths.includes(".github/agents/reviewer.agent.md"));
  assert.ok(paths.includes(".bees/drafts/.gitignore"));
  const claudeReviewer = outs.find((o) => o.path === ".claude/agents/reviewer.md").content;
  assert.match(claudeReviewer, /^---\nname: reviewer\ndescription: Kenji, code reviewer/);
  assert.doesNotMatch(claudeReviewer, /persona:/, "bees-only front matter is not passed to tools");
  const agentsMd = outs.find((o) => o.path === "AGENTS.md").region;
  assert.match(agentsMd, /## The hive/);
  assert.match(agentsMd, /- \*\*Kenji\*\* \(Reviewer, `reviewer`\)/);
  assert.equal(outs.find((o) => o.path === ".bees/drafts/.gitignore").content.includes("!.gitignore"), true);
});
