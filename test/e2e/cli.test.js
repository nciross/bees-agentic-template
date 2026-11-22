// End-to-end: runs the real `bees` binary against realistic projects copied
// from test/fixtures into a temp dir. Nothing outside the temp dir is touched.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import YAML from "yaml";
import { BEGIN, END } from "../../src/markers.js";
import { FIXTURES, bees, copyFixture, read, tempDir, write } from "../helpers.js";

const ALL = "--tools=claude,copilot,cursor,codex";

test("help, version and unknown commands", (t) => {
  const cwd = tempDir(t);
  assert.match(bees(["--help"], { cwd }).stdout, /Usage\s+bees <command>/);
  for (const args of [["help", "sync"], ["sync", "--help"]]) {
    const help = bees(args, { cwd }).stdout;
    assert.match(help, /bees sync --check/, "command help has examples");
    assert.doesNotMatch(help, /^Commands/m, "command help is not the full help");
  }
  const typo = bees(["snyc"], { cwd });
  assert.equal(typo.code, 2);
  assert.match(typo.out, /Did you mean `bees sync`/);
  assert.match(bees(["--version"], { cwd }).stdout, /^\d+\.\d+\.\d+/);
  assert.equal(bees(["fly"], { cwd }).code, 2);
  assert.equal(bees(["sync", "--nope"], { cwd }).code, 2);
});

test("commands fail clearly before init", (t) => {
  const cwd = tempDir(t);
  const res = bees(["sync"], { cwd });
  assert.equal(res.code, 1);
  assert.match(res.out, /No bees\.yaml found/);
  assert.match(res.out, /bees init/);
});

test("Node/Express project: init keeps the team's CLAUDE.md and Claude settings", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  const res = bees(["init", "--yes", ALL], { cwd });
  assert.equal(res.code, 0, res.out);

  const config = YAML.parse(read(cwd, "bees.yaml"));
  assert.equal(config.project.name, "orders-api");
  assert.deepEqual(config.project.stack, ["Node.js", "TypeScript", "Express"]);
  assert.equal(config.project.commands.test, "pnpm run test");

  const claudeMd = read(cwd, "CLAUDE.md");
  assert.ok(claudeMd.startsWith("# Orders API\n\nTeam note: always run `pnpm test` before pushing."), "team text kept on top");
  assert.match(claudeMd, /@AGENTS\.md/);

  const settings = JSON.parse(read(cwd, ".claude/settings.json"));
  assert.equal(settings.model, "sonnet");
  assert.deepEqual(settings.permissions.allow, ["Bash(pnpm test)"]);
  assert.deepEqual(settings.permissions.deny, ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]);

  assert.match(read(cwd, "AGENTS.md"), /\| Test \| `pnpm run test` \|/);
  for (const f of [
    ".claude/skills/project-context/SKILL.md",
    ".claude/commands/onboard.md",
    ".github/copilot-instructions.md",
    ".github/prompts/onboard.prompt.md",
    ".cursor/rules/bees-project-context.mdc",
    ".agents/skills/project-context/SKILL.md",
    "bees.lock",
  ]) {
    assert.ok(existsSync(join(cwd, f)), `${f} generated`);
  }
  assert.equal(bees(["sync", "--check"], { cwd }).code, 0);
  assert.equal(bees(["doctor"], { cwd }).code, 0);
});

test("Python/FastAPI project: detects uv + pytest and syncs only the chosen tools", (t) => {
  const cwd = copyFixture(t, "python-fastapi-app");
  assert.equal(bees(["init", "-y", "--tools", "codex,copilot"], { cwd }).code, 0);
  assert.match(read(cwd, "AGENTS.md"), /\| Test \| `uv run pytest` \|/);
  assert.ok(!existsSync(join(cwd, "CLAUDE.md")));
  assert.ok(!existsSync(join(cwd, ".cursor")));
  assert.ok(existsSync(join(cwd, ".agents/skills/project-context/SKILL.md")));
});

test("lifecycle: idempotent sync, user edits kept, drift caught by --check", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  bees(["init", "--yes", ALL], { cwd });

  // A second sync changes nothing.
  assert.match(bees(["sync"], { cwd }).out, /Already up to date/);

  // Notes outside the markers survive a sync.
  write(cwd, "AGENTS.md", read(cwd, "AGENTS.md") + "\n## Our own notes\n\nDeploys happen on Tuesdays.\n");
  assert.equal(bees(["sync", "--check"], { cwd }).code, 0);
  bees(["sync"], { cwd });
  assert.match(read(cwd, "AGENTS.md"), /Deploys happen on Tuesdays/);

  // Hand edits inside the region are drift: --check fails, sync repairs.
  write(cwd, "AGENTS.md", read(cwd, "AGENTS.md").replace("## Working agreements", "## Hacked"));
  const check = bees(["sync", "--check"], { cwd });
  assert.equal(check.code, 1);
  assert.match(check.out, /~ AGENTS\.md/);
  assert.equal(bees(["doctor"], { cwd }).code, 1);
  bees(["sync"], { cwd });
  assert.match(read(cwd, "AGENTS.md"), /## Working agreements/);
  assert.match(read(cwd, "AGENTS.md"), /Deploys happen on Tuesdays/);

  // Editing bees.yaml without syncing is drift too.
  write(cwd, "bees.yaml", read(cwd, "bees.yaml").replace("pnpm run test", "pnpm vitest"));
  assert.equal(bees(["sync", "--check"], { cwd }).code, 1);
  bees(["sync"], { cwd });
  assert.match(read(cwd, "AGENTS.md"), /`pnpm vitest`/);
});

test("owned files: local edits are flagged and overwritten; deleted files come back", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  bees(["init", "--yes", "--tools=claude"], { cwd });
  const skill = ".claude/skills/project-context/SKILL.md";
  const original = read(cwd, skill);
  write(cwd, skill, original + "\nlocal hack\n");
  const res = bees(["sync"], { cwd });
  assert.match(res.out, /local edits overwritten/);
  assert.equal(read(cwd, skill), original);

  rmSync(join(cwd, skill));
  assert.equal(bees(["sync", "--check"], { cwd }).code, 1);
  bees(["sync"], { cwd });
  assert.equal(read(cwd, skill), original);
});

test("CRLF checkouts (git autocrlf on Windows) are not reported as drift", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  bees(["init", "--yes", ALL], { cwd });
  for (const f of ["AGENTS.md", "CLAUDE.md", ".claude/commands/onboard.md", "bees.lock"]) {
    write(cwd, f, read(cwd, f).replace(/\r?\n/g, "\r\n"));
  }
  const res = bees(["sync", "--check"], { cwd });
  assert.equal(res.code, 0, res.out);
});

test("remove and add packs: generated files go away, team content stays", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  bees(["init", "--yes", "--tools=claude,cursor"], { cwd });

  assert.equal(bees(["remove", "core"], { cwd }).code, 0);
  assert.ok(!existsSync(join(cwd, ".claude/skills")), "skill folder cleaned up");
  assert.ok(!existsSync(join(cwd, ".cursor")), "empty tool folder cleaned up");
  assert.ok(existsSync(join(cwd, ".claude/settings.json")), "team settings kept");
  assert.doesNotMatch(read(cwd, "AGENTS.md"), /Working agreements/);
  assert.match(read(cwd, "CLAUDE.md"), /Team note/);

  assert.equal(bees(["add", "core"], { cwd }).code, 0);
  assert.ok(existsSync(join(cwd, ".cursor/rules/bees-project-context.mdc")));
  assert.equal(bees(["sync", "--check"], { cwd }).code, 0);

  const unknown = bees(["add", "nope"], { cwd });
  assert.equal(unknown.code, 1);
  assert.match(unknown.out, /Unknown pack\(s\): nope/);
  assert.match(bees(["add", "cor"], { cwd }).out, /Did you mean core\?/);
  assert.match(bees(["add"], { cwd }).out, /Available packs: core/);
});

test("add keeps comments in bees.yaml", (t) => {
  const cwd = copyFixture(t, "python-fastapi-app");
  bees(["init", "--yes", "--tools=codex", "--packs=core"], { cwd });
  write(cwd, "bees.yaml", read(cwd, "bees.yaml") + "# keep this comment\n");
  bees(["remove", "core"], { cwd });
  bees(["add", "core"], { cwd });
  assert.match(read(cwd, "bees.yaml"), /# keep this comment/);
});

test("third-party pack dir: sub-agents for Claude, roles for Codex", (t) => {
  const cwd = copyFixture(t, "python-fastapi-app");
  const env = { BEES_PACKS_DIR: join(FIXTURES, "packs") };
  assert.equal(bees(["init", "--yes", "--tools=claude,codex", "--packs=team-demo"], { cwd, env }).code, 0);
  assert.match(read(cwd, ".claude/agents/kenji.md"), /^---\nname: kenji\n/);
  const agentsMd = read(cwd, "AGENTS.md");
  assert.match(agentsMd, /Every change is reviewed by Kenji/);
  assert.match(agentsMd, /## Roles/);
  assert.match(bees(["doctor"], { cwd, env }).out, /core` pack is not enabled/);
});

test("pack requires: init and add pull in dependencies, remove and sync refuse to break them", (t) => {
  const cwd = copyFixture(t, "python-fastapi-app");
  const env = { BEES_PACKS_DIR: join(FIXTURES, "packs") };

  const init = bees(["init", "--yes", "--tools=claude", "--packs=factory-demo"], { cwd, env });
  assert.equal(init.code, 0, init.out);
  assert.match(init.out, /Also enabling team-demo \(required by factory-demo\)/);
  assert.deepEqual(YAML.parse(read(cwd, "bees.yaml")).packs, ["team-demo", "factory-demo"]);
  assert.ok(existsSync(join(cwd, ".claude/agents/kenji.md")), "required pack generated");

  const blocked = bees(["remove", "team-demo"], { cwd, env });
  assert.equal(blocked.code, 1);
  assert.match(blocked.out, /Can't remove team-demo: pack "factory-demo" requires it/);
  assert.match(blocked.out, /bees remove factory-demo team-demo/);
  assert.deepEqual(YAML.parse(read(cwd, "bees.yaml")).packs, ["team-demo", "factory-demo"], "bees.yaml untouched");

  assert.equal(bees(["remove", "factory-demo", "team-demo"], { cwd, env }).code, 0);
  assert.ok(!existsSync(join(cwd, ".claude/agents/kenji.md")));

  const add = bees(["add", "factory-demo"], { cwd, env });
  assert.equal(add.code, 0, add.out);
  assert.deepEqual(YAML.parse(read(cwd, "bees.yaml")).packs, ["team-demo", "factory-demo"]);
  assert.match(bees(["list"], { cwd, env }).stdout, /factory-demo .*\(requires team-demo\)/);

  // A hand-edited bees.yaml that drops a required pack is caught.
  write(cwd, "bees.yaml", read(cwd, "bees.yaml").replace(/^\s*- team-demo\r?\n/m, ""));
  const sync = bees(["sync"], { cwd, env });
  assert.equal(sync.code, 1);
  assert.match(sync.out, /Pack "factory-demo" requires "team-demo", which is not enabled/);
  assert.match(sync.out, /bees add team-demo/);
  assert.equal(bees(["doctor"], { cwd, env }).code, 1);
});

test("refuses to clobber: existing bees.yaml, broken markers, invalid config", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  bees(["init", "--yes", "--tools=claude"], { cwd });

  const again = bees(["init", "--yes"], { cwd });
  assert.equal(again.code, 1);
  assert.match(again.out, /already exists/);

  const claudeMd = read(cwd, "CLAUDE.md");
  write(cwd, "CLAUDE.md", claudeMd.replace(END, ""));
  const broken = bees(["sync"], { cwd });
  assert.equal(broken.code, 1);
  assert.match(broken.out, /markers are broken/);
  assert.ok(!read(cwd, "CLAUDE.md").includes(END), "file left untouched");
  write(cwd, "CLAUDE.md", claudeMd);

  write(cwd, "bees.yaml", "version: 1\ntools: [vim]\n");
  const invalid = bees(["sync"], { cwd });
  assert.equal(invalid.code, 1);
  assert.match(invalid.out, /Unknown tool "vim"/);

  write(cwd, "bees.yaml", "version: [1\n");
  assert.match(bees(["sync"], { cwd }).out, /not valid YAML/);
});

test("--dry-run writes nothing", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  const before = readdirSync(cwd).sort();
  const initPreview = bees(["init", "--yes", "--dry-run"], { cwd });
  assert.equal(initPreview.code, 0);
  assert.match(initPreview.out, /\+ bees\.yaml/);
  assert.match(initPreview.out, /\+ AGENTS\.md/);
  assert.deepEqual(readdirSync(cwd).sort(), before);

  bees(["init", "--yes", "--tools=claude"], { cwd });
  write(cwd, "bees.yaml", read(cwd, "bees.yaml").replace("- claude", "- claude\n  - codex"));
  const snapshot = readFileSync(join(cwd, "bees.lock"), "utf8");
  assert.match(bees(["sync", "--dry-run"], { cwd }).out, /\+ \.agents\/skills/);
  assert.equal(read(cwd, "bees.lock"), snapshot);

  // add/remove --dry-run preview the files, not just the pack list.
  bees(["sync"], { cwd });
  const config = read(cwd, "bees.yaml");
  const preview = bees(["remove", "core", "--dry-run"], { cwd }).out;
  assert.match(preview, /Packs would become: \(none\)/);
  assert.match(preview, /- \.claude\/skills\/project-context\/SKILL\.md/);
  assert.equal(read(cwd, "bees.yaml"), config);
  assert.ok(existsSync(join(cwd, ".claude/skills/project-context/SKILL.md")));
});

test("a tampered bees.lock cannot make sync delete files outside the project", (t) => {
  const cwd = copyFixture(t, "python-fastapi-app");
  bees(["init", "--yes", "--tools=codex"], { cwd });
  const outside = join(cwd, "..", `bees-victim-${process.pid}.txt`);
  writeFileSync(outside, "precious");
  t.after(() => rmSync(outside, { force: true }));
  const lock = JSON.parse(read(cwd, "bees.lock"));
  lock.files[`../bees-victim-${process.pid}.txt`] = { sha256: "x" };
  write(cwd, "bees.lock", JSON.stringify(lock));
  bees(["sync"], { cwd });
  assert.equal(readFileSync(outside, "utf8"), "precious");
});

test("list shows packs and which are enabled", (t) => {
  const cwd = copyFixture(t, "python-fastapi-app");
  assert.match(bees(["list"], { cwd }).stdout, /○ core/);
  bees(["init", "--yes", "--tools=codex"], { cwd });
  assert.match(bees(["list"], { cwd }).stdout, /● core/);
});

test("generated AGENTS.md has exactly one managed region", (t) => {
  const cwd = copyFixture(t, "node-express-app");
  bees(["init", "--yes", ALL], { cwd });
  bees(["sync"], { cwd });
  const text = read(cwd, "AGENTS.md");
  assert.equal(text.split(BEGIN).length, 2);
  assert.equal(text.split(END).length, 2);
});
