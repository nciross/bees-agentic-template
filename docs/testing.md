# Testing bees

bees has three layers of tests. All of them run on Linux, macOS and Windows, need nothing beyond Node.js 22+ (and git for the real-project test), and never write outside a temp directory.

| Layer | Command | What it covers | Time |
|---|---|---|---|
| Unit | `npm run test:unit` | Markers, config validation, stack detection, every adapter's output | < 1 s |
| End-to-end | `npm run test:e2e` | The real `bees` binary against realistic fixture projects | ~10 s |
| Real project | `npm run test:real -- <path or git URL>` | The full lifecycle on *your* project, on a disposable copy | ~5 s + clone |

`npm test` runs unit and end-to-end tests together. CI runs all three.

## End-to-end fixtures

`test/fixtures/` holds small but realistic projects. Each test copies one into a temp dir and runs the CLI as a child process:

| Fixture | Why it is interesting |
|---|---|
| `node-express-app` | pnpm + TypeScript + Express; already has a team `CLAUDE.md` and a `.claude/settings.json` that bees must merge into, not overwrite |
| `python-fastapi-app` | uv + FastAPI + pytest + ruff; no existing agent config |
| `packs/team-demo` | A third-party pack (loaded via `BEES_PACKS_DIR`) with a sub-agent and a rule |
| `packs/factory-demo` | A pack that `requires: [team-demo]`, used to test dependency resolution in `init`, `add`, `remove`, `sync` and `doctor` |

The suite checks, among other things: detection, idempotent sync, notes outside markers surviving, drift caught by `--check`, CRLF checkouts not counted as drift, pack removal cleaning up only bees-owned files, `bees.yaml` comments kept, broken markers and invalid config refused, a tampered `bees.lock` unable to delete files outside the project, and pack `requires:` being resolved on `init`/`add` and enforced on `remove`/`sync`.

To add a fixture, create a folder under `test/fixtures/`, then use `copyFixture(t, "<name>")` and `bees([...args], { cwd })` from `test/helpers.js`.

## Test bees on a real project

Point the real-project script at any local folder or git URL:

```bash
npm run test:real -- ../my-app
npm run test:real -- https://github.com/pallets/flask
npm run test:real -- ../my-app --tools claude,cursor --packs core --keep
```

It **never modifies your project**: local folders are copied (skipping `node_modules`, `.git`, build output and virtualenvs) and URLs are shallow-cloned into a temp directory. Then it runs the CLI through the whole lifecycle and checks each step:

```text
✔ bees init
   detected stack: Python, Flask
✔ pre-existing project files untouched (except bees-managed regions)
✔ bees sync --check passes right after init
✔ second bees sync is a no-op
✔ bees doctor reports a healthy hive
✔ notes outside the bees markers survive a sync
✔ notes outside the markers are not drift
✔ hand edits inside the markers fail --check
✔ bees sync repairs drift and keeps notes
✔ bees remove deletes the files those packs generated
✔ bees add restores them
✔ bees works on this project. 🍯
```

| Option | Default | Meaning |
|---|---|---|
| `--tools` | `claude,copilot,cursor,codex` | Tools passed to `bees init` |
| `--packs` | `core` | Packs passed to `bees init` |
| `--keep` | off | Keep the temp copy so you can open the generated files (kept automatically when a check fails) |

When you are happy with the result, run `bees init` in the real project, review the diff, and commit.

## Try the CLI by hand

```bash
npm link                       # `bees` now points at your working copy
cd /path/to/scratch-copy-of-a-project
bees init
git diff                       # inspect what bees changed
```
