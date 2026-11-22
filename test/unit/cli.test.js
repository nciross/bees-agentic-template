import assert from "node:assert/strict";
import { test } from "node:test";
import { suggest } from "../../src/cli.js";

test("suggest finds close matches, including swapped letters", () => {
  const commands = ["init", "sync", "add", "remove", "list", "doctor"];
  assert.equal(suggest("snyc", commands), "sync");
  assert.equal(suggest("doctr", commands), "doctor");
  assert.equal(suggest("lst", commands), "list");
  assert.equal(suggest("deploy", commands), null);
});
