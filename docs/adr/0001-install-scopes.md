# 0001 — Install scopes: user, project, local

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

bees must work for a whole team *and* for one developer. Some configuration has to be identical for everyone on a project (security rules, conventions, the agent team, elephant memory). Other configuration is personal (preferred agent voice, token defaults, private experiments). The four supported tools each have their own notion of "user" vs "project" settings, and Claude Code already ships `user`, `project` and `local` plugin scopes.

## Decision

bees has **three install scopes**, layered like `git config`. The narrower scope wins: **local > project > user**.

| Scope | Command | Location | Shared | Holds |
|---|---|---|---|---|
| user | `bees init --user` | `~/.bees/config.yaml` + each tool's user folder | Only you, every project | Personal skills, agent voice, token defaults, goldfish settings |
| project *(default)* | `bees init` | `bees.yaml` + generated files, committed | Whole team | Team packs and agents, elephant memory, security, Spec Kit |
| local | `bees init --local` | `bees.local.yaml`, gitignored | Only you, this repo | Experiments, extra personal packs, goldfish notes |

Rules:

1. **Team-critical config is project-only.** Security, conventions, memory and team agents can only be set at project scope.
2. **Packs can be locked.** `security: { locked: true }` in `bees.yaml` prevents user or local config from disabling it.
3. **No duplicates.** `bees doctor` warns when the same skill is installed at user and project scope (it wastes tokens).

### Tool mapping

| Tool | user | project | local |
|---|---|---|---|
| Claude Code | `--scope user` (`~/.claude/`) | `--scope project`, `extraKnownMarketplaces` + `enabledPlugins` in `.claude/settings.json` | `--scope local` (`.claude/settings.local.json`) |
| GitHub Copilot | VS Code user prompts folder | `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/` | not supported, falls back to user scope |
| Cursor | User Rules (settings; bees prints setup steps) | `.cursor/rules/*.mdc` | not supported, falls back to user scope |
| Codex | `~/.codex/AGENTS.md` + user skills | repo `AGENTS.md` + project skills | not supported, falls back to user scope |

Upstream packs follow their own capabilities: **Spec Kit** is project-only (`specify init --here`); **Impeccable** supports user and project.

Exact Codex skill paths are verified when its adapter is built.

## Consequences

- ✅ Teammates get an identical setup from one committed file; Claude Code users are prompted to install automatically.
- ✅ Individuals can personalise without polluting the repo.
- ✅ The model matches Claude Code's native scopes, so the Claude adapter is a direct mapping.
- ⚠️ Tools without a local scope can't express per-repo personal overrides; bees falls back to user scope and `bees doctor` explains it.
- ⚠️ Locking adds a precedence exception that must be clearly reported by `bees doctor`.
