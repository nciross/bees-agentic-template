// Managed regions: bees only ever rewrites text between these two markers,
// so anything a team writes outside them survives every `bees sync`.
import { BeesError } from "./util.js";

export const BEGIN = "<!-- bees:begin -->";
export const END = "<!-- bees:end -->";
const NOTICE = "<!-- Managed by bees: edit bees.yaml and run `bees sync`. Text between these markers is overwritten; write your own notes outside them. -->";

const eolOf = (text) => (text && text.includes("\r\n") ? "\r\n" : "\n");

export function renderRegion(body) {
  return [BEGIN, NOTICE, "", body.trim(), END].join("\n");
}

/** Locate the managed region. Returns null when absent; throws when the markers are broken. */
export function findRegion(text, file = "file") {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 && end === -1) return null;
  const broken =
    begin === -1 ||
    end === -1 ||
    end < begin ||
    text.indexOf(BEGIN, begin + 1) !== -1 ||
    text.indexOf(END, end + 1) !== -1;
  if (broken) {
    throw new BeesError(`${file}: the bees markers are broken (expected exactly one ${BEGIN} followed by one ${END}).`, {
      hint: "Fix or delete the markers by hand, then run `bees sync` again.",
    });
  }
  return { start: begin, end: end + END.length };
}

/** Insert or replace the managed region in `existing` (null = new file), keeping the file's line endings. */
export function upsertRegion(existing, body, file) {
  const eol = eolOf(existing);
  const region = renderRegion(body).replace(/\n/g, eol);
  if (existing == null || existing.trim() === "") return region + eol;
  const found = findRegion(existing, file);
  if (found) return existing.slice(0, found.start) + region + existing.slice(found.end);
  return existing.replace(/\s*$/, "") + eol + eol + region + eol;
}

/** Remove the managed region. Returns null when nothing else is left in the file. */
export function removeRegion(existing, file) {
  const found = findRegion(existing, file);
  if (!found) return existing;
  const rest = (existing.slice(0, found.start).replace(/\s*$/, "") + "\n\n" + existing.slice(found.end).replace(/^\s*/, "")).trim();
  return rest ? rest + eolOf(existing) : null;
}
