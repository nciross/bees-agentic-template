import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE, LOCK_FILE, TOOLS, TOOL_LABELS, loadConfig, readConfigDocument, validateConfig, writeConfig } from "./config.js";
import { detectProject, detectTools } from "./detect.js";
import { findRegion } from "./markers.js";
import { dependentsOf, listPacks, loadPack, loadPacks, missingRequires, resolveRequires } from "./packs.js";
import { applyPlan, computePlan } from "./sync.js";
import { askList, banner, c, isInteractive, log, printChanges } from "./ui.js";
import { BeesError, isDir, readText, writeText } from "./util.js";

export const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `${c.honey("bees")} ${VERSION}: one hive, every agent.

Usage: bees <command> [options]

Commands
  init                 Detect the stack, pick tools and packs, write bees.yaml, generate configs
  sync                 Re-generate configs from bees.yaml (idempotent, keeps your edits)
  sync --check         Exit 1 if generated configs are stale (use in CI)
  add <pack...>        Enable packs (and the packs they require) and sync
  remove <pack...>     Disable packs and sync (removes the files they generated;
                       refuses while another enabled pack requires them)
  list                 List available packs
  doctor               Diagnose config, drift and broken markers

Options
  -C, --cwd <dir>      Run as if started in <dir>
      --tools <list>   init: comma-separated tools (${TOOLS.join(", ")})
      --packs <list>   init: comma-separated packs (default: core)
  -y, --yes            init: accept detected defaults, no prompts
      --force          init: overwrite an existing bees.yaml
      --dry-run        init/sync/add/remove: show changes without writing
  -h, --help           Show this help
  -v, --version        Show the version

Docs: https://github.com/nciross/bees-agentic-template`;

const OPTIONS = {
  cwd: { type: "string", short: "C" },
  tools: { type: "string" },
  packs: { type: "string" },
  yes: { type: "boolean", short: "y" },
  force: { type: "boolean" },
  check: { type: "boolean" },
  "dry-run": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

const splitList = (s) => [...new Set(String(s).split(/[\s,]+/).filter(Boolean))];

function loadProject(cwd) {
  const available = listPacks();
  const { config, warnings } = loadConfig(cwd, available);
  const packs = loadPacks(config.packs);
  const missing = missingRequires(packs);
  if (missing.length) {
    const all = [...new Set(missing.flatMap((m) => m.missing))];
    throw new BeesError(
      missing.map((m) => `Pack "${m.pack}" requires ${m.missing.map((x) => `"${x}"`).join(", ")}, which ${m.missing.length > 1 ? "are" : "is"} not enabled.`).join("\n"),
      { hint: `Run \`bees add ${all.join(" ")}\`.` },
    );
  }
  return { config, warnings, packs };
}

/** Run a sync and report it. Returns the exit code. */
function runSync(cwd, { check = false, dryRun = false, quiet = false } = {}) {
  const { config, warnings, packs } = loadProject(cwd);
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
    log.info(c.dim(`Dry run: would write ${CONFIG_FILE} and generate configs.`));
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
  if (!names.length) throw new BeesError(`Usage: bees ${mode} <pack...>`);
  const available = listPacks();
  const { file, doc } = readConfigDocument(cwd);
  const current = doc.toJS()?.packs ?? [];
  if (mode === "add") {
    const unknown = names.filter((n) => !available.includes(n));
    if (unknown.length) throw new BeesError(`Unknown pack(s): ${unknown.join(", ")}.`, { hint: `Available: ${available.join(", ")}` });
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
    log.info(c.dim(`Dry run: packs would become ${next.join(", ") || "(none)"}`));
    return 0;
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
  if (opts.help || !command || command === "help") {
    if (!command) banner();
    log.info(HELP);
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
      default:
        log.error(`Unknown command "${command}".`);
        log.info(c.dim("Run `bees --help` for usage."));
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
