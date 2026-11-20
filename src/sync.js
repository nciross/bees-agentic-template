// The sync engine: render outputs, compare with disk, and either report (check)
// or apply the difference. Everything is computed before anything is written.
import { isDeepStrictEqual } from "node:util";
import { isAbsolute, join } from "node:path";
import { renderAll } from "./adapters/index.js";
import { LOCK_FILE } from "./config.js";
import { removeRegion, upsertRegion } from "./markers.js";
import { BeesError, normalizeEol, readText, removeFile, sha256, writeText } from "./util.js";

const safeRelPath = (p) => typeof p === "string" && p && !isAbsolute(p) && !p.split(/[\\/]/).includes("..");

export function readLock(cwd) {
  const text = readText(join(cwd, LOCK_FILE));
  if (text == null) return null;
  try {
    const lock = JSON.parse(text);
    const files = Object.fromEntries(Object.entries(lock.files ?? {}).filter(([p]) => safeRelPath(p)));
    return { ...lock, files };
  } catch {
    throw new BeesError(`${LOCK_FILE} is not valid JSON.`, { hint: `Delete ${LOCK_FILE} and run \`bees sync\` to regenerate it.` });
  }
}

export function renderLock(packs, files) {
  const lock = {
    lockfileVersion: 1,
    packs: Object.fromEntries(packs.map((p) => [p.name, { version: p.version, source: "bees" }])),
    files: Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]])),
  };
  return JSON.stringify(lock, null, 2) + "\n";
}

function resolveJson(existing, transform, path) {
  let current = {};
  if (existing != null && existing.trim()) {
    try {
      current = JSON.parse(existing);
    } catch {
      throw new BeesError(`${path} is not valid JSON, so bees cannot merge its settings into it.`, { hint: `Fix ${path} and run \`bees sync\` again.` });
    }
  }
  const next = transform(current);
  // Keep the team's formatting when nothing actually changes.
  return existing != null && isDeepStrictEqual(current, next) ? existing : JSON.stringify(next, null, 2) + "\n";
}

/**
 * Compute every change `bees sync` would make.
 * Returns { changes: [{ path, action, next, note? }], warnings: [] }.
 */
export function computePlan(cwd, { config, packs }) {
  const outputs = renderAll({ config, packs });
  const prevLock = readLock(cwd);
  const changes = [];
  const warnings = [];
  const lockFiles = {};

  for (const out of outputs) {
    const existing = readText(join(cwd, out.path));
    let next;
    let note;
    if (out.content !== undefined) {
      next = out.content;
      lockFiles[out.path] = { sha256: sha256(next) };
      const prevHash = prevLock?.files[out.path]?.sha256;
      if (existing != null && prevHash && sha256(existing) !== prevHash) note = "local edits overwritten (this file is owned by bees)";
      else if (existing != null && !prevHash) note = "replaces an existing file not created by bees";
    } else if (out.region !== undefined) {
      next = upsertRegion(existing, out.region, out.path);
      lockFiles[out.path] = { managed: "region" };
    } else {
      next = resolveJson(existing, out.json, out.path);
      lockFiles[out.path] = { managed: "json" };
    }
    if (existing == null) changes.push({ path: out.path, action: "create", next });
    else if (normalizeEol(existing) !== normalizeEol(next)) changes.push({ path: out.path, action: "update", next, note });
  }

  for (const [path, entry] of Object.entries(prevLock?.files ?? {})) {
    if (lockFiles[path]) continue;
    const existing = readText(join(cwd, path));
    if (existing == null) continue;
    if (entry.sha256) {
      if (sha256(existing) === entry.sha256) changes.push({ path, action: "delete", next: null });
      else warnings.push(`${path} is no longer generated but has local edits, so it was left in place.`);
    } else if (entry.managed === "region") {
      const next = removeRegion(existing, path);
      changes.push(next == null ? { path, action: "delete", next: null } : { path, action: "update", next, note: "bees region removed" });
    }
  }

  const lockText = renderLock(packs, lockFiles);
  const existingLock = readText(join(cwd, LOCK_FILE));
  if (existingLock == null) changes.push({ path: LOCK_FILE, action: "create", next: lockText });
  else if (normalizeEol(existingLock) !== lockText) changes.push({ path: LOCK_FILE, action: "update", next: lockText });

  return { changes, warnings, outputs: outputs.map((o) => o.path) };
}

export function applyPlan(cwd, { changes }) {
  for (const c of changes) {
    const abs = join(cwd, c.path);
    if (c.action === "delete") removeFile(abs, cwd);
    else writeText(abs, c.next);
  }
}
