// Best-effort stack detection for `bees init`. The result is written into
// bees.yaml under `project:` so the team can review and correct it.
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readText } from "./util.js";

const has = (cwd, file) => existsSync(join(cwd, file));
const readJson = (cwd, file) => {
  try {
    return JSON.parse(readText(join(cwd, file)) ?? "null");
  } catch {
    return null;
  }
};

function detectNode(cwd, out) {
  const pkg = readJson(cwd, "package.json");
  if (!pkg) return;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  out.name ??= pkg.name;
  out.stack.push("Node.js");
  if (has(cwd, "tsconfig.json") || deps.typescript) out.stack.push("TypeScript");
  const frameworks = [
    ["next", "Next.js"], ["@nestjs/core", "NestJS"], ["@angular/core", "Angular"], ["nuxt", "Nuxt"],
    ["@sveltejs/kit", "SvelteKit"], ["svelte", "Svelte"], ["vue", "Vue"], ["react", "React"],
    ["express", "Express"], ["fastify", "Fastify"], ["hono", "Hono"], ["vite", "Vite"],
  ];
  for (const [dep, label] of frameworks) if (deps[dep]) out.stack.push(label);

  let pm = "npm";
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : null;
  if (declared) pm = declared;
  else if (has(cwd, "pnpm-lock.yaml")) pm = "pnpm";
  else if (has(cwd, "yarn.lock")) pm = "yarn";
  else if (has(cwd, "bun.lock") || has(cwd, "bun.lockb")) pm = "bun";
  out.packageManager ??= pm;

  const scripts = pkg.scripts ?? {};
  const run = (s) => (pm === "npm" && ["test", "start"].includes(s) ? `npm ${s}` : `${pm} run ${s}`);
  out.commands.install ??= `${pm} install`;
  if (scripts.test && !/no test specified/.test(scripts.test)) out.commands.test ??= run("test");
  if (scripts.build) out.commands.build ??= run("build");
  if (scripts.lint) out.commands.lint ??= run("lint");
  if (scripts.dev) out.commands.dev ??= run("dev");
  else if (scripts.start) out.commands.dev ??= run("start");
}

function detectPython(cwd, out) {
  const pyproject = readText(join(cwd, "pyproject.toml"));
  const requirements = readText(join(cwd, "requirements.txt"));
  if (pyproject == null && requirements == null && !has(cwd, "setup.py")) return;
  const text = `${pyproject ?? ""}\n${requirements ?? ""}`.toLowerCase();
  out.stack.push("Python");
  for (const [dep, label] of [["django", "Django"], ["fastapi", "FastAPI"], ["flask", "Flask"]]) {
    if (new RegExp(`\\b${dep}\\b`).test(text)) out.stack.push(label);
  }
  const nameMatch = pyproject?.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
  if (nameMatch) out.name ??= nameMatch[1];

  let pm = "pip";
  if (has(cwd, "uv.lock")) pm = "uv";
  else if (has(cwd, "poetry.lock") || /\[tool\.poetry\]/.test(pyproject ?? "")) pm = "poetry";
  out.packageManager ??= pm;
  const prefix = pm === "uv" ? "uv run " : pm === "poetry" ? "poetry run " : "";
  out.commands.install ??= pm === "uv" ? "uv sync" : pm === "poetry" ? "poetry install" : requirements != null ? "pip install -r requirements.txt" : "pip install -e .";
  if (/\bpytest\b/.test(text) || has(cwd, "tests") || has(cwd, "pytest.ini")) out.commands.test ??= `${prefix}pytest`;
  if (/\bruff\b/.test(text)) out.commands.lint ??= `${prefix}ruff check .`;
}

function detectOthers(cwd, out) {
  const gomod = readText(join(cwd, "go.mod"));
  if (gomod != null) {
    out.stack.push("Go");
    out.name ??= gomod.match(/^module\s+(\S+)/m)?.[1]?.split("/").pop();
    out.packageManager ??= "go";
    out.commands.test ??= "go test ./...";
    out.commands.build ??= "go build ./...";
    out.commands.lint ??= "go vet ./...";
  }
  const cargo = readText(join(cwd, "Cargo.toml"));
  if (cargo != null) {
    out.stack.push("Rust");
    out.name ??= cargo.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    out.packageManager ??= "cargo";
    out.commands.test ??= "cargo test";
    out.commands.build ??= "cargo build";
    out.commands.lint ??= "cargo clippy";
  }
  if (has(cwd, "pom.xml")) {
    out.stack.push("Java", "Maven");
    out.packageManager ??= "maven";
    const mvn = has(cwd, "mvnw") ? "./mvnw" : "mvn";
    out.commands.test ??= `${mvn} test`;
    out.commands.build ??= `${mvn} package`;
  } else if (has(cwd, "build.gradle") || has(cwd, "build.gradle.kts")) {
    out.stack.push(has(cwd, "build.gradle.kts") ? "Kotlin" : "Java", "Gradle");
    out.packageManager ??= "gradle";
    const gradle = has(cwd, "gradlew") ? "./gradlew" : "gradle";
    out.commands.test ??= `${gradle} test`;
    out.commands.build ??= `${gradle} build`;
  }
  let entries = [];
  try {
    entries = readdirSync(cwd);
  } catch {
    /* unreadable dir: nothing to detect */
  }
  if (entries.some((f) => /\.(sln|csproj|fsproj)$/.test(f))) {
    out.stack.push(".NET");
    out.packageManager ??= "dotnet";
    out.commands.test ??= "dotnet test";
    out.commands.build ??= "dotnet build";
  }
  if (has(cwd, "Gemfile")) {
    out.stack.push("Ruby");
    if (/\brails\b/.test(readText(join(cwd, "Gemfile")) ?? "")) out.stack.push("Rails");
    out.packageManager ??= "bundler";
    out.commands.install ??= "bundle install";
  }
  if (has(cwd, "composer.json")) {
    out.stack.push("PHP");
    out.packageManager ??= "composer";
    out.commands.install ??= "composer install";
  }
}

/** Tools the project already uses, judged by their config files. */
export function detectTools(cwd) {
  const tools = [];
  if (has(cwd, ".claude") || has(cwd, "CLAUDE.md")) tools.push("claude");
  if (has(cwd, ".github/copilot-instructions.md") || has(cwd, ".github/prompts")) tools.push("copilot");
  if (has(cwd, ".cursor") || has(cwd, ".cursorrules")) tools.push("cursor");
  if (has(cwd, ".codex") || has(cwd, ".agents")) tools.push("codex");
  return tools;
}

export function detectProject(cwd) {
  const out = { name: undefined, stack: [], packageManager: undefined, commands: {} };
  detectNode(cwd, out);
  detectPython(cwd, out);
  detectOthers(cwd, out);
  out.name ??= basename(cwd);
  out.stack = [...new Set(out.stack)];
  return out;
}
