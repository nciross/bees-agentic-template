import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { detectProject, detectTools } from "../../src/detect.js";
import { FIXTURES, tempDir } from "../helpers.js";

test("detects a pnpm + TypeScript + Express project", () => {
  const p = detectProject(join(FIXTURES, "node-express-app"));
  assert.equal(p.name, "orders-api");
  assert.deepEqual(p.stack, ["Node.js", "TypeScript", "Express"]);
  assert.equal(p.packageManager, "pnpm");
  assert.deepEqual(p.commands, {
    install: "pnpm install",
    test: "pnpm run test",
    build: "pnpm run build",
    lint: "pnpm run lint",
    dev: "pnpm run dev",
  });
});

test("detects a uv + FastAPI project", () => {
  const p = detectProject(join(FIXTURES, "python-fastapi-app"));
  assert.equal(p.name, "inventory-service");
  assert.deepEqual(p.stack, ["Python", "FastAPI"]);
  assert.equal(p.packageManager, "uv");
  assert.equal(p.commands.install, "uv sync");
  assert.equal(p.commands.test, "uv run pytest");
  assert.equal(p.commands.lint, "uv run ruff check .");
});

test("detects Go, Rust and .NET", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "go.mod"), "module github.com/acme/widgets\n\ngo 1.23\n");
  writeFileSync(join(dir, "Cargo.toml"), '[package]\nname = "widgets-rs"\n');
  writeFileSync(join(dir, "Widgets.sln"), "");
  const p = detectProject(dir);
  assert.deepEqual(p.stack, ["Go", "Rust", ".NET"]);
  assert.equal(p.name, "widgets");
  assert.equal(p.commands.test, "go test ./...");
});

test("ignores npm's placeholder test script and falls back to the folder name", (t) => {
  const dir = tempDir(t, "plain-");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  const p = detectProject(dir);
  assert.equal(p.commands.test, undefined);
  assert.match(p.name, /^plain-/);
});

test("detectTools finds existing tool configs", (t) => {
  const dir = tempDir(t);
  assert.deepEqual(detectTools(dir), []);
  mkdirSync(join(dir, ".cursor"));
  writeFileSync(join(dir, "CLAUDE.md"), "");
  assert.deepEqual(detectTools(dir), ["claude", "cursor"]);
});
