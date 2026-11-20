import assert from "node:assert/strict";
import { test } from "node:test";
import { BEGIN, END, findRegion, removeRegion, upsertRegion } from "../../src/markers.js";

test("creates a region in a new file", () => {
  const out = upsertRegion(null, "hello");
  assert.ok(out.startsWith(BEGIN));
  assert.ok(out.trimEnd().endsWith(END));
  assert.match(out, /hello/);
});

test("appends a region after existing content and keeps it", () => {
  const out = upsertRegion("# Mine\n\nKeep me.\n", "generated");
  assert.ok(out.startsWith("# Mine\n\nKeep me.\n\n" + BEGIN));
});

test("replaces only the region, keeping text before and after", () => {
  const first = upsertRegion("before\n", "v1") + "after\n";
  const second = upsertRegion(first, "v2");
  assert.match(second, /^before\n/);
  assert.match(second, /after\n$/);
  assert.match(second, /v2/);
  assert.doesNotMatch(second, /v1/);
});

test("is idempotent", () => {
  const once = upsertRegion("x\n", "body");
  assert.equal(upsertRegion(once, "body"), once);
});

test("keeps CRLF line endings", () => {
  const out = upsertRegion("line one\r\nline two\r\n", "a\nb");
  assert.ok(!/[^\r]\n/.test(out), "every newline is CRLF");
});

test("rejects broken markers", () => {
  assert.throws(() => findRegion(`${BEGIN}\nno end`, "X.md"), /markers are broken/);
  assert.throws(() => findRegion(`${END}\n${BEGIN}`, "X.md"), /markers are broken/);
  assert.throws(() => findRegion(`${BEGIN}${END}${BEGIN}${END}`, "X.md"), /markers are broken/);
});

test("removeRegion keeps user text, or returns null when nothing is left", () => {
  assert.equal(removeRegion(upsertRegion(null, "x")), null);
  assert.equal(removeRegion(upsertRegion("mine\n", "x")), "mine\n");
});
