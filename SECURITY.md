# Security policy

bees configures AI agents that can read, write and run code in your projects, so we take security seriously.

## Supported versions

bees is in early preview. Security fixes are made on `main` and in the latest release.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through
[GitHub Security Advisories](https://github.com/nciross/bees-agentic-template/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge reports within **3 working days** and to agree on a fix and disclosure timeline with you.

## In scope

- Hooks, commands or skills that could run unexpected code or leak secrets
- Generated configurations that weaken a tool's default permissions
- Upstream pinning that could be bypassed (e.g. unpinned or mutable refs)
- Prompt-injection paths through memory (`.bees/memory/`) or drafts (`.bees/drafts/`)

## Out of scope

Vulnerabilities in the AI tools themselves (Claude Code, Copilot, Cursor, Codex) or in upstream packs — please report those to their maintainers. We are happy to help coordinate.
