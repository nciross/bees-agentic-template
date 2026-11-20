# Contributing to bees 🐝

Thanks for helping the hive grow! This guide explains how we work.

## Workflow: GitHub flow

`main` is always releasable. Every change goes through a short-lived branch and a pull request.

1. **Open or pick an issue** so the work is visible. For a new pack, use the *New pack proposal* template.
2. **Branch from `main`** using a typed prefix:

   | Prefix | Use for |
   |---|---|
   | `feat/` | New packs, CLI features, adapters |
   | `fix/` | Bug fixes |
   | `docs/` | Documentation and ADRs |
   | `chore/` | Tooling, CI, dependencies |
   | `refactor/` | Code changes with no behaviour change |

3. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(team): add QA agent`.
4. **Open a pull request** using the template. CI must be green.
5. **Squash-merge** and delete the branch.

## Local checks

```bash
npx markdownlint-cli2   # lint all Markdown
```

More checks (unit tests, `bees sync --check`) arrive with the CLI.

## Architecture decisions

Significant decisions are recorded as ADRs in [`docs/adr/`](docs/adr/). Copy the format of an existing ADR, give it the next number, and open it as a `docs/` PR — discussion happens in review.

## Writing packs

- Skills use the open [Agent Skills](https://agentskills.io) `SKILL.md` format so every tool can read them.
- Keep skills **small and focused** — Theo, our token optimizer, will enforce budgets.
- Third-party content is **referenced at a pinned version**, never copied. Include its license in `pack.yaml`.

## Agent-written contributions

Agents are welcome contributors, under two rules:

1. **A human reviews and approves** every issue, comment and PR before it is posted.
2. **Agent content is signed** with a footer such as `— Kenji, Reviewer · bees agent 🐝`.

## Code of conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
