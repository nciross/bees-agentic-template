import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** An expected failure: printed without a stack trace, exits with `exitCode`. */
export class BeesError extends Error {
  constructor(message, { exitCode = 1, hint } = {}) {
    super(message);
    this.name = "BeesError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export const toPosix = (p) => p.split(sep).join("/");
export const normalizeEol = (text) => text.replace(/\r\n/g, "\n");
export const sha256 = (text) => createHash("sha256").update(normalizeEol(text)).digest("hex");

export function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "EISDIR") return null;
    throw err;
  }
}

export function writeText(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

/** Delete a file, then remove parent directories that became empty, stopping at `root`. */
export function removeFile(file, root) {
  if (existsSync(file)) unlinkSync(file);
  let dir = dirname(file);
  while (dir !== root && relative(root, dir) && !relative(root, dir).startsWith("..")) {
    try {
      if (readdirSync(dir).length > 0) break;
      rmdirSync(dir);
    } catch {
      break;
    }
    dir = dirname(dir);
  }
}

/** All files under `dir`, as posix paths relative to it, sorted. */
export function listFilesRecursive(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(toPosix(relative(dir, full)));
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return out.sort();
}

export const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
