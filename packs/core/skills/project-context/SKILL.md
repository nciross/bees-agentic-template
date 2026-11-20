---
name: project-context
description: Build an accurate picture of this repository before a non-trivial change - structure, conventions, commands and where similar code already lives. Use at the start of a feature, refactor or bug investigation in an unfamiliar area.
---

# Project context

Spend a few minutes learning the codebase before you change it. Keep notes short; you only need enough to make a change that fits.

## Steps

1. **Read the shared instructions.** `AGENTS.md` lists the stack and the commands to install, build, test and lint.
2. **Map the structure.** List the top-level folders and identify where source, tests, configuration and docs live.
3. **Find a precedent.** Search for code that already does something similar to your task (same layer, same kind of feature). Prefer extending that pattern over inventing a new one.
4. **Check the conventions.** Look at naming, error handling, logging, dependency injection and test style in the files you will touch.
5. **Check recent history.** `git log --oneline -15 -- <path>` shows how the area evolves and which commit style the team uses.
6. **Confirm the baseline.** Run the test command once before changing anything, so you know which failures already existed.

## Output

Summarise in at most five bullets: where the change goes, the pattern to follow, the tests to add or update, and any risk you noticed. Then start the task.
