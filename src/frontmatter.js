import YAML from "yaml";
import { normalizeEol } from "./util.js";

const FENCE = /^---\n([\s\S]*?)\n---\n?/;

/** Split a Markdown file into YAML front matter and body. */
export function parseFrontmatter(text) {
  const src = normalizeEol(text);
  const m = src.match(FENCE);
  if (!m) return { data: {}, body: src };
  const data = YAML.parse(m[1]) ?? {};
  return { data, body: src.slice(m[0].length) };
}

/** Join front matter and body. Keys with undefined values are dropped. */
export function stringifyFrontmatter(data, body) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const head = Object.keys(clean).length ? `---\n${YAML.stringify(clean, { lineWidth: 0 }).trimEnd()}\n---\n\n` : "";
  return head + body.replace(/^\s+/, "").replace(/\s*$/, "\n");
}
