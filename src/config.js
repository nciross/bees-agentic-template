import { join } from "node:path";
import YAML from "yaml";
import { BeesError, readText, writeText } from "./util.js";

export const CONFIG_FILE = "bees.yaml";
export const LOCK_FILE = "bees.lock";
export const TOOLS = ["claude", "copilot", "cursor", "codex"];
export const TOOL_LABELS = { claude: "Claude Code", copilot: "GitHub Copilot", cursor: "Cursor", codex: "Codex" };
export const PACK_NAME = /^[a-z0-9][a-z0-9-]*$/;
const COMMAND_KEYS = ["install", "dev", "build", "test", "lint"];

/** Validate raw parsed YAML. Returns { config, errors, warnings }. */
export function validateConfig(raw, availablePacks) {
  const errors = [];
  const warnings = [];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { config: null, errors: [`${CONFIG_FILE} must be a YAML mapping.`], warnings };
  }
  if (raw.version !== 1) errors.push(`\`version\` must be 1 (found ${JSON.stringify(raw.version)}).`);

  const list = (key) => {
    const v = raw[key];
    if (v == null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      errors.push(`\`${key}\` must be a list of names.`);
      return [];
    }
    return [...new Set(v)];
  };
  const tools = list("tools");
  const packs = list("packs");
  for (const t of tools) if (!TOOLS.includes(t)) errors.push(`Unknown tool "${t}". Supported: ${TOOLS.join(", ")}.`);
  if (tools.length === 0) errors.push("`tools` must list at least one tool.");
  for (const p of packs) {
    if (!PACK_NAME.test(p)) errors.push(`Invalid pack name "${p}".`);
    else if (availablePacks && !availablePacks.includes(p)) {
      errors.push(`Unknown pack "${p}". Available: ${availablePacks.join(", ") || "none"}.`);
    }
  }
  if (!packs.includes("core")) warnings.push("The `core` pack is not enabled; AGENTS.md will only contain project facts.");

  const p = raw.project ?? {};
  if (typeof p !== "object" || Array.isArray(p)) errors.push("`project` must be a mapping.");
  const commands = {};
  for (const k of COMMAND_KEYS) if (typeof p.commands?.[k] === "string" && p.commands[k].trim()) commands[k] = p.commands[k].trim();
  const project = {
    name: typeof p.name === "string" ? p.name : undefined,
    description: typeof p.description === "string" ? p.description : undefined,
    stack: Array.isArray(p.stack) ? p.stack.map(String) : [],
    packageManager: typeof p.packageManager === "string" ? p.packageManager : undefined,
    commands,
  };

  const known = new Set(["version", "project", "tools", "packs", "team", "overrides"]);
  for (const k of Object.keys(raw)) if (!known.has(k)) warnings.push(`Unknown key \`${k}\` in ${CONFIG_FILE} is ignored.`);

  return { config: { version: 1, project, tools: TOOLS.filter((t) => tools.includes(t)), packs }, errors, warnings };
}

export function readConfigDocument(cwd) {
  const file = join(cwd, CONFIG_FILE);
  const text = readText(file);
  if (text == null) {
    throw new BeesError(`No ${CONFIG_FILE} found in ${cwd}.`, { hint: "Run `bees init` to set bees up in this project." });
  }
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) throw new BeesError(`${CONFIG_FILE} is not valid YAML: ${doc.errors[0].message}`);
  return { file, doc };
}

/** Load and validate bees.yaml; throws a BeesError listing every problem. */
export function loadConfig(cwd, availablePacks) {
  const { doc } = readConfigDocument(cwd);
  const result = validateConfig(doc.toJS(), availablePacks);
  if (result.errors.length) {
    throw new BeesError(`${CONFIG_FILE} has ${result.errors.length} problem(s):\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return result;
}

export function renderConfig({ project, tools, packs }) {
  const commands = Object.fromEntries(COMMAND_KEYS.filter((k) => project.commands?.[k]).map((k) => [k, project.commands[k]]));
  const data = {
    version: 1,
    project: {
      name: project.name,
      ...(project.stack?.length ? { stack: project.stack } : {}),
      ...(project.packageManager ? { packageManager: project.packageManager } : {}),
      ...(Object.keys(commands).length ? { commands } : {}),
    },
    tools,
    packs,
  };
  const header = [
    "# bees.yaml: your project's shared agentic dev environment.",
    "# Commit this file. After editing it, run `bees sync` (CI runs `bees sync --check`).",
    "# Docs: https://github.com/nciross/bees-agentic-template",
    "",
  ].join("\n");
  return header + YAML.stringify(data, { lineWidth: 0, flowCollectionPadding: true });
}

export function writeConfig(cwd, config) {
  writeText(join(cwd, CONFIG_FILE), renderConfig(config));
}
