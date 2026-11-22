// The hive: agents with a `persona` (a name) and a `role` in their front matter.
// bees.yaml can rename them or switch them off:
//
//   team:
//     reviewer: { name: Ken }
//     designer: false
//
// Pack text refers to teammates as {{team.<agent>}}; inside an agent file,
// {{name}} and {{role}} are that agent's own name and role.
import { BeesError } from "./util.js";

export const PERSONA_NAME = /^[\p{L}][\p{L}\p{N} .'-]{0,29}$/u;
const PLACEHOLDER = /\{\{\s*(team\.([a-z0-9-]+)|name|role)\s*\}\}/g;

/** Validate the `team` key of bees.yaml. Returns { team, errors }. */
export function validateTeam(raw) {
  if (raw == null) return { team: {}, errors: [] };
  if (typeof raw !== "object" || Array.isArray(raw)) return { team: {}, errors: ["`team` must be a mapping of agent → settings."] };
  const team = {};
  const errors = [];
  for (const [agent, value] of Object.entries(raw)) {
    if (value === false) team[agent] = { enabled: false };
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.name !== undefined && (typeof value.name !== "string" || !PERSONA_NAME.test(value.name))) {
        errors.push(`team.${agent}.name must be a short name (letters, digits, spaces, . ' -; up to 30 characters).`);
      }
      team[agent] = { enabled: value.enabled !== false, name: value.name };
    } else errors.push(`team.${agent} must be a mapping such as { name: Ada } or false.`);
  }
  return { team, errors };
}

/**
 * Apply names and on/off switches from bees.yaml to the loaded packs, and fill
 * in every placeholder. Returns { packs, roster, warnings }.
 */
export function applyTeam(packs, team = {}) {
  const roster = new Map();
  for (const pack of packs) {
    for (const agent of pack.agents) {
      if (!agent.data.persona) continue;
      const override = team[agent.name] ?? {};
      roster.set(agent.name, {
        agent: agent.name,
        name: override.name ?? String(agent.data.persona),
        role: String(agent.data.role ?? agent.name),
        enabled: override.enabled !== false,
      });
    }
  }
  const warnings = Object.keys(team)
    .filter((a) => !roster.has(a))
    .map((a) => `team.${a} in bees.yaml matches no agent in the enabled packs, so it is ignored.`);

  const fill = (text, where, self) =>
    text.replace(PLACEHOLDER, (match, key, agent) => {
      if (key === "name" || key === "role") {
        if (!self) throw new BeesError(`${where}: {{${key}}} only works inside an agent file.`);
        return self[key];
      }
      const member = roster.get(agent);
      if (!member) throw new BeesError(`${where}: unknown teammate {{team.${agent}}}.`, { hint: `Known agents: ${[...roster.keys()].join(", ") || "none"}` });
      return member.enabled ? member.name : `the ${member.role.toLowerCase()}`;
    });

  const out = packs.map((pack) => {
    const at = (kind, name) => `Pack "${pack.name}", ${kind} "${name}"`;
    return {
      ...pack,
      rules: pack.rules.map((r) => ({ ...r, content: fill(r.content, at("rule", r.name)) })),
      skills: pack.skills.map((s) => ({
        ...s,
        description: fill(s.description, at("skill", s.name)),
        files: s.files.map((f) => ({ ...f, content: f.content == null ? f.content : fill(f.content, at("skill", s.name)) })),
      })),
      commands: pack.commands.map((cmd) => ({
        ...cmd,
        description: fill(cmd.description, at("command", cmd.name)),
        data: { ...cmd.data, description: fill(cmd.description, at("command", cmd.name)) },
        body: fill(cmd.body, at("command", cmd.name)),
      })),
      agents: pack.agents
        .filter((a) => roster.get(a.name)?.enabled !== false)
        .map((a) => {
          const self = roster.get(a.name);
          const description = fill(a.description, at("agent", a.name), self);
          return { ...a, description, data: { ...a.data, description }, body: fill(a.body, at("agent", a.name), self), persona: self };
        }),
    };
  });
  return { packs: out, roster: [...roster.values()], warnings };
}
