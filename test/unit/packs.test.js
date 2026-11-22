import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { dependentsOf, loadPack, missingRequires, resolveRequires } from "../../src/packs.js";
import { tempDir } from "../helpers.js";

/** Write minimal packs: { name: [requires...] } (null = omit the field, other values written as-is). */
function packsDir(t, packs) {
  const dir = tempDir(t, "bees-packs-");
  for (const [name, requires] of Object.entries(packs)) {
    mkdirSync(join(dir, name));
    const req = requires === null ? "" : `requires: ${JSON.stringify(requires)}\n`;
    writeFileSync(join(dir, name, "pack.yaml"), `name: ${name}\nversion: 0.0.1\ndescription: ${name} pack\n${req}`);
  }
  return dir;
}

test("requires defaults to an empty list", (t) => {
  const dir = packsDir(t, { core: null });
  assert.deepEqual(loadPack("core", dir).requires, []);
});

test("requires must be a list of pack names and not the pack itself", (t) => {
  const dir = packsDir(t, { a: "team", b: ["Not A Name"], c: ["c"] });
  assert.throws(() => loadPack("a", dir), /`requires` must be a list of pack names/);
  assert.throws(() => loadPack("b", dir), /`requires` must be a list of pack names/);
  assert.throws(() => loadPack("c", dir), /cannot require itself/);
});

test("resolveRequires adds transitive requirements before the packs that need them", (t) => {
  const dir = packsDir(t, { core: null, team: [], spec: ["core"], factory: ["spec", "team"] });
  const { names, added } = resolveRequires(["core", "factory"], dir);
  assert.deepEqual(names, ["core", "spec", "team", "factory"]);
  assert.deepEqual(added, [
    { name: "spec", by: "factory" },
    { name: "team", by: "factory" },
  ]);
});

test("resolveRequires reports cycles and unknown requirements", (t) => {
  const dir = packsDir(t, { a: ["b"], b: ["c"], c: ["a"], d: ["ghost"] });
  assert.throws(() => resolveRequires(["a"], dir), /Pack dependency cycle: a → b → c → a/);
  assert.throws(() => resolveRequires(["d"], dir), /Pack "d" requires "ghost", which is not available/);
});

test("missingRequires and dependentsOf", (t) => {
  const dir = packsDir(t, { team: [], spec: [], factory: ["spec", "team"] });
  const loaded = ["team", "factory"].map((n) => loadPack(n, dir));
  assert.deepEqual(missingRequires(loaded), [{ pack: "factory", missing: ["spec"] }]);
  assert.deepEqual(dependentsOf(["team"], ["spec", "factory"], dir), [{ pack: "factory", needs: ["team"] }]);
  assert.deepEqual(dependentsOf(["team"], ["spec"], dir), []);
});
