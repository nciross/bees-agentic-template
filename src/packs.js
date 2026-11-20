// A pack is a folder: pack.yaml plus any of
//   rules/<name>.md            → sections of the shared AGENTS.md
//   skills/<name>/SKILL.md     → Agent Skills (plus any supporting files)
//   commands/<name>.md         → slash commands / prompts
//   agents/<name>.md           → sub-agents
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { parseFrontmatter } from "./frontmatter.js";
import { PACK_NAME } from "./config.js";
import { BeesError, isDir, listFilesRecursive, readText } from "./util.js";

export const BUILTIN_PACKS_DIR = fileURLToPath(new URL("../packs/", import.meta.url));
export const packsDir = () => process.env.BEES_PACKS_DIR || BUILTIN_PACKS_DIR;

export function listPacks(dir = packsDir()) {
  return listFilesRecursive(dir)
    .filter((f) => /^[^/]+\/pack\.yaml$/.test(f))
    .map((f) => f.split("/")[0])
    .filter((name) => PACK_NAME.test(name));
}

const mdFiles = (dir) => listFilesRecursive(dir).filter((f) => /^[^/]+\.md$/.test(f));
const baseName = (f) => f.replace(/\.md$/, "");

export function loadPack(name, dir = packsDir()) {
  if (!PACK_NAME.test(name)) throw new BeesError(`Invalid pack name "${name}".`);
  const root = join(dir, name);
  const manifestText = readText(join(root, "pack.yaml"));
  if (manifestText == null) throw new BeesError(`Pack "${name}" not found in ${dir}.`);
  const manifest = YAML.parse(manifestText) ?? {};
  const problems = [];
  if (manifest.name !== name) problems.push(`pack.yaml name must be "${name}"`);
  if (typeof manifest.version !== "string") problems.push("pack.yaml needs a version string");
  if (typeof manifest.description !== "string") problems.push("pack.yaml needs a description");

  const rules = mdFiles(join(root, "rules")).map((f) => ({
    name: baseName(f),
    content: readText(join(root, "rules", f)).replace(/\r\n/g, "\n").trim(),
  }));

  const skillsRoot = join(root, "skills");
  const skillNames = [...new Set(listFilesRecursive(skillsRoot).map((f) => f.split("/")[0]))];
  const skills = skillNames.map((skill) => {
    const skillDir = join(skillsRoot, skill);
    const files = listFilesRecursive(skillDir).map((rel) => ({ rel, content: readText(join(skillDir, rel)) }));
    const main = files.find((f) => f.rel === "SKILL.md");
    if (!main) {
      problems.push(`skill "${skill}" has no SKILL.md`);
      return { name: skill, description: "", files };
    }
    const { data } = parseFrontmatter(main.content);
    if (data.name !== skill) problems.push(`skill "${skill}": front matter name must be "${skill}"`);
    if (!data.description) problems.push(`skill "${skill}": front matter needs a description`);
    return { name: skill, description: data.description ?? "", files };
  });

  const loadDocs = (sub) =>
    isDir(join(root, sub))
      ? mdFiles(join(root, sub)).map((f) => {
          const { data, body } = parseFrontmatter(readText(join(root, sub, f)));
          if (!data.description) problems.push(`${sub}/${f}: front matter needs a description`);
          return { name: baseName(f), description: data.description ?? "", data, body: body.trim() };
        })
      : [];

  if (problems.length) throw new BeesError(`Pack "${name}" is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);

  return {
    name,
    version: manifest.version,
    description: manifest.description,
    license: manifest.license,
    permissions: { deny: manifest.permissions?.deny ?? [] },
    rules,
    skills,
    commands: loadDocs("commands"),
    agents: loadDocs("agents"),
  };
}

export function loadPacks(names, dir = packsDir()) {
  return names.map((n) => loadPack(n, dir));
}
