import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { CONFIG_FILE, LOCK_FILE, TOOLS, TOOL_LABELS, loadConfig, readConfigDocument, renderConfig, validateConfig, writeConfig } from "./config.js";
import { detectProject, detectTools } from "./detect.js";
import { findRegion } from "./markers.js";
import { dependentsOf, listPacks, loadPack, loadPacks, missingRequires, resolveRequires } from "./packs.js";
import { applyPlan, computePlan } from "./sync.js";
import { applyTeam } from "./team.js";
import { measureTokens, tokenTips } from "./tokens.js";
import { askList, banner, c, isInteractive, log, printChanges } from "./ui.js";
import { BeesError, isDir, readText, writeText } from "./util.js";

export const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const DOCS = "https://github.com/nciross/bees-agentic-template";

// One entry per command: drives `bees --help`, `bees help <command>` and `bees <command> --help`.
const COMMANDS = {
  init: {
    summary: "Set bees up in this project: detect the stack, pick tools and packs, generate configs",
    usage: "bees init [--tools <list>] [--packs <list>] [-y] [--force] [--dry-run]",
    options: [
      ["--tools <list>", `Comma-separated tools (${TOOLS.join(", ")}). Default: detected, else all`],
      ["--packs <list>", "Comma-separated packs. Default: core. Required packs are added for you"],
      ["-y, --yes", "Accept the detected defaults, no prompts"],
      ["--force", "Overwrite an existing bees.yaml"],
      ["--dry-run", "Show what would be generated, write nothing"],
    ],
    examples: ["bees init", "bees init -y --tools claude,copilot", "bees init --packs core --dry-run"],
  },
  sync: {
    summary: "Re-generate configs from bees.yaml (idempotent, keeps your own edits)",
    usage: "bees sync [--check] [--dry-run]",
    options: [
      ["--check", "Write nothing; exit 1 if generated configs are stale (use in CI)"],
      ["--dry-run", "Show the changes without writing them"],
    ],
    examples: ["bees sync", "bees sync --check"],
  },
  add: {
    summary: "Enable packs (and the packs they require), then sync",
    usage: "bees add <pack...> [--dry-run]",
    options: [["--dry-run", "Show the packs and files that would change"]],
    examples: ["bees add core", "bees add team --dry-run"],
  },
  remove: {
    summary: "Disable packs and delete the files they generated, then sync",
    usage: "bees remove <pack...> [--dry-run]",
    options: [["--dry-run", "Show the packs and files that would change"]],
    notes: "Refuses while another enabled pack still requires one of them.",
    examples: ["bees remove core"],
  },
  list: {
    summary: "List available packs; ● marks the ones enabled here",
    usage: "bees list",
    examples: ["bees list"],
  },
  tokens: {
    summary: "Show the token cost of your agent setup per tool, against your budgets",
    usage: "bees tokens [--check] [--json]",
    options: [
      ["--check", "Exit 1 when anything is over budget (use in CI)"],
      ["--json", "Print the measurement as JSON"],
    ],
    notes: "Set budgets in bees.yaml under `tokens:` (always-loaded, skill, agent, command). Counts are estimates (~4 characters per token).",
    examples: ["bees tokens", "bees tokens --check"],
  },
  doctor: {
    summary: "Check Node.js, bees.yaml, bees.lock, markers, drift and token budgets",
    usage: "bees doctor",
    examples: ["bees doctor"],
  },
};

const GLOBAL_OPTIONS = [
  ["-C, --cwd <dir>", "Run as if started in <dir>"],
  ["-h, --help", "Show help (also: bees help <command>)"],
  ["-v, --version", "Show the version"],
];

const table = (rows, width) => rows.map(([k, v]) => `  ${k.padEnd(width)}${v}`).join("\n");

function mainHelp() {
  const names = Object.keys(COMMANDS);
  return `${c.honey("bees")} ${VERSION}: one hive, every agent.

${c.bold("Usage")}  bees <command> [options]

${c.bold("Commands")}
${table(names.map((n) => [n, COMMANDS[n].summary]), 10)}

${c.bold("Options")}
${table(GLOBAL_OPTIONS, 18)}

${c.bold("Get started")}
  ${c.dim("$")} npx bees-agentic@alpha init     ${c.dim("# in your project")}
  ${c.dim("$")} bees help init                  ${c.dim("# details for one command")}

Docs: ${DOCS}`;
}

function commandHelp(name) {
  const cmd = COMMANDS[name];
  const parts = [`${c.bold(`bees ${name}`)}: ${cmd.summary}`, "", `${c.bold("Usage")}  ${cmd.usage}`];
  if (cmd.options?.length) parts.push("", c.bold("Options"), table([...cmd.options, ...GLOBAL_OPTIONS.slice(0, 1)], 18));
  if (cmd.notes) parts.push("", cmd.notes);
  parts.push("", c.bold("Examples"), ...cmd.examples.map((e) => `  ${c.dim("$")} ${e}`));
  return parts.join("\n");
}

/** Closest candidate within a small edit distance, for "did you mean" hints. */
export function suggest(input, candidates) {
  const dist = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        // A swap of two neighbouring letters ("snyc") counts as one typo.
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    return d[a.length][b.length];
  };
  let best = null;
  for (const cand of candidates) {
    const score = dist(input, cand);
    if (score <= Math.max(1, Math.floor(cand.length / 3)) && (!best || score < best.score)) best = { cand, score };
  }
  return best?.cand ?? null;
}

const OPTIONS = {
  cwd: { type: "string", short: "C" },
  tools: { type: "string" },
  packs: { type: "string" },
  yes: { type: "boolean", short: "y" },
  force: { type: "boolean" },
  check: { type: "boolean" },
  "dry-run": { type: "boolean" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

const splitList = (s) => [...new Set(String(s).split(/[\s,]+/).filter(Boolean))];

/** Load bees.yaml and its packs. `packsOverride` previews a different pack list (dry runs). */
function loadProject(cwd, packsOverride) {
  const available = listPacks();
  const { config, warnings } = loadConfig(cwd, available);
  if (packsOverride) config.packs = packsOverride;
  const packs = loadPacks(config.packs);
  const missing = missingRequires(packs);
  if (missing.length) {
    const all = [...new Set(missing.flatMap((m) => m.missing))];
    throw new BeesError(
      missing.map((m) => `Pack "${m.pack}" requires ${m.missing.map((x) => `"${x}"`).join(", ")}, which ${m.missing.length > 1 ? "are" : "is"} not enabled.`).join("\n"),
      { hint: `Run \`bees add ${all.join(" ")}\`.` },
    );
  }
  const hive = applyTeam(packs, config.team);
  return { config, warnings: [...warnings, ...hive.warnings], packs: hive.packs, roster: hive.roster };
}

/** Run a sync and report it. Returns the exit code. */
function runSync(cwd, { check = false, dryRun = false, quiet = false, packsOverride } = {}) {
  const { config, warnings, packs } = loadProject(cwd, packsOverride);
  for (const w of warnings) log.warn(w);
  const plan = computePlan(cwd, { config, packs });
  for (const w of plan.warnings) log.warn(w);

  if (check) {
    if (plan.changes.length === 0) {
      log.ok(`Generated configs are up to date (${plan.outputs.length} files, tools: ${config.tools.join(", ")}).`);
      return 0;
    }
    log.error(`Generated configs are stale: ${plan.changes.length} file(s) differ from ${CONFIG_FILE}.`);
    printChanges(plan.changes, { prefix: "  " });
    log.info(c.dim("  Run `bees sync` and commit the result."));
    return 1;
  }
  if (plan.changes.length === 0) {
    if (!quiet) log.ok("Already up to date.");
    return 0;
  }
  printChanges(plan.changes, { prefix: "  " });
  if (dryRun) {
    log.info(c.dim(`  Dry run: ${plan.changes.length} change(s) not written.`));
    return 0;
  }
  applyPlan(cwd, plan);
  log.ok(`Synced ${plan.changes.length} file(s).`);
  return 0;
}

async function cmdInit(cwd, opts) {
  if (!isDir(cwd)) throw new BeesError(`Directory not found: ${cwd}`);
  if (existsSync(join(cwd, CONFIG_FILE)) && !opts.force) {
    throw new BeesError(`${CONFIG_FILE} already exists.`, { hint: "Run `bees sync` to regenerate, or `bees init --force` to start over." });
  }
  banner();
  const project = detectProject(cwd);
  log.step(`Project ${c.bold(project.name)}${project.stack.length ? ` · ${project.stack.join(", ")}` : c.dim(" · stack not detected")}`);

  const available = listPacks();
  const detected = detectTools(cwd);
  const defaultTools = detected.length ? detected : TOOLS;
  const defaultPacks = available.includes("core") ? ["core"] : [];
  const prompt = isInteractive() && !opts.yes;

  let tools = opts.tools ? splitList(opts.tools) : prompt ? await askList("Which AI tools does your team use?", TOOLS, defaultTools) : defaultTools;
  let packs = opts.packs ? splitList(opts.packs) : prompt ? await askList("Which packs?", available, defaultPacks) : defaultPacks;

  const { config, errors } = validateConfig({ version: 1, tools, packs }, available);
  if (errors.length) throw new BeesError(errors.join("\n"));
  tools = config.tools;
  const resolved = resolveRequires(config.packs);
  for (const a of resolved.added) log.step(`Also enabling ${c.bold(a.name)} (required by ${a.by})`);
  packs = resolved.names;
  log.step(`Tools: ${tools.map((t) => TOOL_LABELS[t]).join(", ")}`);
  log.step(`Packs: ${packs.join(", ") || "(none)"}`);

  if (opts["dry-run"]) {
    const preview = validateConfig(YAML.parse(renderConfig({ project, tools, packs })), available).config;
    const plan = computePlan(cwd, { config: preview, packs: applyTeam(loadPacks(packs), preview.team).packs });
    printChanges([{ action: existsSync(join(cwd, CONFIG_FILE)) ? "update" : "create", path: CONFIG_FILE }, ...plan.changes], { prefix: "  " });
    log.info(c.dim(`  Dry run: ${plan.changes.length + 1} change(s) not written.`));
    return 0;
  }
  writeConfig(cwd, { project, tools, packs });
  log.ok(`Wrote ${CONFIG_FILE}`);
  runSync(cwd);
  log.info(`
${c.bold("Next steps")}
  1. Review ${CONFIG_FILE} (check the detected project commands).
  2. Commit ${CONFIG_FILE}, ${LOCK_FILE} and the generated files listed above.
  3. In CI, run ${c.dim("bees sync --check")} so generated configs never go stale (see docs/install.md).`);
  return 0;
}

function editPacks(cwd, names, mode, opts) {
  const available = listPacks();
  if (!names.length) {
    throw new BeesError(`Usage: bees ${mode} <pack...>`, { hint: `Available packs: ${available.join(", ")}. See \`bees list\`.` });
  }
  const { file, doc } = readConfigDocument(cwd);
  const current = doc.toJS()?.packs ?? [];
  if (mode === "add") {
    const unknown = names.filter((n) => !available.includes(n));
    if (unknown.length) {
      const guesses = unknown.map((n) => suggest(n, available)).filter(Boolean);
      throw new BeesError(`Unknown pack(s): ${unknown.join(", ")}.`, {
        hint: guesses.length ? `Did you mean ${guesses.join(", ")}? Available: ${available.join(", ")}` : `Available: ${available.join(", ")}`,
      });
    }
  }
  let next;
  if (mode === "add") {
    // Validates every pack (and what it requires) before touching bees.yaml.
    const { names: resolved, added } = resolveRequires(names);
    for (const a of added) if (!current.includes(a.name)) log.step(`Also enabling ${c.bold(a.name)} (required by ${a.by})`);
    next = [...current, ...resolved.filter((n) => !current.includes(n))];
  } else {
    next = current.filter((n) => !names.includes(n));
    const blocked = dependentsOf(names, next.filter((n) => available.includes(n)));
    if (blocked.length) {
      throw new BeesError(
        blocked.map((b) => `Can't remove ${b.needs.join(", ")}: pack "${b.pack}" requires ${b.needs.length > 1 ? "them" : "it"}.`).join("\n"),
        { hint: `Remove the dependent pack too: \`bees remove ${[...new Set([...blocked.map((b) => b.pack), ...names])].join(" ")}\`` },
      );
    }
  }
  if (next.length === current.length) {
    log.ok(mode === "add" ? "Already enabled." : "None of those packs are enabled.");
    return 0;
  }
  doc.set("packs", next);
  if (opts["dry-run"]) {
    log.step(`Packs would become: ${next.join(", ") || "(none)"}`);
    return runSync(cwd, { dryRun: true, packsOverride: next });
  }
  writeText(file, doc.toString());
  log.ok(`${mode === "add" ? "Enabled" : "Disabled"} ${names.join(", ")} in ${CONFIG_FILE}`);
  return runSync(cwd);
}

function cmdList(cwd) {
  let enabled = [];
  try {
    enabled = readConfigDocument(cwd).doc.toJS()?.packs ?? [];
  } catch {
    /* not initialised: just list */
  }
  for (const name of listPacks()) {
    const pack = loadPack(name);
    const mark = enabled.includes(name) ? c.green("●") : c.dim("○");
    const requires = pack.requires.length ? c.dim(`  (requires ${pack.requires.join(", ")})`) : "";
    log.info(`${mark} ${c.bold(name)} ${c.dim(pack.version)}  ${pack.description}${requires}`);
  }
  return 0;
}

const fmt = (n) => n.toLocaleString("en-US");

function bar(value, max, width = 24) {
  const ratio = max > 0 ? value / max : 0;
  const filled = Math.min(width, Math.round(Math.min(ratio, 1) * width));
  const paintBar = ratio > 1 ? c.red : ratio > 0.8 ? c.yellow : c.green;
  return paintBar("█".repeat(filled)) + c.dim("░".repeat(width - filled));
}

const status = (value, max) => (value > max ? c.red("✖ over") : value > max * 0.8 ? c.yellow("⚠ near") : c.green("✔"));

/** The token screen: always-loaded cost per tool, on-demand items, tips. */
function cmdTokens(cwd, opts) {
  const project = loadProject(cwd);
  const report = measureTokens(cwd, { ...project, budgets: project.config.budgets });
  if (opts.json) {
    log.info(JSON.stringify(report, null, 2));
    return opts.check && report.over.length ? 1 : 0;
  }

  const name = project.config.project.name ?? "this project";
  const labelWidth = Math.max(...report.tools.map((t) => t.label.length), 14);
  log.info(`${c.honey("🪙 Token budget")} · ${c.bold(name)}   ${c.dim("estimates, ~4 characters per token")}`);

  log.info(`\n${c.bold("Always loaded")} ${c.dim(`(paid on every request · budget ${fmt(report.budgets["always-loaded"])} per tool)`)}`);
  for (const t of report.tools) {
    const pct = Math.round((t.total / t.budget) * 100);
    log.info(`  ${t.label.padEnd(labelWidth)}  ${bar(t.total, t.budget)}  ${fmt(t.total).padStart(6)}  ${String(pct).padStart(3)}%  ${status(t.total, t.budget)}`);
  }

  const heaviest = [...report.tools].sort((a, b) => b.total - a.total)[0];
  if (heaviest?.parts.length) {
    log.info(`\n  ${c.dim(`What ${heaviest.label} loads`)}`);
    for (const p of heaviest.parts) log.info(`    ${p.label.padEnd(44)} ${fmt(p.tokens).padStart(6)}`);
  }

  if (report.items.length) {
    log.info(`\n${c.bold("Loaded on demand")} ${c.dim("(paid only when used)")}`);
    const width = Math.max(...report.items.map((i) => i.name.length));
    for (const i of [...report.items].sort((a, b) => b.tokens / b.budget - a.tokens / a.budget)) {
      log.info(`  ${i.kind.padEnd(8)} ${i.name.padEnd(width)}  ${bar(i.tokens, i.budget, 12)}  ${fmt(i.tokens).padStart(5)} / ${fmt(i.budget).padEnd(5)}  ${status(i.tokens, i.budget)}`);
    }
  }

  const hasTokenOptimizer = project.packs.some((p) => p.agents.some((a) => a.name === "token-optimizer"));
  log.info(`\n${c.bold("Tips")}`);
  for (const tip of tokenTips(report, { hasTokenOptimizer })) log.info(`  • ${tip}`);
  log.info("");
  if (report.over.length) {
    log.error(`${report.over.length} item(s) over budget: ${report.over.map((o) => o.what).join("; ")}.`);
    log.info(c.dim("  Raise a budget under `tokens:` in bees.yaml, or trim the content."));
    return opts.check ? 1 : 0;
  }
  log.ok("Everything is within budget. 🍯");
  return 0;
}

function cmdDoctor(cwd) {
  let problems = 0;
  const fail = (m) => (problems++, log.error(m));
  const [major] = process.versions.node.split(".").map(Number);
  major >= 22 ? log.ok(`Node.js ${process.versions.node}`) : fail(`Node.js ${process.versions.node} is too old; bees needs 22+.`);

  let project;
  try {
    project = loadProject(cwd);
    log.ok(`${CONFIG_FILE} is valid (tools: ${project.config.tools.join(", ")}; packs: ${project.config.packs.join(", ") || "none"})`);
    for (const w of project.warnings) log.warn(w);
  } catch (err) {
    fail(err.message);
    if (err.hint) log.info(c.dim(`  ${err.hint}`));
    return 1;
  }

  existsSync(join(cwd, LOCK_FILE)) ? log.ok(`${LOCK_FILE} present`) : fail(`${LOCK_FILE} is missing. Run \`bees sync\`.`);

  for (const file of ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"]) {
    const text = readText(join(cwd, file));
    if (text == null) continue;
    try {
      if (!findRegion(text, file)) fail(`${file} has no bees markers. Run \`bees sync\` to add them.`);
    } catch (err) {
      fail(err.message);
    }
  }

  try {
    const plan = computePlan(cwd, project);
    if (plan.changes.length) {
      fail(`${plan.changes.length} generated file(s) are stale. Run \`bees sync\`.`);
      printChanges(plan.changes, { prefix: "    " });
    } else log.ok(`All ${plan.outputs.length} generated files are up to date`);
    for (const w of plan.warnings) log.warn(w);
  } catch (err) {
    fail(err.message);
  }

  const { tools } = project.config;
  if (tools.includes("codex") && project.packs.some((p) => p.commands.length)) {
    log.warn("Codex has no project-scope custom prompts; pack commands are available to the other tools only.");
  }
  if (tools.includes("cursor") && project.packs.some((p) => p.agents.length)) {
    log.warn("Cursor has no sub-agents; pack agents are listed as roles in AGENTS.md instead.");
  }

  // Budgets are advice, not a failure: `bees tokens --check` is the strict version.
  const { over } = measureTokens(cwd, { ...project, budgets: project.config.budgets });
  if (over.length) log.warn(`${over.length} item(s) over their token budget. Run \`bees tokens\` for details.`);
  else log.ok("Within token budgets");

  if (problems) log.error(`${problems} problem(s) found.`);
  else log.ok("The hive is healthy. 🍯");
  return problems ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    log.error(err.message);
    log.info(c.dim("Run `bees --help` for usage."));
    return 2;
  }
  const { values: opts, positionals } = parsed;
  const [command, ...rest] = positionals;
  const cwd = resolve(opts.cwd ?? process.cwd());

  if (opts.version) return log.info(VERSION), 0;
  const helpFor = command === "help" ? rest[0] : opts.help ? command : undefined;
  if (helpFor && COMMANDS[helpFor]) return log.info(commandHelp(helpFor)), 0;
  if (opts.help || !command || command === "help") {
    if (!command) banner();
    if (helpFor) log.warn(`No command "${helpFor}".`);
    log.info(mainHelp());
    return 0;
  }

  try {
    switch (command) {
      case "init":
        return await cmdInit(cwd, opts);
      case "sync":
        return runSync(cwd, { check: opts.check, dryRun: opts["dry-run"] });
      case "add":
        return editPacks(cwd, rest, "add", opts);
      case "remove":
        return editPacks(cwd, rest, "remove", opts);
      case "list":
        return cmdList(cwd);
      case "doctor":
        return cmdDoctor(cwd);
      case "tokens":
        return cmdTokens(cwd, opts);
      default:
        log.error(`Unknown command "${command}".`);
        {
          const guess = suggest(command, Object.keys(COMMANDS));
          log.info(c.dim(guess ? `  Did you mean \`bees ${guess}\`? Run \`bees --help\` for all commands.` : "  Run `bees --help` for usage."));
        }
        return 2;
    }
  } catch (err) {
    if (err instanceof BeesError) {
      log.error(err.message);
      if (err.hint) log.info(c.dim(`  ${err.hint}`));
      return err.exitCode;
    }
    throw err;
  }
}
