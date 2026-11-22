// Token budgets: what every agent pays on each request ("always loaded") and
// what it pays only when a skill, agent or command is used ("on demand").
// Counts are estimates (about 4 characters per token, a common rule of thumb;
// exact counts vary by model), measured from the files on disk.
import { join } from "node:path";
import { renderAll } from "./adapters/index.js";
import { TOOL_LABELS } from "./config.js";
import { BEGIN, END, upsertRegion } from "./markers.js";
import { readText } from "./util.js";
import { DEFAULT_BUDGETS } from "./budgets.js";

export const estimateTokens = (text) => Math.ceil((text ?? "").length / 4);

// Which instruction files each tool reads on every request, and which pack
// items it lists by name + description (the body loads only when used).
const ALWAYS = {
  claude: { files: ["AGENTS.md", "CLAUDE.md"], lists: ["skills", "agents", "commands"] },
  copilot: { files: ["AGENTS.md", ".github/copilot-instructions.md"], lists: ["skills", "agents"] },
  cursor: { files: ["AGENTS.md"], lists: ["skills"] },
  codex: { files: ["AGENTS.md"], lists: ["skills"] },
};

/** Split a managed file into bees' part and the team's own text around the markers. */
function splitManaged(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) return { bees: "", own: text };
  return { bees: text.slice(start, end + END.length), own: text.slice(0, start) + text.slice(end + END.length) };
}

/**
 * Measure a project. Returns
 *   { budgets, tools: [{ tool, label, total, parts: [{ label, tokens }] }],
 *     items: [{ kind, name, tokens, budget }], over: [...] }
 */
export function measureTokens(cwd, { config, packs, budgets = DEFAULT_BUDGETS }) {
  const outputs = new Map(renderAll({ config, packs }).map((o) => [o.path, o]));
  const fileText = (path) => {
    const disk = readText(join(cwd, path));
    if (disk != null) return disk;
    const out = outputs.get(path);
    if (!out) return null;
    return out.content ?? (out.region !== undefined ? upsertRegion(null, out.region, path) : null);
  };

  const all = {
    skills: packs.flatMap((p) => p.skills.map((s) => ({ name: s.name, description: s.description, text: s.files.map((f) => f.content ?? "").join("\n") }))),
    agents: packs.flatMap((p) => p.agents.map((a) => ({ name: a.name, description: a.description, text: a.body }))),
    commands: packs.flatMap((p) => p.commands.map((c) => ({ name: c.name, description: c.description, text: c.body }))),
  };

  const tools = config.tools.map((tool) => {
    const parts = [];
    for (const path of ALWAYS[tool].files) {
      const text = fileText(path);
      if (text == null) continue;
      const { bees, own } = splitManaged(text);
      if (bees) parts.push({ label: `${path} (bees)`, tokens: estimateTokens(bees) });
      if (own.trim()) parts.push({ label: `${path} (your text)`, tokens: estimateTokens(own), own: true });
    }
    for (const kind of ALWAYS[tool].lists) {
      if (!all[kind].length) continue;
      const tokens = all[kind].reduce((n, x) => n + estimateTokens(`${x.name}: ${x.description}`) + 4, 0);
      parts.push({ label: `${all[kind].length} ${kind.replace(/s$/, "")} description${all[kind].length > 1 ? "s" : ""}`, tokens });
    }
    parts.sort((a, b) => b.tokens - a.tokens);
    const total = parts.reduce((n, p) => n + p.tokens, 0);
    return { tool, label: TOOL_LABELS[tool], total, parts, budget: budgets["always-loaded"] };
  });

  const items = [
    ...all.skills.map((s) => ({ kind: "skill", name: s.name, tokens: estimateTokens(s.text), budget: budgets.skill })),
    ...all.agents.map((a) => ({ kind: "agent", name: a.name, tokens: estimateTokens(a.text), budget: budgets.agent })),
    ...all.commands.map((c) => ({ kind: "command", name: c.name, tokens: estimateTokens(c.text), budget: budgets.command })),
  ];

  const over = [
    ...tools.filter((t) => t.total > t.budget).map((t) => ({ what: `${t.label}: always-loaded context`, tokens: t.total, budget: t.budget })),
    ...items.filter((i) => i.tokens > i.budget).map((i) => ({ what: `${i.kind} ${i.name}`, tokens: i.tokens, budget: i.budget })),
  ];
  return { budgets, tools, items, over };
}

/** Short, actionable suggestions from a measurement. */
export function tokenTips(report, { hasTokenOptimizer = false } = {}) {
  const tips = [];
  const worst = [...report.tools].sort((a, b) => b.total - a.total)[0];
  if (worst) {
    const top = worst.parts[0];
    if (top && worst.total > worst.budget * 0.8) {
      const share = `${top.label} is ${Math.round((top.tokens / worst.total) * 100)}% of what ${worst.label} loads on every request.`;
      tips.push(
        top.own
          ? `${share} Move task-specific guidance into a skill so it loads only when needed.`
          : `${share} Remove packs you don't use, or switch off agents you don't need (e.g. \`team: { designer: false }\` in bees.yaml).`,
      );
    }
    for (const p of worst.parts.filter((x) => x.own && x.tokens > 500)) {
      tips.push(`${p.label} costs ~${p.tokens.toLocaleString("en-US")} tokens per request. Trim it, or link to a doc instead of inlining it.`);
    }
  }
  for (const o of report.over.filter((x) => !x.what.includes("always-loaded"))) {
    tips.push(`${o.what} is over its budget. Split it, or move long examples into a supporting file the agent reads on demand.`);
  }
  if (hasTokenOptimizer) tips.push("Ask the token-optimizer agent for a before/after review of the biggest parts.");
  else tips.push("`bees add team` adds Theo, a token-optimizer agent that proposes concrete cuts.");
  return tips;
}
