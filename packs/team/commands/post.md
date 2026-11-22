---
description: Publish one approved agent draft from .bees/drafts/ to GitHub with the gh CLI. Running this command is the human approval.
argument-hint: "<draft file>"
---

I approve publishing this draft: $ARGUMENTS

1. Open the file in `.bees/drafts/`. If it doesn't exist, or its `status` isn't `draft`, stop and tell me.
2. Show me the exact `gh` command you're about to run, then run it, passing the body from a file (`--body-file`), never inline:
   - `kind: issue` → `gh issue create --title "<title>" --body-file <body>`
   - `kind: comment` → `gh issue comment <target> --body-file <body>` (works for PRs too)
   - `kind: review` → `gh pr review <target> --comment --body-file <body>`
   - `kind: pr` → `gh pr create --draft --head <target> --title "<title>" --body-file <body>`
   The body is the file without its front matter.
3. If `gh` fails, show the error and change nothing.
4. On success, set `status: posted` and add `url: <link gh printed>` to the front matter, then tell me the link.

Publish only this one draft. Never merge, approve or close anything.
