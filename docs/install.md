# Installing the bees CLI

bees is a small Node.js CLI. It runs the same on Linux, macOS and Windows (PowerShell, cmd or Git Bash), and works in projects in any language. Node is only needed to *run* bees, not by your project.

**Requirements:** Node.js 22 or newer, and git.

> [!WARNING]
> The npm package is **`bees-agentic`**. The name `bees` on npm belongs to an unrelated project, so never run `npx bees`. The installed command is still called `bees`.

## Option 1: run it without installing (recommended)

bees is on npm as an alpha:

```bash
cd your-existing-project
npx bees-agentic@alpha init
```

To try unreleased changes from `main`, run it straight from GitHub instead: `npx github:nciross/bees-agentic-template init`.

## Option 2: install the `bees` command globally

```bash
npm install -g bees-agentic@alpha

bees --version
cd your-existing-project
bees init
```

Uninstall with `npm uninstall -g bees-agentic`.

## Option 3: pin it in a Node.js project

For JavaScript/TypeScript projects, pinning bees as a dev dependency keeps every teammate and CI on the same version:

```bash
npm install --save-dev bees-agentic@alpha
npx bees init
```

Then add scripts so nobody has to remember the commands:

```json
{
  "scripts": {
    "bees": "bees",
    "bees:check": "bees sync --check"
  }
}
```

## Option 4: from source (contributors)

```bash
git clone https://github.com/nciross/bees-agentic-template.git
cd bees-agentic-template
npm install
npm link            # puts your working copy on PATH as `bees`
bees --help
```

Edits to `src/` take effect immediately. Undo with `npm unlink -g bees-agentic`.

## First run

```bash
bees init                 # interactive: pick tools and packs
bees init --yes           # accept detected defaults (no prompts)
bees init --tools claude,cursor --packs core
```

`init` detects your stack (Node, Python, Go, Rust, Java, .NET, Ruby, PHP), writes `bees.yaml`, and generates the configs. Review the detected commands in `bees.yaml`, then commit `bees.yaml`, `bees.lock` and the generated files.

| Command | What it does |
|---|---|
| `bees init` | Detect the stack, pick tools and packs, write `bees.yaml`, generate configs |
| `bees sync` | Re-generate configs from `bees.yaml`; idempotent, keeps your edits |
| `bees sync --check` | Exit 1 if generated configs are stale (for CI) |
| `bees sync --dry-run` | Show what would change without writing |
| `bees add <pack>` / `bees remove <pack>` | Enable or disable packs, then sync |
| `bees list` | List available packs (● enabled, ○ available) |
| `bees doctor` | Diagnose the config, drift and broken markers |

Every command accepts `-C <dir>` to run against another folder.

## What gets written

| Tool | Files |
|---|---|
| All | `AGENTS.md` (managed region), `bees.yaml`, `bees.lock` |
| Claude Code | `CLAUDE.md` (imports `AGENTS.md`), `.claude/skills/`, `.claude/commands/`, `.claude/agents/`, permission rules merged into `.claude/settings.json` |
| GitHub Copilot | `.github/copilot-instructions.md` (managed region), `.github/skills/`, `.github/prompts/*.prompt.md`, `.github/agents/*.agent.md` |
| Cursor | `.cursor/skills/`, `.cursor/rules/bees-*.mdc`, `.cursor/commands/` |
| Codex | `.agents/skills/` (Codex reads `AGENTS.md` natively) |

Two kinds of files:

- **Managed regions** (`AGENTS.md`, `CLAUDE.md`, `copilot-instructions.md`): bees only rewrites the text between `<!-- bees:begin -->` and `<!-- bees:end -->`. Write your own notes outside the markers.
- **Owned files** (skills, commands, agents, rules): fully generated and tracked by hash in `bees.lock`. Don't edit them; local edits are overwritten on the next sync. When a pack is removed, its owned files are deleted, unless you edited them, in which case they are left in place with a warning.

## Keep configs fresh in CI

Add a step that fails the build when someone edits `bees.yaml` without running `bees sync`:

```yaml
# .github/workflows/ci.yml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes bees-agentic@alpha sync --check
```

If bees is a dev dependency, use `npx bees sync --check` instead.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No bees.yaml found` | Run `bees init` first, or pass `-C <project dir>`. |
| `the bees markers are broken` | A begin or end marker was deleted. Restore it (or remove both), then `bees sync`. |
| `sync --check` fails on CI only | Someone changed `bees.yaml` or a generated file without syncing. Run `bees sync` locally and commit. |
| `npx bees` runs something odd | Wrong package; use `bees-agentic` (see the warning above). |
| Anything else | `bees doctor`, then `BEES_DEBUG=1 bees <command>` for a stack trace, and [open an issue](https://github.com/nciross/bees-agentic-template/issues/new?template=bug_report.yml). |
