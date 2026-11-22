import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BUDGETS, validateBudgets } from "../../src/budgets.js";
import { validateConfig } from "../../src/config.js";
import { loadPacks } from "../../src/packs.js";
import { applyTeam } from "../../src/team.js";
import { estimateTokens, measureTokens, tokenTips } from "../../src/tokens.js";
import { tempDir } from "../helpers.js";

const setup = (tools, packNames = ["core", "team"], tokens) => {
  const config = validateConfig({ version: 1, tools, packs: packNames, project: { name: "demo" }, tokens }).config;
  return { config, packs: applyTeam(loadPacks(packNames)).packs, budgets: config.budgets };
};

test("estimateTokens uses ~4 characters per token", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

test("budgets: defaults, overrides, and validation", () => {
  assert.deepEqual(validateBudgets(undefined).budgets, DEFAULT_BUDGETS);
  assert.equal(validateBudgets({ skill: 500 }).budgets.skill, 500);
  assert.equal(validateBudgets({ skill: -1 }).errors.length, 1);
  assert.equal(validateBudgets({ skill: "lots" }).errors.length, 1);
  assert.match(validateBudgets({ wat: 1 }).warnings[0], /Unknown key `tokens\.wat`/);
  assert.equal(validateBudgets([]).errors.length, 1);
});

test("measures always-loaded context per tool and on-demand items, before the first sync", (t) => {
  const cwd = tempDir(t);
  const report = measureTokens(cwd, setup(["claude", "codex"]));
  const claude = report.tools.find((x) => x.tool === "claude");
  const codex = report.tools.find((x) => x.tool === "codex");
  assert.ok(claude.total > codex.total, "Claude also lists agents and commands");
  assert.ok(claude.parts.some((p) => p.label === "AGENTS.md (bees)"));
  assert.ok(claude.parts.some((p) => p.label === "9 agent descriptions"));
  assert.ok(!codex.parts.some((p) => /agent descriptions/.test(p.label)));
  assert.ok(report.items.some((i) => i.kind === "agent" && i.name === "reviewer" && i.tokens > 0));
  assert.deepEqual(report.over, []);
});

test("flags anything over budget and gives tips", (t) => {
  const cwd = tempDir(t);
  const report = measureTokens(cwd, setup(["claude"], ["core", "team"], { "always-loaded": 100, agent: 50 }));
  assert.ok(report.over.some((o) => o.what === "Claude Code: always-loaded context"));
  assert.ok(report.over.some((o) => o.what === "agent reviewer"));
  const tips = tokenTips(report, { hasTokenOptimizer: true });
  assert.ok(tips.some((x) => /switch off agents/.test(x)));
  assert.ok(tips.some((x) => /token-optimizer agent/.test(x)));
  assert.ok(tokenTips(report).some((x) => /bees add team/.test(x)));
});
