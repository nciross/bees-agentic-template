import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderConfig, validateConfig } from "../../src/config.js";

const ok = { version: 1, tools: ["claude"], packs: ["core"] };

test("accepts a minimal config", () => {
  const { config, errors } = validateConfig(ok, ["core"]);
  assert.deepEqual(errors, []);
  assert.deepEqual(config.tools, ["claude"]);
});

test("orders tools canonically and removes duplicates", () => {
  const { config } = validateConfig({ ...ok, tools: ["codex", "claude", "codex"] }, ["core"]);
  assert.deepEqual(config.tools, ["claude", "codex"]);
});

test("reports every problem", () => {
  const { errors } = validateConfig({ version: 2, tools: ["vim"], packs: ["nope", "../evil"] }, ["core"]);
  assert.equal(errors.length, 4);
  assert.match(errors.join("\n"), /version/);
  assert.match(errors.join("\n"), /Unknown tool "vim"/);
  assert.match(errors.join("\n"), /Unknown pack "nope"/);
  assert.match(errors.join("\n"), /Invalid pack name "\.\.\/evil"/);
});

test("requires at least one tool and a mapping", () => {
  assert.match(validateConfig({ version: 1, tools: [] }).errors.join(), /at least one tool/);
  assert.match(validateConfig([]).errors.join(), /mapping/);
});

test("warns about unknown keys and a missing core pack", () => {
  const { warnings } = validateConfig({ ...ok, packs: [], typo: 1 }, ["core"]);
  assert.equal(warnings.length, 2);
});

test("renderConfig round-trips through validation", () => {
  const text = renderConfig({ project: { name: "app", stack: ["Go"], commands: { test: "go test ./..." } }, tools: ["codex"], packs: ["core"] });
  assert.match(text, /^# bees\.yaml/);
  const { config, errors } = validateConfig(YAML.parse(text), ["core"]);
  assert.deepEqual(errors, []);
  assert.equal(config.project.commands.test, "go test ./...");
});
