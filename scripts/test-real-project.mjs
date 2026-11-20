#!/usr/bin/env node
// Try bees on a real project without touching it.
//
//   npm run test:real -- <path-or-git-url> [--tools claude,codex] [--packs core] [--keep]
//
// The project is copied (or shallow-cloned) into a temp dir, then this script runs
// the real CLI through the full lifecycle and checks that bees behaves:
// init → check → idempotent sync → doctor → your files untouched → notes kept →
// drift detected → remove/add pack. Exit code 1 if any check fails.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const BIN = fileURLToPath(new URL("../bin/bees.js", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "target", ".venv", "venv", "__pycache__", ".next", ".nuxt", ".turbo", "coverage", ".gradle", "bin", "obj"]);

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tools: { type: "string", default: "claude,copilot,cursor,codex" },
    packs: { type: "string", default: "core" },
    keep: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});
const source = positionals[0];
if (opts.help || !source) {
  console.log("Usage: npm run test:real -- <path-or-git-url> [--tools claude,codex] [--packs core] [--keep]");
  process.exit(source ? 0 : 2);
}

const color = process.stdout.isTTY && !("NO_COLOR" in process.env);
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? paint(32, "✔") : paint(31, "✖")} ${label}${detail ? paint(2, `  ${detail}`) : ""}`);
  if (!ok) failures++;
  return ok;
};

const bees = (args, cwd) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
/** Map of relative path → content hash, skipping dependency and build folders. */
function walk(dir, root = dir, out = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, root, out);
    } else if (entry.isFile()) out.set(relative(root, full).split("\\").join("/"), hash(full));
  }
  return out;
}

// 1. Make a disposable copy.
const work = mkdtempSync(join(tmpdir(), "bees-real-"));
const isUrl = /^(https?:\/\/|git@|ssh:\/\/)/.test(source) || source.endsWith(".git");
const projectName = basename(source.replace(/\.git$/, "").replace(/[\\/]+$/, ""));
const cwd = join(work, projectName || "project");
console.log(paint(33, `🐝 bees real-project test: ${source}`));
if (isUrl) {
  const r = spawnSync("git", ["clone", "--depth", "1", "--quiet", source, cwd], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("git clone failed");
    process.exit(1);
  }
  rmSync(join(cwd, ".git"), { recursive: true, force: true });
} else {
  const src = resolve(source);
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    console.error(`Not a directory: ${src}`);
    process.exit(2);
  }
  cpSync(src, cwd, { recursive: true, filter: (p) => !SKIP_DIRS.has(basename(p)) || p === src });
}
console.log(paint(2, `   working copy: ${cwd} (your original is never modified)\n`));

const before = walk(cwd);
const hadBeesYaml = before.has("bees.yaml");
if (hadBeesYaml) {
  console.log(paint(2, "   project already has bees.yaml: re-running init with --force\n"));
}

try {
  // 2. Init.
  const init = bees(["init", "--yes", `--tools=${opts.tools}`, `--packs=${opts.packs}`, ...(hadBeesYaml ? ["--force"] : [])], cwd);
  if (!check(init.code === 0, "bees init")) {
    console.log(init.out);
    throw new Error("init failed, stopping");
  }
  const config = readFileSync(join(cwd, "bees.yaml"), "utf8");
  const stack = config.match(/stack:\n((?:\s+- .+\n)+)/)?.[1].match(/- (.+)/g)?.map((s) => s.slice(2)) ?? [];
  console.log(paint(2, `   detected stack: ${stack.join(", ") || "(none)"}`));

  // 3. Your files: only managed files may change, and their original text must survive.
  const after = walk(cwd);
  const lock = JSON.parse(readFileSync(join(cwd, "bees.lock"), "utf8"));
  const managed = new Set(Object.keys(lock.files));
  const touched = [...before.keys()].filter((f) => after.get(f) !== before.get(f) && f !== "bees.yaml" && f !== "bees.lock");
  const unexpected = touched.filter((f) => !managed.has(f) || lock.files[f].sha256);
  check(unexpected.length === 0, "pre-existing project files untouched (except bees-managed regions)", unexpected.join(", "));
  const generated = [...after.keys()].filter((f) => !before.has(f));
  console.log(paint(2, `   generated ${generated.length} new file(s), merged into ${touched.length} existing file(s)`));

  // 4. Check, idempotency, doctor.
  check(bees(["sync", "--check"], cwd).code === 0, "bees sync --check passes right after init");
  check(/Already up to date/.test(bees(["sync"], cwd).out), "second bees sync is a no-op");
  const doctor = bees(["doctor"], cwd);
  check(doctor.code === 0, "bees doctor reports a healthy hive", doctor.code ? doctor.out.trim().split("\n").pop() : "");

  // 5. Team notes outside the markers survive.
  const agentsPath = join(cwd, "AGENTS.md");
  const note = "\n## Team notes (added by test:real)\n\nKeep me.\n";
  writeFileSync(agentsPath, readFileSync(agentsPath, "utf8") + note);
  bees(["sync"], cwd);
  check(readFileSync(agentsPath, "utf8").includes("Keep me."), "notes outside the bees markers survive a sync");
  check(bees(["sync", "--check"], cwd).code === 0, "notes outside the markers are not drift");

  // 6. Drift inside the region is caught and repaired.
  writeFileSync(agentsPath, readFileSync(agentsPath, "utf8").replace("# Agent instructions", "# Tampered"));
  check(bees(["sync", "--check"], cwd).code === 1, "hand edits inside the markers fail --check");
  bees(["sync"], cwd);
  check(bees(["sync", "--check"], cwd).code === 0 && readFileSync(agentsPath, "utf8").includes("Keep me."), "bees sync repairs drift and keeps notes");

  // 7. Removing every pack cleans up, adding them back restores.
  const packs = opts.packs.split(",").filter(Boolean);
  if (packs.length) {
    bees(["remove", ...packs], cwd);
    const leftovers = Object.entries(lock.files).filter(([f, e]) => e.sha256 && existsSync(join(cwd, f))).map(([f]) => f);
    check(leftovers.length === 0, "bees remove deletes the files those packs generated", leftovers.join(", "));
    const res = bees(["add", ...packs], cwd);
    check(res.code === 0 && bees(["sync", "--check"], cwd).code === 0, "bees add restores them");
  }

  console.log(paint(2, "\n   generated files:"));
  for (const f of generated.sort()) console.log(paint(2, `     + ${f}`));
} catch (err) {
  check(false, err.message);
} finally {
  console.log("");
  if (failures) console.log(paint(31, `✖ ${failures} check(s) failed.`));
  else console.log(paint(32, "✔ bees works on this project. 🍯"));
  if (opts.keep || failures) console.log(paint(2, `   inspect the result: ${cwd}`));
  else rmSync(work, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
