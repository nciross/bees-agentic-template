import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const BIN = join(ROOT, "bin", "bees.js");
export const FIXTURES = join(ROOT, "test", "fixtures");

/** A fresh temp dir, removed when the test finishes. */
export function tempDir(t, prefix = "bees-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Copy test/fixtures/<name> into a temp dir and return its path. */
export function copyFixture(t, name) {
  const dir = tempDir(t, `bees-${name}-`);
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

/** Run the real CLI binary in a child process. */
export function bees(args, { cwd, env = {} } = {}) {
  const res = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", BEES_PACKS_DIR: "", ...env },
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, out: res.stdout + res.stderr };
}

export const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
export const write = (dir, rel, text) => writeFileSync(join(dir, rel), text);
